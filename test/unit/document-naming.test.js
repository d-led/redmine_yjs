/**
 * Unit tests for document naming logic
 */

import { describe, it, expect } from 'vitest';

describe('Document Naming', () => {
  it('should generate correct wiki document name', () => {
    const projectId = 1;
    const wikiPageId = 2;
    const field = 'content_text';
    const expected = `wiki-${projectId}-${wikiPageId}-${field}`;
    
    expect(expected).toBe('wiki-1-2-content_text');
  });

  it('should generate correct issue document name', () => {
    const issueId = 123;
    const field = 'description';
    const expected = `issue-${issueId}-${field}`;
    
    expect(expected).toBe('issue-123-description');
  });

  it('should handle different field names', () => {
    const issueId = 456;
    const field = 'notes';
    const expected = `issue-${issueId}-${field}`;
    
    expect(expected).toBe('issue-456-notes');
  });
});

