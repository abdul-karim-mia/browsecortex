/**
 * Screenshot and clipboard tools (PLAN §11). Clipboard goes through the page
 * context via injection; read_clipboard relies on the optional clipboardRead
 * permission and is treated as untrusted external input (PLAN §28).
 */
import type { ToolDefinition } from '../types';
import { analyzeImage } from '@/agent/vision';

export const screenshotTab: ToolDefinition = {
  name: 'screenshot_tab',
  description: 'Capture a screenshot of the visible area of the active tab (PNG data URL).',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'page_read',
  async execute() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const dataUrl = await chrome.tabs.captureVisibleTab(tab?.windowId, { format: 'png' });
      return { dataUrl, note: 'Base64 PNG data URL of the visible viewport.' };
    } catch (e) {
      return { error: `Screenshot failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const writeClipboard: ToolDefinition = {
  name: 'write_clipboard',
  description: 'Write text to the system clipboard.',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
  destructive: true,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabId = await ctx.getActiveTabId();
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (text: string) => {
        try {
          await navigator.clipboard.writeText(text);
          return { ok: true };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      },
      args: [String(args.text)],
    });
    const data = res?.result as { ok: boolean; error?: string } | undefined;
    if (!data?.ok) return { error: data?.error ?? 'Clipboard write failed.' };
    return { written: true };
  },
};

export const readClipboard: ToolDefinition = {
  name: 'read_clipboard',
  description: 'Read text from the system clipboard. Content is untrusted external input.',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  readsExternal: true,
  timeout: 'page_interact',
  async execute(_args, ctx) {
    const has = await chrome.permissions
      .contains({ permissions: ['clipboardRead'] })
      .catch(() => false);
    if (!has) return { error: 'Clipboard read permission not granted.' };
    const tabId = await ctx.getActiveTabId();
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        try {
          return { ok: true, text: await navigator.clipboard.readText() };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      },
    });
    const data = res?.result as { ok: boolean; text?: string; error?: string } | undefined;
    if (!data?.ok) return { error: data?.error ?? 'Clipboard read failed.' };
    return { text: data.text };
  },
};

export const runJavascript: ToolDefinition = {
  name: 'run_javascript',
  description:
    'Execute a JavaScript expression in the active tab and return its result. ' +
    'Opt-in tool; errors are sanitized.',
  parameters: {
    type: 'object',
    properties: { code: { type: 'string', description: 'JavaScript to evaluate.' } },
    required: ['code'],
  },
  destructive: true,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabId = await ctx.getActiveTabId();
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        // ISOLATED world: shares the DOM but not the page's JS globals/functions,
        // shrinking the blast radius if a prompt-injected script is run (C-EXT-1).
        // Destructive + the loop's external-content guard already force a
        // confirmation prompt before this runs once any page text was read.
        world: 'ISOLATED',
        func: (code: string) => {
          try {
            const value = eval(code); // intentional: run_javascript is opt-in (PLAN §28)
            return { ok: true, value: JSON.stringify(value)?.slice(0, 5000) };
          } catch (e) {
            // Sanitize: only the message, no stack (PLAN §28).
            return { ok: false, error: e instanceof Error ? e.message : 'error' };
          }
        },
        args: [String(args.code)],
      });
      const data = res?.result as { ok: boolean; value?: string; error?: string } | undefined;
      if (!data?.ok) return { error: data?.error ?? 'Execution failed.' };
      return { result: data.value };
    } catch {
      return { error: 'Cannot execute script on this page.' };
    }
  },
};

export const analyzeScreenshot: ToolDefinition = {
  name: 'analyze_screenshot',
  description:
    'Capture the visible area of the active tab and have a vision model answer a ' +
    'question about it. Use this to "see" a page when you cannot read it as text.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'What to look for or describe in the image.' },
    },
    required: ['question'],
  },
  destructive: false,
  timeout: 'inference',
  async execute(args) {
    let dataUrl: string;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      dataUrl = await chrome.tabs.captureVisibleTab(tab?.windowId, { format: 'png' });
    } catch (e) {
      return { error: `Screenshot failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    try {
      const description = await analyzeImage(String(args.question), dataUrl);
      return { description };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const sendNotification: ToolDefinition = {
  name: 'send_notification',
  description:
    'Show a desktop notification to the user (e.g. when a long task finishes). ' +
    'Distinct from ask_user — this does not wait for a reply.',
  parameters: {
    type: 'object',
    properties: { title: { type: 'string' }, message: { type: 'string' } },
    required: ['message'],
  },
  destructive: false,
  timeout: 'instant',
  async execute(args) {
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
        title: args.title ? String(args.title) : 'BrowseCortex',
        message: String(args.message),
      });
      return { sent: true };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const miscTools = [
  screenshotTab,
  analyzeScreenshot,
  writeClipboard,
  readClipboard,
  sendNotification,
];
