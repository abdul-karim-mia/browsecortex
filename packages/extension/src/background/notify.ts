/**
 * Notifications and toolbar badge (PLAN §39). Notifications are gated by the
 * per-event toggles in settings; clicking one opens the side panel.
 */
import { Storage } from '@/storage';
import type { Settings } from '@/types';

function iconUrl(): string {
  return chrome.runtime.getURL('src/assets/icons/icon-128.png');
}

export function setBadge(state: 'running' | 'done' | 'error' | 'clear'): void {
  const map = {
    running: { text: '●', color: '#3b82f6' },
    done: { text: '✓', color: '#22c55e' },
    error: { text: '!', color: '#ef4444' },
    clear: { text: '', color: '#000000' },
  } as const;
  const { text, color } = map[state];
  chrome.action.setBadgeText({ text }).catch(() => {});
  if (text) chrome.action.setBadgeBackgroundColor({ color }).catch(() => {});
}

export type NotifyEvent = keyof Settings['notifications'];

/** Show a notification if the matching event toggle is enabled (PLAN §39). */
export async function notify(event: NotifyEvent, title: string, message: string): Promise<void> {
  try {
    const settings = await Storage.settings.get();
    if (!settings.notifications[event]) return;
    chrome.notifications?.create({ type: 'basic', iconUrl: iconUrl(), title, message });
  } catch {
    // Notifications are best-effort.
  }
}

// Clicking a notification opens the side panel (PLAN §39).
chrome.notifications?.onClicked.addListener(async (id) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId !== undefined)
    await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  chrome.notifications.clear(id);
});
