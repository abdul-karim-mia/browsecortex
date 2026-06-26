import { injectGlowEffect, removeGlowEffect, updateGlowState } from './glow';
import { log } from '@/log';

export type AnimationState = 'idle' | 'thinking' | 'working' | 'error';

let isAgentActive = false;
let currentAnimationState: AnimationState = 'idle';
let currentTabId: number | null = null;

/**
 * Activate/deactivate agent and update glow state
 * @param active - Whether agent is active
 * @param state - Animation state (working, thinking, error)
 */
export function setAgentActive(active: boolean, state: AnimationState = 'working') {
  isAgentActive = active;
  currentAnimationState = active ? state : 'idle';

  if (!active) {
    clearGlow();
  } else {
    updateGlowForActiveTab();
  }
}

/**
 * Update animation state (thinking, working, error)
 * Called during agent execution to provide visual feedback
 */
export function setAnimationState(state: AnimationState) {
  if (!isAgentActive) return;

  currentAnimationState = state;

  // Send state update to all active tabs
  if (currentTabId !== null) {
    updateGlowState(currentTabId, state).catch(() => {
      // Ignore errors (tab may have been closed)
    });
  }
}

async function updateGlowForActiveTab() {
  if (!isAgentActive) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) {
      if (currentTabId !== null && currentTabId !== tab.id) {
        await removeGlowEffect(currentTabId).catch(() => {});
      }
      currentTabId = tab.id;
      await injectGlowEffect(tab.id);
    }
  } catch (e) {
    log.error('[glow-manager] failed to update glow for active tab', e);
  }
}

async function clearAnnotations(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.querySelectorAll('[data-bm-badge]').forEach((b) => b.remove()),
    });
  } catch {}
}

async function clearGlow() {
  if (currentTabId !== null) {
    await removeGlowEffect(currentTabId).catch(() => {});
    await clearAnnotations(currentTabId);
    currentTabId = null;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) {
      await removeGlowEffect(tab.id).catch(() => {});
      await clearAnnotations(tab.id);
    }
  } catch {}
}

chrome.tabs.onActivated?.addListener(async (activeInfo) => {
  if (!isAgentActive) return;
  if (currentTabId !== null && currentTabId !== activeInfo.tabId) {
    await removeGlowEffect(currentTabId).catch(() => {});
    await clearAnnotations(currentTabId);
  }
  currentTabId = activeInfo.tabId;
  await injectGlowEffect(activeInfo.tabId).catch(() => {});
});

chrome.tabs.onUpdated?.addListener(async (tabId, changeInfo, tab) => {
  if (!isAgentActive) return;
  if (tab.active && changeInfo.status === 'complete') {
    currentTabId = tabId;
    await injectGlowEffect(tabId).catch(() => {});
  }
});
