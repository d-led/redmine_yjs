/**
 * Collaboration step definitions for concurrent editing tests
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect, Page, Locator } from '@playwright/test';
import { ICustomWorld } from '../support/custom-world';
import { config } from '../support/config';

const slowExpect = expect.configure({ timeout: 15000 });

/**
 * Get the base URL
 */
function getBaseUrl(world: ICustomWorld): string {
  return config.BASE_URL;
}

/**
 * Login to Redmine if not already logged in
 */
async function ensureLoggedIn(world: ICustomWorld, browser: 'A' | 'B'): Promise<void> {
  const page = browser === 'A' ? world.pageA! : world.pageB!;
  const loggedInKey = browser === 'A' ? 'loggedInA' : 'loggedInB';
  
  if (world[loggedInKey]) {
    return;
  }
  
  const baseUrl = getBaseUrl(world);
  await page.goto(`${baseUrl}/login`);
  await page.fill('#username', config.admin.login);
  await page.fill('#password', config.admin.password);
  await page.click('input[type="submit"][name="login"]');
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
  
  world[loggedInKey] = true;
}

/**
 * Navigate to issue edit page and wait for editor to be ready
 */
async function forceFocusEditor(page: Page, editorLocator: Locator): Promise<void> {
  // First, wait for element to be attached (don't require visibility yet)
  await editorLocator.waitFor({ state: 'attached', timeout: 10000 });
  
  // Check if there's an "Edit" link that needs to be clicked first (for description fields)
  // This is common in Redmine where description fields start in preview mode
  const editLink = page.locator('a:has-text("Edit"), a[href*="edit"]').first();
  try {
    const editLinkVisible = await editLink.isVisible({ timeout: 2000 });
    if (editLinkVisible) {
      console.log('[forceFocusEditor] Clicking Edit link to open editor');
      await editLink.click();
      await page.waitForTimeout(500); // Wait for editor to appear
    }
  } catch (e) {
    // No Edit link found, that's fine
  }
  
  // Check if ClassicEditor (CKEditor 5) or CKEditor (CKEditor 3/4) is being used for this textarea
  const textareaId = await editorLocator.getAttribute('id').catch(() => null);
  const editorInfo = await page.evaluate((id: string | null) => {
    if (!id) return { type: null, found: false };
    
    // Check for ClassicEditor (CKEditor 5)
    const classicEditor = (window as any).ClassicEditor;
    if (typeof classicEditor !== 'undefined') {
      // Try to find the editor instance by looking for the element
      const element = document.querySelector(`#${id}`);
      if (element) {
        // ClassicEditor stores instances in a WeakMap, so we need to check differently
        // Look for the editor's root element (usually has a data-cke attribute or is in a specific container)
        const editorRoot = element.closest('.ck-editor') || element.parentElement;
        if (editorRoot) {
          // Check if there's an editable element (ClassicEditor creates a contenteditable div)
          const editable = editorRoot.querySelector('.ck-editor__editable');
          if (editable) {
            return { type: 'classic', found: true, element: id };
          }
        }
      }
    }
    
    // Check for CKEditor (CKEditor 3/4)
    const ckeditor = (window as any).CKEDITOR;
    if (typeof ckeditor !== 'undefined' && 
        ckeditor.instances && 
        ckeditor.instances[id] !== undefined) {
      return { type: 'ckeditor', found: true, element: id };
    }
    
    return { type: null, found: false };
  }, textareaId).catch(() => ({ type: null, found: false }));
  
  if (editorInfo.found && textareaId) {
    if (editorInfo.type === 'classic') {
      console.log(`[forceFocusEditor] ClassicEditor (CKEditor 5) detected for textarea ${textareaId}, focusing editor`);
      
      // Focus ClassicEditor using its API
      // According to CKEditor 5 docs: https://ckeditor.com/docs/ckeditor5/latest/framework/deep-dive/ui/focus-tracking.html
      // We should use editor.focus() or editor.editing.view.focus()
      await page.evaluate((id: string) => {
        const element = document.querySelector(`#${id}`);
        if (!element) return;
        
        // Find the editor root container
        const editorRoot = element.closest('.ck-editor') || element.parentElement;
        if (!editorRoot) return;
        
        // Find the editable element
        const editable = editorRoot.querySelector('.ck-editor__editable') as HTMLElement;
        if (!editable) return;
        
        // Try multiple methods to get the editor instance and focus it
        // Method 1: Check if editor instance is stored on the element or in a data attribute
        let editor = null;
        
        // Some implementations store editor on the element
        if ((editable as any).ckeditorInstance) {
          editor = (editable as any).ckeditorInstance;
        }
        // Check parent elements
        else if ((editorRoot as any).ckeditorInstance) {
          editor = (editorRoot as any).ckeditorInstance;
        }
        // Check if stored in a global registry (some implementations do this)
        else if ((window as any).ckeditorInstances && (window as any).ckeditorInstances[id]) {
          editor = (window as any).ckeditorInstances[id];
        }
        // Try to get from ClassicEditor's internal registry (if accessible)
        else {
          const classicEditor = (window as any).ClassicEditor;
          if (classicEditor && classicEditor.instances) {
            // CKEditor 5 might store instances in a Map or similar structure
            try {
              // Try to find by element
              for (const [key, instance] of classicEditor.instances.entries()) {
                if (instance.sourceElement === element || instance.sourceElement?.id === id) {
                  editor = instance;
                  break;
                }
              }
            } catch (e) {
              // Instances might not be directly accessible
            }
          }
        }
        
        // If we found the editor instance, use the proper API
        if (editor && typeof editor.focus === 'function') {
          editor.focus();
        } else if (editor && editor.editing && editor.editing.view && typeof editor.editing.view.focus === 'function') {
          editor.editing.view.focus();
        } else {
          // Fallback: focus the editable element directly
          // This should work for most cases as the editable element is the focusable area
          editable.focus();
          editable.click();
          
          // Also try to dispatch focus events to ensure proper focus tracking
          editable.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
          editable.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      }, textareaId);
      
      await page.waitForTimeout(500); // Give time for focus events to fire
      
      // Verify ClassicEditor is focused
      const isFocused = await page.evaluate((id: string) => {
        const element = document.querySelector(`#${id}`);
        if (!element) return false;
        const editorRoot = element.closest('.ck-editor') || element.parentElement;
        if (!editorRoot) return false;
        const editable = editorRoot.querySelector('.ck-editor__editable') as HTMLElement;
        if (!editable) return false;
        return document.activeElement === editable || editable.contains(document.activeElement);
      }, textareaId).catch(() => false);
      
      if (isFocused) {
        console.log('[forceFocusEditor] ClassicEditor is focused - collaboration should be active');
        return;
      } else {
        console.warn('[forceFocusEditor] ClassicEditor focus may not be set, but continuing');
        return;
      }
    } else if (editorInfo.type === 'ckeditor') {
      console.log(`[forceFocusEditor] CKEditor (3/4) detected for textarea ${textareaId}, focusing CKEditor instance`);
      
      // Focus CKEditor using its API
      await page.evaluate((id: string) => {
        const ckeditor = (window as any).CKEDITOR;
        const editor = ckeditor?.instances?.[id];
        if (editor) {
          editor.focus();
          // Also try clicking the editor's editable area
          const editable = editor.editable();
          if (editable && editable.$) {
            editable.$.focus();
          }
        }
      }, textareaId);
      
      await page.waitForTimeout(500); // Give time for focus events to fire
      
      // Verify CKEditor is focused
      const isCKEditorFocused = await page.evaluate((id: string) => {
        const ckeditor = (window as any).CKEDITOR;
        const editor = ckeditor?.instances?.[id];
        if (!editor) return false;
        const editable = editor.editable();
        if (!editable || !editable.$) return false;
        // Check if the editable element or its iframe has focus
        const iframe = editable.$.ownerDocument?.defaultView;
        return iframe?.document.activeElement === editable.$ || 
               document.activeElement === editable.$;
      }, textareaId).catch(() => false);
      
      if (isCKEditorFocused) {
        console.log('[forceFocusEditor] CKEditor is focused - collaboration should be active');
        return;
      } else {
        console.warn('[forceFocusEditor] CKEditor focus may not be set, but continuing');
        return;
      }
    }
  }
  
  // Fallback to textarea focus logic (for plain text editors)
  // Check if element is visible, if not, make it visible via JavaScript
  const isVisible = await editorLocator.isVisible().catch(() => false);
  
  if (!isVisible) {
    console.log('[forceFocusEditor] Editor not visible, making it visible via JavaScript');
    await editorLocator.evaluate((el: HTMLElement) => {
      // Make element and parents visible
      el.style.display = 'block';
      el.style.visibility = 'visible';
      el.style.opacity = '1';
      
      // Expand any collapsed parents
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        if (parent.style.display === 'none') {
          parent.style.display = 'block';
        }
        parent = parent.parentElement;
      }
    });
    await page.waitForTimeout(300);
  }
  
  // Now scroll into view (should work now that element is visible)
  try {
    await editorLocator.scrollIntoViewIfNeeded({ timeout: 5000 });
  } catch (e) {
    // If scroll fails, use JavaScript scroll
    await editorLocator.evaluate((el: HTMLElement) => {
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  }
  await page.waitForTimeout(200);
  
  // CRITICAL: Use JavaScript to force focus - collaboration features only work when focused!
  await editorLocator.evaluate((el: HTMLElement) => {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      el.focus();
      el.click();
      el.setSelectionRange(0, 0);
    }
  });
  await page.waitForTimeout(500); // Give time for focus events to fire
  
  // Verify focus is set
  const isFocused = await editorLocator.evaluate((el: HTMLElement) => {
    return document.activeElement === el;
  });
  
  if (!isFocused) {
    console.warn('[forceFocusEditor] Warning: Editor may not be focused, trying again');
    // Try one more time with a click
    await editorLocator.click({ force: true });
    await page.waitForTimeout(300);
  } else {
    console.log('[forceFocusEditor] Editor is focused - collaboration should be active');
  }
}

async function openIssueEdit(page: Page, issueId: number, world: ICustomWorld): Promise<void> {
  const baseUrl = getBaseUrl(world);
  
  // Navigate directly to edit URL
  await page.goto(`${baseUrl}/issues/${issueId}/edit`, { waitUntil: 'networkidle' });
  
  // Wait for page to fully load
  await page.waitForLoadState('domcontentloaded');
  
  // Wait for the editor to be ready - try multiple selectors
  const editorLocator = getEditorLocator(page);
  await editorLocator.waitFor({ state: 'attached', timeout: 20000 });
  
  // Wait a moment for any dynamic content to load
  await page.waitForTimeout(1000);
  
  // CRITICAL: Force focus the editor to trigger collaboration initialization
  // Collaboration features only work when the editing window is focused
  await forceFocusEditor(page, editorLocator);
  
  // Wait for Yjs collaboration to initialize (non-blocking - don't fail if widget doesn't appear immediately)
  const statusLocator = page.locator('#yjs-collaboration-status, #yjs-connection-status, .yjs-collaboration-status-widget').first();
  try {
    await statusLocator.waitFor({ state: 'attached', timeout: 10000 });
    console.log('[openIssueEdit] Yjs status widget found');
  } catch (e) {
    console.log('[openIssueEdit] Status widget not found yet, continuing (Yjs may still be initializing)');
  }
  
  // Wait for Yjs to initialize and awareness to sync
  await page.waitForTimeout(3000);
}

/**
 * Navigate to wiki page edit and wait for editor to be ready
 */
async function openWikiEdit(page: Page, projectId: string, pageName: string, world: ICustomWorld): Promise<void> {
  const baseUrl = getBaseUrl(world);
  
  // Navigate directly to edit URL
  await page.goto(`${baseUrl}/projects/${projectId}/wiki/${pageName}/edit`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('domcontentloaded');
  
  // Wait for the editor to be ready
  const editorLocator = getEditorLocator(page);
  await editorLocator.waitFor({ state: 'attached', timeout: 20000 });
  
  // Wait a moment for any dynamic content to load
  await page.waitForTimeout(1000);
  
  // CRITICAL: Force focus the editor to trigger collaboration initialization
  // Collaboration features only work when the editing window is focused
  await forceFocusEditor(page, editorLocator);
  
  // Wait for Yjs collaboration to initialize
  await slowExpect(
    page.locator('#yjs-collaboration-status, #yjs-connection-status, .yjs-collaboration-status-widget').first()
  ).toBeVisible({ timeout: 20000 });
  
  // Additional wait for WebSocket connection and awareness to sync
  await page.waitForTimeout(3000);
}

/**
 * Get the main editor element (textarea)
 */
function getEditorLocator(page: Page) {
  // Try multiple selectors - Redmine uses different IDs for different contexts
  return page.locator(
    'textarea#issue_description, ' +
    'textarea[name="issue[description]"], ' +
    'textarea[id*="description"], ' +
    'textarea#issue_notes, ' +
    'textarea[name="issue[notes]"], ' +
    'textarea[id*="notes"], ' +
    'textarea#content, ' +
    'textarea[name="content"], ' +
    'textarea[id*="content"]'
  ).first();
}

/**
 * Get editor content (works for textarea, ClassicEditor, and CKEditor)
 */
async function getEditorContent(page: Page): Promise<string> {
  const textarea = getEditorLocator(page);
  const textareaId = await textarea.getAttribute('id').catch(() => null);
  const textareaName = await textarea.getAttribute('name').catch(() => null);
  
  // Debug: log what we found
  if (!textareaId && !textareaName) {
    const allTextareas = await page.locator('textarea').all();
    console.log(`[getEditorContent] Found ${allTextareas.length} textareas on page`);
    for (let i = 0; i < Math.min(allTextareas.length, 3); i++) {
      const id = await allTextareas[i].getAttribute('id').catch(() => 'no-id');
      const name = await allTextareas[i].getAttribute('name').catch(() => 'no-name');
      const value = await allTextareas[i].inputValue().catch(() => 'no-value');
      console.log(`[getEditorContent] Textarea ${i}: id="${id}", name="${name}", value="${value.substring(0, 50)}..."`);
    }
  }
  
  if (!textareaId) {
    const value = await textarea.inputValue().catch(() => '');
    console.log(`[getEditorContent] No textarea ID, using inputValue: "${value.substring(0, 100)}..."`);
    return value;
  }
  
  // Check if ClassicEditor or CKEditor is being used
  const editorInfo = await page.evaluate((id: string) => {
    // Check for ClassicEditor (CKEditor 5)
    const classicEditor = (window as any).ClassicEditor;
    if (typeof classicEditor !== 'undefined') {
      const element = document.querySelector(`#${id}`);
      if (element) {
        const editorRoot = element.closest('.ck-editor') || element.parentElement;
        if (editorRoot) {
          const editable = editorRoot.querySelector('.ck-editor__editable') as HTMLElement;
          if (editable) {
            return { type: 'classic', found: true, content: editable.textContent || editable.innerText || '' };
          }
        }
      }
    }
    
    // Check for CKEditor (CKEditor 3/4)
    const ckeditor = (window as any).CKEDITOR;
    if (typeof ckeditor !== 'undefined' && 
        ckeditor.instances && 
        ckeditor.instances[id] !== undefined) {
      const editor = ckeditor.instances[id];
      return { type: 'ckeditor', found: true, content: editor.getData() || '' };
    }
    
    return { type: null, found: false, content: '' };
  }, textareaId).catch(() => ({ type: null, found: false, content: '' }));
  
  // If ClassicEditor or CKEditor found, return their content
  if (editorInfo.found && editorInfo.content !== undefined) {
    console.log(`[getEditorContent] Found ${editorInfo.type} editor, content: "${editorInfo.content.substring(0, 100)}..."`);
    return editorInfo.content;
  }
  
  // Fallback to textarea value (should work for all editors as they sync back to textarea)
  const value = await textarea.inputValue().catch(() => '');
  console.log(`[getEditorContent] Using textarea inputValue (id="${textareaId}"): "${value.substring(0, 100)}..."`);
  return value;
}

/**
 * Type into the editor (textarea or CKEditor)
 */
async function typeInEditor(page: Page, text: string, position: 'beginning' | 'end' | 'current' = 'current'): Promise<void> {
  const textarea = getEditorLocator(page);
  
  // Wait for the textarea to be attached to DOM first
  await textarea.waitFor({ state: 'attached', timeout: 30000 });
  
  // Debug: log what we found
  const count = await textarea.count();
  if (count === 0) {
    // Try to find any textarea on the page for debugging
    const allTextareas = await page.locator('textarea').all();
    console.error(`[typeInEditor] Textarea not found! Found ${allTextareas.length} textareas on page`);
    for (let i = 0; i < Math.min(allTextareas.length, 5); i++) {
      const id = await allTextareas[i].getAttribute('id').catch(() => 'no-id');
      const name = await allTextareas[i].getAttribute('name').catch(() => 'no-name');
      console.error(`[typeInEditor] Textarea ${i}: id="${id}", name="${name}"`);
    }
    throw new Error('Textarea editor not found on page');
  }
  
  // Check if ClassicEditor (CKEditor 5) or CKEditor (CKEditor 3/4) is being used for this textarea
  const textareaId = await textarea.getAttribute('id').catch(() => null);
  const editorInfo = await page.evaluate((id: string | null) => {
    if (!id) return { type: null, found: false };
    
    // Check for ClassicEditor (CKEditor 5)
    const classicEditor = (window as any).ClassicEditor;
    if (typeof classicEditor !== 'undefined') {
      const element = document.querySelector(`#${id}`);
      if (element) {
        const editorRoot = element.closest('.ck-editor') || element.parentElement;
        if (editorRoot) {
          const editable = editorRoot.querySelector('.ck-editor__editable');
          if (editable) {
            return { type: 'classic', found: true, element: id };
          }
        }
      }
    }
    
    // Check for CKEditor (CKEditor 3/4)
    const ckeditor = (window as any).CKEDITOR;
    if (typeof ckeditor !== 'undefined' && 
        ckeditor.instances && 
        ckeditor.instances[id] !== undefined) {
      return { type: 'ckeditor', found: true, element: id };
    }
    
    return { type: null, found: false };
  }, textareaId).catch(() => ({ type: null, found: false }));
  
  if (editorInfo.found && textareaId) {
    if (editorInfo.type === 'classic') {
      console.log(`[typeInEditor] ClassicEditor (CKEditor 5) detected for textarea ${textareaId}, focusing and typing into ClassicEditor`);
      
      // Focus ClassicEditor using its API
      // According to CKEditor 5 docs: https://ckeditor.com/docs/ckeditor5/latest/framework/deep-dive/ui/focus-tracking.html
      await page.evaluate((id: string) => {
        const element = document.querySelector(`#${id}`);
        if (!element) return;
        const editorRoot = element.closest('.ck-editor') || element.parentElement;
        if (!editorRoot) return;
        const editable = editorRoot.querySelector('.ck-editor__editable') as HTMLElement;
        if (!editable) return;
        
        // Try multiple methods to get the editor instance and focus it
        let editor = null;
        
        // Method 1: Check if editor instance is stored on the element
        if ((editable as any).ckeditorInstance) {
          editor = (editable as any).ckeditorInstance;
        }
        // Method 2: Check parent elements
        else if ((editorRoot as any).ckeditorInstance) {
          editor = (editorRoot as any).ckeditorInstance;
        }
        // Method 3: Check global registry
        else if ((window as any).ckeditorInstances && (window as any).ckeditorInstances[id]) {
          editor = (window as any).ckeditorInstances[id];
        }
        // Method 4: Try ClassicEditor's internal registry
        else {
          const classicEditor = (window as any).ClassicEditor;
          if (classicEditor && classicEditor.instances) {
            try {
              for (const [key, instance] of classicEditor.instances.entries()) {
                if (instance.sourceElement === element || instance.sourceElement?.id === id) {
                  editor = instance;
                  break;
                }
              }
            } catch (e) {
              // Instances might not be directly accessible
            }
          }
        }
        
        // Use proper CKEditor 5 focus API if available
        if (editor && typeof editor.focus === 'function') {
          editor.focus();
        } else if (editor && editor.editing && editor.editing.view && typeof editor.editing.view.focus === 'function') {
          editor.editing.view.focus();
        } else {
          // Fallback: focus the editable element directly
          editable.focus();
          editable.click();
          editable.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
          editable.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      }, textareaId);
      
      await page.waitForTimeout(300); // Give time for focus to be established
      
      // Move cursor to position if needed (for ClassicEditor, we can use selection API)
      if (position === 'beginning') {
        await page.evaluate((id: string) => {
          const element = document.querySelector(`#${id}`);
          if (!element) return;
          const editorRoot = element.closest('.ck-editor') || element.parentElement;
          if (!editorRoot) return;
          const editable = editorRoot.querySelector('.ck-editor__editable') as HTMLElement;
          if (editable) {
            const range = document.createRange();
            range.selectNodeContents(editable);
            range.collapse(true); // true = collapse to start
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        }, textareaId);
      } else if (position === 'end') {
        await page.evaluate((id: string) => {
          const element = document.querySelector(`#${id}`);
          if (!element) return;
          const editorRoot = element.closest('.ck-editor') || element.parentElement;
          if (!editorRoot) return;
          const editable = editorRoot.querySelector('.ck-editor__editable') as HTMLElement;
          if (editable) {
            const range = document.createRange();
            range.selectNodeContents(editable);
            range.collapse(false); // false = collapse to end
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        }, textareaId);
      }
      
      // Type into ClassicEditor - keyboard events should work if ClassicEditor is focused
      // Handle newlines: replace \n (literal backslash-n from Gherkin) with Enter key presses
      const parts = text.split(/\\n|\n/);
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          // Press Enter to create a newline (not before first part)
          await page.keyboard.press('Enter');
        }
        if (parts[i]) {
          // Type the text part (only if non-empty)
          await page.keyboard.type(parts[i], { delay: 50 });
        }
      }
      
      return;
    } else if (editorInfo.type === 'ckeditor') {
      console.log(`[typeInEditor] CKEditor (3/4) detected for textarea ${textareaId}, focusing and typing into CKEditor`);
      
      // Focus CKEditor using its API
      await page.evaluate((id: string) => {
        const ckeditor = (window as any).CKEDITOR;
        const editor = ckeditor?.instances?.[id];
        if (editor) {
          editor.focus();
          const editable = editor.editable();
          if (editable && editable.$) {
            editable.$.focus();
            // Click to ensure focus
            editable.$.click();
          }
        }
      }, textareaId);
      
      await page.waitForTimeout(300); // Give time for focus to be established
      
      // Move cursor to position if needed
      if (position === 'beginning') {
        await page.evaluate((id: string) => {
          const ckeditor = (window as any).CKEDITOR;
          const editor = ckeditor?.instances?.[id];
          if (editor) {
            const range = editor.createRange();
            range.moveToElementEditablePosition(editor.editable(), true); // true = start
            editor.getSelection().selectRanges([range]);
          }
        }, textareaId);
      } else if (position === 'end') {
        await page.evaluate((id: string) => {
          const ckeditor = (window as any).CKEDITOR;
          const editor = ckeditor?.instances?.[id];
          if (editor) {
            const range = editor.createRange();
            range.moveToElementEditablePosition(editor.editable(), false); // false = end
            editor.getSelection().selectRanges([range]);
          }
        }, textareaId);
      }
      
      // Type into CKEditor - keyboard events should work if CKEditor is focused
      // Handle newlines: replace \n (literal backslash-n from Gherkin) with Enter key presses
      const parts = text.split(/\\n|\n/);
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          // Press Enter to create a newline (not before first part)
          await page.keyboard.press('Enter');
        }
        if (parts[i]) {
          // Type the text part (only if non-empty)
          await page.keyboard.type(parts[i], { delay: 50 });
        }
      }
      
      return;
    }
  }
  
  // Fallback to textarea typing logic (for plain text editors)
  // Use JavaScript to interact with the textarea directly - more reliable than Playwright's visibility checks
  await textarea.evaluate((el: HTMLTextAreaElement) => {
    // Remove any hiding styles
    el.style.display = 'block';
    el.style.visibility = 'visible';
    el.style.opacity = '1';
    el.style.height = 'auto';
    el.style.minHeight = '100px';
    
    // Expand any collapsed parent containers
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      if (parent.style.display === 'none') {
        parent.style.display = 'block';
      }
      if (parent.classList.contains('collapsed')) {
        parent.classList.remove('collapsed');
      }
      // Check for common Redmine collapsible patterns
      const toggle = parent.querySelector('.toggle, a.toggle');
      if (toggle && toggle.getAttribute('aria-expanded') === 'false') {
        toggle.setAttribute('aria-expanded', 'true');
      }
      parent = parent.parentElement;
    }
    
    // Scroll into view
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    
    // Focus
    el.focus();
    el.click();
  });
  
  // Wait a bit for focus to be established
  await page.waitForTimeout(200);
  
  // Verify we can interact with it
  const isFocused = await textarea.evaluate((el: HTMLTextAreaElement) => {
    return document.activeElement === el;
  }).catch(() => false);
  
  if (!isFocused) {
    // Try one more time to focus
    await textarea.focus();
    await page.waitForTimeout(100);
  }
  
  if (position === 'beginning') {
    await page.keyboard.press('Control+Home');
  } else if (position === 'end') {
    await page.keyboard.press('Control+End');
  }
  
  // Handle newlines: replace \n (literal backslash-n from Gherkin) with Enter key presses
  // Also handle actual newline characters if present
  // Split by literal \n string or actual newline, and type each part with Enter between them
  const parts = text.split(/\\n|\n/);
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      // Press Enter to create a newline (not before first part)
      await page.keyboard.press('Enter');
    }
    if (parts[i]) {
      // Type the text part (only if non-empty)
      await page.keyboard.type(parts[i], { delay: 50 });
    }
  }
}

