/**
 * Service worker entry (PLAN §2, §9, §22, §23).
 *
 * Responsibilities (built out incrementally):
 *  - Open the side panel on action click
 *  - Hold the long-lived 'chat' port and run the agent loop
 *  - Keep-alive via offscreen ping + in-task interval (PLAN §22)
 *  - Handle keyboard commands (PLAN §43)
 *
 * This is the skeleton: wiring + lifecycle. The agent loop and tool executor
 * land in Phase 4.
 */
import { PORT_NAME, type ClientMessage, type ServerMessage } from './protocol';
import { ensureOffscreen } from './offscreen-manager';
import { runAgentLoop } from '@/agent/loop';
import { resolveActive } from '@/agent/resolve';
import { Storage } from '@/storage';
import {
  ensureConversation,
  getApiHistory,
  getMessages,
  persistNewTurns,
} from '@/conversations/manager';
import { autoName } from '@/conversations/naming';
import { notify, setBadge } from './notify';
import { clearCheckpoint, getCheckpoint, saveCheckpoint } from './checkpoint';
import { connect as connectRelay } from '@/mcp-server/relay-client';
import { writeRecoverySnapshot } from '@/backup/backup';
import { runMigrationSafety } from '@/db/migration';
import { executeTool } from '@/tools/registry';
import { registerLocalOriginFix } from '@/providers/local-origin-fix';
import { log } from '@/log';

// Snapshot data on version change before further use (PLAN §42).
runMigrationSafety();

// Local providers (Ollama, LM Studio, etc.) 403 on the extension's Origin
// header — strip it so they treat us like any other local client.
registerLocalOriginFix();

// Auto-backup recovery snapshot on a daily alarm (PLAN §32).
chrome.alarms?.create('auto-backup', { periodInMinutes: 60 * 24 });
chrome.alarms?.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'auto-backup') return;
  const settings = await Storage.settings.get();
  if (settings.autoBackupDays > 0) await writeRecoverySnapshot().catch(() => {});
});

// Connect to the BrowseCortex relay if the MCP server is enabled (PLAN §21).
connectRelay();
// Reconnect when the MCP server config changes.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.mcp_server_config) connectRelay();
});

// Recover an interrupted task on startup (PLAN §22 L3). If the worker was
// killed mid-task, flush the checkpoint's partial turns to IndexedDB so the
// work isn't lost, then clear it.
async function recoverCheckpoint(): Promise<void> {
  const cp = await getCheckpoint();
  if (!cp) return;
  try {
    await persistNewTurns(cp.conversationId, cp.messages, cp.priorTurnCount);
  } finally {
    await clearCheckpoint();
  }
}
recoverCheckpoint();

// Tool Playground bridge (PLAN §38, dev only): run a single tool on request.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'playground_run') return;
  (async () => {
    const ctx = {
      conversationId: 'playground',
      async getActiveTabId() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id === undefined) throw new Error('No active tab.');
        return tab.id;
      },
    };
    const start = performance.now();
    const result = await executeTool(msg.name, msg.args ?? {}, ctx);
    sendResponse({ result, ms: Math.round(performance.now() - start) });
  })();
  return true; // async response
});

// Open the side panel when the toolbar icon is clicked.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId !== undefined) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Allow the side panel to open from the action icon by default.
chrome.runtime.onInstalled.addListener(async (details) => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  if (details.reason === 'install') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') });
  }
});

// Keyboard commands (PLAN §43).
chrome.commands?.onCommand.addListener(async (command) => {
  if (command === 'toggle-panel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId !== undefined) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  } else if (command === 'new-conversation') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId !== undefined) await chrome.sidePanel.open({ windowId: tab.windowId });
    // Tell the (now open) side panel to start a fresh conversation.
    chrome.runtime.sendMessage({ type: 'command_new_conversation' }).catch(() => {});
  }
});

/** In-task keep-alive: ping a trivial API every 25s (PLAN §22, Layer 2). */
function startKeepAlive(): () => void {
  const interval = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 25_000);
  return () => clearInterval(interval);
}

async function getActiveTabUrl(): Promise<string | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url;
}

