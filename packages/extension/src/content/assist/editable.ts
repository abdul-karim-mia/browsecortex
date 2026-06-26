/**
 * Helpers for reading and writing the page's editable fields — `<textarea>`,
 * `<input>`, and `contenteditable` elements — used by the highlight toolbar
 * (Replace) and inline assist (Insert/Replace).
 */

export type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export function isTextInput(node: Element | null): node is HTMLInputElement | HTMLTextAreaElement {
  if (!node) return false;
  if (node instanceof HTMLTextAreaElement) return true;
  if (node instanceof HTMLInputElement) {
    const t = (node.type || 'text').toLowerCase();
    return ['text', 'search', 'url', 'email', 'tel', ''].includes(t);
  }
  return false;
}

export function isContentEditable(node: Element | null): node is HTMLElement {
  return node instanceof HTMLElement && node.isContentEditable;
}

/** The currently focused editable field, if any. */
export function focusedEditable(): Editable | null {
  const a = document.activeElement;
  if (isTextInput(a) || isContentEditable(a)) return a as Editable;
  return null;
}

/** Replace the active selection inside `field` with `text`. */
export function replaceSelection(field: Editable, text: string): void {
  if (isTextInput(field)) {
    const input = field as HTMLInputElement | HTMLTextAreaElement;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.setRangeText(text, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  // contenteditable
  field.focus();
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    sel.collapseToEnd();
  } else {
    field.textContent = (field.textContent ?? '') + text;
  }
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Insert `text` at the caret in `field` (no replacement of a range). */
export function insertAtCaret(field: Editable, text: string): void {
  replaceSelection(field, text);
}

/** Best-effort plain-text value of an editable field. */
export function fieldText(field: Editable): string {
  if (isTextInput(field)) return (field as HTMLInputElement | HTMLTextAreaElement).value;
  return field.textContent ?? '';
}
