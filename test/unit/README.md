# JavaScript Unit Tests

Unit tests for the Yjs collaboration JavaScript code using Vitest.

**Note:** These unit tests focus on pure logic and algorithms. DOM interactions and browser behavior are tested in the E2E tests using Playwright (see `test/e2e/`).

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch
```

## Test Structure

- `merge.test.js` - Tests for Yjs merge functionality (merging external content with Yjs documents)
- `document-naming.test.js` - Tests for document name generation
- `helpers.test.js` - Tests for helper functions (normalization, cursor handling, etc.)
- `setup.js` - Vitest setup file (mocks, globals, etc.)

## What to Test Here vs E2E

**Unit Tests (Vitest):**
- Pure logic functions
- Algorithms (merge, diff, normalization)
- Data transformations
- Yjs CRDT operations
- Helper functions

**E2E Tests (Playwright):**
- DOM interactions
- Browser behavior
- User workflows
- Integration with Redmine UI
- Real-time collaboration scenarios

## Writing New Tests

1. Create a new test file in `test/unit/` with the pattern `*.test.js`
2. Import Vitest functions: `import { describe, it, expect, beforeEach } from 'vitest'`
3. Use `describe` blocks to group related tests
4. Use `it` blocks for individual test cases
5. Use `expect` for assertions

Example:
```javascript
import { describe, it, expect } from 'vitest';

describe('My Feature', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