// Long-lived chat port (PLAN §23). One agent runs at a time per port (PLAN §48).
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  const send = (msg: ServerMessage) => {
    try {
      port.postMessage(msg);
    } catch (e) {
      log.error('[chat:bg] postMessage threw (port likely disconnected)', e, msg);
    }
  };
  setBadge('clear'); // panel is open — clear any pending indicator (PLAN §39)
  let abortController: AbortController | null = null;
  // Pending ask_user resolver — set while the loop waits for an answer (PLAN §18).
  let pendingAsk: ((answers: Record<string, unknown>) => void) | null = null;

  const askUser = (questions: unknown): Promise<Record<string, unknown>> => {
    send({ type: 'ask_user', questions });
    setBadge('error'); // '!' badge signals input needed (PLAN §39)
    notify('needsInput', 'BrowseCortex', 'The agent needs your input to continue.');
    return new Promise((resolve) => {
      pendingAsk = resolve;
    });
  };

  port.onMessage.addListener(async (msg: ClientMessage) => {
    try {
      if (msg.type === 'abort') {
        abortController?.abort();
        pendingAsk?.({}); // unblock a waiting ask_user so the loop can wind down
        pendingAsk = null;
        return;
      }
      if (msg.type === 'ask_user_response') {
        pendingAsk?.(msg.answers);
        pendingAsk = null;
        return;
      }
      if (msg.type !== 'send') return;

      if (abortController) {
        log.warn('[chat:bg] rejected send — agent already running');
        send({ type: 'error', message: 'An agent is already running. Stop it first.' });
        return;
      }

      // Set before any await to prevent concurrent runs from double-submit.
      abortController = new AbortController();
      setBadge('running');

      const resolved = await resolveActive();
      if ('error' in resolved) {
        log.error('[chat:bg] resolveActive failed', resolved.error);
        send({ type: 'error', message: resolved.error });
        send({ type: 'done' });
        abortController = null;
        return;
      }
      // Surface fallback routing to the user (PLAN §40).
      if (resolved.note) send({ type: 'token', content: `_${resolved.note}_\n\n` });

      await ensureOffscreen();
      const stopKeepAlive = startKeepAlive();
      const settings = await Storage.settings.get();

      try {
        await ensureConversation(msg.conversationId, resolved.provider, resolved.model.id);
        const existing = await getMessages(msg.conversationId);
        const isFirstExchange = existing.length === 0;
        const pinnedContents = existing.filter((m) => m.pinned).map((m) => m.content);
        // Rebuild history from IndexedDB so chats survive panel reloads (PLAN §8).
        const history = await getApiHistory(msg.conversationId);

        const {
          messages: updated,
          outcome,
          toolRounds,
        } = await runAgentLoop({
          provider: resolved.provider,
          model: resolved.model,
          settings,
          history,
          userContent: msg.content,
          attachments: msg.attachments,
          pinnedContents,
          conversationId: msg.conversationId,
          activeTabUrl: await getActiveTabUrl(),
          signal: abortController.signal,
          emit: send,
          askUser,
          onCheckpoint: (messages) =>
            saveCheckpoint({
              conversationId: msg.conversationId,
              priorTurnCount: history.length,
              messages,
              updatedAt: Date.now(),
            }),
        });
        log.debug('[chat:bg] agent loop finished — outcome:', outcome, 'toolRounds:', toolRounds);

        // Persist the user message + every new assistant/tool turn this run added,
        // THEN signal done — so the panel's reload-from-storage sees a complete
        // history (avoids a race that dropped the latest turn).
        await persistNewTurns(msg.conversationId, updated, history.length);
        console.log('[chat:bg] persisted new turns');
        await clearCheckpoint();
        send({ type: 'done' });

        // Auto-name after the first exchange (PLAN §8). Fire-and-forget: naming
        // is best-effort housekeeping that happens after the visible reply is
        // already done, so it must not hold the "agent running" state (and
        // thus block every subsequent send) if the title-generation call
        // stalls or the provider is slow.
        if (isFirstExchange) {
          const lastAssistant = [...updated].reverse().find((m) => m.role === 'assistant');
          const assistantText =
            lastAssistant && typeof lastAssistant.content === 'string' ? lastAssistant.content : '';
          autoName(
            msg.conversationId,
            resolved.provider,
            resolved.model,
            msg.content,
            assistantText,
          ).catch((e) => console.error('[chat:bg] autoName failed', e));
        }

        // Report status accurately (PLAN §39). Don't notify on abort, and only
        // notify on completion when the run actually did tool work (avoid spam).
        if (outcome === 'error') {
          setBadge('error');
          notify('taskFailed', 'BrowseCortex', 'Task failed.');
        } else if (outcome === 'aborted') {
          setBadge('clear');
        } else {
          setBadge('done');
          if (toolRounds > 0) notify('taskCompleted', 'BrowseCortex', 'Task completed.');
        }
      } catch (e) {
        console.error('[chat:bg] agent loop threw', e);
        setBadge('error');
        notify('taskFailed', 'BrowseCortex', 'Task failed.');
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
        send({ type: 'done' });
      } finally {
        stopKeepAlive();
        abortController = null;
      }
    } catch (e) {
      // Catches anything thrown before/outside the inner try (e.g. resolveActive,
      // ensureOffscreen, Storage.settings.get) so a failure here is never silent.
      console.error('[chat:bg] onMessage handler threw outside inner try', e);
      try {
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
        send({ type: 'done' });
      } catch (sendErr) {
        console.error('[chat:bg] failed to report outer error to panel', sendErr);
      }
      abortController = null;
    }
  });

  port.onDisconnect.addListener(() => {
    console.warn('[chat:bg] port disconnected', chrome.runtime.lastError);
    abortController?.abort();
    abortController = null;
  });
});
