/**
 * Collaboration step definitions for concurrent editing tests
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect, Page } from '@playwright/test';
import { ICustomWorld } from '../support/custom-world';
import { config } from '../support/config';

const slowExpect = expect.configure({ timeout: 15000 });

/**
 * Login to Redmine if not already logged in
 */
async function ensureLoggedIn(world: ICustomWorld, browser: 'A' | 'B'): Promise<void> {
  const page = browser === 'A' ? world.pageA! : world.pageB!;
  const loggedInKey = browser === 'A' ? 'loggedInA' : 'loggedInB';
  
  if (world[loggedInKey]) {
    return;
  }
  
  await page.goto(`${config.BASE_URL}/login`);
  await page.fill('#username', config.admin.login);
  await page.fill('#password', config.admin.password);
  await page.click('input[type="submit"][name="login"]');
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
  
  world[loggedInKey] = true;
}

/**
 * Navigate to issue edit page and wait for editor to be ready
 */
async function openIssueEdit(page: Page, issueId: number): Promise<void> {
  await page.goto(`${config.BASE_URL}/issues/${issueId}/edit`);
  
  // Wait for page to load
  await page.waitForLoadState('domcontentloaded');
  
  // Wait for Yjs collaboration to initialize (status widget appears)
  await slowExpect(
    page.locator('#yjs-collaboration-status, #yjs-connection-status, .yjs-collaboration-status-widget').first()
  ).toBeVisible({ timeout: 20000 });
  
  // Additional wait for WebSocket connection
  await page.waitForTimeout(1000);
}

/**
 * Navigate to wiki page edit and wait for editor to be ready
 */
async function openWikiEdit(page: Page, projectId: string, pageName: string): Promise<void> {
  await page.goto(`${config.BASE_URL}/projects/${projectId}/wiki/${pageName}/edit`);
  
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
  await textarea.click();
  
  if (position === 'beginning') {
    await page.keyboard.press('Control+Home');
  } else if (position === 'end') {
    await page.keyboard.press('Control+End');
  }
  
  await page.keyboard.type(text, { delay: 50 });
}

// =============================================================================
// Given Steps
// =============================================================================

Given('user {string} opens the issue in browser A', { timeout: 30000 }, async function (this: ICustomWorld, username: string) {
  await ensureLoggedIn(this, 'A');
  
  if (!this.currentIssueId) {
    throw new Error('No issue ID available. Make sure "an issue exists" step ran first.');
  }
  
  await openIssueEdit(this.pageA!, this.currentIssueId);
  console.log(`[Collab] Browser A opened issue ${this.currentIssueId} for editing`);
});

Given('user {string} opens the same issue in browser B', { timeout: 30000 }, async function (this: ICustomWorld, username: string) {
  await ensureLoggedIn(this, 'B');
  
  if (!this.currentIssueId) {
    throw new Error('No issue ID available. Make sure "an issue exists" step ran first.');
  }
  
  await openIssueEdit(this.pageB!, this.currentIssueId);
  console.log(`[Collab] Browser B opened issue ${this.currentIssueId} for editing`);
});

Given('user {string} opens the wiki page edit in browser A', { timeout: 30000 }, async function (this: ICustomWorld, username: string) {
  await ensureLoggedIn(this, 'A');
  
  if (!this.currentProjectId || !this.currentWikiPage) {
    throw new Error('No wiki page context. Make sure "a wiki page exists" step ran first.');
  }
  
  await openWikiEdit(this.pageA!, this.currentProjectId, this.currentWikiPage);
  console.log(`[Collab] Browser A opened wiki page ${this.currentWikiPage} for editing`);
});

Given('user {string} opens the same wiki page edit in browser B', { timeout: 30000 }, async function (this: ICustomWorld, username: string) {
  await ensureLoggedIn(this, 'B');
  
  if (!this.currentProjectId || !this.currentWikiPage) {
    throw new Error('No wiki page context. Make sure "a wiki page exists" step ran first.');
  }
  
  await openWikiEdit(this.pageB!, this.currentProjectId, this.currentWikiPage);
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
  const statusWidget = this.pageA!.locator('#yjs-collaboration-status, .yjs-collaboration-status-widget');
  
  if (count === 0) {
    // Should show "No other editors" or similar
    await slowExpect(statusWidget).toContainText(/no other editor|connected.*\(.*0\)/i);
  } else {
    // Should show user badges or count
    const userBadges = statusWidget.locator('.yjs-user-badge');
    await slowExpect(userBadges).toHaveCount(count);
  }
});

Then('browser B shows {int} other editor(s) connected', async function (this: ICustomWorld, count: number) {
  const statusWidget = this.pageB!.locator('#yjs-collaboration-status, .yjs-collaboration-status-widget');
  
  if (count === 0) {
    await slowExpect(statusWidget).toContainText(/no other editor|connected.*\(.*0\)/i);
  } else {
    const userBadges = statusWidget.locator('.yjs-user-badge');
    await slowExpect(userBadges).toHaveCount(count);
  }
});

Then('browser A\'s editor shows {string}', async function (this: ICustomWorld, expectedText: string) {
  // Wait for sync and check content
  await this.pageA!.waitForTimeout(1000);
  const content = await getEditorContent(this.pageA!);
  expect(content).toContain(expectedText);
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
  const statusIndicator = this.pageA!.locator(
    '#yjs-connection-status, .yjs-status-indicator, .yjs-collaboration-status-widget'
  );
  
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
  // Check if CKEditor iframe is present
  const iframeLocator = page.locator('iframe.cke_wysiwyg_frame').first();
  if (await iframeLocator.count() > 0) {
    const frame = iframeLocator.contentFrame();
    const body = frame.locator('body');
    await body.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    return;
  }
  
  // Check for CKEditor contenteditable
  const ckeEditable = page.locator('.cke_editable').first();
  if (await ckeEditable.count() > 0) {
    await ckeEditable.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    return;
  }
  
  // Fallback to textarea
  const textarea = page.locator(
    'textarea[id*="description"], textarea[id*="notes"], textarea[id*="content"]'
  ).first();
  await textarea.fill('');
}

/**
 * Wait for Yjs collaboration to be ready after page load/reload
 */
async function waitForCollaborationReady(page: Page): Promise<void> {
  // Wait for page to load
  await page.waitForLoadState('domcontentloaded');
  
  // Wait for Yjs collaboration to initialize (status widget appears)
  await slowExpect(
    page.locator('#yjs-collaboration-status, #yjs-connection-status, .yjs-collaboration-status-widget').first()
  ).toBeVisible({ timeout: 20000 });
  
  // Wait for WebSocket connection to be established
  await slowExpect(
    page.locator('.yjs-collaboration-status-widget.connected, .yjs-status.connected, .yjs-status-indicator.connected')
  ).toBeVisible({ timeout: 15000 });
  
  // Additional wait for sync
  await page.waitForTimeout(1500);
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

