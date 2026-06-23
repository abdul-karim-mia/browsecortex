/**
 * OCR tools (Tesseract.js and Native TextDetector).
 */
import type { ToolDefinition } from '../types';
import { ensureOffscreen } from '@/background/offscreen-manager';
import { screenshotTab, getElementScreenshot } from './misc';
import * as vfs from '@/fs/vfs';

export const ocrTesseract: ToolDefinition = {
  name: 'ocr_tesseract',
  description: 'Perform OCR (optical character recognition) on the active tab, a specific element, or a given image using Tesseract.js (runs locally, offline-friendly).',
  parameters: {
    type: 'object',
    properties: {
      image: { type: 'string', description: 'Base64 image data URL, URL, or local VFS path. If omitted, captures the active viewport.' },
      selector: { type: 'string', description: 'CSS selector of the element to capture and OCR.' },
      tab_id: { type: 'number' },
    },
  },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    const id = typeof args.tab_id === 'number' ? args.tab_id : await ctx.getActiveTabId();
    let dataUrl = '';
    
    if (args.image) {
      const imgStr = String(args.image);
      if (imgStr.startsWith('data:image/')) {
        dataUrl = imgStr;
      } else if (ctx.conversationId) {
        try {
          const content = await vfs.readFile(ctx.conversationId, imgStr);
          if (content.startsWith('data:image/')) dataUrl = content;
        } catch {
          // ignore
        }
      }
      if (!dataUrl) {
        return { error: 'Invalid image format or image not found.' };
      }
    } else if (args.selector) {
      const res = await getElementScreenshot.execute({ selector: String(args.selector), tab_id: id }, ctx);
      if ('error' in res) return res;
      dataUrl = (res as { dataUrl: string }).dataUrl;
    } else {
      const res = await screenshotTab.execute({ tab_id: id }, ctx);
      if ('error' in res) return res;
      dataUrl = (res as { dataUrl: string }).dataUrl;
    }

    try {
      await ensureOffscreen();
      const res = await chrome.runtime.sendMessage({
        type: 'ocr_tesseract',
        dataUrl,
      });
      if (!res?.ok) return { error: res?.error ?? 'Tesseract OCR failed.' };
      return { text: res.text };
    } catch (e) {
      return { error: `Tesseract OCR failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const ocrNative: ToolDefinition = {
  name: 'ocr_native',
  description: 'Perform fast, native OCR on the active tab, a specific element, or a given image using Chrome\'s hardware-accelerated TextDetector API.',
  parameters: {
    type: 'object',
    properties: {
      image: { type: 'string', description: 'Base64 image data URL, URL, or local VFS path. If omitted, captures the active viewport.' },
      selector: { type: 'string', description: 'CSS selector of the element to capture and OCR.' },
      tab_id: { type: 'number' },
    },
  },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    const id = typeof args.tab_id === 'number' ? args.tab_id : await ctx.getActiveTabId();
    let dataUrl = '';
    
    if (args.image) {
      const imgStr = String(args.image);
      if (imgStr.startsWith('data:image/')) {
        dataUrl = imgStr;
      } else if (ctx.conversationId) {
        try {
          const content = await vfs.readFile(ctx.conversationId, imgStr);
          if (content.startsWith('data:image/')) dataUrl = content;
        } catch {
          // ignore
        }
      }
      if (!dataUrl) {
        return { error: 'Invalid image format or image not found.' };
      }
    } else if (args.selector) {
      const res = await getElementScreenshot.execute({ selector: String(args.selector), tab_id: id }, ctx);
      if ('error' in res) return res;
      dataUrl = (res as { dataUrl: string }).dataUrl;
    } else {
      const res = await screenshotTab.execute({ tab_id: id }, ctx);
      if ('error' in res) return res;
      dataUrl = (res as { dataUrl: string }).dataUrl;
    }

    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: id },
        func: async (url: string) => {
          if (typeof (window as any).TextDetector === 'undefined') {
            return { error: 'Native TextDetector is not supported or enabled in this browser (enable "Experimental Web Platform features" in chrome://flags).' };
          }
          try {
            const img = new Image();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = url;
            });
            const detector = new (window as any).TextDetector();
            const results = await detector.detect(img);
            const text = results.map((r: any) => r.rawValue).join('\n');
            return { text };
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
        args: [dataUrl],
      });
      const data = res?.result as { text?: string; error?: string } | undefined;
      if (data?.error) return { error: data.error };
      return { text: data?.text ?? '' };
    } catch (e) {
      return { error: `Native OCR failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const ocrTools = [ocrTesseract, ocrNative];
