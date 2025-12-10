/**
 * Setup step definitions for test data creation
 */

import { Given } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/custom-world';
import { config } from '../support/config';

const slowExpect = expect.configure({ timeout: 15000 });

/**
 * Login to Redmine as admin
 */
async function loginAsAdmin(world: ICustomWorld, browser: 'A' | 'B'): Promise<void> {
  const page = browser === 'A' ? world.pageA! : world.pageB!;
  const loggedInKey = browser === 'A' ? 'loggedInA' : 'loggedInB';
  
  if (world[loggedInKey]) {
    return; // Already logged in
  }
  
  await page.goto(`${config.BASE_URL}/login`);
  await page.fill('#username', config.admin.login);
  await page.fill('#password', config.admin.password);
  await page.click('input[type="submit"][name="login"]');
  
  // Wait for redirect after login
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
  
  // Verify logged in by checking for user menu or logged-in indicator
  await slowExpect(page.locator('#loggedas, .user.active, #top-menu .user')).toBeVisible();
  
  world[loggedInKey] = true;
  console.log(`[Setup] Logged in as admin in browser ${browser}`);
}

Given('Redmine is running with Yjs collaborative editing enabled', async function (this: ICustomWorld) {
  // Health check already done in BeforeAll hook
  // Just verify we can reach the home page
  await this.pageA!.goto(config.BASE_URL);
  await slowExpect(this.pageA!.locator('body')).toBeVisible();
  console.log('[Setup] ✅ Redmine is running');
});

Given('a test project {string} exists', async function (this: ICustomWorld, projectName: string) {
  await loginAsAdmin(this, 'A');
  
  const projectId = projectName.toLowerCase().replace(/\s+/g, '-');
  this.currentProjectId = projectId;
  
  // Try to access the project first
  const response = await this.pageA!.goto(`${config.BASE_URL}/projects/${projectId}`);
  
  if (response?.status() === 404) {
    // Project doesn't exist, create it
    await this.pageA!.goto(`${config.BASE_URL}/projects/new`);
    await this.pageA!.fill('#project_name', projectName);
    await this.pageA!.fill('#project_identifier', projectId);
    
    // Enable issue tracking module
    await this.pageA!.check('input[name="project[enabled_module_names][]"][value="issue_tracking"]');
    // Enable wiki module
    await this.pageA!.check('input[name="project[enabled_module_names][]"][value="wiki"]');
    
    await this.pageA!.click('input[type="submit"][name="commit"]');
    
    // Wait for project creation
    await this.pageA!.waitForURL(url => url.toString().includes(`/projects/${projectId}`), { timeout: 10000 });
    console.log(`[Setup] Created project: ${projectName}`);
  } else {
    console.log(`[Setup] Project exists: ${projectName}`);
  }
});

Given('an issue {string} exists in {string}', async function (this: ICustomWorld, issueSubject: string, projectName: string) {
  await loginAsAdmin(this, 'A');
  
  const projectId = projectName.toLowerCase().replace(/\s+/g, '-');
  
  // Check if issue already exists by searching
  await this.pageA!.goto(`${config.BASE_URL}/projects/${projectId}/issues?set_filter=1&f[]=subject&op[subject]=~&v[subject][]=${encodeURIComponent(issueSubject)}`);
  
  const existingIssue = this.pageA!.locator(`table.issues td.subject:has-text("${issueSubject}")`);
  const issueExists = await existingIssue.count() > 0;
  
  if (issueExists) {
    // Get the issue ID from the link
    const issueLink = existingIssue.first().locator('a');
    const href = await issueLink.getAttribute('href');
    const match = href?.match(/\/issues\/(\d+)/);
    if (match) {
      this.currentIssueId = parseInt(match[1], 10);
      console.log(`[Setup] Issue exists: ${issueSubject} (ID: ${this.currentIssueId})`);
      return;
    }
  }
  
  // Create new issue
  await this.pageA!.goto(`${config.BASE_URL}/projects/${projectId}/issues/new`);
  await this.pageA!.fill('#issue_subject', issueSubject);
  
  // Wait for any CKEditor to initialize (if used)
  await this.pageA!.waitForTimeout(1000);
  
  await this.pageA!.click('input[type="submit"][name="commit"]');
  
  // Wait for issue creation and extract ID from URL
  await this.pageA!.waitForURL(url => /\/issues\/\d+/.test(url.toString()), { timeout: 10000 });
  
  const url = this.pageA!.url();
  const idMatch = url.match(/\/issues\/(\d+)/);
  if (idMatch) {
    this.currentIssueId = parseInt(idMatch[1], 10);
    console.log(`[Setup] Created issue: ${issueSubject} (ID: ${this.currentIssueId})`);
  }
});

Given('a wiki page {string} exists in {string}', async function (this: ICustomWorld, pageName: string, projectName: string) {
  await loginAsAdmin(this, 'A');
  
  const projectId = projectName.toLowerCase().replace(/\s+/g, '-');
  this.currentProjectId = projectId;
  this.currentWikiPage = pageName;
  
  // Try to access the wiki page
  const response = await this.pageA!.goto(`${config.BASE_URL}/projects/${projectId}/wiki/${pageName}`);
  
  if (response?.status() === 404 || await this.pageA!.locator('.nodata, .wiki-404').count() > 0) {
    // Page doesn't exist, create it
    await this.pageA!.goto(`${config.BASE_URL}/projects/${projectId}/wiki/${pageName}/edit`);
    
    // Wait for editor to load
    await this.pageA!.waitForTimeout(1000);
    
    // Add initial content
    const textarea = this.pageA!.locator('textarea[id*="content"]');
    if (await textarea.isVisible()) {
      await textarea.fill(`Initial content for ${pageName}`);
    }
    
    await this.pageA!.click('input[type="submit"][name="commit"]');
    await this.pageA!.waitForURL(url => url.toString().includes(`/wiki/${pageName}`), { timeout: 10000 });
    
    console.log(`[Setup] Created wiki page: ${pageName}`);
  } else {
    console.log(`[Setup] Wiki page exists: ${pageName}`);
  }
});