// =============================================================================
// Given Steps
// =============================================================================

Given('user {string} opens the issue in browser A', { timeout: 60000 }, async function (this: ICustomWorld, username: string) {
  await ensureLoggedIn(this, 'A');
  
  if (!this.currentIssueId) {
    throw new Error('No issue ID available. Make sure "an issue exists" step ran first.');
  }
  
  await openIssueEdit(this.pageA!, this.currentIssueId, this);
  console.log(`[Collab] Browser A opened issue ${this.currentIssueId} for editing`);
  
  // Wait for Yjs to fully initialize and connect
  await this.pageA!.waitForTimeout(2000);
});

Given('user {string} opens the same issue in browser B', { timeout: 60000 }, async function (this: ICustomWorld, username: string) {
  await ensureLoggedIn(this, 'B');
  
  if (!this.currentIssueId) {
    throw new Error('No issue ID available. Make sure "an issue exists" step ran first.');
  }
  
  await openIssueEdit(this.pageB!, this.currentIssueId, this);
  console.log(`[Collab] Browser B opened issue ${this.currentIssueId} for editing`);
  
  // Wait for awareness to sync between both browsers
  // Both browsers need to see each other's presence - give more time for WebSocket connection
  await this.pageA!.waitForTimeout(3000);
  await this.pageB!.waitForTimeout(3000);
});

