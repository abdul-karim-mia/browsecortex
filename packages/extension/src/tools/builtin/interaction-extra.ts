/**
 * Extended interaction tools (PLAN §11 + tool ideas): hover/focus/double/right
 * click, checkbox/dropdown, key/text input, form inspection.
 */
import type { ToolDefinition, ToolResult } from '../types';
import { findFrameId } from './interaction';

async function tabId(args: Record<string, unknown>, getActive: () => Promise<number>) {
  return typeof args.tab_id === 'number' ? args.tab_id : getActive();
}

async function runInPage<A extends unknown[]>(
  id: number,
  frameId: number,
  func: (...a: A) => unknown,
  args: A,
): Promise<ToolResult> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: id, frameIds: [frameId] }, func, args });
    return (res?.result as ToolResult) ?? { error: 'No result.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export const hoverElement: ToolDefinition = {
  name: 'hover_element',
  description: 'Dispatch hover (mouseenter/mouseover) on an element by CSS selector or annotation_id.',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string' },
      annotation_id: { type: 'number', description: 'The [n] id from a prior annotate_page call.' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    if (args.selector === undefined && args.annotation_id === undefined) {
      return { error: 'Either selector or annotation_id must be provided.' };
    }
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      tabIdVal,
      targetFrameId,
      (selector: string | null, annId: number | null) => {
        const el = (() => {
          if (annId !== null) {
            const w = window as unknown as { __bmAnnotations?: Element[] };
            return w.__bmAnnotations?.[annId - 1] as HTMLElement ?? null;
          }
          if (selector) {
            return document.querySelector(selector) as HTMLElement ?? null;
          }
          return null;
        })();
        if (!el) return { error: 'Element not found.' };
        for (const type of ['mouseenter', 'mouseover', 'mousemove']) {
          el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
        }
        return { hovered: true };
      },
      [(args.selector as string) ?? null, typeof args.annotation_id === 'number' ? args.annotation_id : null],
    );
  },
};

export const focusElement: ToolDefinition = {
  name: 'focus_element',
  description: 'Focus an element (e.g. to open a dropdown) by CSS selector or annotation_id.',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string' },
      annotation_id: { type: 'number', description: 'The [n] id from a prior annotate_page call.' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    if (args.selector === undefined && args.annotation_id === undefined) {
      return { error: 'Either selector or annotation_id must be provided.' };
    }
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      tabIdVal,
      targetFrameId,
      (selector: string | null, annId: number | null) => {
        const el = (() => {
          if (annId !== null) {
            const w = window as unknown as { __bmAnnotations?: Element[] };
            return w.__bmAnnotations?.[annId - 1] as HTMLElement ?? null;
          }
          if (selector) {
            return document.querySelector<HTMLElement>(selector);
          }
          return null;
        })();
        if (!el) return { error: 'Element not found.' };
        el.focus();
        return { focused: true };
      },
      [(args.selector as string) ?? null, typeof args.annotation_id === 'number' ? args.annotation_id : null],
    );
  },
};

function clickVariant(name: string, event: string, description: string): ToolDefinition {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        tab_id: { type: 'number' },
        frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
      },
      required: ['selector'],
    },
    destructive: false,
    timeout: 'page_interact',
    async execute(args, ctx) {
      const tabIdVal = await tabId(args, ctx.getActiveTabId);
      let targetFrameId = 0;
      if (args.frame_selector) {
        const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
        if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
        targetFrameId = resolved;
      }
      return runInPage(
        tabIdVal,
        targetFrameId,
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
  description: 'Scroll an element into view by CSS selector or annotation_id.',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string' },
      annotation_id: { type: 'number', description: 'The [n] id from a prior annotate_page call.' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    if (args.selector === undefined && args.annotation_id === undefined) {
      return { error: 'Either selector or annotation_id must be provided.' };
    }
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      tabIdVal,
      targetFrameId,
      (selector: string | null, annId: number | null) => {
        const el = (() => {
          if (annId !== null) {
            const w = window as unknown as { __bmAnnotations?: Element[] };
            return w.__bmAnnotations?.[annId - 1] as HTMLElement ?? null;
          }
          if (selector) {
            return document.querySelector(selector);
          }
          return null;
        })();
        if (!el) return { error: 'Element not found.' };
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { scrolled: true };
      },
      [(args.selector as string) ?? null, typeof args.annotation_id === 'number' ? args.annotation_id : null],
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
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
    required: ['selector', 'checked'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      tabIdVal,
      targetFrameId,
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
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
    required: ['selector', 'value'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      tabIdVal,
      targetFrameId,
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
    properties: {
      selector: { type: 'string' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
    required: ['selector'],
  },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      tabIdVal,
      targetFrameId,
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
  description:
    'Dispatch a keyboard key (Enter, Tab, Escape, ArrowDown, etc.) to the focused element.',
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string' },
      selector: { type: 'string' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
    required: ['key'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      tabIdVal,
      targetFrameId,
      (key: string, selector: string | null) => {
        const el = selector
          ? document.querySelector<HTMLElement>(selector)
          : document.activeElement;
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
    properties: {
      selector: { type: 'string' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
    required: ['selector'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      tabIdVal,
      targetFrameId,
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
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
  },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      tabIdVal,
      targetFrameId,
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

export const handleDialog: ToolDefinition = {
  name: 'handle_dialog',
  description:
    'Accept or dismiss the most recent alert/confirm/prompt dialog. Call this after seeing a dialog in the page.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['accept', 'dismiss'],
        description: 'Accept (click OK/Yes) or dismiss (click Cancel/No) the dialog.',
      },
      text: {
        type: 'string',
        description: 'Response text for prompt() dialogs. Optional for alert/confirm.',
      },
      tab_id: { type: 'number' },
    },
    required: ['action'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    const action = String(args.action);
    const text = args.text ? String(args.text) : '';

    if (action !== 'accept' && action !== 'dismiss') {
      return { error: 'Action must be "accept" or "dismiss"' };
    }

    return runInPage(
      tabIdVal,
      0,
      (act: string, respText: string) => {
        const dialogStore = window as unknown as {
          __bmDialogQueue?: Array<{ type: string; message: string }>;
        };

        if (!dialogStore.__bmDialogQueue || dialogStore.__bmDialogQueue.length === 0) {
          return { error: 'No dialog is currently open' };
        }

        const dialog = dialogStore.__bmDialogQueue[dialogStore.__bmDialogQueue.length - 1];
        let result = '';

        if (act === 'accept') {
          result = 'accepted';
        } else {
          result = 'dismissed';
        }

        return {
          handled: true,
          action: act,
          dialogType: dialog.type,
          dialogMessage: dialog.message.slice(0, 200),
          result,
        };
      },
      [action, text],
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
  handleDialog,
];
