/**
 * Cucumber hooks for test lifecycle management
 * 
 * Sets up and tears down Playwright browsers and contexts.
 */

import {
  Before,
  After,
  BeforeAll,
  AfterAll,
  Status,
  setDefaultTimeout,
} from '@cucumber/cucumber';
import { chromium, Browser } from '@playwright/test';
import { ICustomWorld } from './custom-world';
import { config } from './config';

// Shared browser instance across all tests
let sharedBrowser: Browser | undefined;

// Set default timeout for all steps (60 seconds, or unlimited if debugging)
setDefaultTimeout(process.env.PWDEBUG ? -1 : 60 * 1000);

/**
 * Cleanup function to ensure browser is closed
 */
async function cleanupBrowser(): Promise<void> {
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
    } catch (e) {
      console.warn('[Hooks] Error closing browser during cleanup:', e);
    }
    sharedBrowser = undefined;
  }
}

// Ensure cleanup on process termination
process.on('SIGINT', async () => {
  console.log('\n[Hooks] SIGINT received, cleaning up...');
  await cleanupBrowser();
  process.exit(130); // Standard exit code for SIGINT
});

process.on('SIGTERM', async () => {
  console.log('\n[Hooks] SIGTERM received, cleaning up...');
  await cleanupBrowser();
  process.exit(143); // Standard exit code for SIGTERM
});

process.on('uncaughtException', async (error) => {
  console.error('[Hooks] Uncaught exception:', error);
  await cleanupBrowser();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  console.error('[Hooks] Unhandled rejection:', reason);
  await cleanupBrowser();
  process.exit(1);
});

/**
 * Wait for a URL to become available (basic HTTP check)
 */
