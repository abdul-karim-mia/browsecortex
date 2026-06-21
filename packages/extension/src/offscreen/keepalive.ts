/**
 * Keep-alive ping (PLAN §22, Layer 1).
 * Sends a runtime message every 25s so the service worker idle timer resets.
 */
const PING_INTERVAL_MS = 25_000;

setInterval(() => {
  chrome.runtime.sendMessage({ type: 'keepalive_ping' }).catch(() => {
    // Worker may be momentarily down; the next tick retries.
  });
}, PING_INTERVAL_MS);
