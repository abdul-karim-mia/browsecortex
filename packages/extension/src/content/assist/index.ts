/**
 * Content-script entry for the in-page assist features (isolated world):
 *  - Highlight Toolbar  (text selection → rewrite/translate/tone/expand/TTS)
 *  - Inline Assist      (Ctrl/Cmd+Shift+K inside any text field)
 *  - Floating Bubble    (summarize the current page)
 *  - Quick AI Email Reply (Gmail thread → drafted reply)
 *
 * Each feature can be toggled in Settings → Features; the flags are read once
 * when a page loads, so a tab reload picks up a change. All UI lives in a single
 * Shadow DOM root (see ./ui) and talks to the worker over the 'bc-assist' port.
 */
import { initToolbar } from './toolbar';
import { initInline } from './inline';
import { initBubble } from './bubble';
import { initEmail } from './email';
import { DEFAULT_SETTINGS, type Settings } from '@/types';

async function featureFlags(): Promise<Settings['assistFeatures']> {
  try {
    const { settings } = await chrome.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS.assistFeatures, ...(settings?.assistFeatures ?? {}) };
  } catch {
    return DEFAULT_SETTINGS.assistFeatures;
  }
}

// Guard against double injection (SPA reinjection, multiple matches).
if (!(window as Window & { __bcAssist?: boolean }).__bcAssist) {
  (window as Window & { __bcAssist?: boolean }).__bcAssist = true;

  const start = async () => {
    const flags = await featureFlags();
    // Each feature is independent — one failing must not take down the others.
    const safely = (fn: () => void) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    };
    if (flags.highlightToolbar) safely(initToolbar);
    if (flags.inlineAssist) safely(initInline);
    if (flags.floatingBubble) safely(initBubble);
    if (flags.emailReply) safely(initEmail);
  };

  if (document.body) void start();
  else document.addEventListener('DOMContentLoaded', () => void start(), { once: true });
}