async function waitForUrl(url: string, maxRetries = 30, intervalMs = 2000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        console.log(`[Hooks] ✅ ${url} is available`);
        return true;
      }
    } catch (e) {
      if (i % 5 === 0) {
        console.log(`[Hooks] ⏳ Waiting for ${url}... (attempt ${i + 1}/${maxRetries})`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  console.error(`[Hooks] ❌ ${url} not available after ${maxRetries} attempts`);
  return false;
}

/**
 * Wait for Redmine to be fully ready (login page loads with form)
 * This ensures Rails, database, and migrations are all complete
 */
async function waitForRedmineReady(baseUrl: string, maxRetries = 60, intervalMs = 3000): Promise<boolean> {
  const loginUrl = `${baseUrl}/login`;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const res = await fetch(loginUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        // Check if the response contains the login form (Rails fully initialized)
        const html = await res.text();
        if (html.includes('id="username"') || html.includes('name="username"')) {
          console.log(`[Hooks] ✅ Redmine is fully ready (login page loaded)`);
          return true;
        } else if (html.includes('Internal Server Error') || html.includes('We\'re sorry')) {
          console.log(`[Hooks] ⚠️ Redmine returned error page, waiting... (attempt ${i + 1}/${maxRetries})`);
        } else {
          // Page loaded but no login form - might be redirecting or still initializing
          console.log(`[Hooks] ⏳ Redmine responding but not fully ready... (attempt ${i + 1}/${maxRetries})`);
        }
      } else {
        console.log(`[Hooks] ⏳ Redmine returned ${res.status}, waiting... (attempt ${i + 1}/${maxRetries})`);
      }
    } catch (e) {
      if (i % 5 === 0) {
        console.log(`[Hooks] ⏳ Waiting for Redmine to start... (attempt ${i + 1}/${maxRetries})`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  console.error(`[Hooks] ❌ Redmine not fully ready after ${maxRetries} attempts`);
  return false;
}

// Timeout for BeforeAll: must accommodate Redmine startup (up to 90 retries * 3s = 270s)
// plus Hocuspocus check and browser launch. Use 5 minutes to be safe.
BeforeAll({ timeout: 5 * 60 * 1000 }, async function () {
  console.log('[Hooks] BeforeAll: Starting test suite');
  console.log(`[Hooks] Redmine URL (CKEditor, direct): ${config.BASE_URL}`);
  console.log(`[Hooks] Redmine URL (CKEditor, proxy): ${config.BASE_URL_PROXY}`);
  console.log(`[Hooks] Redmine URL (plain text): ${config.BASE_URL_PLAINTEXT}`);
  console.log(`[Hooks] Hocuspocus URL: ${config.HOCUSPOCUS_URL}`);
  
  // Wait for Hocuspocus to be available (quick startup)
  console.log('[Hooks] Checking Hocuspocus...');
  const hocuspocusAvailable = await waitForUrl(`${config.HOCUSPOCUS_URL}/health`, 30, 2000);
  if (!hocuspocusAvailable) {
    throw new Error(`Hocuspocus not available at ${config.HOCUSPOCUS_URL}/health. Check docker-compose.test.yml`);
  }
  
  // Wait for all Redmine instances to be FULLY ready (Rails + DB + migrations complete)
  console.log('[Hooks] Checking Redmine (CKEditor, direct mode)...');
  const redmineReady = await waitForRedmineReady(config.BASE_URL, 90, 3000);
  if (!redmineReady) {
    throw new Error(
      `Redmine not fully ready at ${config.BASE_URL}. ` +
      `Run: docker-compose -f plugins/redmine_yjs/test/e2e/docker-compose.test.yml logs redmine`
    );
  }
  
  console.log('[Hooks] Checking Redmine (CKEditor, proxy mode)...');
  const redmineProxyReady = await waitForRedmineReady(config.BASE_URL_PROXY, 90, 3000);
  if (!redmineProxyReady) {
    throw new Error(
      `Redmine proxy not fully ready at ${config.BASE_URL_PROXY}. ` +
      `Run: docker-compose -f plugins/redmine_yjs/test/e2e/docker-compose.test.yml logs redmine-proxy`
    );
  }
  
  // Plaintext instance is optional - only check if container exists
  // Tests that require it will fail later if it's not available
  console.log('[Hooks] Checking Redmine (plain text editor)...');
  const redminePlaintextReady = await waitForRedmineReady(config.BASE_URL_PLAINTEXT, 30, 3000);
  if (!redminePlaintextReady) {
    console.warn(
      `[Hooks] ⚠️ Redmine plaintext not ready at ${config.BASE_URL_PLAINTEXT}. ` +
      `Tests requiring @plaintext tag will fail. ` +
      `Run: docker-compose -f plugins/redmine_yjs/test/e2e/docker-compose.test.yml up -d redmine-plaintext`
    );
    // Don't throw - allow tests that don't need plaintext to continue
  }
  
  // Launch shared browser
  sharedBrowser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo,
  });
  
  console.log('[Hooks] BeforeAll: Browser launched, all services ready');
});

AfterAll(async function () {
  console.log('[Hooks] AfterAll: Cleaning up');
  await cleanupBrowser();
  console.log('[Hooks] AfterAll: Cleanup complete');
});

Before(async function (this: ICustomWorld, { pickle }) {
  this.startTime = new Date();
  this.testName = pickle.name.replace(/\W/g, '-');
  this.feature = pickle;
  this.debug = process.env.DEBUG === 'true';
  
  console.log(`[Hooks] Before: Starting scenario "${pickle.name}"`);
  
  // Ensure browser is available and connected (recreate if needed)
  if (!sharedBrowser) {
    console.log('[Hooks] Browser not initialized, creating new one...');
    sharedBrowser = await chromium.launch({
      headless: config.headless,
      slowMo: config.slowMo,
    });
  }
  
  // Check if browser is still connected by trying to get version
  try {
    await sharedBrowser.version();
  } catch (e) {
    console.log('[Hooks] Browser disconnected, creating new one...');
    try {
      await sharedBrowser.close();
    } catch {
      // Ignore errors closing old browser
    }
    sharedBrowser = await chromium.launch({
      headless: config.headless,
      slowMo: config.slowMo,
    });
  }
  
  this.browser = sharedBrowser;
  
  // Create two separate browser contexts (simulates two different sessions)
  // Fresh contexts for each scenario (following mermaidlive pattern)
  this.contextA = await this.browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Playwright E2E Test - Browser A',
  });
  
  this.contextB = await this.browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Playwright E2E Test - Browser B',
  });
  
  // Create pages
  this.pageA = await this.contextA.newPage();
  this.pageB = await this.contextB.newPage();
  
  // Set up console logging in debug mode
  if (this.debug) {
    this.pageA.on('console', msg => console.log(`[Browser A] ${msg.type()}: ${msg.text()}`));
    this.pageB.on('console', msg => console.log(`[Browser B] ${msg.type()}: ${msg.text()}`));
  }
  
  // Reset login state
  this.loggedInA = false;
  this.loggedInB = false;
});

After(async function (this: ICustomWorld, { result }) {
  const duration = this.startTime ? Date.now() - this.startTime.getTime() : 0;
  console.log(`[Hooks] After: Scenario "${this.testName}" ${result?.status} (${duration}ms)`);
  
  // Take screenshots on failure (following mermaidlive pattern)
  if (result?.status === Status.FAILED) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = this.testName || 'unknown';
    
    try {
      if (this.pageA) {
        const image = await this.pageA.screenshot({ fullPage: true });
        // Could attach image here if using Cucumber's attach API
        await this.pageA.screenshot({
          path: `reports/screenshots/${safeName}_A_${timestamp}.png`,
          fullPage: true,
        }).catch(() => {
          // Page already closed, skip screenshot
        });
      }
      if (this.pageB) {
        await this.pageB.screenshot({
          path: `reports/screenshots/${safeName}_B_${timestamp}.png`,
          fullPage: true,
        }).catch(() => {
          // Page already closed, skip screenshot
        });
      }
    } catch (e) {
      console.error('[Hooks] Failed to take screenshot:', e);
    }
  }
  
  // Close pages and contexts (following mermaidlive pattern - clean up per scenario)
  // Close pages first, then contexts
  try {
    await this.pageA?.close();
  } catch (e) {
    // Page already closed, ignore
  }
  try {
    await this.pageB?.close();
  } catch (e) {
    // Page already closed, ignore
  }
  try {
    await this.contextA?.close();
  } catch (e) {
    // Context already closed, ignore
  }
  try {
    await this.contextB?.close();
  } catch (e) {
    // Context already closed, ignore
  }
});

