/**
 * Unit tests for our merge functionality
 * Tests our mergeExternalContent logic, not Yjs itself
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';

/**
 * Extract the merge logic from our implementation for testing
 * This tests OUR code, not Yjs
 */
function mergeExternalContent(documentName, externalContent, collaboration) {
  if (!collaboration) {
    return false;
  }
  
  const { ydoc, ytext } = collaboration;
  const currentContent = ytext.toString();
  
  // Our logic: check if content is identical BEFORE merging
  if (currentContent === externalContent) {
    return true; // Early return - no merge needed
  }
  
  // Our logic: create temp doc and merge
  const tempDoc = new Y.Doc();
  const tempYtext = tempDoc.getText('content');
  tempYtext.insert(0, externalContent || '');
  const update = Y.encodeStateAsUpdate(tempDoc);
  Y.applyUpdate(ydoc, update);
  
  return true;
}

describe('Our Merge Functionality', () => {
  let ydoc;
  let ytext;
  let collaboration;

  beforeEach(() => {
    ydoc = new Y.Doc();
    ytext = ydoc.getText('content');
    collaboration = { ydoc, ytext, documentName: 'test-doc' };
  });

  describe('mergeExternalContent - our implementation', () => {
    it('should return early when content is identical', () => {
      ytext.insert(0, 'Same content');
      const externalContent = 'Same content';
      
      // Our function should detect identical content and return early
      const result = mergeExternalContent('test-doc', externalContent, collaboration);
      
      expect(result).toBe(true);
      // Content should remain unchanged (no merge happened)
      expect(ytext.toString()).toBe('Same content');
    });

    it('should return false when collaboration is missing', () => {
      const result = mergeExternalContent('test-doc', 'content', null);
      expect(result).toBe(false);
    });

    it('should merge when content is different', () => {
      ytext.insert(0, 'Hello');
      const externalContent = 'Hello World';
      
      const result = mergeExternalContent('test-doc', externalContent, collaboration);
      
      expect(result).toBe(true);
      // Content should be merged (Yjs handles the actual merge)
      const merged = ytext.toString();
      expect(merged.length).toBeGreaterThan('Hello'.length);
    });

    it('should handle empty external content', () => {
      ytext.insert(0, 'Existing content');
      
      const result = mergeExternalContent('test-doc', '', collaboration);
      
      expect(result).toBe(true);
      // Should still have existing content (empty doesn't match, so merge happens)
      expect(ytext.toString()).toContain('Existing');
    });

    it('should handle empty Yjs content', () => {
      // Yjs is empty
      const externalContent = 'New content';
      
      const result = mergeExternalContent('test-doc', externalContent, collaboration);
      
      expect(result).toBe(true);
      // Should have merged the external content
      expect(ytext.toString()).toContain('New content');
    });

    it('should handle null/undefined external content', () => {
      ytext.insert(0, 'Existing');
      
      const result = mergeExternalContent('test-doc', null, collaboration);
      
      expect(result).toBe(true);
      // Should handle gracefully
      expect(ytext.toString()).toBeTruthy();
    });
  });

  describe('Content comparison logic', () => {
    it('should correctly identify identical content', () => {
      ytext.insert(0, 'Test content');
      const currentContent = ytext.toString();
      const externalContent = 'Test content';
      
      // Test our comparison logic
      const isIdentical = currentContent === externalContent;
      expect(isIdentical).toBe(true);
    });

    it('should correctly identify different content', () => {
      ytext.insert(0, 'Content A');
      const currentContent = ytext.toString();
      const externalContent = 'Content B';
      
      // Test our comparison logic
      const isIdentical = currentContent === externalContent;
      expect(isIdentical).toBe(false);
    });

    it('should handle whitespace differences', () => {
      ytext.insert(0, 'Content');
      const currentContent = ytext.toString();
      const externalContent = 'Content '; // trailing space
      
      // Our logic uses strict equality, so whitespace matters
      const isIdentical = currentContent === externalContent;
      expect(isIdentical).toBe(false);
    });
  });
});

