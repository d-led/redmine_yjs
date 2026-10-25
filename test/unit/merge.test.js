/**
 * Reconciling content saved by another request into a live collaborative
 * document (src/merge.js). Real Yjs, no stubs.
 */

import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { minimalEdit, reconcileWithSavedContent } from '../../src/merge.js';

function collaborativeDocument(initialText = '') {
  const doc = new Y.Doc();
  const text = doc.getText('content');

  if (initialText) text.insert(0, initialText);

  return { doc, text };
}

describe('minimalEdit', () => {
  it('changes nothing when both texts match', () => {
    expect(minimalEdit('same', 'same')).toMatchObject({
      removeCount: 0,
      insertText: '',
      isNoop: true
    });
  });

  it('appends only the new tail', () => {
    expect(minimalEdit('Hello', 'Hello World')).toEqual({
      start: 5,
      removeCount: 0,
      insertText: ' World',
      isNoop: false
    });
  });

  it('removes only the deleted middle', () => {
    expect(minimalEdit('Hello World', 'Hello')).toEqual({
      start: 5,
      removeCount: 6,
      insertText: '',
      isNoop: false
    });
  });

  it('replaces a word in place', () => {
    expect(minimalEdit('Hello world', 'Hello there')).toEqual({
      start: 6,
      removeCount: 5,
      insertText: 'there',
      isNoop: false
    });
  });

  it('keeps a shared suffix out of the edit', () => {
    expect(minimalEdit('aaa bbb', 'ccc bbb')).toEqual({
      start: 0,
      removeCount: 3,
      insertText: 'ccc',
      isNoop: false
    });
  });
});

describe('reconcileWithSavedContent', () => {
  it('adopts saved content into a document nobody typed in yet', () => {
    const { doc, text } = collaborativeDocument();

    const changed = reconcileWithSavedContent(Y, doc, text, 'saved while you were away');

    expect(changed).toBe(true);
    expect(text.toString()).toBe('saved while you were away');
  });

  it('takes a longer saved version without duplicating the shared part', () => {
    const { doc, text } = collaborativeDocument('local draft');

    reconcileWithSavedContent(Y, doc, text, 'local draft and more');

    expect(text.toString()).toBe('local draft and more');
  });

  it('drops local wording that the saved version replaced', () => {
    const { doc, text } = collaborativeDocument('local draft');

    reconcileWithSavedContent(Y, doc, text, 'database version');

    expect(text.toString()).toBe('database version');
  });

  it('reports no change when both sides already hold the same text', () => {
    const { doc, text } = collaborativeDocument('same text');

    expect(reconcileWithSavedContent(Y, doc, text, 'same text')).toBe(false);
    expect(text.toString()).toBe('same text');
  });

  it('reports no change when there is nothing saved', () => {
    const { doc, text } = collaborativeDocument('local only');

    expect(reconcileWithSavedContent(Y, doc, text, '')).toBe(false);
    expect(text.toString()).toBe('local only');
  });

  it('shows the saved text in the editor that was open when it happened', () => {
    const bob = collaborativeDocument('shared start');
    const savedElsewhere = 'shared start + alice typed + bob typed';

    reconcileWithSavedContent(Y, bob.doc, bob.text, savedElsewhere);

    // A snapshot carries no Yjs history, so it cannot also replay the other
    // editor's operations; what it *must* do is leave a document without
    // duplicated text.
    expect(bob.text.toString()).toBe(savedElsewhere);
  });
});
