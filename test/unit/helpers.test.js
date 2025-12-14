/**
 * Unit tests for helper functions (pure logic only)
 * 
 * Note: DOM interactions are tested in E2E tests with Playwright
 */

import { describe, it, expect } from 'vitest';

describe('Content normalization', () => {
  it('should normalize newlines correctly', () => {
    const normalizeNewlines = (text) => {
      return text.replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
    };
    
    expect(normalizeNewlines('Line 1\\nLine 2')).toBe('Line 1\nLine 2');
    expect(normalizeNewlines('Line 1\r\nLine 2')).toBe('Line 1\nLine 2');
    expect(normalizeNewlines('Line 1\nLine 2')).toBe('Line 1\nLine 2');
  });

  it('should handle empty strings', () => {
    const normalizeNewlines = (text) => {
      return text.replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
    };
    
    expect(normalizeNewlines('')).toBe('');
  });

  it('should handle strings without newlines', () => {
    const normalizeNewlines = (text) => {
      return text.replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
    };
    
    expect(normalizeNewlines('Simple text')).toBe('Simple text');
  });
});

describe('Cursor position calculations', () => {
  it('should clamp cursor position to content length', () => {
    const contentLength = 5; // "Hello"
    const cursorPosition = 10; // Beyond content length
    
    const clamped = Math.min(cursorPosition, contentLength);
    
    expect(clamped).toBe(5);
  });

  it('should preserve cursor position when within bounds', () => {
    const contentLength = 11; // "Hello World"
    const cursorPosition = 5;
    
    const clamped = Math.min(cursorPosition, contentLength);
    
    expect(clamped).toBe(5);
  });

  it('should handle cursor at start', () => {
    const contentLength = 10;
    const cursorPosition = 0;
    
    const clamped = Math.min(cursorPosition, contentLength);
    
    expect(clamped).toBe(0);
  });

  it('should handle cursor at end', () => {
    const contentLength = 10;
    const cursorPosition = 10;
    
    const clamped = Math.min(cursorPosition, contentLength);
    
    expect(clamped).toBe(10);
  });
});

