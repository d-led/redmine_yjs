/**
 * Bringing content saved by another request into a live collaborative document.
 *
 * Redmine stores plain text, so a conflicting save only gives us a snapshot of
 * what the other user had. Inserting that snapshot as a fresh Yjs state would
 * duplicate every character both sides already share; reconciling with a
 * minimal edit keeps the document free of duplicates and leaves the Yjs history
 * (and therefore everyone else's cursors) intact.
 *
 * Yjs is passed in explicitly so this module can be tested on its own and
 * bundled without depending on a global.
 */

/**
 * The single edit that turns `oldValue` into `newValue`.
 *
 * @returns {{start: number, removeCount: number, insertText: string, isNoop: boolean}}
 */
export function minimalEdit(oldValue, newValue) {
  let start = 0;
  const shortest = Math.min(oldValue.length, newValue.length);

  while (start < shortest && oldValue[start] === newValue[start]) start++;

  let commonSuffix = 0;
  while (
    commonSuffix < shortest - start &&
    oldValue[oldValue.length - 1 - commonSuffix] === newValue[newValue.length - 1 - commonSuffix]
  ) {
    commonSuffix++;
  }

  const removeCount = oldValue.length - start - commonSuffix;
  const insertText = newValue.slice(start, newValue.length - commonSuffix);

  return { start, removeCount, insertText, isNoop: removeCount === 0 && insertText === '' };
}

/**
 * Make the collaborative document hold the content another request saved.
 *
 * @param {object} Y      the Yjs namespace
 * @param {object} doc    the live Y.Doc
 * @param {object} text   the Y.Text inside `doc` holding the content
 * @param {string} saved  content stored by another request
 * @returns {boolean} whether the document changed
 */
export function reconcileWithSavedContent(Y, doc, text, saved) {
  if (typeof saved !== 'string' || saved === '') return false;

  const edit = minimalEdit(text.toString(), saved);

  if (edit.isNoop) return false;

  doc.transact(() => {
    if (edit.removeCount > 0) text.delete(edit.start, edit.removeCount);
    if (edit.insertText !== '') text.insert(edit.start, edit.insertText);
  });

  return true;
}
