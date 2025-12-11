/**
 * Custom World for Cucumber tests with Playwright
 * 
 * Provides two browser contexts (A and B) for testing concurrent editing.
 * Follows the pattern from mermaidlive project.
 */

import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import type { Pickle } from '@cucumber/messages';
import type {
  Browser,
  BrowserContext,
  Page,
  PlaywrightTestOptions,
} from '@playwright/test';

export interface ICustomWorld extends World {
  /** Debug mode flag */
  debug: boolean;
  /** Current feature/scenario being executed */
  feature?: Pickle;
  /** Test name for reporting */
  testName?: string;
  /** Test start time */
  startTime?: Date;

  /** Playwright browser instance (shared across contexts) */
  browser?: Browser;

  /** Browser context A (first user session) */
  contextA?: BrowserContext;
  /** Browser context B (second user session) */
  contextB?: BrowserContext;

  /** Page for browser A */
  pageA?: Page;
  /** Page for browser B */
  pageB?: Page;

  /** Current issue ID being tested */
  currentIssueId?: number;
  /** Current project identifier being tested */
  currentProjectId?: string;
  /** Current wiki page name being tested */
  currentWikiPage?: string;

  /** Playwright options (timeout, etc.) */
  playwrightOptions?: PlaywrightTestOptions;

  /** Track logged-in state per context */
  loggedInA?: boolean;
  loggedInB?: boolean;
  
  /** Use plaintext instance instead of CKEditor */
  usePlaintextInstance?: boolean;
  /** Use proxy instance instead of direct */
  useProxyInstance?: boolean;
}

export class CustomWorld extends World implements ICustomWorld {
  debug = false;
  browser?: Browser;
  contextA?: BrowserContext;
  contextB?: BrowserContext;
  pageA?: Page;
  pageB?: Page;
  currentIssueId?: number;
  currentProjectId?: string;
  currentWikiPage?: string;
  loggedInA?: boolean;
  loggedInB?: boolean;
  usePlaintextInstance?: boolean;
  useProxyInstance?: boolean;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(CustomWorld);

