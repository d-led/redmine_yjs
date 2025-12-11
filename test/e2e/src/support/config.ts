/**
 * Test configuration for E2E tests
 */

import { ChildProcess } from 'child_process';

// Detect macOS for hostname configuration
const isMacOS = process.platform === 'darwin';
const defaultHost = isMacOS ? '0.0.0.0' : '127.0.0.1';

interface TestConfig {
  /** Redmine base URL (direct WebSocket mode) */
  BASE_URL: string;
  /** Redmine base URL (ActionCable proxy mode) */
  BASE_URL_PROXY: string;
  /** Hocuspocus WebSocket URL for health checks */
  HOCUSPOCUS_URL: string;
  /** Hocuspocus WebSocket URL that browsers will use */
  HOCUSPOCUS_WS_URL: string;
  /** Whether to start the server before tests */
  startServer: boolean;
  /** Reference to spawned server process (if started) */
  server?: ChildProcess;
  /** Run browsers in headless mode */
  headless: boolean;
  /** Slow down Playwright actions (ms) */
  slowMo: number;
  /** Default test timeout (ms) */
  defaultTimeout: number;
  /** Admin credentials */
  admin: {
    login: string;
    password: string;
  };
}

export const config: TestConfig = {
  BASE_URL: process.env.SUT_BASE_URL || `http://${defaultHost}:3000`,
  BASE_URL_PROXY: process.env.SUT_BASE_URL_PROXY || `http://${defaultHost}:3001`,
  HOCUSPOCUS_URL: process.env.HOCUSPOCUS_URL || `http://${defaultHost}:8081`,
  HOCUSPOCUS_WS_URL: process.env.HOCUSPOCUS_WS_URL || `ws://${defaultHost}:8081`,
  startServer: process.env.START_SERVER === 'true',
  headless: process.env.HEADLESS !== 'false',
  slowMo: parseInt(process.env.SLOW_MO || '0', 10),
  defaultTimeout: 30000,
  admin: {
    login: process.env.ADMIN_LOGIN || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },
};

console.log('[Config] Test configuration loaded:');
console.log(`  BASE_URL (direct): ${config.BASE_URL}`);
console.log(`  BASE_URL_PROXY (ActionCable): ${config.BASE_URL_PROXY}`);
console.log(`  HOCUSPOCUS_URL: ${config.HOCUSPOCUS_URL}`);
console.log(`  HOCUSPOCUS_WS_URL: ${config.HOCUSPOCUS_WS_URL}`);
console.log(`  Headless: ${config.headless}`);
console.log(`  Platform: ${process.platform} (using host: ${defaultHost})`);
