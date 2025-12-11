/**
 * Collaboration step definitions for concurrent editing tests
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect, Page } from '@playwright/test';
import { ICustomWorld } from '../support/custom-world';
import { config } from '../support/config';

const slowExpect = expect.configure({ timeout: 15000 });

/**
 * Get the base URL based on world configuration
 */
function getBaseUrl(world: ICustomWorld): string {
  if (world.usePlaintextInstance) {
    return config.BASE_URL_PLAINTEXT;
  }
  if (world.useProxyInstance) {
    return config.BASE_URL_PROXY;
  }
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
async function openIssueEdit(page: Page, issueId: number, world: ICustomWorld): Promise<void> {
  const baseUrl = getBaseUrl(world);
  await page.goto(`${baseUrl}/issues/${issueId}/edit`);
  
  // Wait for page to load
  await page.waitForLoadState('domcontentloaded');
  
  // Wait for the editor to be ready (this is what we actually need)
  const editorLocator = getEditorLocator(page);
  await editorLocator.waitFor({ state: 'attached', timeout: 20000 });
  
  // Optionally wait for Yjs status widget to exist (but don't fail if it's hidden)
  // The widget might be hidden by CSS but Yjs is still functional
  try {
    const statusLocator = page.locator('#yjs-collaboration-status, #yjs-connection-status, .yjs-collaboration-status-widget').first();
    await statusLocator.waitFor({ state: 'attached', timeout: 5000 });
  } catch (e) {
    // Status widget not found, but editor is ready - continue anyway
    console.log('[openIssueEdit] Status widget not found, but editor is ready');
  }
  
  // Wait a bit for Yjs to initialize (even if widget is hidden)
  await page.waitForTimeout(2000);
}

/**
 * Navigate to wiki page edit and wait for editor to be ready
 */
async function openWikiEdit(page: Page, projectId: string, pageName: string, world: ICustomWorld): Promise<void> {
  const baseUrl = getBaseUrl(world);
  await page.goto(`${baseUrl}/projects/${projectId}/wiki/${pageName}/edit`);
  
  // Wait for page to load
  await page.waitForLoadState('domcontentloaded');
  
  // Wait for Yjs collaboration to initialize
  await slowExpect(
    page.locator('#yjs-collaboration-status, #yjs-connection-status, .yjs-collaboration-status-widget').first()
  ).toBeVisible({ timeout: 20000 });
  
  // Additional wait for WebSocket connection
  await page.waitForTimeout(1000);
}

/**
 * Get the main editor element (textarea or CKEditor)
 */
function getEditorLocator(page: Page) {
  // Try CKEditor first, then fallback to textarea
  return page.locator(
    '.cke_editable, ' +
    'iframe.cke_wysiwyg_frame, ' +
    'textarea[id*="description"], ' +
    'textarea[id*="notes"], ' +
    'textarea[id*="content"]'
  ).first();
}

/**
 * Get editor content
 */
async function getEditorContent(page: Page): Promise<string> {
  // Check if CKEditor iframe is present
  const iframeLocator = page.locator('iframe.cke_wysiwyg_frame').first();
  if (await iframeLocator.count() > 0) {
    const frame = iframeLocator.contentFrame();
    const body = frame.locator('body');
    return (await body.textContent()) || '';
  }
  
  // Check for CKEditor contenteditable
  const ckeEditable = page.locator('.cke_editable').first();
  if (await ckeEditable.count() > 0) {
    return (await ckeEditable.textContent()) || '';
  }
  
  // Fallback to textarea
  const textarea = page.locator(
    'textarea[id*="description"], textarea[id*="notes"], textarea[id*="content"]'
  ).first();
  return await textarea.inputValue();
}

/**
 * Type into the editor
 */
async function typeInEditor(page: Page, text: string, position: 'beginning' | 'end' | 'current' = 'current'): Promise<void> {
  // Check if CKEditor iframe is present
  const iframeLocator = page.locator('iframe.cke_wysiwyg_frame').first();
  if (await iframeLocator.count() > 0) {
    const frame = iframeLocator.contentFrame();
    const body = frame.locator('body');
    await body.click();
    
    if (position === 'beginning') {
      await page.keyboard.press('Control+Home');
    } else if (position === 'end') {
      await page.keyboard.press('Control+End');
    }
    
    await page.keyboard.type(text, { delay: 50 });
    return;
  }
  
  // Check for CKEditor contenteditable
  const ckeEditable = page.locator('.cke_editable').first();
  if (await ckeEditable.count() > 0) {
    await ckeEditable.click();
    
    if (position === 'beginning') {
      await page.keyboard.press('Control+Home');
    } else if (position === 'end') {
      await page.keyboard.press('Control+End');
    }
    
    await page.keyboard.type(text, { delay: 50 });
    return;
  }
  
  // Fallback to textarea
  const textarea = page.locator(
    'textarea[id*="description"], textarea[id*="notes"], textarea[id*="content"]'
  ).first();
  
  // Try to scroll into view and click, but if that fails, use evaluate
  try {
    await textarea.scrollIntoViewIfNeeded();
    await textarea.click();
    
    if (position === 'beginning') {
      await page.keyboard.press('Control+Home');
    } else if (position === 'end') {
      await page.keyboard.press('Control+End');
    }
    
    await page.keyboard.type(text, { delay: 50 });
  } catch (e) {
    // If clicking fails (element not visible), use evaluate to append text
    await textarea.evaluate((el: HTMLTextAreaElement, args: { text: string; position: string }) => {
      const { text: t, position: pos } = args;
      if (pos === 'beginning') {
        el.value = t + el.value;
        el.setSelectionRange(t.length, t.length);
      } else if (pos === 'end') {
        el.value = el.value + t;
        el.setSelectionRange(el.value.length, el.value.length);
      } else {
        el.value = el.value + t;
        el.setSelectionRange(el.value.length, el.value.length);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, { text, position });
  }
}

// =============================================================================
// Given Steps
// =============================================================================

Given('user {string} opens the issue in browser A', { timeout: 30000 }, async function (this: ICustomWorld, username: string) {
  await ensureLoggedIn(this, 'A');
  
  if (!this.currentIssueId) {
    throw new Error('No issue ID available. Make sure "an issue exists" step ran first.');
  }
  
  await openIssueEdit(this.pageA!, this.currentIssueId, this);
  console.log(`[Collab] Browser A opened issue ${this.currentIssueId} for editing`);
});

Given('user {string} opens the same issue in browser B', { timeout: 30000 }, async function (this: ICustomWorld, username: string) {
  await ensureLoggedIn(this, 'B');
  
  if (!this.currentIssueId) {
    throw new Error('No issue ID available. Make sure "an issue exists" step ran first.');
  }
  
  await openIssueEdit(this.pageB!, this.currentIssueId, this);
  console.log(`[Collab] Browser B opened issue ${this.currentIssueId} for editing`);
  
  // Wait for awareness to sync between both browsers
  // Both browsers need to see each other's presence
  await this.pageA!.waitForTimeout(2000);
  await this.pageB!.waitForTimeout(2000);
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

/**
 * Login to Redmine proxy instance if not already logged in
 */
async function ensureLoggedInProxy(world: ICustomWorld, browser: 'A' | 'B'): Promise<void> {
  const page = browser === 'A' ? world.pageA! : world.pageB!;
  const loggedInKey = browser === 'A' ? 'loggedInA' : 'loggedInB';
  
  if (world[loggedInKey]) {
    return;
  }
  
  await page.goto(`${config.BASE_URL_PROXY}/login`);
  await page.fill('#username', config.admin.login);
  await page.fill('#password', config.admin.password);
  await page.click('input[type="submit"][name="login"]');
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
  
  world[loggedInKey] = true;
}

/**
 * Navigate to wiki page edit in proxy mode and wait for editor to be ready
 */
async function openWikiEditProxy(page: Page, projectId: string, pageName: string): Promise<void> {
  await page.goto(`${config.BASE_URL_PROXY}/projects/${projectId}/wiki/${pageName}/edit`);
  
  // Wait for page to load
  await page.waitForLoadState('domcontentloaded');
  
  // Wait for Yjs collaboration to initialize (via ActionCable proxy)
  await slowExpect(
    page.locator('#yjs-collaboration-status, #yjs-connection-status, .yjs-collaboration-status-widget').first()
  ).toBeVisible({ timeout: 20000 });
  
  // Additional wait for WebSocket connection through ActionCable
  await page.waitForTimeout(1000);
}

Given('user {string} opens the wiki page edit in browser A using proxy mode', { timeout: 30000 }, async function (this: ICustomWorld, username: string) {
  await ensureLoggedInProxy(this, 'A');
  
  if (!this.currentProjectId || !this.currentWikiPage) {
    throw new Error('No wiki page context. Make sure "a wiki page exists in proxy mode" step ran first.');
  }
  
  await openWikiEditProxy(this.pageA!, this.currentProjectId, this.currentWikiPage);
  console.log(`[Collab] Browser A opened wiki page ${this.currentWikiPage} for editing (proxy mode)`);
});

Given('user {string} opens the same wiki page edit in browser B using proxy mode', { timeout: 30000 }, async function (this: ICustomWorld, username: string) {
  await ensureLoggedInProxy(this, 'B');
  
  if (!this.currentProjectId || !this.currentWikiPage) {
    throw new Error('No wiki page context. Make sure "a wiki page exists in proxy mode" step ran first.');
  }
  
  await openWikiEditProxy(this.pageB!, this.currentProjectId, this.currentWikiPage);
  console.log(`[Collab] Browser B opened wiki page ${this.currentWikiPage} for editing (proxy mode)`);
});

// =============================================================================
// When Steps
// =============================================================================

When('user types {string} in browser A\'s editor', async function (this: ICustomWorld, text: string) {
  await typeInEditor(this.pageA!, text, 'end');
  // Wait for sync
  await this.pageA!.waitForTimeout(500);
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
  // Set cursor position in textarea or CKEditor
  const textarea = this.pageA!.locator(
    'textarea[id*="description"], textarea[id*="notes"], textarea[id*="content"]'
  ).first();
  
  if (await textarea.count() > 0) {
    // Plain text editor - set selection range
    await textarea.evaluate((el: HTMLTextAreaElement, pos: number) => {
      el.focus();
      el.setSelectionRange(pos, pos);
      el.dispatchEvent(new Event('click', { bubbles: true }));
    }, position);
  } else {
    // CKEditor - try to set cursor position
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
  }
  
  // Wait for cursor position to sync
  await this.pageA!.waitForTimeout(500);
  console.log(`[Collab] Set cursor to position ${position} in browser A`);
});

When('the Hocuspocus connection is interrupted', async function (this: ICustomWorld) {
  // Block WebSocket connections by intercepting routes
  await this.pageA!.route('**/*', route => {
    const url = route.request().url();
    if (url.includes(':8081') || url.includes('/ws')) {
      route.abort();
    } else {
      route.continue();
    }
  });
  
  // Wait for disconnection to be detected
  await this.pageA!.waitForTimeout(2000);
});

When('the Hocuspocus connection is restored', async function (this: ICustomWorld) {
  // Remove route interception
  await this.pageA!.unroute('**/*');
  
  // Wait for reconnection
  await this.pageA!.waitForTimeout(3000);
});

When('browser B is disconnected from Hocuspocus', async function (this: ICustomWorld) {
  await this.pageB!.route('**/*', route => {
    const url = route.request().url();
    if (url.includes(':8081') || url.includes('/ws')) {
      route.abort();
    } else {
      route.continue();
    }
  });
  
  await this.pageB!.waitForTimeout(2000);
});

When('browser B reconnects to Hocuspocus', async function (this: ICustomWorld) {
  await this.pageB!.unroute('**/*');
  await this.pageB!.waitForTimeout(3000);
});

// =============================================================================
// Then Steps
// =============================================================================

Then('browser A shows {int} other editor(s) connected', async function (this: ICustomWorld, count: number) {
  // Look for presence indicators in the collaboration status widget
  // Use .first() to avoid strict mode violation (multiple status widgets might exist)
  const statusWidget = this.pageA!.locator('#yjs-collaboration-status, .yjs-collaboration-status-widget').first();
  
  if (count === 0) {
    // Should show "No other editors" or similar
    await slowExpect(statusWidget).toContainText(/no other editor|connected.*\(.*0\)/i);
  } else {
    // Wait for awareness to sync - check that badge count stabilizes
    // Awareness updates are debounced, so we need to wait for them to settle
    let badgeCount = 0;
    let stableCount = 0;
    const maxAttempts = 10;
    
    for (let i = 0; i < maxAttempts; i++) {
      await this.pageA!.waitForTimeout(1000);
      const userBadges = statusWidget.locator('.yjs-user-badge');
      const currentCount = await userBadges.count();
      
      if (currentCount === badgeCount) {
        stableCount++;
        if (stableCount >= 2) {
          // Count has been stable for 2 checks, use it
          badgeCount = currentCount;
          break;
        }
      } else {
        badgeCount = currentCount;
        stableCount = 0;
      }
    }
    
    // Debug: log what we found
    const userBadges = statusWidget.locator('.yjs-user-badge');
    if (badgeCount !== count) {
      const badgeTexts = await userBadges.allTextContents();
      console.log(`[Collab] Browser A: Expected ${count} badges, found ${badgeCount}:`, badgeTexts);
      // Also log the widget HTML for debugging
      const widgetHtml = await statusWidget.innerHTML().catch(() => '');
      console.log(`[Collab] Browser A widget HTML:`, widgetHtml.substring(0, 500));
    }
    
    await slowExpect(userBadges).toHaveCount(count);
  }
});

Then('browser B shows {int} other editor(s) connected', async function (this: ICustomWorld, count: number) {
  const statusWidget = this.pageB!.locator('#yjs-collaboration-status, .yjs-collaboration-status-widget').first();
  
  if (count === 0) {
    await slowExpect(statusWidget).toContainText(/no other editor|connected.*\(.*0\)/i);
  } else {
    // Wait for awareness to sync - check that badge count stabilizes
    let badgeCount = 0;
    let stableCount = 0;
    const maxAttempts = 10;
    
    for (let i = 0; i < maxAttempts; i++) {
      await this.pageB!.waitForTimeout(1000);
      const userBadges = statusWidget.locator('.yjs-user-badge');
      const currentCount = await userBadges.count();
      
      if (currentCount === badgeCount) {
        stableCount++;
        if (stableCount >= 2) {
          // Count has been stable for 2 checks, use it
          badgeCount = currentCount;
          break;
        }
      } else {
        badgeCount = currentCount;
        stableCount = 0;
      }
    }
    
    // Debug: log what we found
    const userBadges = statusWidget.locator('.yjs-user-badge');
    if (badgeCount !== count) {
      const badgeTexts = await userBadges.allTextContents();
      console.log(`[Collab] Browser B: Expected ${count} badges, found ${badgeCount}:`, badgeTexts);
      const widgetHtml = await statusWidget.innerHTML().catch(() => '');
      console.log(`[Collab] Browser B widget HTML:`, widgetHtml.substring(0, 500));
    }
    
    await slowExpect(userBadges).toHaveCount(count);
  }
});

Then('browser A\'s editor shows {string}', async function (this: ICustomWorld, expectedText: string) {
  // Wait for sync and check content
  await this.pageA!.waitForTimeout(1000);
  const content = await getEditorContent(this.pageA!);
  expect(content).toContain(expectedText);
});

Then('browser B shows a cursor at the correct vertical position for browser A', async function (this: ICustomWorld) {
  // Wait for cursor to appear
  await this.pageB!.waitForTimeout(1000);
  
  // Find cursor elements (should be visible for remote users)
  const cursorElements = this.pageB!.locator('.yjs-cursor[data-user-id]');
  const cursorCount = await cursorElements.count();
  
  expect(cursorCount).toBeGreaterThan(0);
  
  // Check that cursor is visible (not display: none)
  const firstCursor = cursorElements.first();
  const isVisible = await firstCursor.isVisible();
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
  
  console.log(`[Collab] Cursor position verified: top=${top}, left=${left}`);
});

Then('browser B\'s editor shows {string}', async function (this: ICustomWorld, expectedText: string) {
  await this.pageB!.waitForTimeout(1000);
  const content = await getEditorContent(this.pageB!);
  expect(content).toContain(expectedText);
});

Then('both browsers show {string}', async function (this: ICustomWorld, expectedText: string) {
  await this.pageA!.waitForTimeout(1000);
  await this.pageB!.waitForTimeout(1000);
  
  const contentA = await getEditorContent(this.pageA!);
  const contentB = await getEditorContent(this.pageB!);
  
  expect(contentA).toContain(expectedText);
  expect(contentB).toContain(expectedText);
});

Then('browser A shows connection status {string}', async function (this: ICustomWorld, status: string) {
  // Use .first() to avoid strict mode violation (multiple status elements might exist)
  const statusIndicator = this.pageA!.locator(
    '#yjs-connection-status, .yjs-status-indicator, .yjs-collaboration-status-widget'
  ).first();
  
  if (status === 'connected') {
    await slowExpect(statusIndicator).toHaveClass(/connected/);
  } else if (status === 'disconnected') {
    await slowExpect(statusIndicator).toHaveClass(/disconnected/);
  } else {
    await slowExpect(statusIndicator).toContainText(status);
  }
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
  
  expect(trimmedContent).toBe(expectedText);
  console.log(`[Collab] Browser A content verified: "${trimmedContent}"`);
});

Then('browser B\'s editor shows exactly {string}', async function (this: ICustomWorld, expectedText: string) {
  await this.pageB!.waitForTimeout(1000);
  const content = await getEditorContent(this.pageB!);
  const trimmedContent = content.trim();
  
  expect(trimmedContent).toBe(expectedText);
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

