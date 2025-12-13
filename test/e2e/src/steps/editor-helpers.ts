/**
 * Shared helper functions for editor operations in test steps
 */

import { Page, Locator } from '@playwright/test';

/**
 * Get the editor locator (textarea)
 */
export function getEditorLocator(page: Page): Locator {
  return page.locator(
    'textarea[id*="description"], ' +
    'textarea#issue_notes, ' +
    'textarea[name="issue[notes]"], ' +
    'textarea[id*="notes"], ' +
    'textarea#content, ' +
    'textarea[name="content"], ' +
    'textarea[id*="content"]'
  ).first();
}

/**
 * Get editor content (works for textarea, ClassicEditor, and CKEditor)
 */
export async function getEditorContent(page: Page): Promise<string> {
  const textarea = getEditorLocator(page);
  const textareaId = await textarea.getAttribute('id').catch(() => null);
  
  if (!textareaId) {
    const value = await textarea.inputValue().catch(() => '');
    return value;
  }
  
  // Check if ClassicEditor or CKEditor is being used
  const editorInfo = await page.evaluate((id: string) => {
    // Check for ClassicEditor (CKEditor 5)
    const classicEditor = (window as any).ClassicEditor;
    if (typeof classicEditor !== 'undefined') {
      const element = document.querySelector(`#${id}`);
      if (element) {
        const editorRoot = element.closest('.ck-editor') || element.parentElement;
        if (editorRoot) {
          const editable = editorRoot.querySelector('.ck-editor__editable') as HTMLElement;
          if (editable) {
            return { type: 'classic', found: true, content: editable.textContent || editable.innerText || '' };
          }
        }
      }
    }
    
    // Check for CKEditor (CKEditor 3/4)
    const ckeditor = (window as any).CKEDITOR;
    if (typeof ckeditor !== 'undefined' && 
        ckeditor.instances && 
        ckeditor.instances[id] !== undefined) {
      const editor = ckeditor.instances[id];
      return { type: 'ckeditor', found: true, content: editor.getData() || '' };
    }
    
    return { type: null, found: false, content: '' };
  }, textareaId).catch(() => ({ type: null, found: false, content: '' }));
  
  if (editorInfo.found && editorInfo.content !== undefined) {
    return editorInfo.content;
  }
  
  // Fallback to textarea value
  const value = await textarea.inputValue().catch(() => '');
  return value;
}

/**
 * Type into the editor (textarea or CKEditor)
 */
export async function typeInEditor(page: Page, text: string, position: 'beginning' | 'end' | 'current' = 'current'): Promise<void> {
  const textarea = getEditorLocator(page);
  await textarea.waitFor({ state: 'attached', timeout: 30000 });
  
  const textareaId = await textarea.getAttribute('id').catch(() => null);
  const editorInfo = await page.evaluate((id: string | null) => {
    if (!id) return { type: null, found: false };
    
    const classicEditor = (window as any).ClassicEditor;
    if (typeof classicEditor !== 'undefined') {
      const element = document.querySelector(`#${id}`);
      if (element) {
        const editorRoot = element.closest('.ck-editor') || element.parentElement;
        if (editorRoot) {
          const editable = editorRoot.querySelector('.ck-editor__editable');
          if (editable) {
            return { type: 'classic', found: true };
          }
        }
      }
    }
    
    const ckeditor = (window as any).CKEDITOR;
    if (typeof ckeditor !== 'undefined' && 
        ckeditor.instances && 
        ckeditor.instances[id] !== undefined) {
      return { type: 'ckeditor', found: true };
    }
    
    return { type: null, found: false };
  }, textareaId).catch(() => ({ type: null, found: false }));
  
  if (editorInfo.found && textareaId) {
    // CKEditor handling (simplified - just focus and type)
    await textarea.focus();
    await page.waitForTimeout(200);
    
    if (position === 'beginning') {
      await page.keyboard.press('Control+Home');
    } else if (position === 'end') {
      await page.keyboard.press('Control+End');
    }
    
    // Handle newlines
    const parts = text.split(/\n/);
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        await page.keyboard.press('Enter');
      }
      if (parts[i]) {
        await page.keyboard.type(parts[i], { delay: 50 });
      }
    }
    return;
  }
  
  // Plain textarea handling
  await textarea.evaluate((el: HTMLTextAreaElement) => {
    el.style.display = 'block';
    el.style.visibility = 'visible';
    el.focus();
  });
  
  await page.waitForTimeout(200);
  
  if (position === 'beginning') {
    await page.keyboard.press('Control+Home');
  } else if (position === 'end') {
    await page.keyboard.press('Control+End');
  }
  
  // Handle newlines
  const parts = text.split(/\n/);
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      await page.keyboard.press('Enter');
    }
    if (parts[i]) {
      await page.keyboard.type(parts[i], { delay: 50 });
    }
  }
}

/**
 * Normalize newlines for comparison (handles both literal \n and actual newlines)
 */
function normalizeNewlines(text: string): string {
  // Replace literal \n with actual newlines, then normalize all newlines
  return text.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
}

/**
 * Wait for content to appear in editor (with polling)
 */
export async function waitForContent(page: Page, expectedText: string, maxWaitTime: number = 5000): Promise<void> {
  const pollInterval = 200;
  const startTime = Date.now();
  const normalizedExpected = normalizeNewlines(expectedText);
  
  while (Date.now() - startTime < maxWaitTime) {
    const content = await getEditorContent(page);
    const normalizedContent = normalizeNewlines(content);
    
    if (normalizedContent.includes(normalizedExpected)) {
      return;
    }
    await page.waitForTimeout(pollInterval);
  }
  
  const finalContent = await getEditorContent(page);
  const normalizedFinal = normalizeNewlines(finalContent);
  throw new Error(`Content "${normalizedExpected}" not found after ${maxWaitTime}ms. Got: "${normalizedFinal.substring(0, 100)}"`);
}

