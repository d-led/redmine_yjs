/**
 * Yjs Collaborative Editing Integration for Redmine
 * 
 * This script integrates Yjs with Redmine's editors (CKEditor and plain text)
 * using Hocuspocus as the WebSocket sync server.
 * 
 * Features:
 * - Real-time collaborative editing with conflict-free merging
 * - User presence indicators (cursors and avatars)
 * - Works with both CKEditor (WYSIWYG) and plain text editors
 * - Offline support with automatic sync
 * 
 * Build: BUILD_TIMESTAMP_PLACEHOLDER
 */

(function() {
  'use strict';

  // Build timestamp - injected during Docker build
  const BUILD_TIMESTAMP = 'BUILD_TIMESTAMP_PLACEHOLDER';

  console.log('[Yjs] Collaboration script started');
  console.log('[Yjs] Build timestamp:', BUILD_TIMESTAMP);
  console.log('[Yjs] Config available:', typeof window.RedmineYjsConfig !== 'undefined', window.RedmineYjsConfig);
  console.log('[Yjs] User available:', typeof window.currentUser !== 'undefined', window.currentUser);

  // Early exit: Only enable collaboration on edit pages
  // Check multiple conditions (be lenient - collaboration should work on any edit form):
  // 1. URL path contains /edit (e.g., /issues/1/edit, /wiki/Page/edit)
  // 2. Query string has edit=true
  // 3. Form contains textareas for content/description/notes (even if replaced by CKEditor)
  // 4. CKEditor instances exist (CKEditor replaces textareas but we still want collaboration)
  // 5. Issue edit form detected (has issue form with description/notes fields) - even if hidden
  // 6. Wiki edit form detected
  // 7. Issue show page (might have hidden edit form that becomes visible)
  // 8. Wiki show page (might have edit form that becomes visible)
  const pathHasEdit = window.location.pathname.includes('/edit');
  const queryHasEdit = window.location.search.includes('edit=true');
  const isIssueShowPage = /\/issues\/\d+$/.test(window.location.pathname); // e.g., /issues/1
  const isWikiShowPage = /\/projects\/[^\/]+\/wiki\/[^\/]+$/.test(window.location.pathname); // e.g., /projects/test/wiki/Page
  // Check for textareas even if hidden (issue edit form might be hidden initially)
  // querySelector finds elements even if they're hidden (display: none)
  // Include #issue_description_and_toolbar and #update which contain the edit form
  const hasTextarea = document.querySelector('form textarea[id*="content"], form textarea[id*="description"], form textarea[id*="notes"], textarea#issue_description, textarea#issue_notes, textarea#content_text, textarea.wiki-edit, #update textarea, #issue_description_and_toolbar textarea, #update form textarea');
  // Check for issue form even if hidden (Redmine shows/hides the edit form dynamically)
  // The #update div contains the edit form and might be hidden initially
  // Also check for #issue_description_and_toolbar which contains the description editor
  const hasIssueForm = document.querySelector('form#issue-form, form.edit_issue, form[action*="/issues"], form input[name="issue[subject]"], #update, #update form, #issue_description_and_toolbar');
  const hasWikiForm = document.querySelector('form#wiki_form, form[action*="/wiki"]');
  const hasCKEditor = typeof window.CKEDITOR !== 'undefined' && 
                      (document.querySelector('.cke_editable') || 
                       document.querySelector('iframe.cke_wysiwyg_frame') ||
                       document.querySelector('[id*="description"][class*="cke"], [id*="notes"][class*="cke"], [id*="content"][class*="cke"]'));
  
  // On issue and wiki show pages, always enable collaboration (form might be hidden initially)
  const isEditPage = pathHasEdit || queryHasEdit || hasTextarea || hasIssueForm || hasWikiForm || hasCKEditor || isIssueShowPage || isWikiShowPage;
  
  if (!isEditPage) {
    console.log('[Yjs] Not an edit page, skipping collaboration initialization');
    console.log('[Yjs] Debug - pathHasEdit:', pathHasEdit, 'queryHasEdit:', queryHasEdit, 'hasTextarea:', !!hasTextarea, 'hasIssueForm:', !!hasIssueForm, 'hasWikiForm:', !!hasWikiForm, 'hasCKEditor:', hasCKEditor, 'isIssueShowPage:', isIssueShowPage, 'isWikiShowPage:', isWikiShowPage);
    console.log('[Yjs] Debug - pathname:', window.location.pathname, 'search:', window.location.search);
    return;
  }
  
  console.log('[Yjs] Edit page detected, initializing collaboration');
  console.log('[Yjs] Debug - pathHasEdit:', pathHasEdit, 'queryHasEdit:', queryHasEdit, 'hasTextarea:', !!hasTextarea, 'hasIssueForm:', !!hasIssueForm, 'hasWikiForm:', !!hasWikiForm, 'hasCKEditor:', hasCKEditor, 'isIssueShowPage:', isIssueShowPage, 'isWikiShowPage:', isWikiShowPage);

  // Check for libraries immediately - fail fast if not available
  // CDN scripts load synchronously before this script runs
  // UMD builds expose: window.Y for Yjs, window.HocuspocusProvider for Hocuspocus Provider
  const Yjs = window.Y;
  const Provider = window.HocuspocusProvider;
  
  if (!Yjs) {
    console.error('[Yjs] ERROR: window.Y is not available!');
    console.error('[Yjs] Check if Yjs library is loaded. Available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('yjs')));
    console.error('[Yjs] All window keys (first 50):', Object.keys(window).slice(0, 50));
    throw new Error('Yjs library (window.Y) is not available. Check if the library script is loaded correctly.');
  }
  
  if (!Provider) {
    console.error('[Yjs] ERROR: window.HocuspocusProvider is not available!');
    console.error('[Yjs] Check if Hocuspocus Provider library is loaded. Available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('hocus')));
    throw new Error('Hocuspocus Provider library (window.HocuspocusProvider) is not available. Check if the library script is loaded correctly.');
  }
  
  console.log('[Yjs] Libraries loaded:', { Yjs: !!Yjs, Provider: !!Provider });
  
  // Wait for DOM to be ready before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
  initializeCollaboration(Yjs, Provider);
    });
  } else {
    // DOM already ready, but wait a tick to ensure body exists
    setTimeout(function() {
      initializeCollaboration(Yjs, Provider);
    }, 0);
  }
  
  function initializeCollaboration(Y, HocuspocusProvider) {

  // Store active collaborations to avoid duplicate initialization
  const activeCollaborations = new Map();
  
  // Cleanup all awareness states when page unloads (Yjs best practice)
  window.addEventListener('beforeunload', () => {
    activeCollaborations.forEach((collab) => {
      if (collab.provider && collab.provider.awareness) {
        // Clear local awareness state so peers know we're leaving
        collab.provider.awareness.setLocalState(null);
      }
    });
    console.log('[Yjs] 🧹 Cleaned up awareness states on page unload');
  });
  
  // Create connection status indicator
  function createConnectionStatus() {
    if (document.getElementById('yjs-connection-status')) {
      return document.getElementById('yjs-connection-status');
    }
    // Ensure document.body exists
    if (!document.body) {
      return null;
    }
    const status = document.createElement('div');
    status.className = 'yjs-status';
    status.id = 'yjs-connection-status';
    document.body.appendChild(status);
    return status;
  }
  
  // Lazy initialization - create status element when needed
  let connectionStatus = null;
  
  function updateConnectionStatus(state, message) {
    // Create status element if it doesn't exist and body is available
    if (!connectionStatus) {
      connectionStatus = createConnectionStatus();
      if (!connectionStatus) {
        // Body not ready yet, try again later
        setTimeout(() => updateConnectionStatus(state, message), 10);
        return;
      }
      
      // Add click handler to restart reconnection when disconnected
      connectionStatus.addEventListener('click', () => {
        // Check current state from element's class
        const currentState = connectionStatus.className.includes('disconnected') ? 'disconnected' :
                            connectionStatus.className.includes('syncing') ? 'syncing' : 'connected';
        
        if (currentState === 'disconnected' || currentState === 'syncing') {
          // Find all active providers and reset their reconnection attempts
          let reconnected = false;
          activeCollaborations.forEach((collab) => {
            if (collab.provider) {
              reconnectionManager.resetAndReconnect(collab.provider);
              reconnected = true;
            }
          });
          
          if (reconnected) {
            console.log('[Yjs] Manual reconnection triggered by user click');
          } else {
            console.log('[Yjs] No active providers to reconnect');
          }
        }
      });
      
      // Also support keyboard activation (Enter/Space)
      connectionStatus.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          connectionStatus.click();
        }
      });
      
      // Add title attribute to show it's clickable when disconnected
      connectionStatus.setAttribute('role', 'button');
      connectionStatus.setAttribute('tabindex', '0');
    }
    connectionStatus.className = `yjs-status ${state}`;
    
    // Count total editors from all active collaborations
    let totalEditors = 0;
    activeCollaborations.forEach((collab) => {
      if (collab.provider && collab.provider.awareness) {
        const states = collab.provider.awareness.getStates();
        totalEditors = states.size; // Use current state count
      }
    });
    
    // Show "Collaboration active (✏️ N)" format - no words needed
    const editorCount = totalEditors > 0 ? ` (✏️ ${totalEditors})` : '';
    connectionStatus.textContent = message || (state === 'connected' ? `Collaboration active${editorCount}` : 
                                               state === 'disconnected' ? 'Disconnected' : 
                                               'Syncing...');
    
    // Update title/tooltip based on state
    if (state === 'disconnected' || state === 'syncing') {
      connectionStatus.title = 'Click to reconnect immediately';
    } else {
      connectionStatus.title = '';
    }
    
    // Also update the form widget if it exists
    updateCollaborationStatusWidget(state, message);
  }

  /**
   * Create or get the collaboration status widget in the edit form
   */
  function getCollaborationStatusWidget() {
    let widget = document.getElementById('yjs-collaboration-status');
    if (!widget) {
      widget = document.createElement('div');
      widget.id = 'yjs-collaboration-status';
      widget.className = 'yjs-collaboration-status-widget';
      widget.style.display = 'none'; // Hidden by default, shown only when editor is focused
    }
    
    // If we have an active editor, place widget below it
    if (activeEditorElement) {
      // Find the editor container (textarea parent or CKEditor wrapper)
      let container = null;
      
      if (activeEditorElement.tagName === 'TEXTAREA') {
        // For plain text editor, find the parent container
        container = activeEditorElement.closest('.jstEditor, .wiki-edit, .form-group, .box, fieldset, div');
        if (!container || container === document.body) {
          container = activeEditorElement.parentElement;
        }
      } else if (typeof CKEDITOR !== 'undefined' && activeEditorElement.container) {
        // For CKEditor, use the editor's container
        container = activeEditorElement.container.$;
      }
      
      if (container && widget.parentNode !== container) {
        // Remove from old location
        if (widget.parentNode) {
          widget.parentNode.removeChild(widget);
        }
        // Insert after the container (below the editor)
        if (container.nextSibling) {
          container.parentNode.insertBefore(widget, container.nextSibling);
        } else {
          container.parentNode.appendChild(widget);
        }
        console.log('[Yjs] ✅ Placed collaboration widget below active editor');
      }
    }
    
    return widget;
  }

  // Track global connection state
  let globalConnectionState = 'syncing';
  
  // Track which editor is currently focused/active
  let activeEditorElement = null; // The textarea or CKEditor instance that's currently focused

  /**
   * Reconnection manager with exponential backoff
   * Tracks retry attempts per provider and implements exponential backoff
   */
  const reconnectionManager = {
    // Map of provider -> { retryCount, timeoutId, baseDelay }
    providers: new Map(),
    
    // Configuration
    baseDelay: 1000, // Start with 1 second
    maxDelay: 30000, // Cap at 30 seconds
    maxRetries: Infinity, // No hard limit, but exponential backoff will slow down
    
    /**
     * Calculate delay for next retry using exponential backoff
     * Formula: baseDelay * (2 ^ retryCount), capped at maxDelay
     */
    calculateDelay(retryCount) {
      const delay = Math.min(
        this.baseDelay * Math.pow(2, retryCount),
        this.maxDelay
      );
      return Math.round(delay);
    },
    
    /**
     * Schedule a reconnection attempt for a provider
     */
    scheduleReconnect(provider, documentName) {
      const state = this.providers.get(provider) || { retryCount: 0 };
      
      // If there's already a pending reconnection, don't schedule another one
      // This prevents multiple rapid disconnect events from creating multiple reconnection attempts
      if (state.timeoutId) {
        console.log(`[Yjs] Reconnection already scheduled for ${documentName}, skipping duplicate`);
        return state.timeoutId;
      }
      
      const delay = this.calculateDelay(state.retryCount);
      const attemptNumber = state.retryCount + 1;
      
      console.log(`[Yjs] Scheduling reconnect attempt ${attemptNumber} for ${documentName} in ${delay}ms`);
      
      // Schedule new reconnect
      const timeoutId = setTimeout(() => {
        // Clear the timeout ID since it's now executing
        const currentState = this.providers.get(provider);
        if (currentState) {
          currentState.timeoutId = null;
        }
        
        console.log(`[Yjs] Attempting to reconnect to Hocuspocus (attempt ${attemptNumber})...`);
        updateCollaborationStatusWidget('syncing', `Reconnecting... (attempt ${attemptNumber})`);
        provider.connect();
      }, delay);
      
      // Update state BEFORE incrementing retry count
      // This ensures the delay calculation uses the correct retry count
      state.timeoutId = timeoutId;
      state.documentName = documentName;
      
      // Increment retry count AFTER scheduling (for next time)
      state.retryCount++;
      this.providers.set(provider, state);
      
      return timeoutId;
    },
    
    /**
     * Reset retry count and reconnect immediately
     * Called when user clicks the badge to manually reconnect
     */
    resetAndReconnect(provider) {
      const state = this.providers.get(provider);
      if (!state) {
        console.log('[Yjs] No reconnection state found, connecting immediately');
        provider.connect();
        return;
      }
      
      // Clear existing timeout
      if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }
      
      // Reset retry count
      state.retryCount = 0;
      this.providers.set(provider, state);
      
      console.log('[Yjs] Manual reconnect requested, resetting retry count and connecting immediately');
      updateCollaborationStatusWidget('syncing', 'Reconnecting...');
      provider.connect();
    },
    
    /**
     * Reset retry count when connection succeeds
     */
    onConnectSuccess(provider) {
      const state = this.providers.get(provider);
      if (state) {
        // Clear any pending timeout
        if (state.timeoutId) {
          clearTimeout(state.timeoutId);
          state.timeoutId = null;
        }
        // Reset retry count on successful connection
        state.retryCount = 0;
        this.providers.set(provider, state);
        console.log('[Yjs] Connection successful, resetting retry count');
      }
    },
    
    /**
     * Get current retry count for a provider
     */
    getRetryCount(provider) {
      const state = this.providers.get(provider);
      return state ? state.retryCount : 0;
    },
    
    /**
     * Get next retry delay for a provider
     */
    getNextDelay(provider) {
      const state = this.providers.get(provider);
      if (!state) return this.baseDelay;
      return this.calculateDelay(state.retryCount);
    }
  };
  
  /**
   * Determine if an editor should have collaboration enabled
   * Returns true for main content editors, false for comments/notes
   */
  function shouldEnableCollaboration(textarea) {
    const editorId = textarea.id || '';
    const editorName = textarea.name || '';
    const pathname = window.location.pathname;
    
    // Check if editor is in a comment/notes section
    const isInCommentSection = textarea.closest('#add_notes, .journal, .comment, .comments, #comments, .issue-notes, fieldset#add_notes') !== null;
    if (isInCommentSection) {
      console.log('[Yjs] ⏭️ Editor is in comment/notes section, skipping:', editorId);
      return false;
    }
    
    // Check editor ID/name patterns that indicate comments/notes
    const isCommentEditor = editorId.includes('comment') || 
                           editorName.includes('comment') ||
                           editorId.includes('journal') ||
                           editorName.includes('journal');
    if (isCommentEditor) {
      console.log('[Yjs] ⏭️ Editor ID/name indicates comment/journal, skipping:', editorId);
      return false;
    }
    
    // Issue pages: only description, not notes
    if (/\/issues\/\d+/.test(pathname)) {
      const isDescription = editorId === 'issue_description' || 
                            (editorName.includes('description') && !editorName.includes('notes'));
      const isNotes = editorId === 'issue_notes' || 
                     editorName.includes('notes');
      if (!isDescription || isNotes) {
        console.log('[Yjs] ⏭️ Issue page: not description editor, skipping:', editorId);
        return false;
      }
      return true;
    }
    
    // Wiki pages: only main content, not comments
    if (/\/wiki\//.test(pathname)) {
      const isMainContent = editorId === 'content_text' || 
                           editorId.includes('content') && !editorId.includes('comment') ||
                           editorName.includes('content') && !editorName.includes('comment');
      if (!isMainContent) {
        console.log('[Yjs] ⏭️ Wiki page: not main content editor, skipping:', editorId);
        return false;
      }
      return true;
    }
    
    // For other pages, allow if it's not clearly a comment/notes field
    // Main content fields typically have: content, description, text (but not notes/comment)
    const isMainContentField = (editorId.includes('content') || 
                                editorId.includes('description') || 
                                editorId.includes('text')) &&
                               !editorId.includes('comment') &&
                               !editorId.includes('notes') &&
                               !editorId.includes('journal');
    
    if (!isMainContentField) {
      console.log('[Yjs] ⏭️ Not a main content field, skipping:', editorId);
      return false;
    }
    
    return true;
  }

  /**
   * Update the collaboration status widget with current state
   */
  function updateCollaborationStatusWidget(connectionState, connectionMessage) {
    const widget = getCollaborationStatusWidget();
    if (!widget) return;
    
    // Only show widget when an editor is actively focused
    if (!activeEditorElement) {
      widget.style.display = 'none';
      return;
    }
    
    // Show the widget - use 'block' to ensure it's visible
    widget.style.display = 'block';

    // Update global connection state
    if (connectionState) {
      globalConnectionState = connectionState;
    } else {
      connectionState = globalConnectionState;
    }

    // Collect all active sessions from all active collaborations
    // IMPORTANT: Each tab gets its own clientId, so we show one badge per clientId (one per tab)
    // This means: same user in different tabs = different badges (intended behavior)
    // If the same user is editing multiple textareas in the same tab, they'll have the same clientId
    // Solution: Use clientId as key to show one badge per tab/session
    const allUsers = new Map(); // Map<clientId, {name, color, clientId, userId, sessionId, isSameUser}>
    const allPeers = new Map(); // Map<clientId, {userId, userName, isSelf}>
    let totalSessions = 0;
    let selfPeerId = null;
    let totalEditors = 0;

    activeCollaborations.forEach((collab, element) => {
      if (collab.provider && connectionState === 'connected') {
        const states = collab.provider.awareness.getStates();
        const selfClientId = collab.provider.awareness.clientID;
        
        // Track self peer ID (use the first one we encounter)
        if (selfPeerId === null) {
          selfPeerId = selfClientId;
        }
        totalEditors = Math.max(totalEditors, states.size);

        states.forEach((state, clientId) => {
          const isSelf = clientId === selfClientId;
          const hasUser = !!state.user;
          
          // Track all peers for debugging
          allPeers.set(clientId, {
            userId: state.user?.id || 'unknown',
            userName: state.user?.name || 'Unknown',
            isSelf: isSelf,
            hasUser: hasUser
          });
          
          // Show other sessions (not self)
          // Use clientId as key - each tab gets its own clientId, so each tab gets its own badge
          if (hasUser && !isSelf) {
            if (!allUsers.has(clientId)) {
              const userId = state.user.id;
              const sessionId = state.sessionId || `${userId}-${clientId}`;
              const isSameUser = userId === window.currentUser?.id;
              allUsers.set(clientId, {
                name: state.user.name || 'Unknown',
                color: state.color || getUserColor(userId),
                clientId: clientId,
                userId: userId,
                sessionId: sessionId, // Unique session ID for this tab
                isSameUser: isSameUser // Flag to show "(other tab)" suffix
              });
              totalSessions++;
            }
          }
        });
      }
    });
    
    // Count peers excluding self
    const otherPeers = Array.from(allPeers.values()).filter(peer => !peer.isSelf);
    const totalOtherPeers = otherPeers.length;
    
    // Log all peers for debugging
    if (allPeers.size > 0) {
      console.log('[Yjs] 🔍 All peers on document:', {
        totalPeers: allPeers.size,
        otherPeers: totalOtherPeers, // Excluding self
        selfPeerId: selfPeerId,
        peers: Array.from(allPeers.entries()).map(([clientId, info]) => ({
          peerId: clientId,
          userId: info.userId,
          userName: info.userName,
          isSelf: info.isSelf,
          hasUser: info.hasUser
        }))
      });
    }

    // Build HTML content
    let html = '<div class="yjs-status-header">';
    
    // Connection status indicator
    const statusClass = connectionState === 'connected' ? 'connected' : 
                       connectionState === 'disconnected' ? 'disconnected' : 'syncing';
    const statusIcon = connectionState === 'connected' ? '●' : 
                      connectionState === 'disconnected' ? '○' : '◐';
    html += `<span class="yjs-status-indicator ${statusClass}" title="${connectionMessage || connectionState}">${statusIcon}</span>`;
    html += '<span class="yjs-status-label">Collaborative Editing</span>';
    // Editor count is shown in floating badge, not here
    html += '</div>';

    // Active sessions list (show other sessions, even if same user)
    if (allUsers.size > 0) {
      // Debug: log all users to help diagnose duplicate issues
      if (allUsers.size > 1) {
        console.log('[Yjs] 🔍 Multiple users in widget:', Array.from(allUsers.entries()).map(([cid, info]) => ({
          clientId: cid,
          name: info.name,
          isSameUser: info.isSameUser
        })));
      }
      
      html += '<div class="yjs-users-list">';
      allUsers.forEach((userInfo, clientId) => {
        // Use sessionId in element ID to make badges uniquely identifiable for testing
        const badgeId = `yjs-user-badge-${userInfo.sessionId || clientId}`;
        html += `<span id="${badgeId}" class="yjs-user-badge" data-client-id="${clientId}" data-session-id="${userInfo.sessionId || clientId}" style="background-color: ${userInfo.color}20; border-color: ${userInfo.color}">`;
        html += `<span class="yjs-user-avatar" style="background-color: ${userInfo.color}"></span>`;
        html += `<span class="yjs-user-name">${escapeHtml(userInfo.name)}`;
        if (userInfo.isSameUser) {
          html += ' <span style="opacity: 0.6">(other tab)</span>';
        }
        html += `</span>`;
        html += '</span>';
      });
      html += '</div>';
    } else {
      // Show connection status with prefix
      if (connectionState === 'syncing' || connectionState === 'connecting') {
        html += '<div class="yjs-users-empty">Connecting to the collaboration server...</div>';
      } else if (connectionState === 'connected') {
        html += '<div class="yjs-users-empty">connected: No other editors</div>';
      } else {
        const disconnectMsg = connectionMessage || 'Disconnected';
        html += `<div class="yjs-users-empty">disconnected: ${escapeHtml(disconnectMsg)}</div>`;
      }
    }

    widget.innerHTML = html;
    // Ensure the class includes the connection state for test detection
    // Remove any existing state classes and add the current one
    widget.className = widget.className.replace(/\bconnected\b|\bdisconnected\b|\bsyncing\b/g, '');
    widget.className = `yjs-collaboration-status-widget ${statusClass}`.trim();
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get current user information from Redmine
   */
  function getCurrentUser() {
    // Try to get user info from Redmine's global variables or DOM
    const userId = window.currentUser?.id || 
                   document.querySelector('[data-user-id]')?.getAttribute('data-user-id') ||
                   'anonymous';
    const userName = window.currentUser?.name ||
                     document.querySelector('[data-user-name]')?.getAttribute('data-user-name') ||
                     document.querySelector('.user.active')?.textContent?.trim() ||
                     'Anonymous';
    
    return { id: userId, name: userName };
  }

  /**
   * Create a cursor element for a remote user
   */
  function createCursorElement(userId, userName, color) {
    const cursor = document.createElement('div');
    cursor.className = 'yjs-cursor';
    cursor.setAttribute('data-user-id', userId);
    cursor.style.position = 'absolute';  // Absolute positioning relative to cursor container
    cursor.style.width = '2px';
    cursor.style.height = '20px';
    cursor.style.backgroundColor = color;
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '10001';
    cursor.style.display = 'none';
    
    // Add user label
    const label = document.createElement('span');
    label.className = 'yjs-cursor-label';
    label.textContent = userName;
    label.style.position = 'absolute';
    label.style.top = '-20px';
    label.style.left = '0';
    label.style.padding = '2px 6px';
    label.style.backgroundColor = color;
    label.style.color = 'white';
    label.style.fontSize = '11px';
    label.style.whiteSpace = 'nowrap';
    label.style.borderRadius = '3px';
    label.style.pointerEvents = 'none';
    cursor.appendChild(label);
    
    return cursor;
  }

  /**
   * Calculate cursor position for a textarea
   * Returns {x, y} coordinates relative to the textarea's visible area
   */
  function calculateTextareaCursorPosition(textarea, cursorPos) {
    const style = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    
    // Get padding and border values
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    
    // Create a hidden div that mirrors the textarea's styling exactly
    const mirror = document.createElement('div');
    
    // Copy all relevant styles that affect text rendering
    [
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
      'letterSpacing', 'textTransform', 'wordSpacing',
      'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
      'borderLeftWidth', 'borderRightWidth', 'borderTopWidth', 'borderBottomWidth',
      'boxSizing', 'whiteSpace', 'wordWrap', 'lineHeight'
    ].forEach(prop => {
      mirror.style[prop] = style[prop];
    });
    
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap'; // Match textarea behavior
    mirror.style.wordWrap = 'break-word';
    mirror.style.width = textarea.offsetWidth + 'px';
    mirror.style.height = 'auto';
    mirror.style.overflow = 'visible';
    
    // Position mirror exactly where textarea is for accurate measurement
    const textareaRect = textarea.getBoundingClientRect();
    mirror.style.top = textareaRect.top + 'px';
    mirror.style.left = textareaRect.left + 'px';
    
    document.body.appendChild(mirror);
    
    try {
      const text = textarea.value.substring(0, cursorPos);
      
      // Insert marker at cursor position
      const marker = document.createElement('span');
      marker.style.display = 'inline-block';
      marker.style.width = '1px';
      marker.style.height = lineHeight + 'px';
      marker.style.verticalAlign = 'top';
      marker.style.backgroundColor = 'transparent';
      
      // Build mirror content: text before cursor + marker
      mirror.textContent = '';
      if (text.length > 0) {
        const textNode = document.createTextNode(text);
        mirror.appendChild(textNode);
      }
      mirror.appendChild(marker);
      
      // Force layout recalculation
      void mirror.offsetHeight;
      
      // Get bounding rectangles
      const markerRect = marker.getBoundingClientRect();
      
      // Calculate position relative to textarea's top-left corner
      // markerRect is already in viewport coordinates, textareaRect is too
      const absoluteX = markerRect.left - textareaRect.left;
      const absoluteY = markerRect.top - textareaRect.top;
      
      // Account for scroll position
      // When textarea is scrolled, content moves but cursor container doesn't
      const scrollTop = textarea.scrollTop;
      const scrollLeft = textarea.scrollLeft;
      
      // Final position: absolute position minus scroll
      // This gives us position relative to the visible textarea area
      const x = absoluteX - scrollLeft;
      const y = absoluteY - scrollTop;
      
      return {
        x: Math.max(0, x),
        y: Math.max(0, y),
        lineHeight: lineHeight
      };
    } catch (e) {
      console.warn('[Yjs] Error calculating textarea cursor position:', e);
      // Fallback: estimate based on line count
      const text = textarea.value.substring(0, cursorPos);
      const lines = text.split('\n');
      const currentLine = lines.length - 1;
      const currentLineText = lines[currentLine] || '';
      
      // Estimate X from line text length (rough approximation)
      const charWidth = parseFloat(style.fontSize) * 0.6; // Approximate character width
      const estimatedX = currentLineText.length * charWidth;
      const yInContent = currentLine * lineHeight;
      const scrollTop = textarea.scrollTop;
      const scrollLeft = textarea.scrollLeft;
      
      return {
        x: Math.max(0, paddingLeft + estimatedX - scrollLeft),
        y: Math.max(0, paddingTop + yInContent - scrollTop),
        lineHeight: lineHeight
      };
    } finally {
      document.body.removeChild(mirror);
    }
  }

  /**
   * Calculate cursor position for CKEditor using DOM Range API
   * Returns {x, y, lineHeight} coordinates relative to the editable element
   */
  function calculateCKEditorCursorPosition(editableEl, charOffset) {
    if (!editableEl) return null;
    
    // Walk through text nodes to find the one containing our offset
    const walker = document.createTreeWalker(
      editableEl,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let currentOffset = 0;
    let targetNode = null;
    let nodeOffset = 0;
    let textNodes = [];
    
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const nodeLength = node.textContent.length;
      textNodes.push({ text: node.textContent.substring(0, 20), length: nodeLength, offset: currentOffset });
      
      if (!targetNode && currentOffset + nodeLength >= charOffset) {
        targetNode = node;
        nodeOffset = charOffset - currentOffset;
      }
      currentOffset += nodeLength;
    }
    
    console.debug('[Yjs] 🔍 CKEditor text walk:', {
      charOffset,
      totalTextLength: currentOffset,
      textNodesFound: textNodes.length,
      targetNodeFound: !!targetNode,
      nodeOffset,
      firstNodes: textNodes.slice(0, 5)
    });
    
    if (!targetNode) {
      // Fallback: cursor is at the end or no text nodes
      console.debug('[Yjs] ⚠️ No target node found, using fallback');
      const lastNode = editableEl.lastChild;
      if (lastNode) {
        const rect = editableEl.getBoundingClientRect();
        return {
          x: 10,
          y: rect.height - 20,
          lineHeight: 20
        };
      }
      return { x: 10, y: 10, lineHeight: 20 };
    }
    
    // Create a range at the cursor position
    const range = document.createRange();
    try {
      range.setStart(targetNode, Math.min(nodeOffset, targetNode.textContent.length));
      range.setEnd(targetNode, Math.min(nodeOffset, targetNode.textContent.length));
      
      const rects = range.getClientRects();
      const editableRect = editableEl.getBoundingClientRect();
      
      console.debug('[Yjs] 🔍 Range rects:', {
        rectsCount: rects.length,
        editableRect: { left: editableRect.left, top: editableRect.top, width: editableRect.width, height: editableRect.height },
        firstRect: rects.length > 0 ? { left: rects[0].left, top: rects[0].top } : null
      });
      
      if (rects.length > 0) {
        const rect = rects[0];
        const style = window.getComputedStyle(targetNode.parentElement || editableEl);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 20;
        
        // Account for scroll position of the editable
        const scrollTop = editableEl.scrollTop || 0;
        const scrollLeft = editableEl.scrollLeft || 0;
        
        const result = {
          x: rect.left - editableRect.left + scrollLeft,
          y: rect.top - editableRect.top + scrollTop,
          lineHeight: lineHeight
        };
        
        console.debug('[Yjs] ✅ Calculated position:', result);
        return result;
      }
    } catch (e) {
      console.warn('[Yjs] Range calculation error:', e);
    }
    
    // Fallback
    console.debug('[Yjs] ⚠️ Using fallback position');
    return { x: 10, y: 10, lineHeight: 20 };
  }

  // Transaction origin constant - used to distinguish local vs remote updates
  // See: https://docs.yjs.dev/api/document-updates
  const LOCAL_ORIGIN = 'local-editor';

  /**
   * Apply minimal diff to Y.Text instead of replacing entire content.
   * This follows the y-prosemirror pattern (see SO#78057638).
   * Preserves cursor positions and is more efficient for collaborative editing.
   * 
   * Uses transaction origin to prevent echo loops where updates bounce back.
   * See: https://docs.yjs.dev/api/document-updates#example-listen-to-update-events
   */
  function applyDiffToYText(ydoc, ytext, oldValue, newValue) {
    if (oldValue === newValue) return;
    
    // Find common prefix
    let prefixLen = 0;
    const minLen = Math.min(oldValue.length, newValue.length);
    while (prefixLen < minLen && oldValue[prefixLen] === newValue[prefixLen]) {
      prefixLen++;
    }
    
    // Find common suffix (but don't overlap with prefix)
    let suffixLen = 0;
    while (
      suffixLen < (oldValue.length - prefixLen) &&
      suffixLen < (newValue.length - prefixLen) &&
      oldValue[oldValue.length - 1 - suffixLen] === newValue[newValue.length - 1 - suffixLen]
    ) {
      suffixLen++;
    }
    
    // Calculate what needs to change
    const deleteStart = prefixLen;
    const deleteCount = oldValue.length - prefixLen - suffixLen;
    const insertText = newValue.slice(prefixLen, newValue.length - suffixLen || undefined);
    
    // Apply the minimal change in a transaction with LOCAL_ORIGIN
    // This allows us to distinguish local changes from remote ones
    ydoc.transact(() => {
      if (deleteCount > 0) {
        ytext.delete(deleteStart, deleteCount);
      }
      if (insertText.length > 0) {
        ytext.insert(deleteStart, insertText);
      }
    }, LOCAL_ORIGIN);
    
    console.debug('[Yjs] 📝 Diff applied:', { deleteStart, deleteCount, insertLen: insertText.length });
  }

  /**
   * Generate a color from a string (session ID or user ID) by hashing into HSL color space
   * Each session gets a unique color even if same user
   */
  function getColorFromHash(str) {
    // Hash the string to get a number
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Project hash into HSL color space for vibrant, distinct colors
    // Hue: 0-360, Saturation: 60-80%, Lightness: 45-55%
    const hue = Math.abs(hash) % 360;
    const saturation = 60 + (Math.abs(hash >> 8) % 20); // 60-80%
    const lightness = 45 + (Math.abs(hash >> 16) % 10);  // 45-55%
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }
  
  /**
   * Generate a color for a user based on their ID (fallback)
   */
  function getUserColor(userId) {
    return getColorFromHash(userId);
  }
  
  /**
   * Generate a color for a session (unique per tab)
   */
  function getSessionColor(sessionId) {
    return getColorFromHash(sessionId || String(Math.random()));
  }

  /**
   * Initialize Yjs collaboration for a textarea (plain text editor)
   */
  function initTextareaCollaboration(textarea, documentName, hocuspocusUrl, user) {
    if (activeCollaborations.has(textarea)) {
      return activeCollaborations.get(textarea);
    }

    // Create Yjs document
    const ydoc = new Y.Doc();
    console.log('[Yjs] Created document:', documentName);
    const ytext = ydoc.getText('content');

    // Generate a unique session ID per WebSocket connection
    // Will be set after provider connects using the clientId from awareness
    // This ensures each WebSocket connection (each browser tab) gets a unique session ID
    let sessionId = null; // Will be set after provider connects

    // Validate document name BEFORE connecting
    if (!documentName || documentName.trim() === '') {
      console.error('[Yjs] ❌ Cannot connect: document name is empty or invalid:', documentName);
      return null;
    }
    
    // HocuspocusProvider appends document name to URL path: url + '/' + name
    // So if url='ws://localhost:3000/ws' and name='doc', it connects to 'ws://localhost:3000/ws/doc'
    // Traefik strips /ws prefix → forwards /doc to Hocuspocus
    // Hocuspocus extracts document name from path
    const baseUrl = hocuspocusUrl.replace(/\/+$/, ''); // Remove trailing slash
    
    console.log('[Yjs] 📡 Connecting to Hocuspocus:');
    console.log('[Yjs]   Base WebSocket URL:', baseUrl);
    console.log('[Yjs]   Document name:', documentName);
    console.log('[Yjs]   Full connection URL will be:', `${baseUrl}/${documentName}`);
    
    const provider = new HocuspocusProvider({
      url: baseUrl, // Base URL - HocuspocusProvider will append '/' + documentName
      name: documentName, // Document name - appended to URL path by HocuspocusProvider
      document: ydoc,
      token: JSON.stringify({ id: user.id, name: user.name }), // Pass user info as JSON token
      onConnect: () => {
        console.log('[Yjs] Connected to Hocuspocus:', documentName);
        // Reset reconnection retry count on successful connection
        reconnectionManager.onConnectSuccess(provider);
        // Generate unique session ID based on WebSocket connection (clientId from awareness)
        // Each WebSocket connection gets a unique clientId, so this ensures uniqueness per tab
        const clientId = provider.awareness.clientID;
        sessionId = `${user.id}-${clientId}-${Date.now()}`;
        console.log('[Yjs] 👤 Current user:', user.name, `(${user.id})`, 'clientId:', clientId, 'document:', documentName);
        console.log('[Yjs] ✅ Your peer ID is:', clientId, '(this tab\'s unique WebSocket connection ID)');
        // Set awareness state - this broadcasts to all other clients
        provider.awareness.setLocalStateField('sessionId', sessionId);
        provider.awareness.setLocalStateField('user', user);
        provider.awareness.setLocalStateField('cursor', null);
        // Use session color for unique per-tab colors
        provider.awareness.setLocalStateField('color', getSessionColor(sessionId));
        updateConnectionStatus('connected'); // No message - let it use the fallback with editor count
        // Force immediate widget update to show presence - use setTimeout to ensure awareness is set
        setTimeout(() => {
          updateCollaborationStatusWidget('connected');
        }, 100);
      },
      onDisconnect: () => {
        console.warn('[Yjs] Disconnected from Hocuspocus:', documentName);
        updateConnectionStatus('disconnected');
        // Ensure widget gets disconnected class - update immediately
        updateCollaborationStatusWidget('disconnected');
        // Force widget to have disconnected class for test detection
        const widget = document.getElementById('yjs-collaboration-status') || document.querySelector('.yjs-collaboration-status-widget');
        if (widget) {
          widget.className = widget.className.replace(/\bconnected\b|\bsyncing\b/g, '') + ' disconnected';
        }
        // Reconnect logic with exponential backoff
        // But only if we're not in a test environment (test will block reconnection)
        const isTest = window.location.search.includes('test=true') || (window.__TEST_MODE__ === true);
        if (!isTest) {
          const retryCount = reconnectionManager.getRetryCount(provider);
          const nextDelay = reconnectionManager.getNextDelay(provider);
          updateCollaborationStatusWidget('disconnected', `Disconnected. Retrying in ${Math.round(nextDelay / 1000)}s...`);
          reconnectionManager.scheduleReconnect(provider, documentName);
        }
      },
      onStatus: ({ status }) => {
        console.log('[Yjs] Status changed:', status, documentName);
        if (status === 'connected') {
          updateConnectionStatus('connected');
          updateCollaborationStatusWidget('connected');
        } else if (status === 'connecting') {
          updateConnectionStatus('syncing');
          updateCollaborationStatusWidget('syncing');
        } else {
          updateConnectionStatus('disconnected');
          updateCollaborationStatusWidget('disconnected');
        }
      },
      onSynced: () => {
        // Called when initial sync with server is complete
        console.log('[Yjs] 🔄 Initial sync complete for:', documentName);
        syncInitialTextareaContent();
      },
      onDestroy: () => {
        console.log('[Yjs] Provider destroyed:', documentName);
      },
      onConnectError: (error) => {
        console.error('[Yjs] Connection error:', error, 'document:', documentName, 'url:', hocuspocusUrl);
      },
    });

    // Track if initial sync is done
    let initialSyncDone = false;
    
    // Sync initial content - called from onSynced to ensure Yjs is fully synced
    function syncInitialTextareaContent() {
      if (initialSyncDone) return;
      initialSyncDone = true;
      
      const yjsContent = ytext.toString();
      const peerCount = provider.awareness.getStates().size;
      
      console.log('[Yjs] 📊 Content comparison:', {
        textareaLength: textarea.value?.length || 0,
        yjsLength: yjsContent?.length || 0,
        peerCount: peerCount,
        textareaPreview: textarea.value?.substring(0, 50),
        yjsPreview: yjsContent?.substring(0, 50)
      });
      
      if (yjsContent && yjsContent.length > 0) {
        // Yjs has content - use it (it's synced from other editors)
        if (textarea.value !== yjsContent) {
          console.log('[Yjs] 📥 Loading synced content from Yjs into textarea');
          textarea.value = yjsContent;
          $(textarea).trigger('change');
        }
      } else if (textarea.value && textarea.value.length > 0 && peerCount <= 1) {
        // Yjs is empty, textarea has content, AND we're the only peer - safe to initialize
        console.log('[Yjs] 📤 Initializing Yjs with textarea content (first client)');
        ydoc.transact(() => {
          ytext.insert(0, textarea.value);
        }, LOCAL_ORIGIN);
      } else if (peerCount > 1 && yjsContent.length === 0) {
        // Other peers exist but Yjs is empty - wait a bit and retry
        console.log('[Yjs] ⏳ Other peers exist, waiting for sync...');
        setTimeout(syncInitialTextareaContent, 200);
        initialSyncDone = false; // Allow retry
      }
      // If both empty and no other peers, nothing to do
    }

    // Create container for cursors - positioned absolutely over the textarea
    const cursorContainer = document.createElement('div');
    cursorContainer.className = 'yjs-cursor-container';
    cursorContainer.style.position = 'absolute';
    cursorContainer.style.top = '0';
    cursorContainer.style.left = '0';
    cursorContainer.style.width = '100%';
    cursorContainer.style.height = '100%';
    cursorContainer.style.pointerEvents = 'none';
    cursorContainer.style.zIndex = '100';
    cursorContainer.style.overflow = 'hidden';
    
    // Wrap textarea if not already wrapped
    let wrapper = textarea.parentElement;
    if (!wrapper || !wrapper.classList.contains('yjs-wrapper')) {
      wrapper = document.createElement('div');
      wrapper.className = 'yjs-wrapper';
      wrapper.style.position = 'relative';
      wrapper.style.display = 'inline-block';
      wrapper.style.width = '100%';
      textarea.parentNode.insertBefore(wrapper, textarea);
      wrapper.appendChild(textarea);
    }
    wrapper.appendChild(cursorContainer);
    
    // Update cursor container size when textarea resizes
    const updateCursorContainerSize = () => {
      const rect = textarea.getBoundingClientRect();
      cursorContainer.style.width = textarea.offsetWidth + 'px';
      cursorContainer.style.height = textarea.offsetHeight + 'px';
    };
    updateCursorContainerSize();
    
    // Watch for textarea resize
    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(updateCursorContainerSize);
      resizeObserver.observe(textarea);
    }

    // Initial content sync happens in onSynced callback (after Yjs is fully synced)

    let isUpdating = false;
    let lastCursorPosition = textarea.selectionStart || 0;

    // Update textarea when Yjs changes from remote peers
    // See: https://docs.yjs.dev/api/document-updates
    // CRDTs handle content merging automatically - we should not interfere with cursor positions
    // Cursor positions are communicated via awareness, not inferred from content changes
    ytext.observe((event, transaction) => {
      // Skip if this is our own local change (prevents echo loop)
      if (transaction.origin === LOCAL_ORIGIN) return;
      if (isUpdating) return;
      
      // Only update content if textarea is NOT focused
      // If user is actively editing, we should preserve their cursor position
      // If textarea is not focused, updating content won't affect cursor position
      const isFocused = document.activeElement === textarea;
      
      isUpdating = true;
      const currentValue = textarea.value;
      const yjsValue = ytext.toString();
      
      if (currentValue !== yjsValue) {
        // Save cursor position before updating content
        const currentCursorPos = textarea.selectionStart;
        const currentSelectionEnd = textarea.selectionEnd;
        
        // Update content - Yjs CRDT handles merging automatically
        // Cursor positions are communicated via awareness, NOT by adjusting cursor on content changes
        // See: https://docs.yjs.dev/getting-started/adding-awareness
        // We should NOT adjust cursor position based on remote content changes
        textarea.value = yjsValue;
        
        // Only clamp cursor if it's beyond the new content length (safety measure)
        // Otherwise, let the browser preserve the cursor position naturally
        // The browser's default behavior is correct - it preserves cursor position relative to content
        const maxPos = yjsValue.length;
        if (currentCursorPos > maxPos || currentSelectionEnd > maxPos) {
          // Position is out of bounds, clamp to end
          textarea.setSelectionRange(maxPos, maxPos);
        }
        // Note: If cursor was at position 5 and someone inserts text before position 5,
        // the browser will naturally move the cursor forward. This is correct behavior.
        // We should NOT manually adjust it - that would interfere with the user's cursor position.
        
        $(textarea).trigger('change');
      }
      
      setTimeout(() => { isUpdating = false; }, 0);
    });

    // Update Yjs when textarea changes
    textarea.addEventListener('input', (e) => {
      if (isUpdating) return;
      
      isUpdating = true;
      const currentValue = textarea.value;
      const yjsValue = ytext.toString();
      const cursorPos = textarea.selectionStart || 0;
      
      if (currentValue !== yjsValue) {
        // Apply minimal diff to Y.Text instead of replacing everything
        // This preserves cursor positions and is more efficient (see SO#78057638)
        applyDiffToYText(ydoc, ytext, yjsValue, currentValue);
      }
      
      // Update cursor position in awareness
      lastCursorPosition = cursorPos;
      provider.awareness.setLocalStateField('cursor', cursorPos);
      
      setTimeout(() => { isUpdating = false; }, 0);
    });

    // Update cursor position on selection change and mouse/keyboard events
    const updateCursorPosition = () => {
      const cursorPos = textarea.selectionStart || 0;
      if (cursorPos !== lastCursorPosition) {
        lastCursorPosition = cursorPos;
        provider.awareness.setLocalStateField('cursor', cursorPos);
      }
    };
    
    // Listen to various events that change cursor position
    textarea.addEventListener('click', updateCursorPosition);
    textarea.addEventListener('keyup', updateCursorPosition);
    textarea.addEventListener('keydown', updateCursorPosition);
    
    // Use selectionchange if available (Chrome/Edge)
    if (document.addEventListener) {
      document.addEventListener('selectionchange', () => {
        if (document.activeElement === textarea) {
          updateCursorPosition();
        }
      });
    }
    
    // Also update on focus/blur
    textarea.addEventListener('focus', () => {
      updateCursorPosition();
      // Only track as active if this is a main content editor (not comments/notes)
      if (!shouldEnableCollaboration(textarea)) {
        console.log('[Yjs] ⏭️ Not tracking focus for non-main-content textarea:', textarea.id || textarea.name);
        return;
      }
      // Track this as the active editor
      activeEditorElement = textarea;
      console.log('[Yjs] 📝 Editor focused, setting activeEditorElement and showing widget');
      // Update widget position and visibility
      const widget = getCollaborationStatusWidget();
      updateCollaborationStatusWidget();
      // Ensure widget is visible
      if (widget) {
        widget.style.display = 'block';
        console.log('[Yjs] ✅ Widget should now be visible, display:', widget.style.display);
      }
    });
    
    textarea.addEventListener('blur', () => {
      // Only clear if this is still the active editor (might have switched to another)
      if (activeEditorElement === textarea) {
        activeEditorElement = null;
        // Hide widget when no editor is focused
        const widget = document.getElementById('yjs-collaboration-status');
        if (widget) {
          widget.style.display = 'none';
        }
      }
    });

    // Handle remote cursors and presence using Yjs awareness
    const remoteCursors = new Map();
    const knownUsers = new Map(); // Track users for presence logging
    const cursorOffsets = new Map(); // Store cursor offsets for scroll updates (clientId -> cursorPos)
    
    // Update all cursor positions on scroll/resize (similar to CKEditor solution)
    function updateAllTextareaCursorPositions() {
      cursorOffsets.forEach((cursorPos, clientId) => {
        const cursorEl = remoteCursors.get(clientId);
        if (!cursorEl || cursorPos === null || cursorPos === undefined || cursorPos < 0) return;
        
        const position = calculateTextareaCursorPosition(textarea, cursorPos);
        cursorEl.style.display = 'block';
        cursorEl.style.left = position.x + 'px';
        cursorEl.style.top = position.y + 'px';
        cursorEl.style.height = position.lineHeight + 'px';
        
        const label = cursorEl.querySelector('.yjs-cursor-label');
        if (label) {
          label.style.left = '0';
          label.style.top = '-' + (parseFloat(position.lineHeight) + 4) + 'px';
        }
      });
    }
    
    // Listen for scroll events to update cursor positions (like CKEditor)
    textarea.addEventListener('scroll', updateAllTextareaCursorPositions, { passive: true });
    window.addEventListener('scroll', updateAllTextareaCursorPositions, { passive: true });
    window.addEventListener('resize', updateAllTextareaCursorPositions, { passive: true });
    
    // Listen for Yjs awareness updates (when users join/leave/update)
    // Awareness is the core Yjs facility for presence data
    let awarenessUpdateTimeout = null;
    provider.awareness.on('update', ({ added, updated, removed }) => {
      // Handle removed clients immediately (no debounce needed)
      removed.forEach(clientId => {
        if (remoteCursors.has(clientId)) {
          const cursorEl = remoteCursors.get(clientId);
          if (cursorEl) cursorEl.remove();
          remoteCursors.delete(clientId);
          cursorOffsets.delete(clientId); // Clean up stored offset
        }
        if (knownUsers.has(clientId)) {
          const userInfo = knownUsers.get(clientId);
          console.log('[Yjs] 👋 Awareness: user removed:', userInfo?.name || clientId);
          knownUsers.delete(clientId);
        }
      });
      
      // Debounce added/updated for batching, but update widget immediately for added users
      // This ensures presence badges appear quickly when users join
      if (added.length > 0) {
        // Immediately update widget when new users are added (no debounce)
        const collab = activeCollaborations.get(textarea);
        if (collab && collab.provider) {
          const providerStatus = collab.provider.status || (collab.provider.synced ? 'connected' : 'connecting');
          const connectionState = providerStatus === 'connected' ? 'connected' : 'syncing';
          updateCollaborationStatusWidget(connectionState);
        }
      }
      
      if (awarenessUpdateTimeout) {
        clearTimeout(awarenessUpdateTimeout);
      }
      awarenessUpdateTimeout = setTimeout(() => {
      const currentUsers = new Map();
        const states = provider.awareness.getStates();
        const selfClientId = provider.awareness.clientID;
      
        // Process all awareness states - each clientId represents a unique WebSocket connection (tab)
      states.forEach((state, clientId) => {
        const userState = state.user;
          if (!userState) return; // Skip clients without user state
          
          const sessionId = state.sessionId;
        const cursorPos = state.cursor;
          // Use session color for unique per-tab colors
          const color = state.color || (sessionId ? getSessionColor(sessionId) : getUserColor(userState.id));
          const isSelf = clientId === selfClientId;
        
          currentUsers.set(clientId, {
            id: userState.id,
            name: userState.name,
            sessionId: sessionId,
            cursor: cursorPos,
            color: color,
            isSelf: isSelf
          });
        
        // Log user presence changes
          if (!isSelf) {
          const wasKnown = knownUsers.has(clientId);
          if (!wasKnown) {
              console.log('[Yjs] 👤 User joined document:', documentName, '-', userState.name, `(${userState.id})`, 'clientId:', clientId);
            }
          }
        
          // Render cursor for remote users
          if (!isSelf && cursorPos !== null && cursorPos !== undefined && cursorPos >= 0) {
          // Store cursor offset for scroll updates (like CKEditor solution)
          cursorOffsets.set(clientId, cursorPos);
          
          let cursorEl = remoteCursors.get(clientId);
          if (!cursorEl) {
              cursorEl = createCursorElement(userState.id, userState.name, color);
            cursorContainer.appendChild(cursorEl);
            remoteCursors.set(clientId, cursorEl);
          }
          
            const position = calculateTextareaCursorPosition(textarea, cursorPos);
          // Position is relative to textarea, and cursor uses position: absolute relative to cursor container
          // The cursor container is positioned absolute relative to the wrapper, which matches textarea position
          // So we can use the position directly
          console.debug('[Yjs] 🎯 Textarea cursor position:', {
            clientId,
            cursorPos,
            position,
            textareaScroll: { top: textarea.scrollTop, left: textarea.scrollLeft },
            textareaSize: { width: textarea.offsetWidth, height: textarea.offsetHeight }
          });
          // Ensure cursor is visible - set display explicitly and remove any hiding styles
          cursorEl.style.display = 'block';
          cursorEl.style.visibility = 'visible';
          cursorEl.style.opacity = '1';
          cursorEl.style.position = 'absolute'; // Ensure positioning works
            cursorEl.style.left = position.x + 'px';
            cursorEl.style.top = position.y + 'px';
            cursorEl.style.height = position.lineHeight + 'px';
            cursorEl.style.width = '2px'; // Ensure width is set
            cursorEl.style.backgroundColor = color; // Ensure color is set
            
            const label = cursorEl.querySelector('.yjs-cursor-label');
            if (label) {
              label.style.left = '0';
              label.style.top = '-' + (parseFloat(position.lineHeight) + 4) + 'px';
              label.style.display = 'block';
              label.style.visibility = 'visible';
            }
          } else if (!isSelf && remoteCursors.has(clientId)) {
            remoteCursors.get(clientId).style.display = 'none';
            cursorOffsets.delete(clientId); // Clean up offset when cursor is hidden
        }
      });
      
      // Log users who left
      knownUsers.forEach((userInfo, clientId) => {
        if (!currentUsers.has(clientId) && !userInfo.isSelf) {
          const sessionInfo = userInfo.sessionId && userInfo.sessionId !== userInfo.id ? 
            `[session: ${userInfo.sessionId.substring(0, 12)}...]` : '';
            console.log('[Yjs] 👋 User left document:', documentName, '-', userInfo.name, `(${userInfo.id})`, sessionInfo);
        }
      });
      
      // Update known users
      knownUsers.clear();
      currentUsers.forEach((info, clientId) => {
        knownUsers.set(clientId, info);
      });
      
      // Count sessions per user - use clientId as unique identifier (each WebSocket connection = unique clientId)
      const userSessions = new Map();
      currentUsers.forEach((info, clientId) => {
          const key = `${info.name} (${info.id})`;
          if (!userSessions.has(key)) {
          userSessions.set(key, new Set());
          }
        // clientId is guaranteed unique per WebSocket connection, so use it directly
        userSessions.get(key).add(clientId);
      });
      
      if (userSessions.size > 0) {
        const summary = Array.from(userSessions.entries())
          .map(([userKey, sessionSet]) => {
            const sessionCount = sessionSet.size > 1 ? ` [${sessionSet.size} sessions]` : '';
            return userKey + sessionCount;
          })
          .join(', ');
        const totalSessions = Array.from(userSessions.values()).reduce((sum, sessionSet) => sum + sessionSet.size, 0);
        console.log('[Yjs] 👥 Active users on document', documentName + ':', summary, `(${totalSessions} total session${totalSessions !== 1 ? 's' : ''})`);
      }
      
      // Remove cursors for disconnected users
      remoteCursors.forEach((cursorEl, clientId) => {
        if (!currentUsers.has(clientId)) {
          cursorEl.remove();
          remoteCursors.delete(clientId);
        }
      });
      
      // Update collaboration status widget immediately when awareness changes
      // This ensures presence badges are shown as soon as users join
      const collab = activeCollaborations.get(textarea);
      if (collab && collab.provider) {
        const providerStatus = collab.provider.status || (collab.provider.synced ? 'connected' : 'connecting');
        const connectionState = providerStatus === 'connected' ? 'connected' : 'syncing';
        updateConnectionStatus(connectionState); // Update floating badge with current count
        // Always update widget when awareness changes to ensure presence badges are shown
        // Pass connectionState to ensure widget reflects current connection status
        updateCollaborationStatusWidget(connectionState);
      } else {
        updateCollaborationStatusWidget('syncing');
      }
      }, 50); // Close setTimeout callback - small debounce to ensure sessionId is set
    }); // Close awareness.on callback

    const collaboration = { ydoc, provider, ytext, element: textarea, documentName: documentName };
    activeCollaborations.set(textarea, collaboration);
    
    return collaboration;
  }

  /**
   * Initialize Yjs collaboration for CKEditor
   */
  function initCKEditorCollaboration(textarea, documentName, hocuspocusUrl, user) {
    // Wait for CKEditor to be ready
    if (typeof CKEDITOR === 'undefined') {
      console.warn('CKEditor not loaded. Skipping CKEditor collaboration.');
      return null;
    }

    // Find CKEditor instance for this textarea
    const editorId = textarea.id || textarea.name;
    
    // IMPORTANT: Only collaborate on main content editors, NOT on comments/notes
    // This works for issues (description), wikis (content), and other entities
    if (!shouldEnableCollaboration(textarea)) {
      console.log('[Yjs] ⏭️ Skipping CKEditor collaboration for non-main-content editor:', editorId);
      return null;
    }
    
    const editor = CKEDITOR.instances[editorId];
    
    if (!editor) {
      // Wait for CKEditor to initialize
      CKEDITOR.on('instanceReady', function(event) {
        if (event.editor.name === editorId) {
          initCKEditorCollaboration(textarea, documentName, hocuspocusUrl, user);
        }
      });
      return null;
    }

    if (activeCollaborations.has(editor)) {
      return activeCollaborations.get(editor);
    }

    // Create Yjs document with XML fragment for HTML content
    const ydoc = new Y.Doc();
    const yxml = ydoc.getXmlFragment('content');

    // Generate a unique session ID per WebSocket connection
    // Will be set after provider connects using the clientId from awareness
    let sessionId = null; // Will be set after provider connects

    // Validate document name BEFORE connecting
    if (!documentName || documentName.trim() === '') {
      console.error('[Yjs] ❌ Cannot connect (CKEditor): document name is empty or invalid:', documentName);
      return null;
    }
    
    // HocuspocusProvider sends document name in protocol messages, NOT URL path
    // But Hocuspocus server extracts document name from URL path
    // So we need to manually append document name to URL: url + '/' + name
    // Traefik strips /ws prefix → forwards /document-name to Hocuspocus
    const baseUrl = hocuspocusUrl.replace(/\/+$/, ''); // Remove trailing slash
    const fullUrl = `${baseUrl}/${documentName}`; // Manually append document name
    
    console.log('[Yjs] 📡 Connecting to Hocuspocus (CKEditor):');
    console.log('[Yjs]   Base WebSocket URL:', baseUrl);
    console.log('[Yjs]   Document name:', documentName);
    console.log('[Yjs]   Full WebSocket URL:', fullUrl);
    
    // Intercept WebSocket creation to see actual URL
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(...args) {
      const url = args[0];
      console.log('[Yjs] 🔍 ACTUAL WebSocket URL being used:', url);
      return new OriginalWebSocket(...args);
    };
    
    const provider = new HocuspocusProvider({
      url: fullUrl, // Full URL with document name appended
      name: documentName, // Document name - also sent in protocol messages
      document: ydoc,
      token: JSON.stringify({ id: user.id, name: user.name }), // Pass user info as JSON token
      onConnect: () => {
        // Restore original WebSocket
        if (OriginalWebSocket) {
          window.WebSocket = OriginalWebSocket;
        }
        // Generate unique session ID based on WebSocket connection (clientId from awareness)
        const clientId = provider.awareness.clientID;
        sessionId = `${user.id}-${clientId}-${Date.now()}`;
        console.log('[Yjs] 👤 Current user (CKEditor):', user.name, `(${user.id})`, 'clientId:', clientId, 'document:', documentName);
        console.log('[Yjs] ✅ Your peer ID is:', clientId, '(this tab\'s unique WebSocket connection ID)');
        // Set awareness state - this is what other clients will see
        provider.awareness.setLocalStateField('sessionId', sessionId);
        provider.awareness.setLocalStateField('user', user);
        provider.awareness.setLocalStateField('textCursorOffset', null); // Cursor position in text
        // Reset reconnection retry count on successful connection
        reconnectionManager.onConnectSuccess(provider);
        // Use session color for unique per-tab colors
        provider.awareness.setLocalStateField('color', getSessionColor(sessionId));
        updateConnectionStatus('connected'); // No message - let it use the fallback with editor count
        // Force immediate widget update to show presence - use setTimeout to ensure awareness is set
        setTimeout(() => {
          updateCollaborationStatusWidget('connected');
        }, 100);
      },
      onDisconnect: () => {
        console.warn('[Yjs] Disconnected from Hocuspocus (CKEditor):', documentName);
        updateConnectionStatus('disconnected');
        // Ensure widget gets disconnected class - update immediately
        updateCollaborationStatusWidget('disconnected');
        // Force widget to have disconnected class for test detection
        const widget = document.getElementById('yjs-collaboration-status') || document.querySelector('.yjs-collaboration-status-widget');
        if (widget) {
          widget.className = widget.className.replace(/\bconnected\b|\bsyncing\b/g, '') + ' disconnected';
        }
        // Reconnect logic with exponential backoff
        // But only if we're not in a test environment (test will block reconnection)
        const isTest = window.location.search.includes('test=true') || (window.__TEST_MODE__ === true);
        if (!isTest) {
          const retryCount = reconnectionManager.getRetryCount(provider);
          const nextDelay = reconnectionManager.getNextDelay(provider);
          updateCollaborationStatusWidget('disconnected', `Disconnected. Retrying in ${Math.round(nextDelay / 1000)}s...`);
          reconnectionManager.scheduleReconnect(provider, documentName);
        }
      },
      onStatus: ({ status }) => {
        if (status === 'connected') {
          updateConnectionStatus('connected');
          updateCollaborationStatusWidget('connected');
        } else if (status === 'connecting') {
          updateConnectionStatus('syncing');
          updateCollaborationStatusWidget('syncing');
        } else {
          updateConnectionStatus('disconnected');
          updateCollaborationStatusWidget('disconnected');
          // Force widget to have disconnected class for test detection
          const widget = document.getElementById('yjs-collaboration-status') || document.querySelector('.yjs-collaboration-status-widget');
          if (widget) {
            widget.className = widget.className.replace(/\bconnected\b|\bsyncing\b/g, '') + ' disconnected';
          }
        }
      },
      onSynced: () => {
        // Called when initial sync with server is complete
        // NOW we can safely compare Yjs content with editor content
        console.log('[Yjs] 🔄 Initial sync complete for:', documentName);
        syncInitialContent();
      },
    });

    // Awareness state will be set in onConnect callback after WebSocket connection is established

    let isUpdating = false;
    let initialSyncDone = false;

    // Sync CKEditor content with Yjs XML fragment
    // For HTML content, we'll sync the HTML string as text
    const ytext = ydoc.getText('html-content');

    // Sync initial content - called from onSynced to ensure Yjs is fully synced
    function syncInitialContent() {
      if (initialSyncDone) return;
      initialSyncDone = true;
      
      const initialContent = editor.getData();
      const yjsContent = ytext.toString();
      const peerCount = provider.awareness.getStates().size;
      
      console.log('[Yjs] 📊 Content comparison:', {
        editorLength: initialContent?.length || 0,
        yjsLength: yjsContent?.length || 0,
        peerCount: peerCount,
        editorPreview: initialContent?.substring(0, 50),
        yjsPreview: yjsContent?.substring(0, 50)
      });
      
      if (yjsContent && yjsContent.length > 0) {
        // Yjs has content - use it (it's synced from other editors)
        if (initialContent !== yjsContent) {
          console.log('[Yjs] 📥 Loading synced content from Yjs into editor');
          isUpdating = true;
          editor.setData(yjsContent, { callback: function() {
            setTimeout(() => { isUpdating = false; }, 0);
          }});
        }
      } else if (initialContent && initialContent.length > 0 && peerCount <= 1) {
        // Yjs is empty, editor has content, AND we're the only peer - safe to initialize
        // If there are other peers, wait for their content to arrive
        console.log('[Yjs] 📤 Initializing Yjs with editor content (first client)');
        ydoc.transact(() => {
          ytext.insert(0, initialContent);
        }, LOCAL_ORIGIN);
      } else if (peerCount > 1 && yjsContent.length === 0) {
        // Other peers exist but Yjs is empty - wait a bit and retry
        console.log('[Yjs] ⏳ Other peers exist, waiting for sync...');
        setTimeout(syncInitialContent, 200);
        initialSyncDone = false; // Allow retry
      }
      // If both empty and no other peers, nothing to do
    }

    // Update CKEditor when Yjs changes from remote peers
    // See: https://docs.yjs.dev/api/document-updates
    ytext.observe((event, transaction) => {
      // Skip if this is our own local change (prevents echo loop)
      if (transaction.origin === LOCAL_ORIGIN) return;
      if (isUpdating) return;
      
      isUpdating = true;
      const currentContent = editor.getData();
      const yjsContent = ytext.toString();
      
      if (currentContent !== yjsContent) {
        console.debug('[Yjs] 📥 Remote update applied to CKEditor');
        editor.setData(yjsContent, { callback: function() {
          setTimeout(() => { isUpdating = false; }, 0);
        }});
      } else {
        setTimeout(() => { isUpdating = false; }, 0);
      }
    });

    // Update Yjs when CKEditor changes
    editor.on('change', function() {
      if (isUpdating) return;
      
      isUpdating = true;
      const currentContent = editor.getData();
      const yjsContent = ytext.toString();
      
      if (currentContent !== yjsContent) {
        // Apply minimal diff to Y.Text instead of replacing everything
        // This preserves cursor positions and is more efficient (see SO#78057638)
        applyDiffToYText(ydoc, ytext, yjsContent, currentContent);
      }
      
      // Update cursor position in awareness
      updateCKEditorCursorPosition();
      
      setTimeout(() => { isUpdating = false; }, 0);
    });
    
    // Track cursor position using Yjs awareness
    // Awareness is the Yjs facility for ephemeral presence data (cursors, selections, etc.)
    // See: https://docs.yjs.dev/getting-started/awareness
    let lastCursorOffset = null;
    
    function updateCKEditorCursorPosition() {
      try {
        const editable = editor.editable();
        if (!editable || !editable.$) return;
        
        // CKEditor may use an iframe - get selection from the correct document
        // The editable's document might be different from window.document
        const editableDoc = editable.$.ownerDocument || document;
        const nativeSelection = editableDoc.getSelection ? editableDoc.getSelection() : 
                               (editableDoc.defaultView && editableDoc.defaultView.getSelection ? 
                                editableDoc.defaultView.getSelection() : null);
        
        if (!nativeSelection || nativeSelection.rangeCount === 0) {
          console.debug('[Yjs] No selection in CKEditor');
          return;
        }
        
        const range = nativeSelection.getRangeAt(0);
        
        // Verify the selection is within our editable area
        if (!editable.$.contains(range.startContainer)) {
          console.debug('[Yjs] Selection not in editable area');
          return;
        }
        
        // Calculate character offset in rendered text content
        // Since content is synced via Yjs, same text offset = same position across editors
        const charOffset = getCharacterOffsetInElement(editable.$, range.startContainer, range.startOffset);
        if (charOffset === null || charOffset < 0) {
          console.debug('[Yjs] Could not calculate char offset');
          return;
        }
        
        if (charOffset !== lastCursorOffset) {
          lastCursorOffset = charOffset;
          // Use Yjs awareness to broadcast cursor position to all peers
          provider.awareness.setLocalStateField('textCursorOffset', charOffset);
          console.debug('[Yjs] 📍 Awareness: sending cursor offset:', charOffset);
        }
      } catch (error) {
        console.debug('[Yjs] CKEditor cursor tracking error:', error);
      }
    }
    
    // Clean up awareness state on destroy
    function cleanupAwareness() {
      provider.awareness.setLocalState(null);
      console.log('[Yjs] 🧹 Awareness state cleared');
    }
    
    // Get character offset from start of element to a specific point in text content
    function getCharacterOffsetInElement(root, targetNode, targetOffset) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      let offset = 0;
      let node;
      
      while ((node = walker.nextNode())) {
        if (node === targetNode) {
          return offset + targetOffset;
        }
        offset += node.textContent.length;
      }
      
      // If targetNode is not a text node, count all text up to it
      if (targetNode.nodeType !== Node.TEXT_NODE) {
        return offset;
      }
      
      return null;
    }
    
    // Convert character offset to visual position in the editor
    function getVisualPositionFromCharOffset(editableEl, charOffset) {
      if (charOffset === null || charOffset < 0) {
        console.warn('[Yjs] getVisualPositionFromCharOffset: invalid offset', charOffset);
        return null;
      }
      
      const walker = document.createTreeWalker(editableEl, NodeFilter.SHOW_TEXT, null, false);
      let currentOffset = 0;
      let node;
      let nodeCount = 0;
      
      while ((node = walker.nextNode())) {
        nodeCount++;
        const nodeLength = node.textContent.length;
        if (currentOffset + nodeLength >= charOffset) {
          // Found the node containing our offset
          const offsetInNode = charOffset - currentOffset;
          
          try {
            const range = document.createRange();
            range.setStart(node, Math.min(offsetInNode, nodeLength));
            range.setEnd(node, Math.min(offsetInNode, nodeLength));
            
            const rects = range.getClientRects();
            if (rects.length > 0) {
              const rect = rects[0];
              const editableRect = editableEl.getBoundingClientRect();
              const style = window.getComputedStyle(node.parentElement || editableEl);
              
              const result = {
                x: rect.left - editableRect.left + (editableEl.scrollLeft || 0),
                y: rect.top - editableRect.top + (editableEl.scrollTop || 0),
                lineHeight: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 20
              };
              console.debug('[Yjs] 📍 getVisualPositionFromCharOffset found position:', {
                charOffset, nodeCount, offsetInNode, result
              });
              return result;
            } else {
              console.warn('[Yjs] No rects from range at offset', charOffset);
            }
          } catch (e) {
            console.warn('[Yjs] Error getting rects:', e);
            console.debug('[Yjs] Range error:', e);
          }
          break;
        }
        currentOffset += nodeLength;
      }
      
      return null;
    }
    
    // Update cursor position on various CKEditor events
    editor.on('selectionChange', updateCKEditorCursorPosition);
    editor.on('key', updateCKEditorCursorPosition);
    editor.on('contentDom', function() {
      const editable = editor.editable();
      if (editable) {
        editable.attachListener(editable, 'keyup', updateCKEditorCursorPosition);
        editable.attachListener(editable, 'click', updateCKEditorCursorPosition);
      }
    });
    
    // Track CKEditor as active editor when focused (only if it's a main content editor)
    editor.on('focus', function() {
      // Only track as active if this is a main content editor (not comments/notes)
      const editorId = editor.name;
      // Find the corresponding textarea to check if collaboration should be enabled
      const textarea = document.getElementById(editorId) || document.querySelector(`textarea[name="${editorId}"]`);
      if (textarea && !shouldEnableCollaboration(textarea)) {
        console.log('[Yjs] ⏭️ Not tracking focus for non-main-content CKEditor:', editorId);
        return;
      }
      activeEditorElement = editor;
      // Update widget position and visibility
      getCollaborationStatusWidget();
      updateCollaborationStatusWidget();
    });
    
    editor.on('blur', function() {
      // Only clear if this is still the active editor (might have switched to another)
      if (activeEditorElement === editor) {
        activeEditorElement = null;
        // Hide widget when no editor is focused
        const widget = document.getElementById('yjs-collaboration-status');
        if (widget) {
          widget.style.display = 'none';
        }
      }
    });

    // Update textarea when editor changes (for form submission)
    editor.on('change', function() {
      textarea.value = editor.getSnapshot();
      $(textarea).trigger('change');
    });

    // Create cursor container for CKEditor
    // Cursors use position:fixed with viewport coordinates, so container is just at 0,0
    const cursorContainerCK = document.createElement('div');
    cursorContainerCK.className = 'yjs-cursor-container yjs-cursor-container-ckeditor';
    cursorContainerCK.style.position = 'fixed';
    cursorContainerCK.style.top = '0';
    cursorContainerCK.style.left = '0';
    cursorContainerCK.style.pointerEvents = 'none';
    cursorContainerCK.style.zIndex = '10000';
    document.body.appendChild(cursorContainerCK);
    console.log('[Yjs] 📦 Created CKEditor cursor container');
    
    // Store cursor offsets for scroll updates
    const cursorOffsets = new Map(); // clientId -> textCursorOffset
    
    // Update all cursor positions (called on scroll)
    function updateAllCursorPositions() {
      const editable = editor.editable();
      if (!editable || !editable.$) return;
      
      // Calculate iframe offset once for all cursors
      const editableEl = editable.$;
      const editableDoc = editableEl.ownerDocument;
      const editableWin = editableDoc.defaultView || editableDoc.parentWindow;
      
      let iframeOffset = { top: 0, left: 0 };
      if (editableWin !== window) {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          try {
            if (iframe.contentDocument === editableDoc || iframe.contentWindow === editableWin) {
              const iframeRect = iframe.getBoundingClientRect();
              iframeOffset.top = iframeRect.top;
              iframeOffset.left = iframeRect.left;
              break;
            }
          } catch (e) { /* cross-origin iframe, skip */ }
        }
      }
      
      const editableRect = editableEl.getBoundingClientRect();
      
      cursorOffsets.forEach((offset, clientId) => {
        const cursorEl = remoteCursorsCK.get(clientId);
        if (!cursorEl || offset === null || offset === undefined) return;
        
        const position = getVisualPositionFromCharOffset(editable.$, offset);
        if (position) {
          const viewportX = iframeOffset.left + editableRect.left + position.x;
          const viewportY = iframeOffset.top + editableRect.top + position.y;
          cursorEl.style.left = viewportX + 'px';
          cursorEl.style.top = viewportY + 'px';
        }
      });
    }
    
    // Listen for scroll events to update cursor positions
    window.addEventListener('scroll', updateAllCursorPositions, { passive: true });
    // Also listen to CKEditor's internal scroll if it has one
    editor.on('contentDom', function() {
      const editable = editor.editable();
      if (editable && editable.$) {
        editable.$.addEventListener('scroll', updateAllCursorPositions, { passive: true });
      }
    });
    
    // Handle remote presence and cursors using Yjs awareness
    // Awareness provides: added, updated, removed arrays for efficient updates
    const knownUsersCK = new Map();
    const remoteCursorsCK = new Map();
    let awarenessUpdateTimeoutCK = null;
    
    // Listen for awareness changes - this is the core Yjs presence mechanism
    provider.awareness.on('update', ({ added, updated, removed }) => {
      // Handle removed clients immediately (no debounce needed)
      removed.forEach(clientId => {
        if (remoteCursorsCK.has(clientId)) {
          const cursorEl = remoteCursorsCK.get(clientId);
          if (cursorEl) cursorEl.remove();
          remoteCursorsCK.delete(clientId);
          cursorOffsets.delete(clientId); // Clean up stored offset
        }
        if (knownUsersCK.has(clientId)) {
          const userInfo = knownUsersCK.get(clientId);
          console.log('[Yjs] 👋 Awareness: user removed:', userInfo?.name || clientId);
          knownUsersCK.delete(clientId);
        }
      });
      
      // Debounce added/updated for batching
      // Debounce added/updated for batching, but update widget immediately for added users
      // This ensures presence badges appear quickly when users join
      if (added.length > 0) {
        // Immediately update widget when new users are added (no debounce)
        const collab = activeCollaborations.get(editor);
        if (collab && collab.provider) {
          const providerStatus = collab.provider.status || (collab.provider.synced ? 'connected' : 'connecting');
          const connectionState = providerStatus === 'connected' ? 'connected' : 'syncing';
          updateCollaborationStatusWidget(connectionState);
        }
      }
      
      if (awarenessUpdateTimeoutCK) {
        clearTimeout(awarenessUpdateTimeoutCK);
      }
      awarenessUpdateTimeoutCK = setTimeout(() => {
      const currentUsers = new Map();
      const states = provider.awareness.getStates(); // Get all client states
      
        const selfClientIdCK = provider.awareness.clientID;
        
        // Count all states, including those without user state yet (connecting)
        let connectingCount = 0;
      states.forEach((state, clientId) => {
        const userState = state.user;
          if (!userState) {
            // Client is connecting but hasn't set user state yet
            connectingCount++;
            return;
          }
          
          const sessionId = state.sessionId;
          // Use text cursor offset - same offset = same position in synced content
          const textCursorOffset = state.textCursorOffset;
          // Use session color for unique per-tab colors
          const color = state.color || (sessionId ? getSessionColor(sessionId) : getUserColor(userState.id));
          const isSelf = clientId === selfClientIdCK;
        
          currentUsers.set(clientId, {
            id: userState.id,
            name: userState.name,
            sessionId: sessionId,
            textCursorOffset: textCursorOffset,
            color: color,
            isSelf: isSelf
          });
        
        // Log user presence changes
          if (!isSelf) {
          const wasKnown = knownUsersCK.has(clientId);
          if (!wasKnown) {
              console.log('[Yjs] 👤 User joined document:', documentName, '-', userState.name, `(${userState.id})`, 'clientId:', clientId, '(CKEditor)');
            }
          }
          
          // Render cursor for remote users using text cursor offset
          console.log('[Yjs] 👀 Processing peer:', {
            clientId,
            isSelf,
            userId: userState.id,
            userName: userState.name,
            textCursorOffset,
            hasOffset: textCursorOffset !== null && textCursorOffset !== undefined && textCursorOffset >= 0
          });
          
          if (!isSelf && textCursorOffset !== null && textCursorOffset !== undefined && textCursorOffset >= 0) {
            let cursorEl = remoteCursorsCK.get(clientId);
            if (!cursorEl) {
              cursorEl = createCursorElement(userState.id, userState.name, color);
              cursorContainerCK.appendChild(cursorEl);
              remoteCursorsCK.set(clientId, cursorEl);
              console.log('[Yjs] ✨ Created cursor element for:', userState.name);
            }
            
            // Store offset for scroll updates
            cursorOffsets.set(clientId, textCursorOffset);
            
            // Calculate visual position from character offset in local editor
            const editable = editor.editable();
            if (editable && editable.$) {
              const position = getVisualPositionFromCharOffset(editable.$, textCursorOffset);
              
              if (position) {
                // CKEditor may use an iframe - we need to account for it
                const editableEl = editable.$;
                const editableDoc = editableEl.ownerDocument;
                const editableWin = editableDoc.defaultView || editableDoc.parentWindow;
                
                // Get editable rect - if in iframe, this is relative to iframe
                let editableRect = editableEl.getBoundingClientRect();
                
                // Check if we're in an iframe and add iframe's position
                let iframeOffset = { top: 0, left: 0 };
                if (editableWin !== window) {
                  // We're in an iframe - find it and get its position
                  const iframes = document.querySelectorAll('iframe');
                  for (const iframe of iframes) {
                    try {
                      if (iframe.contentDocument === editableDoc || iframe.contentWindow === editableWin) {
                        const iframeRect = iframe.getBoundingClientRect();
                        iframeOffset.top = iframeRect.top;
                        iframeOffset.left = iframeRect.left;
                        break;
                      }
                    } catch (e) { /* cross-origin iframe, skip */ }
                  }
                }
                
                // Position in viewport coordinates
                const viewportX = iframeOffset.left + editableRect.left + position.x;
                const viewportY = iframeOffset.top + editableRect.top + position.y;
                
                cursorEl.style.display = 'block';
                cursorEl.style.left = viewportX + 'px';
                cursorEl.style.top = viewportY + 'px';
                cursorEl.style.height = (position.lineHeight || 20) + 'px';
              } else {
                console.warn('[Yjs] ⚠️ Could not calculate position for offset:', textCursorOffset);
              }
            } else {
              console.warn('[Yjs] ⚠️ No editable element for cursor positioning');
            }
          } else if (!isSelf && remoteCursorsCK.has(clientId)) {
            remoteCursorsCK.get(clientId).style.display = 'none';
          }
      });
      
      // Log users who left
      knownUsersCK.forEach((userInfo, clientId) => {
        if (!currentUsers.has(clientId) && !userInfo.isSelf) {
          const sessionInfo = userInfo.sessionId && userInfo.sessionId !== userInfo.id ? 
            `[session: ${userInfo.sessionId.substring(0, 12)}...]` : '';
            console.log('[Yjs] 👋 User left document:', documentName, '-', userInfo.name, `(${userInfo.id})`, sessionInfo, '(CKEditor)');
            
            // Remove cursor element if it exists
            const cursorEl = remoteCursorsCK.get(clientId);
            if (cursorEl) {
              cursorEl.remove();
              remoteCursorsCK.delete(clientId);
              cursorOffsets.delete(clientId); // Clean up stored offset
            }
        }
      });
      
      // Update known users
      knownUsersCK.clear();
      currentUsers.forEach((info, clientId) => {
        knownUsersCK.set(clientId, info);
      });
      
      // Log current presence summary with session counts
        // Group by user ID (not name) to properly count sessions from same user
        // Include ALL users (including self) to show total session count
      const userSessions = new Map();
        const allClientIds = [];
        currentUsers.forEach((info, cid) => {
          const key = `${info.name} (${info.id})`;
          if (!userSessions.has(key)) {
            userSessions.set(key, new Set());
          }
          const sessionId = info.sessionId || cid.toString();
          userSessions.get(key).add(sessionId);
          allClientIds.push({ clientId: cid, sessionId, isSelf: info.isSelf, user: key });
        });
        
        // Debug: log all client states
        const totalClientsWithUsers = currentUsers.size;
        const otherClientsWithUsers = Array.from(currentUsers.values()).filter(u => !u.isSelf).length;
        const totalStates = states.size;
        console.log('[Yjs] 🔍 Debug - All client states (CKEditor):', {
          totalClients: totalClientsWithUsers,
          otherClients: otherClientsWithUsers, // Excluding self
          totalStates: totalStates,
          connecting: connectingCount,
          clientIds: allClientIds.map(c => ({ clientId: c.clientId, sessionId: c.sessionId.substring(0, 20), isSelf: c.isSelf, user: c.user })),
          states: Array.from(states.entries()).map(([cid, state]) => ({
            clientId: cid,
            sessionId: state.sessionId?.substring(0, 20) || 'none',
            userId: state.user?.id,
            userName: state.user?.name,
            hasUser: !!state.user
          }))
      });
      
      if (userSessions.size > 0) {
        const summary = Array.from(userSessions.entries())
            .map(([userKey, sessionSet]) => {
              const sessionCount = sessionSet.size > 1 ? ` [${sessionSet.size} sessions]` : '';
            return userKey + sessionCount;
          })
          .join(', ');
          const totalSessions = Array.from(userSessions.values()).reduce((sum, sessionSet) => sum + sessionSet.size, 0);
          console.log('[Yjs] 👥 Active users on document', documentName + ':', summary, `(${totalSessions} total session${totalSessions !== 1 ? 's' : ''}) (CKEditor)`);
        } else {
          console.log('[Yjs] 👥 No users on document:', documentName, '(CKEditor)');
        }
        
        // Update collaboration status widget and floating badge
        // HocuspocusProvider uses 'status' property, not 'isConnected'
        const providerStatus = provider.status || (provider.synced ? 'connected' : 'connecting');
        const connectionState = providerStatus === 'connected' ? 'connected' : 
                               (providerStatus === 'connecting' || connectingCount > 0) ? 'syncing' : 'disconnected';
        updateConnectionStatus(connectionState); // Update floating badge with current count
        updateCollaborationStatusWidget(connectionState);
      }, 50); // Debounce awareness updates
    });

    const collaboration = { ydoc, provider, ytext, element: editor, documentName: documentName };
    activeCollaborations.set(editor, collaboration);
    
    return collaboration;
  }

  /**
   * Initialize Yjs collaboration for an element
   */
  function initYjsCollaboration(element, documentName, hocuspocusUrl, user) {
    if (!element || !documentName) {
      return null;
    }

    // Check if CKEditor is enabled for this textarea
    const isCKEditor = typeof CKEDITOR !== 'undefined' && 
                       CKEDITOR.instances[element.id || element.name];
    
    if (isCKEditor) {
      return initCKEditorCollaboration(element, documentName, hocuspocusUrl, user);
    } else if (element.tagName === 'TEXTAREA') {
      return initTextareaCollaboration(element, documentName, hocuspocusUrl, user);
    }
    
    return null;
  }

  /**
   * Generate a unique document name for Yjs sync
   * Uses document context from server-side to ensure uniqueness
   */
  function generateDocumentName(element) {
    const id = element.id || '';
    const name = element.name || '';
    const fieldName = id || name || 'content';
    
    // Get document context from config (set by server-side hook)
    const docContext = window.RedmineYjsConfig?.documentContext || {};
    
    // Priority: Use server-provided context first (most reliable)
    if (docContext.issue_id) {
      // Issue document: use simple format issue-{issue_id} for main fields
      // For description and notes, just use issue-{id}
      if (fieldName.includes('description') || fieldName.includes('notes')) {
        return `issue-${docContext.issue_id}`;
      }
      // For other fields, include field name
      return `issue-${docContext.issue_id}-${fieldName}`;
    }
    
    if (docContext.wiki_page_id || docContext.wiki_page_title) {
      // Wiki page document: wiki-{project_id}-{page_id_or_title}-{field}
      const projectId = docContext.project_id || '0';
      const pageId = docContext.wiki_page_id || docContext.wiki_page_title || 'unknown';
      // Sanitize page title for use in document name (replace spaces/special chars)
      const pageIdSafe = String(pageId).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      return `wiki-${projectId}-${pageIdSafe}-${fieldName}`;
    }
    
    if (docContext.project_id) {
      // Project-level document: project-{project_id}-{field}
      return `project-${docContext.project_id}-${fieldName}`;
    }
    
    // Fallback: Extract from URL (less reliable but better than nothing)
    const urlMatch = window.location.pathname.match(/\/(projects|issues|wiki)\/([^\/]+)/);
    const urlType = urlMatch ? urlMatch[1] : null;
    const urlId = urlMatch ? urlMatch[2] : null;
    
    // Try to extract IDs from URL
    const issueMatch = window.location.pathname.match(/\/issues\/(\d+)/);
    const issueId = issueMatch ? issueMatch[1] : null;
    
    const projectMatch = window.location.pathname.match(/\/projects\/([^\/]+)/);
    const projectSlug = projectMatch ? projectMatch[1] : null;
    
    // Try to get IDs from form data as last resort
    const form = element.closest('form');
    let formProjectId = null;
    let formIssueId = null;
    
    if (form) {
      const projectInput = form.querySelector('input[name*="project_id"], select[name*="project_id"]');
      if (projectInput) {
        formProjectId = projectInput.value || null;
      }
      
      const issueInput = form.querySelector('input[name*="issue_id"], input[name*="id"]');
      if (issueInput && issueInput.value) {
        formIssueId = issueInput.value;
      }
    }
    
    // Generate document name with fallback priority
    if (formIssueId || issueId) {
      // For description and notes, use simple format issue-{id}
      if (fieldName.includes('description') || fieldName.includes('notes')) {
        return `issue-${formIssueId || issueId}`;
      }
      // For other fields, include field name
      return `issue-${formIssueId || issueId}-${fieldName}`;
    }
    
    if (urlType === 'wiki' && urlId) {
      // Wiki page from URL: wiki-{project_slug}-{page_title}-{field}
      const projectId = formProjectId || projectSlug || '0';
      const pageIdSafe = String(urlId).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      return `wiki-${projectId}-${pageIdSafe}-${fieldName}`;
    }
    
    if (formProjectId || projectSlug) {
      return `project-${formProjectId || projectSlug}-${fieldName}`;
    }
    
    // Last resort: use URL path as identifier
    if (urlId) {
      const pathSafe = window.location.pathname.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      return `doc-${pathSafe}-${fieldName}`;
    }
    
    console.warn('[Yjs] Could not generate unique document name for:', element.id || element.name);
    return null;
  }

  // Track initialization to prevent duplicate calls
  let editorsInitialized = false;
  let editorsInitializing = false;

  /**
   * Initialize collaboration for all editors on the page
   */
  function initAllEditors() {
    // Prevent duplicate initialization
    if (editorsInitialized || editorsInitializing) {
      return;
    }
    editorsInitializing = true;
    
    // Get WebSocket URL from config - use window.location to avoid hostname mismatch
    // HocuspocusProvider sends document name in protocol messages, NOT URL path
    // But we manually append it to URL so Hocuspocus can extract it from path
    let hocuspocusUrl = window.RedmineYjsConfig?.hocuspocusUrl;
    if (!hocuspocusUrl) {
      // Fallback: construct from current page protocol/host with /ws path
      // Use window.location to match the page's origin exactly
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // CRITICAL: Use window.location.host to match the page origin exactly
      // This ensures WebSocket connects to the same host/port as the page
      const host = window.location.host; // Includes hostname:port
      hocuspocusUrl = `${protocol}//${host}/ws`;
    } else {
      // If config URL uses localhost but page is accessed via 0.0.0.0, replace to match
      // This ensures WebSocket connects to the same hostname as the page
      if (window.location.hostname === '0.0.0.0' && hocuspocusUrl.includes('localhost')) {
        hocuspocusUrl = hocuspocusUrl.replace(/localhost/g, '0.0.0.0');
      }
      // If config URL uses 0.0.0.0 but page is accessed via localhost, replace to match
      if (window.location.hostname === 'localhost' && hocuspocusUrl.includes('0.0.0.0')) {
        hocuspocusUrl = hocuspocusUrl.replace(/0\.0\.0\.0/g, 'localhost');
      }
    }
    // Ensure URL ends with /ws (no trailing slash)
    hocuspocusUrl = hocuspocusUrl.replace(/\/+$/, ''); // Remove trailing slashes
    if (!hocuspocusUrl.endsWith('/ws')) {
      hocuspocusUrl = hocuspocusUrl + '/ws';
    }
    console.log('[Yjs] 🔧 Final hocuspocusUrl for provider:', hocuspocusUrl);
    
    const enabled = window.RedmineYjsConfig?.enabled !== false;
    
    console.log('[Yjs] Initializing editors:', { hocuspocusUrl, enabled });

    if (!enabled) {
      editorsInitializing = false; // Reset flag if disabled
      return;
    }

    const user = getCurrentUser();

    // Find all textareas that should have collaboration
    // Include specific selectors for issue forms (even if hidden initially)
    // For issue pages, we'll filter to only description editor later
    const selectors = [
      'textarea[id*="description"]',
      'textarea[id*="content"]',
      'textarea[id*="text"]',
      'textarea.wiki-edit',
      '#issue_description_and_toolbar textarea',
      '#update textarea',
      'form#issue-form textarea',
      'form.edit_issue textarea'
    ].join(', ');
    
    let editorsFound = 0;
    let editorsInitializedCount = 0;
    
    console.log('[Yjs] 🔍 Searching for textareas with selectors:', selectors);
    const allTextareas = document.querySelectorAll(selectors);
    console.log('[Yjs] 🔍 Found', allTextareas.length, 'textarea(s)');
    
    allTextareas.forEach((textarea) => {
      editorsFound++;
      
      const editorId = textarea.id || textarea.name;
      const hasCKEditor = typeof CKEDITOR !== 'undefined' && CKEDITOR.instances[editorId];
      
      console.log('[Yjs] 🔍 Processing textarea:', editorId, 'id:', textarea.id, 'name:', textarea.name, 'parent:', textarea.closest('#issue_description_and_toolbar, #update, form#issue-form')?.id || 'none');
      
      // IMPORTANT: Only collaborate on main content editors, NOT on comments/notes
      // This works for issues (description), wikis (content), and other entities
      if (!shouldEnableCollaboration(textarea)) {
        return;
      }
      
      // Check if we need to switch from CKEditor to plain text (or vice versa)
      // If textarea has collaboration but CKEditor was destroyed, clean it up
      if (activeCollaborations.has(textarea) && !hasCKEditor) {
        // Plain text editor is active and already has collaboration - keep it
        editorsInitializedCount++;
        return;
      }
      // If CKEditor instance exists and is tracked, keep it
      if (hasCKEditor && activeCollaborations.has(CKEDITOR.instances[editorId])) {
        editorsInitializedCount++;
        console.log('[Yjs] ⏭️ Skipping already initialized CKEditor:', editorId);
        return;
      }
      // If textarea was tracked for CKEditor but CKEditor is gone, clean up and re-initialize
      if (activeCollaborations.has(textarea) && hasCKEditor === false) {
        // CKEditor was destroyed, clean up old collaboration
        const oldCollab = activeCollaborations.get(textarea);
        if (oldCollab && oldCollab.provider) {
          console.log('[Yjs] 🔄 CKEditor destroyed, cleaning up old collaboration for:', editorId);
          oldCollab.provider.destroy();
          activeCollaborations.delete(textarea);
        }
      }
      
      const isHidden = textarea.offsetParent === null && textarea.style.display === 'none';
      const computedStyle = window.getComputedStyle(textarea);
      const isActuallyHidden = computedStyle.display === 'none' || computedStyle.visibility === 'hidden';
      
      // For hidden textareas on issue show pages, still initialize (form will become visible)
      // Only skip if it's truly hidden and we're not on an issue show page
      const isIssueShowPage = /\/issues\/\d+$/.test(window.location.pathname);
      
      if (isActuallyHidden && !isIssueShowPage) {
        if (hasCKEditor) {
          // CKEditor is ready, initialize it
          console.log('[Yjs] 🔍 Found hidden textarea with CKEditor instance:', editorId);
        } else if (typeof CKEDITOR !== 'undefined') {
          // CKEditor is loading but not ready yet - wait for it
          console.log('[Yjs] ⏳ CKEditor not ready yet for:', editorId, '- will retry on instanceReady');
          // Don't skip - let initYjsCollaboration handle the wait
        } else {
          // No CKEditor at all, skip hidden textarea (unless it's an issue show page)
          console.log('[Yjs] ⏭️ Skipping hidden textarea (no CKEditor):', editorId);
          return;
        }
      } else if (isActuallyHidden && isIssueShowPage) {
        // On issue show pages, initialize even if hidden (form will become visible)
        console.log('[Yjs] 🔍 Found hidden textarea on issue show page, will initialize (form will become visible):', editorId);
      } else if (!isActuallyHidden) {
        console.log('[Yjs] ✅ Found visible textarea:', editorId);
      }
      
      // Generate document name FIRST and validate it BEFORE initializing
      const documentName = generateDocumentName(textarea);
      if (!documentName || documentName.trim() === '') {
        console.error('[Yjs] ❌ Cannot initialize collaboration: document name is empty or invalid');
        console.error('[Yjs]   Element:', textarea.id || textarea.name);
        console.error('[Yjs]   Document context:', window.RedmineYjsConfig?.documentContext);
        updateCollaborationStatusWidget('disconnected', 'No document name available');
        return; // Skip this textarea
      }
      
      console.log('[Yjs] 📄 Document name generated:', documentName, 'for field:', textarea.id || textarea.name);
      // Update widget to show we're initializing
      updateCollaborationStatusWidget('syncing', 'Initializing collaboration...');
        const collaboration = initYjsCollaboration(textarea, documentName, hocuspocusUrl, user);
        if (collaboration) {
        editorsInitializedCount++;
        console.log('[Yjs] ✓ Collaboration initialized for document:', documentName);
        // Widget will be updated by onConnect/onStatus callbacks
        } else {
        console.warn('[Yjs] ✗ Failed to initialize collaboration for document:', documentName);
        // Don't update widget here - might be waiting for CKEditor
        if (!isHidden || hasCKEditor) {
          // Only show error if not waiting for CKEditor
          updateCollaborationStatusWidget('disconnected', 'Failed to initialize');
        }
      }
    });
    
    console.log('[Yjs] 📊 Editor initialization summary:', {
      editorsFound: editorsFound,
      editorsInitialized: editorsInitializedCount,
      alreadyInitialized: activeCollaborations.size
    });
    
    // Initialize collaboration status widget if no editors found
    if (editorsFound === 0) {
      updateCollaborationStatusWidget('disconnected', 'No editors found');
      editorsInitialized = true; // No editors to initialize
      editorsInitializing = false;
    } else if (editorsInitializedCount > 0) {
      // At least one editor was initialized (or was already initialized)
      editorsInitialized = true;
      editorsInitializing = false;
    } else {
      // Editors found but none initialized yet (probably waiting for CKEditor)
      console.log('[Yjs] ⏳ Waiting for editors to be ready...');
      editorsInitializing = false; // Allow retry
      // Don't set editorsInitialized = true, so we can retry
    }
  }

  /**
   * Merge external content (from database) with Yjs document
   * This is called when someone saves while another user is editing
   * 
   * The merge handles two scenarios:
   * 1. Saved content was previously in Yjs (normal case) - CRDTs merge automatically
   * 2. Saved content was never in Yjs (e.g., saved directly without Yjs) - we need to diff and apply changes
   */
  function mergeExternalContent(documentName, externalContent) {
    console.log('[Yjs] 🔀 Merging external content for document:', documentName);
    console.log('[Yjs] External content length:', externalContent?.length || 0);
    
    // Find the collaboration for this document
    let collaboration = null;
    for (const [element, collab] of activeCollaborations.entries()) {
      if (collab.documentName === documentName) {
        collaboration = collab;
        break;
      }
    }
    
    if (!collaboration) {
      console.warn('[Yjs] No active collaboration found for document:', documentName);
      return false;
    }
    
    const { ydoc, ytext } = collaboration;
    const currentContent = ytext.toString();
    
    // If content is the same, no merge needed
    if (currentContent === externalContent) {
      console.log('[Yjs] Content already matches, no merge needed');
      return true;
    }
    
    // Strategy: Merge external content (from database) with current Yjs document
    // 
    // This handles two scenarios:
    // 1. Saved content was previously in Yjs (normal collaborative editing case)
    //    - Yjs CRDTs merge automatically based on shared history
    // 2. Saved content was never in Yjs (e.g., saved directly without Yjs, or before Yjs was initialized)
    //    - We create a temporary Y.Doc and merge it - Yjs CRDTs can merge independent states
    //    - However, this may not preserve all local changes if content diverged significantly
    //
    // Note: The merge works best when the saved content was at least partially in Yjs before.
    // If the saved content is completely new (never in Yjs), the merge might not be perfect,
    // but Yjs will do its best to merge the states.
    
    // Save current cursor position if editor is focused
    let cursorPosition = null;
    try {
      if (collaboration.element && collaboration.element === document.activeElement) {
        cursorPosition = collaboration.element.selectionStart;
      }
    } catch (e) {
      // Ignore errors getting cursor position
    }
    
    // Create a temporary Y.Doc with the external content
    // This represents the state that was saved to the database
    const tempDoc = new Y.Doc();
    const tempYtext = tempDoc.getText('content');
    
    // Insert external content into temp document
    tempYtext.insert(0, externalContent || '');
    
    // Get the update from temp document
    const update = Y.encodeStateAsUpdate(tempDoc);
    
    // Apply the update to the current document
    // Yjs CRDTs will merge the content, attempting to preserve both:
    // - The saved content from the database
    // - Any local unsaved changes in the current Yjs document
    // 
    // This works because Yjs uses CRDTs (Conflict-free Replicated Data Types) that can
    // merge independent states. However, if the content diverged significantly and was
    // never in Yjs before, the merge might not be perfect.
    Y.applyUpdate(ydoc, update);
    
    // Restore cursor position if it was saved
    if (cursorPosition !== null && collaboration.element) {
      try {
        const newLength = ytext.toString().length;
        const safePosition = Math.min(cursorPosition, newLength);
        collaboration.element.setSelectionRange(safePosition, safePosition);
      } catch (e) {
        // Ignore errors setting cursor position
      }
    }
    
    console.log('[Yjs] ✅ Merged external content with local changes');
    console.log('[Yjs] Before merge:', currentContent.substring(0, 50));
    console.log('[Yjs] After merge:', ytext.toString().substring(0, 50));
    
    return true;
  }
  
  // Expose merge function globally so it can be called from hooks
  if (typeof window.RedmineYjs === 'undefined') {
    window.RedmineYjs = {};
  }
  window.RedmineYjs.mergeExternalContent = mergeExternalContent;
  
  /**
   * Process merge data from JSON script tag (set by Ruby hooks)
   * This is called when someone saves while another user is editing
   */
  function processMergeData() {
    // Read merge data from JSON script tag
    const mergeDataScript = document.getElementById('yjs-merge-data');
    if (!mergeDataScript) {
      return;
    }
    
    let mergeData;
    try {
      mergeData = JSON.parse(mergeDataScript.textContent);
    } catch (e) {
      console.error('[Yjs] Failed to parse merge data:', e);
      return;
    }
    
    const { document: documentName, content, autoRetry } = mergeData;
    console.log('[Yjs] Processing merge data for:', documentName, 'autoRetry:', autoRetry);
    
    function tryMerge() {
      if (window.RedmineYjs && window.RedmineYjs.mergeExternalContent) {
        const merged = window.RedmineYjs.mergeExternalContent(documentName, content);
        if (merged && autoRetry) {
          // Auto-retry the save after merge completes
          setTimeout(() => {
            const form = document.querySelector('form[action*="wiki"], form#wiki_form, form[action*="issues"], form#issue-form');
            if (form) {
              console.log('[Yjs] Auto-retrying save after merge');
              form.submit();
            }
          }, 500);
        }
        // Remove merge data script after processing
        mergeDataScript.remove();
        return true;
      }
      return false;
    }
    
    // Try immediately
    if (!tryMerge()) {
      // Yjs not ready yet, retry periodically
      let attempts = 0;
      const maxAttempts = 20; // 10 seconds max
      const interval = setInterval(() => {
        attempts++;
        if (tryMerge() || attempts >= maxAttempts) {
          clearInterval(interval);
        }
      }, 500);
    }
  }
  
  // Process merge data when Yjs is initialized
  // Wait a bit for collaborations to initialize
  setTimeout(processMergeData, 1000);
  
  // Also process immediately if merge data exists (in case Yjs is already initialized)
  if (document.getElementById('yjs-merge-data')) {
    processMergeData();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllEditors);
  } else {
    setTimeout(initAllEditors, 100); // Small delay to ensure everything is ready
  }
  
  // Also watch for dynamically shown edit forms (e.g., issue edit form that's hidden initially)
  // Use MutationObserver to detect when edit forms become visible
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      // Check if any edit forms became visible
      const updateDiv = document.querySelector('#update');
      const hasVisibleEditForm = updateDiv && 
                                 (updateDiv.style.display !== 'none' && 
                                  window.getComputedStyle(updateDiv).display !== 'none') &&
                                 updateDiv.querySelector('form');
      
      // Also check if textareas became visible (e.g., switching from CKEditor to plain text)
      const visibleTextareas = document.querySelectorAll('#issue_description_and_toolbar textarea:not([style*="display: none"]), #update textarea:not([style*="display: none"])');
      const hasVisibleTextarea = visibleTextareas.length > 0;
      
      if ((hasVisibleEditForm || hasVisibleTextarea) && !editorsInitializing) {
        console.log('[Yjs] Edit form or textarea became visible, initializing collaboration');
        // Reset flags to allow re-initialization (in case editor mode changed)
        editorsInitialized = false;
        setTimeout(initAllEditors, 500); // Small delay to ensure form is fully rendered
      }
    });
    
    // Observe changes to the document body, especially the #update div
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    
    // Also observe the #update div specifically if it exists
    const updateDiv = document.querySelector('#update');
    if (updateDiv) {
      observer.observe(updateDiv, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }
    
    // Also observe #issue_description_and_toolbar if it exists (issue edit form)
    const issueDescriptionToolbar = document.querySelector('#issue_description_and_toolbar');
    if (issueDescriptionToolbar) {
      console.log('[Yjs] 🔍 Observing #issue_description_and_toolbar for changes');
      observer.observe(issueDescriptionToolbar, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }
  }
  
  // Also listen for click events on Edit buttons to trigger initialization
  // Redmine uses showAndScrollTo() function to show the edit form
  document.addEventListener('click', (event) => {
    const target = event.target;
    // Check if Edit button was clicked (icon-edit class or link containing /edit)
    if (target && target.closest && target.closest('a.icon-edit, a[href*="/edit"], a[onclick*="showAndScrollTo"]')) {
      console.log('[Yjs] Edit button clicked, will initialize collaboration when form appears');
      // Wait a bit for the form to appear, then initialize
      setTimeout(() => {
        if (!editorsInitialized && !editorsInitializing) {
          console.log('[Yjs] Initializing collaboration after Edit button click');
          initAllEditors();
        }
      }, 300);
    }
  }, true); // Use capture phase to catch events early

  // Re-initialize after AJAX updates (Redmine uses AJAX)
  if (typeof jQuery !== 'undefined') {
    $(document).ajaxComplete(function() {
      setTimeout(initAllEditors, 100);
    });
  }

  // Also listen for CKEditor initialization
  if (typeof CKEDITOR !== 'undefined') {
    CKEDITOR.on('instanceReady', function(event) {
      console.log('[Yjs] 🔔 CKEditor instanceReady event:', event.editor.name);
      // Reset flags to allow re-initialization
      editorsInitialized = false;
      editorsInitializing = false;
      setTimeout(initAllEditors, 200); // Longer delay to ensure CKEditor is fully ready
    });
  } else {
    // CKEditor might load later, set up listener when it becomes available
    const checkCKEditor = setInterval(function() {
      if (typeof CKEDITOR !== 'undefined') {
        clearInterval(checkCKEditor);
        console.log('[Yjs] 🔔 CKEditor loaded, setting up instanceReady listener');
        CKEDITOR.on('instanceReady', function(event) {
          console.log('[Yjs] 🔔 CKEditor instanceReady event:', event.editor.name);
          editorsInitialized = false;
          editorsInitializing = false;
          setTimeout(initAllEditors, 200);
        });
      }
    }, 500);
    // Stop checking after 10 seconds
    setTimeout(function() {
      clearInterval(checkCKEditor);
    }, 10000);
  }
  
  } // End of initializeCollaboration function
})();