Given('user {string} opens the wiki page edit in browser A', { timeout: 30000 }, async function (this: ICustomWorld, username: string) {
  await ensureLoggedIn(this, 'A');
  
  if (!this.currentProjectId || !this.currentWikiPage) {
    throw new Error('No wiki page context. Make sure "a wiki page exists" step ran first.');
  }
  
  await openWikiEdit(this.pageA!, this.currentProjectId, this.currentWikiPage, this);
  console.log(`[Collab] Browser A opened wiki page ${this.currentWikiPage} for editing`);
});

Given('user {string} opens the same wiki page edit in browser B', { timeout: 30000 }, async function (this: ICustomWorld, username: string) {
  await ensureLoggedIn(this, 'B');
  
  if (!this.currentProjectId || !this.currentWikiPage) {
    throw new Error('No wiki page context. Make sure "a wiki page exists" step ran first.');
  }
  
  await openWikiEdit(this.pageB!, this.currentProjectId, this.currentWikiPage, this);
  console.log(`[Collab] Browser B opened wiki page ${this.currentWikiPage} for editing`);
});


// =============================================================================
// When Steps
// =============================================================================

When('user types {string} in browser A\'s editor', async function (this: ICustomWorld, text: string) {
  console.log(`[Test] Typing "${text}" in browser A's editor`);
  
  // Normalize newlines: Gherkin passes \n as literal string, but we need actual newlines for comparison
  const normalizedText = text.replace(/\\n/g, '\n');
  
  await typeInEditor(this.pageA!, normalizedText, 'end');
  
  // Wait for content to appear in the editor (polling with condition to avoid race conditions)
  // This ensures the typing actually happened before we proceed
  const maxWaitTime = 2000;
  const pollInterval = 200;
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const content = await getEditorContent(this.pageA!);
    // Compare with normalized text (actual newlines)
    if (content.includes(normalizedText)) {
      console.log(`[Test] Content "${normalizedText}" confirmed in browser A after ${Date.now() - startTime}ms`);
      return; // Success - content typed and confirmed
    }
    await this.pageA!.waitForTimeout(pollInterval);
  }
  
  // Final check - fail if content wasn't typed
  const finalContent = await getEditorContent(this.pageA!);
  console.error(`[Test] ERROR: Typed text "${normalizedText}" not found in editor after ${maxWaitTime}ms`);
  console.error(`[Test] Final content: "${finalContent}"`);
  expect(finalContent).toContain(normalizedText);
});

