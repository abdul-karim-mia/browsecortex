/**
 * Offscreen document manager (PLAN §22, Layer 1).
 * Ensures a single offscreen document exists to drive the keep-alive ping.
 */
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
    .catch(() => {});
  await creating;
  creating = null;
}
