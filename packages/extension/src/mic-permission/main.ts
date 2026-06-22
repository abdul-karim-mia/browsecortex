/**
 * Side panels and popups can't show the getUserMedia permission prompt
 * (Chrome dismisses it automatically). This page runs in a full tab, where
 * the prompt works, then reports the result back and closes itself.
 */
const statusEl = document.getElementById('status')!;

(async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    statusEl.textContent = 'Microphone access granted. You can close this tab.';
    await chrome.runtime.sendMessage({ type: 'mic_permission_result', granted: true });
  } catch (err) {
    statusEl.textContent = `Microphone access denied: ${err instanceof Error ? err.message : String(err)}`;
    await chrome.runtime.sendMessage({ type: 'mic_permission_result', granted: false });
  } finally {
    setTimeout(() => window.close(), 600);
  }
})();