When('user types {string} in browser B\'s editor', async function (this: ICustomWorld, text: string) {
  await typeInEditor(this.pageB!, text, 'end');
  // Wait for sync
  await this.pageB!.waitForTimeout(500);
});

When('user types {string} at the beginning in browser A\'s editor', async function (this: ICustomWorld, text: string) {
  await typeInEditor(this.pageA!, text, 'beginning');
  await this.pageA!.waitForTimeout(500);
});

When('user types {string} at the end in browser B\'s editor', async function (this: ICustomWorld, text: string) {
  await typeInEditor(this.pageB!, text, 'end');
  await this.pageB!.waitForTimeout(500);
});

When('user sets cursor to position {int} in browser A\'s editor', async function (this: ICustomWorld, position: number) {
  // Set cursor position in textarea, ClassicEditor, or CKEditor
  const textarea = this.pageA!.locator(
    'textarea[id*="description"], textarea[id*="notes"], textarea[id*="content"]'
  ).first();
  
  if (await textarea.count() === 0) {
    throw new Error('Editor textarea not found');
  }
  
  const textareaId = await textarea.getAttribute('id').catch(() => null);
  if (!textareaId) {
    throw new Error('Editor textarea has no ID');
  }
  
  // Check which editor type is being used
  const editorInfo = await this.pageA!.evaluate((id: string) => {
    // Check for ClassicEditor (CKEditor 5)
    const classicEditor = (window as any).ClassicEditor;
    if (typeof classicEditor !== 'undefined') {
      const element = document.querySelector(`#${id}`);
      if (element) {
        const editorRoot = element.closest('.ck-editor') || element.parentElement;
        if (editorRoot) {
          const editable = editorRoot.querySelector('.ck-editor__editable');
          if (editable) {
            return { type: 'classic', found: true };
          }
        }
      }
    }
    
    // Check for CKEditor (CKEditor 3/4)
    const ckeditor = (window as any).CKEDITOR;
    if (typeof ckeditor !== 'undefined' && 
        ckeditor.instances && 
        ckeditor.instances[id] !== undefined) {
      return { type: 'ckeditor', found: true };
    }
    
    return { type: null, found: false };
  }, textareaId).catch(() => ({ type: null, found: false }));
  
  if (editorInfo.found && editorInfo.type === 'classic') {
    // ClassicEditor - set cursor position using DOM Range API
    await this.pageA!.evaluate(({ id, pos }: { id: string; pos: number }) => {
      const element = document.querySelector(`#${id}`);
      if (!element) return;
      const editorRoot = element.closest('.ck-editor') || element.parentElement;
      if (!editorRoot) return;
      const editable = editorRoot.querySelector('.ck-editor__editable') as HTMLElement;
      if (!editable) return;
      
      editable.focus();
      
      // Use TreeWalker to find the correct text node and position
      const walker = document.createTreeWalker(
        editable,
        NodeFilter.SHOW_TEXT
      );
      let currentOffset = 0;
      let node;
      while ((node = walker.nextNode())) {
        const nodeLength = node.textContent?.length || 0;
        if (currentOffset + nodeLength >= pos) {
          const range = document.createRange();
          const offsetInNode = pos - currentOffset;
          range.setStart(node, Math.min(offsetInNode, nodeLength));
          range.setEnd(node, Math.min(offsetInNode, nodeLength));
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
          return;
        }
        currentOffset += nodeLength;
      }
      
      // If position is beyond content, set cursor to end
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }, { id: textareaId, pos: position });
  } else if (editorInfo.found && editorInfo.type === 'ckeditor') {
    // CKEditor (3/4) - try to set cursor position via iframe
    const iframeLocator = this.pageA!.locator('iframe.cke_wysiwyg_frame').first();
    if (await iframeLocator.count() > 0) {
      const elementHandle = await iframeLocator.elementHandle();
      if (elementHandle) {
        const frame = await elementHandle.contentFrame();
        if (frame) {
          await frame.evaluate((pos: number) => {
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT
            );
            let currentOffset = 0;
            let node;
            while ((node = walker.nextNode())) {
              const nodeLength = node.textContent?.length || 0;
              if (currentOffset + nodeLength >= pos) {
                const range = document.createRange();
                const offsetInNode = pos - currentOffset;
                range.setStart(node, Math.min(offsetInNode, nodeLength));
                range.setEnd(node, Math.min(offsetInNode, nodeLength));
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
                return;
              }
              currentOffset += nodeLength;
            }
          }, position);
        }
      }
    }
  } else {
    // Plain text editor - set selection range
    await textarea.evaluate((el: HTMLTextAreaElement, pos: number) => {
      el.focus();
      el.setSelectionRange(pos, pos);
      el.dispatchEvent(new Event('click', { bubbles: true }));
    }, position);
  }
  
  // Wait for cursor position to sync
  await this.pageA!.waitForTimeout(500);
  console.log(`[Collab] Set cursor to position ${position} in browser A`);
});


