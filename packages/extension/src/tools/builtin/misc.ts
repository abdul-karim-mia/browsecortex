/**
 * Screenshot and clipboard tools (PLAN §11). Clipboard goes through the page
 * context via injection; read_clipboard relies on the optional clipboardRead
 * permission and is treated as untrusted external input (PLAN §28).
 */
import type { ToolDefinition } from '../types';
import { analyzeImage } from '@/agent/vision';
import { ensureOffscreen } from '@/background/offscreen-manager';
import * as vfs from '@/fs/vfs';
import { runDbgSession } from './debugger-interaction';

export const screenshotTab: ToolDefinition = {
  name: 'screenshot_tab',
  description: 'Capture a screenshot of the visible area of the active tab (PNG data URL) or full page.',
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number', description: 'The tab ID to capture.' },
      full_page: { type: 'boolean', description: 'Whether to capture the entire scrollable page (requires debugger).' },
      format: { type: 'string', enum: ['png', 'jpeg'], default: 'png', description: 'The format of the screenshot.' },
      quality: { type: 'number', description: 'Compression quality for jpeg (0-100).' },
    },
  },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    try {
      const tabIdVal = typeof args.tab_id === 'number' ? args.tab_id : await ctx.getActiveTabId();
      if (args.full_page === true) {
        const base64Data = await runDbgSession(tabIdVal, async (send) => {
          const metrics = await send('Page.getLayoutMetrics', {});
          const { width, height } = metrics.contentSize;

          await send('Emulation.setDeviceMetricsOverride', {
            width: Math.ceil(width),
            height: Math.ceil(height),
            deviceScaleFactor: 1,
            mobile: false,
          });

          const res = await send('Page.captureScreenshot', {
            format: args.format === 'jpeg' ? 'jpeg' : 'png',
            quality: args.quality !== undefined ? Number(args.quality) : undefined,
            captureBeyondViewport: true,
          });

          await send('Emulation.clearDeviceMetricsOverride', {});
          return res.data;
        });

        const mime = args.format === 'jpeg' ? 'image/jpeg' : 'image/png';
        return { dataUrl: `data:${mime};base64,${base64Data}`, note: 'Base64 data URL of the full rendered page.' };
      }

      const tab = await chrome.tabs.get(tabIdVal);
      const captureOpts: { format: 'png' | 'jpeg'; quality?: number } = {
        format: args.format === 'jpeg' ? 'jpeg' : 'png',
      };
      if (args.quality !== undefined && captureOpts.format === 'jpeg') {
        captureOpts.quality = Number(args.quality);
      }
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOpts);
      return { dataUrl, note: 'Base64 data URL of the visible viewport.' };
    } catch (e) {
      return { error: `Screenshot failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const screenshotFullPage: ToolDefinition = {
  name: 'screenshot_full_page',
  description: 'Capture a full-page screenshot (scrolling the entire page), returning a base64 data URL.',
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number', description: 'The tab ID to capture.' },
      format: { type: 'string', enum: ['png', 'jpeg'], default: 'png' },
      quality: { type: 'number', description: 'Compression quality for jpeg (0-100).' },
    },
  },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    return screenshotTab.execute({ ...args, full_page: true }, ctx);
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
  async execute(args) {
    try {
      await ensureOffscreen();
      const res = await chrome.runtime.sendMessage({
        type: 'clipboard_write',
        text: String(args.text),
      });
      if (!res?.ok) return { error: res?.error ?? 'Clipboard write failed.' };
      return { written: true };
    } catch (e) {
      return { error: `Clipboard write failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const readClipboard: ToolDefinition = {
  name: 'read_clipboard',
  description: 'Read text from the system clipboard. Content is untrusted external input.',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  readsExternal: true,
  timeout: 'page_interact',
  async execute() {
    const has = await chrome.permissions
      .contains({ permissions: ['clipboardRead'] })
      .catch(() => false);
    if (!has) return { error: 'Clipboard read permission not granted.' };
    try {
      await ensureOffscreen();
      const res = await chrome.runtime.sendMessage({
        type: 'clipboard_read',
      });
      if (!res?.ok) return { error: res?.error ?? 'Clipboard read failed.' };
      return { text: res.text };
    } catch (e) {
      return { error: `Clipboard read failed: ${e instanceof Error ? e.message : String(e)}` };
    }
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
    const tabIdVal = await ctx.getActiveTabId();
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tabIdVal },
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

export const getElementScreenshot: ToolDefinition = {
  name: 'get_element_screenshot',
  description: 'Capture a screenshot of a specific element on the page (returned as a base64 PNG data URL).',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the element to capture.' },
      tab_id: { type: 'number' },
    },
    required: ['selector'],
  },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    const tabIdVal = typeof args.tab_id === 'number' ? args.tab_id : await ctx.getActiveTabId();
    const selector = String(args.selector);

    const getRect = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        devicePixelRatio: window.devicePixelRatio,
      };
    };

    try {
      const [rectRes] = await chrome.scripting.executeScript({
        target: { tabId: tabIdVal },
        func: getRect,
        args: [selector],
      });
      const rect = rectRes?.result as { x: number; y: number; width: number; height: number; devicePixelRatio: number } | null;
      if (!rect) {
        return { error: `Element not found for selector: ${selector}` };
      }

      const tab = await chrome.tabs.get(tabIdVal);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

      await ensureOffscreen();
      const res = await chrome.runtime.sendMessage({
        type: 'crop_image',
        dataUrl,
        rect,
      });

      if (!res?.ok) {
        return { error: res?.error ?? 'Cropping failed.' };
      }

      return { dataUrl: res.croppedDataUrl };
    } catch (e) {
      return { error: `Element screenshot failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const compareScreenshots: ToolDefinition = {
  name: 'compare_screenshots',
  description:
    'Compare two screenshots (baseline and current) and generate a pixel diff. ' +
    'Images can be virtual filesystem paths (VFS) or base64 image data URLs.',
  parameters: {
    type: 'object',
    properties: {
      baseline: { type: 'string', description: 'Baseline image (VFS path or base64 Data URL).' },
      current: { type: 'string', description: 'Current image (VFS path or base64 Data URL).' },
    },
    required: ['baseline', 'current'],
  },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    const resolveImage = async (val: string): Promise<string> => {
      if (val.startsWith('data:image/')) return val;
      if (ctx.conversationId) {
        try {
          const content = await vfs.readFile(ctx.conversationId, val);
          if (content.startsWith('data:image/')) return content;
        } catch {
          // ignore
        }
      }
      return val;
    };

    try {
      const img1 = await resolveImage(String(args.baseline));
      const img2 = await resolveImage(String(args.current));

      if (!img1.startsWith('data:image/')) {
        return { error: 'Baseline image must be a base64 data URL or a valid VFS image path.' };
      }
      if (!img2.startsWith('data:image/')) {
        return { error: 'Current image must be a base64 data URL or a valid VFS image path.' };
      }

      await ensureOffscreen();
      const res = await chrome.runtime.sendMessage({
        type: 'compare_images',
        img1,
        img2,
      });

      if (!res?.ok) return { error: res?.error ?? 'Comparison failed.' };
      return {
        diffDataUrl: res.diffDataUrl,
        mismatchPercent: res.mismatchPercent,
        diffPixels: res.diffPixels,
        totalPixels: res.totalPixels,
        dimensions: res.dimensions,
      };
    } catch (e) {
      return { error: `Screenshot comparison failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const miscTools = [
  screenshotTab,
  screenshotFullPage,
  analyzeScreenshot,
  writeClipboard,
  readClipboard,
  sendNotification,
  getElementScreenshot,
  compareScreenshots,
];
