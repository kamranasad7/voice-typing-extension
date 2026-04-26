type WritableInput = HTMLInputElement | HTMLTextAreaElement;

const WRITABLE_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
  '',
]);

export function isWritableTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) {
    if (el.disabled || el.readOnly) return false;
    return WRITABLE_INPUT_TYPES.has(el.type);
  }
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

export function writeToTarget(target: Element, text: string): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return writeToFormInput(target, text);
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    return writeToContentEditable(target, text);
  }
  return false;
}

function writeToFormInput(el: WritableInput, text: string): boolean {
  el.focus();

  // Selection APIs throw on some <input> types (number, email, etc.) — fall back to append.
  let start: number;
  let end: number;
  try {
    start = el.selectionStart ?? el.value.length;
    end = el.selectionEnd ?? el.value.length;
  } catch {
    start = el.value.length;
    end = el.value.length;
  }

  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const next = before + text + after;

  // Use the native setter so frameworks like React see the change.
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) {
    setter.call(el, next);
  } else {
    el.value = next;
  }

  try {
    const caret = start + text.length;
    el.setSelectionRange(caret, caret);
  } catch {
    /* selection not supported on this input type */
  }

  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function writeToContentEditable(el: HTMLElement, text: string): boolean {
  el.focus();

  // Prefer execCommand for compatibility with rich-text editors (Gmail, Slack, etc.).
  // It is deprecated in spec but still the most reliable cross-editor insertion path.
  const inserted =
    typeof document.execCommand === 'function' &&
    document.execCommand('insertText', false, text);

  if (inserted) return true;

  // Fallback: manipulate the selection directly.
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    el.appendChild(document.createTextNode(text));
  } else {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  el.dispatchEvent(
    new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })
  );
  return true;
}