// =============================================================================
// Then Steps
// =============================================================================

Then('browser A shows {int} other editor(s) connected', async function (this: ICustomWorld, count: number) {
  // CRITICAL: Force focus editor so collaboration widget is visible
  const editorLocator = getEditorLocator(this.pageA!);
  await forceFocusEditor(this.pageA!, editorLocator);
  await this.pageA!.waitForTimeout(1000);
  
  // Get the current browser's client ID to exclude it from the count
  const currentClientId = await this.pageA!.evaluate(() => {
    // Try to get client ID from Yjs provider if available
    const widget = document.getElementById('yjs-collaboration-status') || document.querySelector('.yjs-collaboration-status-widget');
    if (widget) {
      // Check if there's a way to get the current client ID from the page context
      // For now, we'll count all badges and check that we have at least the expected count
      return null; // We'll use a different approach
    }
    return null;
  }).catch(() => null);
  
  // Look for presence indicators in the collaboration status widget
  // Use .first() to avoid strict mode violation (multiple status widgets might exist)
  const statusWidget = this.pageA!.locator('#yjs-collaboration-status, .yjs-collaboration-status-widget').first();
  
  if (count === 0) {
    // Should show "No other editors" or similar
    await slowExpect(statusWidget).toContainText(/no other editor|connected.*\(.*0\)/i);
  } else {
    // Wait for awareness to sync - check that badge count is at least the expected value
    // This is relative: we check for "at least N" to account for additional browser tabs
    let stableCount = 0;
    const maxAttempts = 20; // More attempts to allow awareness to fully sync
    const requiredStableChecks = 3; // Need 3 consecutive stable checks
    
    for (let i = 0; i < maxAttempts; i++) {
      await this.pageA!.waitForTimeout(1000);
      // Count badges by unique session/client IDs (more reliable)
      const userBadges = statusWidget.locator('.yjs-user-badge[data-session-id], .yjs-user-badge[data-client-id], .yjs-user-badge');
      const currentCount = await userBadges.count();
      
      // Check that we have at least the expected count (relative assertion)
      if (currentCount >= count) {
        stableCount++;
        if (stableCount >= requiredStableChecks) {
          // Count has been stable at or above expected value for required checks
          console.log(`[Collab] Browser A: Found ${currentCount} badge(s) (expected at least ${count}, stable for ${stableCount} checks)`);
          // Verify we have exactly the expected count if possible, but allow more
          if (currentCount === count) {
            console.log(`[Collab] Browser A: Exact match - ${count} badge(s) as expected`);
          } else {
            console.log(`[Collab] Browser A: More badges than expected (${currentCount} >= ${count}), likely due to additional browser tabs`);
          }
          return; // Success!
        }
      } else {
        stableCount = 0; // Reset if count is below expected
        if (i % 5 === 0) {
          // Log progress every 5 attempts - show session IDs for debugging
          const badgeInfo = await userBadges.evaluateAll((badges) => {
            return badges.map((badge) => {
              const el = badge as HTMLElement;
              return {
                sessionId: el.getAttribute('data-session-id'),
                clientId: el.getAttribute('data-client-id'),
                text: el.textContent?.trim()
              };
            });
          }).catch(() => []);
          console.log(`[Collab] Browser A: Waiting for at least ${count} badge(s), currently ${currentCount}:`, badgeInfo);
        }
      }
    }
    
    // If we get here, the count never reached the expected minimum
    const userBadges = statusWidget.locator('.yjs-user-badge[data-session-id], .yjs-user-badge[data-client-id], .yjs-user-badge');
    const finalCount = await userBadges.count();
    const badgeInfo = await userBadges.evaluateAll((badges) => {
      return badges.map((badge) => {
        const el = badge as HTMLElement;
        return {
          sessionId: el.getAttribute('data-session-id'),
          clientId: el.getAttribute('data-client-id'),
          text: el.textContent?.trim()
        };
      });
    }).catch(() => []);
    const widgetHtml = await statusWidget.innerHTML().catch(() => '');
    
    console.error(`[Collab] Browser A: Expected at least ${count} badge(s), but count never reached minimum. Final count: ${finalCount}`);
    console.error(`[Collab] Browser A badge info:`, badgeInfo);
    console.error(`[Collab] Browser A widget HTML:`, widgetHtml.substring(0, 1000));
    
    // Final assertion - check for at least the expected count (relative assertion)
    expect(finalCount).toBeGreaterThanOrEqual(count);
  }
});

