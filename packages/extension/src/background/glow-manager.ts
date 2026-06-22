import { injectGlowEffect, removeGlowEffect } from './glow';
import { log } from '@/log';

let isAgentActive = false;
let currentTabId: number | null = null;

export function setAgentActive(active: boolean) {
  isAgentActive = active;
  if (!active) {
    clearGlow();
  } else {
    updateGlowForActiveTab();
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
