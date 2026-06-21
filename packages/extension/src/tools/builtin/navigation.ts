/**
 * Navigation tools (PLAN §11). Acts on the active tab unless a tab_id is given.
 */
import type { ToolDefinition } from '../types';

async function resolveTabId(args: Record<string, unknown>, getActive: () => Promise<number>) {
  const id = args.tab_id;
  if (typeof id === 'number' && Number.isInteger(id)) return id;
  return getActive();
}

export const navigateTo: ToolDefinition = {
  name: 'navigate_to',
  description: 'Navigate the active tab (or a given tab) to a URL.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      tab_id: { type: 'number', description: 'Optional tab to navigate; defaults to active.' },
    },
    required: ['url'],
  },
  destructive: false,
  timeout: 'navigation',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    await chrome.tabs.update(tabId, { url: String(args.url) });
    return { navigated: String(args.url), tab_id: tabId };
  },
};

export const goBack: ToolDefinition = {
  name: 'go_back',
  description: 'Navigate back in the active tab history.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  timeout: 'navigation',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    await chrome.tabs.goBack(tabId);
    return { ok: true };
  },
};

export const goForward: ToolDefinition = {
  name: 'go_forward',
  description: 'Navigate forward in the active tab history.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  timeout: 'navigation',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    await chrome.tabs.goForward(tabId);
    return { ok: true };
  },
};

export const navigationTools = [navigateTo, goBack, goForward];