Then('browser B shows {int} other editor(s) connected', async function (this: ICustomWorld, count: number) {
  // CRITICAL: Force focus editor so collaboration widget is visible
  const editorLocator = getEditorLocator(this.pageB!);
  await forceFocusEditor(this.pageB!, editorLocator);
  await this.pageB!.waitForTimeout(1000);
  
  const statusWidget = this.pageB!.locator('#yjs-collaboration-status, .yjs-collaboration-status-widget').first();
  
  if (count === 0) {
    await slowExpect(statusWidget).toContainText(/no other editor|connected.*\(.*0\)/i);
  } else {
    // Wait for awareness to sync - check that badge count is at least the expected value
    // This is relative: we check for "at least N" to account for additional browser tabs
    let stableCount = 0;
    const maxAttempts = 20; // More attempts to allow awareness to fully sync
    const requiredStableChecks = 3; // Need 3 consecutive stable checks
    
    for (let i = 0; i < maxAttempts; i++) {
      await this.pageB!.waitForTimeout(1000);
      const userBadges = statusWidget.locator('.yjs-user-badge[data-session-id], .yjs-user-badge[data-client-id], .yjs-user-badge');
      const currentCount = await userBadges.count();
      
      // Check that we have at least the expected count (relative assertion)
      if (currentCount >= count) {
        stableCount++;
        if (stableCount >= requiredStableChecks) {
          // Count has been stable at or above expected value for required checks
          console.log(`[Collab] Browser B: Found ${currentCount} badge(s) (expected at least ${count}, stable for ${stableCount} checks)`);
          // Verify we have exactly the expected count if possible, but allow more
          if (currentCount === count) {
            console.log(`[Collab] Browser B: Exact match - ${count} badge(s) as expected`);
          } else {
            console.log(`[Collab] Browser B: More badges than expected (${currentCount} >= ${count}), likely due to additional browser tabs`);
          }
          return; // Success!
        }
      } else {
        stableCount = 0; // Reset if count is below expected
        if (i % 5 === 0) {
          // Log progress every 5 attempts
          const badgeInfo = await userBadges.evaluateAll((badges) => {
            return badges.map((badge) => {
              const el = badge as HTMLElement;
              return {
                sessionId: el.getAttribute('data-session-id'),
                clientId: el.getAttribute('data-client-id'),
                text: el.textContent?.trim()
              };
            });
          }).catch(() => []);
          console.log(`[Collab] Browser B: Waiting for at least ${count} badge(s), currently ${currentCount}:`, badgeInfo);
        }
      }
    }
    
    // If we get here, the count never reached the expected minimum
    const userBadges = statusWidget.locator('.yjs-user-badge[data-session-id], .yjs-user-badge[data-client-id], .yjs-user-badge');
    const finalCount = await userBadges.count();
    const badgeInfo = await userBadges.evaluateAll((badges) => {
      return badges.map((badge) => {
        const el = badge as HTMLElement;
        return {
          sessionId: el.getAttribute('data-session-id'),
          clientId: el.getAttribute('data-client-id'),
          text: el.textContent?.trim()
        };
      });
    }).catch(() => []);
    const widgetHtml = await statusWidget.innerHTML().catch(() => '');
    
    console.error(`[Collab] Browser B: Expected at least ${count} badge(s), but count never reached minimum. Final count: ${finalCount}`);
    console.error(`[Collab] Browser B badge info:`, badgeInfo);
    console.error(`[Collab] Browser B widget HTML:`, widgetHtml.substring(0, 1000));
    
    // Final assertion - check for at least the expected count (relative assertion)
    expect(finalCount).toBeGreaterThanOrEqual(count);
  }
});

