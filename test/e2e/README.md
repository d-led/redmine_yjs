# Redmine Yjs E2E Tests

End-to-end tests for the Redmine Yjs collaborative editing plugin using Playwright and Cucumber.

## Overview

These tests verify real-time collaborative editing functionality by:
- Running two browser sessions simultaneously
- Testing real-time text synchronization via Yjs/Hocuspocus
- Verifying presence indicators (other editors connected)
- Testing reconnection and offline resilience

## Prerequisites

- Node.js 18+
- Docker and Docker Compose

## Quick Start

### Option 1: Use the Test Runner Script (Recommended)

```bash
cd test/e2e

# Run all tests (starts services, runs tests, cleans up)
./scripts/run-tests.sh

# Run with visible browser
./scripts/run-tests.sh --visible

# Only start services (for manual testing)
./scripts/run-tests.sh --setup

# Only cleanup
./scripts/run-tests.sh --cleanup
```

### Option 2: Manual Setup

#### 1. Start the Test Stack

```bash
cd test/e2e

# Start minimal Redmine + Hocuspocus (SQLite database)
docker-compose -f docker-compose.test.yml up --build -d

# Wait for services to be ready (takes ~60 seconds on first run)
docker-compose -f docker-compose.test.yml logs -f
```

#### 2. Install Test Dependencies

```bash
npm install
npx playwright install chromium
```

#### 3. Run Tests

```bash
# Run all tests
npm test

# Run only concurrent editing tests
npm test -- --tags @concurrent

# Run with visible browser (debug mode)
HEADLESS=false npm test

# Run with slow motion for debugging
HEADLESS=false SLOW_MO=500 npm test
```

#### 4. Cleanup

```bash
docker-compose -f docker-compose.test.yml down -v
```

### View Results

```bash
# Open HTML report
npm run test:report

# Screenshots are saved in reports/screenshots/ on failure
```

## Test Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SUT_BASE_URL` | `http://0.0.0.0:3000` (macOS) / `http://127.0.0.1:3000` | Redmine URL |
| `HOCUSPOCUS_URL` | `http://0.0.0.0:8081` / `http://127.0.0.1:8081` | Hocuspocus health check URL |
| `HOCUSPOCUS_WS_URL` | `ws://0.0.0.0:8081` / `ws://127.0.0.1:8081` | WebSocket URL |
| `HEADLESS` | `true` | Run browsers without UI |
| `SLOW_MO` | `0` | Delay between actions (ms) |
| `DEBUG` | `false` | Enable debug logging |
| `ADMIN_LOGIN` | `admin` | Redmine admin username |
| `ADMIN_PASSWORD` | `admin123` | Redmine admin password |

**Note:** On macOS, use `0.0.0.0` instead of `127.0.0.1` due to Docker networking.

## Test Structure

```
test/e2e/
├── docker-compose.test.yml      # Minimal test stack (Redmine + Hocuspocus)
├── Dockerfile.redmine           # Test Redmine image with plugin
├── scripts/
│   └── run-tests.sh             # Test runner with setup/cleanup
├── features/                    # Gherkin feature files
│   ├── concurrent_editing.feature  # Main collaboration tests
│   └── wiki_collaboration.feature  # Wiki-specific tests
├── src/
│   ├── steps/                   # Step definitions
│   │   ├── setup.steps.ts       # Test data setup
│   │   └── collaboration.steps.ts  # Collaboration test steps
│   └── support/                 # Test infrastructure
│       ├── config.ts            # Configuration
│       ├── custom-world.ts      # Cucumber world with two browsers
│       └── hooks.ts             # Before/After hooks
├── reports/                     # Generated reports
├── cucumber.js                  # Cucumber configuration
├── package.json
└── tsconfig.json
```

## Test Scenarios

### Concurrent Editing (`@concurrent`)

1. **Two users see each other's presence** - Verifies WebSocket connection and Yjs awareness
2. **Real-time text synchronization** - Tests CRDT sync between browsers
3. **Concurrent edits merge without conflict** - Verifies conflict-free merging
4. **Connection status indicator** - Tests UI feedback for connection state
5. **Reconnection syncs content** - Tests offline resilience

### Browser Reload (`@ui`)

1. **Browser reload does not duplicate content** - Verifies content integrity after reload
2. **Multiple reloads do not accumulate content** - Tests repeated reload scenarios

### Wiki Collaboration

1. **Two users collaborate on wiki page** - Tests wiki-specific collaboration

## Architecture

The tests use:
- **Playwright** for browser automation with two separate browser contexts
- **Cucumber** for BDD-style test specifications
- **Yjs** CRDT library (synced via Hocuspocus WebSocket server)

Each test scenario:
1. Creates test data (project, issue, or wiki page)
2. Opens the same edit page in two browser sessions
3. Verifies real-time synchronization
4. Cleans up browser contexts after each test

## Troubleshooting

### Services not starting
```bash
# Check Docker logs
docker-compose -f docker-compose.test.yml logs

# Restart services
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.test.yml up --build
```

### WebSocket connection issues
```bash
# Verify Hocuspocus is running
curl http://0.0.0.0:8081/health  # macOS
curl http://127.0.0.1:8081/health  # Linux

# Check browser console for WebSocket errors
HEADLESS=false DEBUG=true npm test
```

### Tests timing out
```bash
# Run with visible browser and slow motion for debugging
./scripts/run-tests.sh --visible

# Or manually:
SLOW_MO=1000 HEADLESS=false npm test
```

## Development

### Adding new tests

1. Add scenarios to `features/*.feature`
2. Implement step definitions in `src/steps/`
3. Run tests to verify

### Debugging

```bash
# Run with visible browser and debug logging
HEADLESS=false DEBUG=true npm test

# Run specific scenario
npm test -- --name "Two users see each other"

# Generate step definition snippets
npm test -- --dry-run
```

## Continuous Integration

The E2E tests have their own GitHub Actions workflow located at `.github/workflows/e2e-tests.yml` 
(within the plugin repository).

Tests run automatically on:
- Push to main/master branches
- Pull requests
- Manual trigger (workflow_dispatch)

### Running CI Locally

To simulate the CI environment locally:

```bash
cd test/e2e

# Ensure package-lock.json exists (required for CI caching)
npm install

# Run the full E2E test script (same as CI)
./scripts/run-tests.sh
```

### CI Workflow

The workflow (`.github/workflows/e2e-tests.yml`):
1. Checks out the plugin repository
2. Starts Docker services (uses `Dockerfile.redmine` to build test Redmine image)
3. Runs Playwright/Cucumber tests (tests wait for services to be ready)
4. Uploads test reports and screenshots as artifacts
5. **Always cleans up** Docker services (on success and failure)

### Manual Trigger

You can manually trigger the workflow from GitHub Actions with optional debug mode.

## Related Documentation

- [Yjs Documentation](https://docs.yjs.dev/)
- [Hocuspocus Documentation](https://tiptap.dev/docs/hocuspocus/)
- [Playwright Documentation](https://playwright.dev/)
- [Cucumber.js Documentation](https://github.com/cucumber/cucumber-js)
