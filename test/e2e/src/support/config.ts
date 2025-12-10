/**
 * Test configuration for E2E tests
 * 
 * Environment variables:
 * - SUT_BASE_URL: Redmine base URL (default: http://localhost:3000)
 * - HOCUSPOCUS_URL: Hocuspocus WebSocket URL (default: ws://localhost:8081)
 * - START_SERVER: Whether to start the server (default: false)
 * - HEADLESS: Run browsers in headless mode (default: true)
 * - SLOW_MO: Slow down actions by ms (default: 0)
 */

import { ChildProcess } from 'child_process';

// Detect macOS for hostname configuration
const isMacOS = process.platform === 'darwin';
const defaultHost = isMacOS ? '0.0.0.0' : '127.0.0.1';

interface TestConfig {
  /** Redmine base URL */
  BASE_URL: string;
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
console.log(`  BASE_URL: ${config.BASE_URL}`);
console.log(`  HOCUSPOCUS_URL: ${config.HOCUSPOCUS_URL}`);
console.log(`  HOCUSPOCUS_WS_URL: ${config.HOCUSPOCUS_WS_URL}`);
console.log(`  Headless: ${config.headless}`);
console.log(`  Platform: ${process.platform} (using host: ${defaultHost})`);

