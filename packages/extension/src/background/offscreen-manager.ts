/**
 * Offscreen document manager (PLAN §22, Layer 1).
 * Ensures a single offscreen document exists to drive the keep-alive ping.
 */
import { log } from '@/log';

let creating: Promise<void> | null = null;

export async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL('src/offscreen/index.html');

  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (existing.length > 0) return;

  if (creating) {
    await creating;
    return;
  }

  creating = chrome.offscreen
    .createDocument({
      url,
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'Keep the service worker alive during long agent tasks.',
    })
    // Surface failures (quota/permissions) instead of silently degrading the
    // keep-alive — otherwise long tasks get killed with no diagnostic (H-EXT-6).
    .catch((e) => log.warn('[offscreen] creation failed', e));
  await creating;
  creating = null;
}