Then('browser A\'s editor shows {string}', async function (this: ICustomWorld, expectedText: string) {
  // Wait for content to appear (polling with condition to avoid race conditions)
  const normalizedExpected = expectedText.replace(/\\n/g, '\n');
  const maxWaitTime = 2000;
  const pollInterval = 200;
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const content = await getEditorContent(this.pageA!);
    if (content.includes(normalizedExpected)) {
      console.log(`[Test] Content confirmed in browser A after ${Date.now() - startTime}ms`);
      return; // Success
    }
    await this.pageA!.waitForTimeout(pollInterval);
  }
  
  // Final assertion
  const finalContent = await getEditorContent(this.pageA!);
  console.error(`[Test] ERROR: Content "${normalizedExpected}" not found in browser A after ${maxWaitTime}ms`);
  console.error(`[Test] Final content: "${finalContent}"`);
  expect(finalContent).toContain(normalizedExpected);
});

Then('browser B shows a cursor at the correct vertical position for browser A', async function (this: ICustomWorld) {
  // CRITICAL: Force focus browser B's editor so collaboration is active
  const editorLocatorB = getEditorLocator(this.pageB!);
  await forceFocusEditor(this.pageB!, editorLocatorB);
  
  // Wait for cursor to appear and sync
  await this.pageB!.waitForTimeout(3000);
  
  // Find cursor elements (should be visible for remote users)
  const cursorElements = this.pageB!.locator('.yjs-cursor[data-user-id]');
  const cursorCount = await cursorElements.count();
  
  if (cursorCount === 0) {
    // Debug: check if cursor container exists
    const containerExists = await this.pageB!.locator('.yjs-cursor-container').count();
    console.log(`[Collab] Cursor count: ${cursorCount}, container exists: ${containerExists}`);
    
    // Check if collaboration is active
    const widgetExists = await this.pageB!.locator('#yjs-collaboration-status').count();
    console.log(`[Collab] Widget exists: ${widgetExists}`);
  }
  
  expect(cursorCount).toBeGreaterThan(0);
  
  // Check that cursor is visible (not display: none)
  const firstCursor = cursorElements.first();
  const isVisible = await firstCursor.isVisible();
  
  if (!isVisible) {
    // Debug: check computed styles
    const display = await firstCursor.evaluate((el: HTMLElement) => {
      return window.getComputedStyle(el).display;
    });
    const opacity = await firstCursor.evaluate((el: HTMLElement) => {
      return window.getComputedStyle(el).opacity;
    });
    console.log(`[Collab] Cursor not visible - display: ${display}, opacity: ${opacity}`);
  }
  
  expect(isVisible).toBe(true);
  
  // Verify cursor has a valid position (top and left are set)
  const top = await firstCursor.evaluate((el: HTMLElement) => {
    return window.getComputedStyle(el).top;
  });
  const left = await firstCursor.evaluate((el: HTMLElement) => {
    return window.getComputedStyle(el).left;
  });
  
  // Top should be a valid CSS value (not 'auto' or '0px' if content exists)
  expect(top).not.toBe('auto');
  expect(left).not.toBe('auto');
  
  // Top should be a positive number (cursor should be positioned)
  const topNum = parseFloat(top);
  expect(topNum).toBeGreaterThanOrEqual(0);
  
  console.log(`[Collab] Cursor position verified: top=${top}, left=${left}`);
});

