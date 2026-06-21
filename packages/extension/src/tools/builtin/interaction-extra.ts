/**
 * Extended interaction tools (PLAN §11 + tool ideas): hover/focus/double/right
 * click, checkbox/dropdown, key/text input, form inspection.
 */
import type { ToolDefinition, ToolResult } from '../types';

async function tabId(args: Record<string, unknown>, getActive: () => Promise<number>) {
  return typeof args.tab_id === 'number' ? args.tab_id : getActive();
}

async function runInPage<A extends unknown[]>(
  id: number,
  func: (...a: A) => unknown,
  args: A,
): Promise<ToolResult> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: id }, func, args });
    return (res?.result as ToolResult) ?? { error: 'No result.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export const hoverElement: ToolDefinition = {
  name: 'hover_element',
  description: 'Dispatch hover (mouseenter/mouseover) on an element by CSS selector.',
  parameters: {
    type: 'object',
    properties: { selector: { type: 'string' }, tab_id: { type: 'number' } },
    required: ['selector'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return { error: 'Element not found.' };
        for (const type of ['mouseenter', 'mouseover', 'mousemove']) {
          el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
        }
        return { hovered: true };
      },
      [String(args.selector)],
    );
  },
};

export const focusElement: ToolDefinition = {
  name: 'focus_element',
  description: 'Focus an element (e.g. to open a dropdown) by CSS selector.',
  parameters: {
    type: 'object',
    properties: { selector: { type: 'string' }, tab_id: { type: 'number' } },
    required: ['selector'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      (selector: string) => {
        const el = document.querySelector<HTMLElement>(selector);
        if (!el) return { error: 'Element not found.' };
        el.focus();
        return { focused: true };
      },
      [String(args.selector)],
    );
  },
};

function clickVariant(name: string, event: string, description: string): ToolDefinition {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties: { selector: { type: 'string' }, tab_id: { type: 'number' } },
      required: ['selector'],
    },
    destructive: false,
    timeout: 'page_interact',
    async execute(args, ctx) {
      return runInPage(
        await tabId(args, ctx.getActiveTabId),
        (selector: string, ev: string) => {
          const el = document.querySelector(selector);
          if (!el) return { error: 'Element not found.' };
          el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }));
          return { ok: true };
        },
        [String(args.selector), event],
      );
    },
  };
}

export const doubleClickElement = clickVariant(
  'double_click_element',
  'dblclick',
  'Double-click an element by CSS selector.',
);
export const rightClickElement = clickVariant(
  'right_click_element',
  'contextmenu',
  'Right-click (context menu) an element by CSS selector.',
);

export const scrollToElement: ToolDefinition = {
  name: 'scroll_to_element',
  description: 'Scroll an element into view by CSS selector.',
  parameters: {
    type: 'object',
    properties: { selector: { type: 'string' }, tab_id: { type: 'number' } },
    required: ['selector'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return { error: 'Element not found.' };
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { scrolled: true };
      },
      [String(args.selector)],
    );
  },
};

export const setCheckbox: ToolDefinition = {
  name: 'set_checkbox',
  description: 'Check or uncheck a checkbox/radio input by CSS selector.',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string' },
      checked: { type: 'boolean' },
      tab_id: { type: 'number' },
    },
    required: ['selector', 'checked'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      (selector: string, checked: boolean) => {
        const el = document.querySelector<HTMLInputElement>(selector);
        if (!el) return { error: 'Element not found.' };
        if (el.checked !== checked) el.click();
        return { checked: el.checked };
      },
      [String(args.selector), args.checked === true],
    );
  },
};

export const selectDropdown: ToolDefinition = {
  name: 'select_dropdown',
  description: 'Select an option in a <select> by value or visible label.',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string' },
      value: { type: 'string' },
      tab_id: { type: 'number' },
    },
    required: ['selector', 'value'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      (selector: string, value: string) => {
        const el = document.querySelector<HTMLSelectElement>(selector);
        if (!el) return { error: 'Element not found.' };
        const opt = Array.from(el.options).find(
          (o) => o.value === value || o.text.trim() === value,
        );
        if (!opt) return { error: 'Option not found.' };
        el.value = opt.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { selected: opt.value };
      },
      [String(args.selector), String(args.value)],
    );
  },
};

export const getDropdownOptions: ToolDefinition = {
  name: 'get_dropdown_options',
  description: 'List all options (value + label) of a <select> element.',
  parameters: {
    type: 'object',
    properties: { selector: { type: 'string' }, tab_id: { type: 'number' } },
    required: ['selector'],
  },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      (selector: string) => {
        const el = document.querySelector<HTMLSelectElement>(selector);
        if (!el) return { error: 'Element not found.' };
        return { options: Array.from(el.options).map((o) => ({ value: o.value, label: o.text })) };
      },
      [String(args.selector)],
    );
  },
};

export const pressKey: ToolDefinition = {
  name: 'press_key',
  description: 'Dispatch a keyboard key (Enter, Tab, Escape, ArrowDown, etc.) to the focused element.',
  parameters: {
    type: 'object',
    properties: { key: { type: 'string' }, selector: { type: 'string' }, tab_id: { type: 'number' } },
    required: ['key'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      (key: string, selector: string | null) => {
        const el = selector ? document.querySelector<HTMLElement>(selector) : document.activeElement;
        if (!el) return { error: 'No target element.' };
        for (const type of ['keydown', 'keypress', 'keyup']) {
          el.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
        }
        return { pressed: key };
      },
      [String(args.key), (args.selector as string) ?? null],
    );
  },
};

export const clearInput: ToolDefinition = {
  name: 'clear_input',
  description: 'Clear the value of an input or textarea by CSS selector.',
  parameters: {
    type: 'object',
    properties: { selector: { type: 'string' }, tab_id: { type: 'number' } },
    required: ['selector'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      (selector: string) => {
        const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
        if (!el) return { error: 'Element not found.' };
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return { cleared: true };
      },
      [String(args.selector)],
    );
  },
};

export const getFormFields: ToolDefinition = {
  name: 'get_form_fields',
  description:
    'Detect form fields on the page: name, type, label, required flag, and current value.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      () => {
        const fields = Array.from(
          document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            'input,select,textarea',
          ),
        )
          .slice(0, 80)
          .map((el) => {
            const label =
              el.labels?.[0]?.innerText?.trim() ||
              el.getAttribute('aria-label') ||
              (el as HTMLInputElement).placeholder ||
              '';
            return {
              name: el.name || el.id,
              type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
              label: label.slice(0, 80),
              required: el.required,
              value: el.type === 'password' ? '***' : String(el.value).slice(0, 80),
            };
          });
        return { fields };
      },
      [],
    );
  },
};

export const interactionExtraTools = [
  hoverElement,
  focusElement,
  doubleClickElement,
  rightClickElement,
  scrollToElement,
  setCheckbox,
  selectDropdown,
  getDropdownOptions,
  pressKey,
  clearInput,
  getFormFields,
];