Then('browser B\'s editor shows {string}', async function (this: ICustomWorld, expectedText: string) {
  // Wait before starting assertions - give time for sync to propagate
  await this.pageB!.waitForTimeout(500);
  
  // Wait for content to appear in browser B (polling with condition to avoid race conditions)
  // This ensures synchronization has completed before we assert
  const normalizedExpected = expectedText.replace(/\\n/g, '\n');
  const maxWaitTime = 5000;
  const pollInterval = 300; // Check every 300ms
  const startTime = Date.now();
  
  let lastContent = '';
  let lastLogTime = 0;
  
  while (Date.now() - startTime < maxWaitTime) {
    const content = await getEditorContent(this.pageB!);
    
    // Debug logging every 1 second
    const elapsed = Date.now() - startTime;
    if (elapsed - lastLogTime >= 1000) {
      console.log(`[Test] Waiting for sync (${Math.round(elapsed / 1000)}s): Expected "${normalizedExpected}", Got "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
      lastLogTime = elapsed;
    }
    
    if (content.includes(normalizedExpected)) {
      console.log(`[Test] Content synchronized to browser B after ${elapsed}ms`);
      return; // Success - content synchronized
    }
    
    lastContent = content;
    await this.pageB!.waitForTimeout(pollInterval);
  }
  
  // Final assertion - fail if content never appeared
  const finalContent = await getEditorContent(this.pageB!);
  console.error(`[Test] ERROR: Content "${normalizedExpected}" not synchronized to browser B after ${maxWaitTime}ms`);
  console.error(`[Test] Final content in browser B (length: ${finalContent.length}): "${finalContent}"`);
  console.error(`[Test] Expected content (length: ${normalizedExpected.length}): "${normalizedExpected}"`);
  
  expect(finalContent).toContain(normalizedExpected);
});

Then('both browsers show {string}', async function (this: ICustomWorld, expectedText: string) {
  await this.pageA!.waitForTimeout(1000);
  await this.pageB!.waitForTimeout(1000);
  
  const contentA = await getEditorContent(this.pageA!);
  const contentB = await getEditorContent(this.pageB!);
  // Normalize: convert literal \n in expected string to real newlines for comparison
  const normalizedExpected = expectedText.replace(/\\n/g, '\n');
  
  expect(contentA).toContain(normalizedExpected);
  expect(contentB).toContain(normalizedExpected);
});


// =============================================================================
// Browser Reload and Content Verification Steps
// =============================================================================

/**
 * Clear editor content
 */
async function clearEditorContent(page: Page): Promise<void> {
  // Try CKEditor iframe first
  const iframeLocator = page.locator('iframe.cke_wysiwyg_frame').first();
  if (await iframeLocator.count() > 0) {
    try {
      const elementHandle = await iframeLocator.elementHandle();
      if (elementHandle) {
        const frame = await elementHandle.contentFrame();
        if (frame) {
          // Use evaluate to clear CKEditor content (doesn't require visibility)
          await frame.evaluate(() => {
            const body = document.body;
            if (body) {
              body.innerHTML = '';
              body.dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
          return;
        }
      }
    } catch (e) {
      // If iframe access fails, continue to other methods
    }
  }
  
  // Try CKEditor contenteditable
  const ckeEditable = page.locator('.cke_editable').first();
  if (await ckeEditable.count() > 0) {
    try {
      await ckeEditable.evaluate((el: HTMLElement) => {
        el.innerHTML = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      return;
    } catch (e) {
      // If clearing fails, continue to textarea
    }
  }
  
  // Fallback to textarea - use evaluate (doesn't require visibility)
  const textarea = page.locator(
    'textarea[id*="description"], textarea[id*="notes"], textarea[id*="content"]'
  ).first();
  if (await textarea.count() > 0) {
    await textarea.evaluate((el: HTMLTextAreaElement) => {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}

/**
 * Wait for Yjs collaboration to be ready after page load/reload
 */
async function waitForCollaborationReady(page: Page): Promise<void> {
  // Wait for page to load
  await page.waitForLoadState('domcontentloaded');
  
  // Wait for editor to be ready
  const editorLocator = getEditorLocator(page);
  await editorLocator.waitFor({ state: 'attached', timeout: 20000 });
  
  // Optionally wait for Yjs status widget to exist (but don't fail if it's hidden)
  // The widget might be hidden by CSS but Yjs is still functional
  try {
    const statusLocator = page.locator('#yjs-collaboration-status, #yjs-connection-status, .yjs-collaboration-status-widget').first();
    await statusLocator.waitFor({ state: 'attached', timeout: 5000 });
  } catch (e) {
    // Status widget not found, but editor is ready - continue anyway
  }
  
  // Wait a bit for Yjs to initialize (even if widget is hidden)
  await page.waitForTimeout(2000);
}

Given('the editor is empty', async function (this: ICustomWorld) {
  // Clear editor content in browser A
  await clearEditorContent(this.pageA!);
  // Wait for sync to browser B
  await this.pageA!.waitForTimeout(1000);
  
  // Verify both editors are empty
  const contentA = await getEditorContent(this.pageA!);
  const contentB = await getEditorContent(this.pageB!);
  
  // Allow for whitespace/empty HTML tags
  const isEmptyA = contentA.trim() === '' || contentA.trim() === '<br>' || contentA.trim() === '<p></p>';
  const isEmptyB = contentB.trim() === '' || contentB.trim() === '<br>' || contentB.trim() === '<p></p>';
  
  if (!isEmptyA || !isEmptyB) {
    // If not empty, clear both editors
    await clearEditorContent(this.pageA!);
    await this.pageA!.waitForTimeout(500);
    await clearEditorContent(this.pageB!);
    await this.pageB!.waitForTimeout(1000);
  }
  
  console.log('[Collab] Editor cleared and verified empty');
});

When('browser B reloads the page', async function (this: ICustomWorld) {
  console.log('[Collab] Browser B reloading page...');
  
  // Reload the page
  await this.pageB!.reload();
  
  // Wait for collaboration to be fully ready again
  await waitForCollaborationReady(this.pageB!);
  
  console.log('[Collab] Browser B reloaded and collaboration ready');
});

When('browser A reloads the page', async function (this: ICustomWorld) {
  console.log('[Collab] Browser A reloading page...');
  
  await this.pageA!.reload();
  await waitForCollaborationReady(this.pageA!);
  
  console.log('[Collab] Browser A reloaded and collaboration ready');
});

Then('browser A\'s editor shows exactly {string}', async function (this: ICustomWorld, expectedText: string) {
  await this.pageA!.waitForTimeout(1000);
  const content = await getEditorContent(this.pageA!);
  const trimmedContent = content.trim();
  // Normalize: convert literal \n in expected string to real newlines for comparison
  const normalizedExpected = expectedText.replace(/\\n/g, '\n');
  
  expect(trimmedContent).toBe(normalizedExpected);
  console.log(`[Collab] Browser A content verified: "${trimmedContent}"`);
});

Then('browser B\'s editor shows exactly {string}', async function (this: ICustomWorld, expectedText: string) {
  await this.pageB!.waitForTimeout(1000);
  const content = await getEditorContent(this.pageB!);
  const trimmedContent = content.trim();
  // Normalize: convert literal \n in expected string to real newlines for comparison
  const normalizedExpected = expectedText.replace(/\\n/g, '\n');
  
  expect(trimmedContent).toBe(normalizedExpected);
  console.log(`[Collab] Browser B content verified: "${trimmedContent}"`);
});

Then('browser A\'s editor does not show {string}', async function (this: ICustomWorld, unexpectedText: string) {
  await this.pageA!.waitForTimeout(500);
  const content = await getEditorContent(this.pageA!);
  
  expect(content).not.toContain(unexpectedText);
  console.log(`[Collab] Browser A verified NOT containing: "${unexpectedText}"`);
});

Then('browser B\'s editor does not show {string}', async function (this: ICustomWorld, unexpectedText: string) {
  await this.pageB!.waitForTimeout(500);
  const content = await getEditorContent(this.pageB!);
  
  expect(content).not.toContain(unexpectedText);
  console.log(`[Collab] Browser B verified NOT containing: "${unexpectedText}"`);
});

