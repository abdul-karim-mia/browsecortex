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
import { setAgentActive } from './glow-manager';
import { writeRecoverySnapshot } from '@/backup/backup';
import { runMigrationSafety } from '@/db/migration';
import { executeTool } from '@/tools/registry';
import { registerLocalOriginFix } from '@/providers/local-origin-fix';
import { estimateTokens } from '@/agent/compaction';
import { log } from '@/log';

// Snapshot data on version change before further use (PLAN §42).
runMigrationSafety();

// Which conversation currently has a live agent run — one at a time (PLAN §48).
// Broadcast on change so the side panel can show a pulsing indicator.
let runningConversationId: string | null = null;
function setRunningConversation(id: string | null): void {
  runningConversationId = id;
  chrome.runtime.sendMessage({ type: 'running_conversation', id }).catch(() => {});
}

// Answer the panel's "what's running?" query on (re)connect.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'get_running_conversation') return;
  sendResponse({ id: runningConversationId });
  return true;
});

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

// Context-menu selection → prefill the side panel input (B4).
const CONTEXT_MENU_ID = 'send-to-browsecortex';
const PENDING_SELECTION_KEY = 'pending_context_selection';

// Allow the side panel to open from the action icon by default.
chrome.runtime.onInstalled.addListener(async (details) => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  // Right-click selected text → send to chat (B4).
  chrome.contextMenus?.create(
    {
      id: CONTEXT_MENU_ID,
      title: 'Send to BrowseCortex',
      contexts: ['selection'],
    },
    () => void chrome.runtime.lastError, // ignore "duplicate id" on reload
  );
  if (details.reason === 'install') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') });
  }
});

// The panel may not be open yet, so stash the text in session storage and also
// broadcast it; the panel consumes the stash on load and the broadcast while
// already open.
chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) return;
  // Open the panel FIRST, synchronously within the click gesture — any `await`
  // before this drops the user-gesture context and sidePanel.open() throws.
  if (tab?.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
  // Then stash (for a freshly-opening panel to read on mount) + broadcast (for
  // an already-open panel). The stash resolves well before the panel mounts.
  chrome.storage.session.set({ [PENDING_SELECTION_KEY]: info.selectionText }).catch(() => {});
  chrome.runtime
    .sendMessage({ type: 'context_selection', text: info.selectionText })
    .catch(() => {});
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

interface ActiveRun {
  conversationId: string;
  abortController: AbortController;
  pendingAsk: ((answers: Record<string, unknown>) => void) | null;
  send: (msg: ServerMessage) => void;
  disconnectTimeout: ReturnType<typeof setTimeout> | null;
  lastQuestions?: unknown;
}

let activeRun: ActiveRun | null = null;

// Long-lived chat port (PLAN §23). One agent runs at a time per port (PLAN §48).
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  const localSend = (msg: ServerMessage) => {
    try {
      port.postMessage(msg);
    } catch (e) {
      log.error('[chat:bg] postMessage threw (port likely disconnected)', e, msg);
    }
  };

  const send = (msg: ServerMessage) => {
    if (activeRun) {
      activeRun.send(msg);
    } else {
      localSend(msg);
    }
  };

  setBadge('clear'); // panel is open — clear any pending indicator (PLAN §39)

  // Re-bind to active run if reconnecting
  if (activeRun) {
    log.debug('[chat:bg] reconnected to active run for conversation:', activeRun.conversationId);
    if (activeRun.disconnectTimeout) {
      clearTimeout(activeRun.disconnectTimeout);
      activeRun.disconnectTimeout = null;
    }
    activeRun.send = localSend;
    if (activeRun.pendingAsk && activeRun.lastQuestions !== undefined) {
      activeRun.send({ type: 'ask_user', questions: activeRun.lastQuestions });
    }
  }

  const askUser = (questions: unknown): Promise<Record<string, unknown>> => {
    if (activeRun) {
      activeRun.lastQuestions = questions;
      activeRun.send({ type: 'ask_user', questions });
    } else {
      localSend({ type: 'ask_user', questions });
    }
    setBadge('error'); // '!' badge signals input needed (PLAN §39)
    notify('needsInput', 'BrowseCortex', 'The agent needs your input to continue.');
    return new Promise((resolve) => {
      if (activeRun) {
        activeRun.pendingAsk = resolve;
      } else {
        resolve({});
      }
    });
  };

  port.onMessage.addListener(async (msg: ClientMessage) => {
    try {
      if (msg.type === 'abort') {
        if (activeRun) {
          if (activeRun.disconnectTimeout) {
            clearTimeout(activeRun.disconnectTimeout);
          }
          activeRun.abortController.abort();
          activeRun.pendingAsk?.({});
          activeRun.pendingAsk = null;
          activeRun = null;
        }
        setRunningConversation(null);
        return;
      }
      if (msg.type === 'ask_user_response') {
        if (activeRun) {
          activeRun.pendingAsk?.(msg.answers);
          activeRun.pendingAsk = null;
          activeRun.lastQuestions = undefined;
        }
        return;
      }
      if (msg.type !== 'send') return;

      if (activeRun) {
        log.warn('[chat:bg] rejected send — agent already running');
        localSend({ type: 'error', message: 'An agent is already running. Stop it first.' });
        return;
      }

      // Set before any await to prevent concurrent runs from double-submit.
      const abortController = new AbortController();
      activeRun = {
        conversationId: msg.conversationId,
        abortController,
        pendingAsk: null,
        send: localSend,
        disconnectTimeout: null,
      };
      setBadge('running');
      setAgentActive(true);
      setRunningConversation(msg.conversationId);

      const resolved = await resolveActive();
      if ('error' in resolved) {
        log.error('[chat:bg] resolveActive failed', resolved.error);
        send({ type: 'error', message: resolved.error });
        send({ type: 'done' });
        activeRun = null;
        setAgentActive(false);
        setRunningConversation(null);
        return;
      }
      // Surface fallback routing to the user (PLAN §40).
      if (resolved.note) send({ type: 'token', content: `_${resolved.note}_\n\n` });

      await ensureOffscreen();
      const stopKeepAlive = startKeepAlive();
      const settings = await Storage.settings.get();

      try {
        const conv = await ensureConversation(
          msg.conversationId,
          resolved.provider,
          resolved.model.id,
        );
        const existing = await getMessages(msg.conversationId);
        const isFirstExchange = existing.length === 0;
        // Prepend the stored synopsis on resume when enabled (B6).
        const conversationSummary = settings.useConversationSummary ? conv.summary : undefined;
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
          conversationSummary,
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
        // Accumulate an estimated token count for this conversation (B2). The
        // new turns are everything after the prior history (system excluded).
        const newTurns = updated.filter((m) => m.role !== 'system').slice(history.length);
        const addedTokens = estimateTokens(newTurns);
        if (addedTokens > 0) {
          const conv = await Storage.conversations.get(msg.conversationId);
          if (conv) {
            conv.tokensUsed = (conv.tokensUsed ?? 0) + addedTokens;
            await Storage.conversations.save(conv);
          }
        }
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
          ).catch((e) => log.error('[chat:bg] autoName failed', e));
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
        log.error('[chat:bg] agent loop threw', e);
        setBadge('error');
        notify('taskFailed', 'BrowseCortex', 'Task failed.');
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
        send({ type: 'done' });
      } finally {
        stopKeepAlive();
        if (activeRun) {
          if (activeRun.disconnectTimeout) {
            clearTimeout(activeRun.disconnectTimeout);
          }
          activeRun = null;
        }
        setAgentActive(false);
        setRunningConversation(null);
      }
    } catch (e) {
      // Catches anything thrown before/outside the inner try (e.g. resolveActive,
      // ensureOffscreen, Storage.settings.get) so a failure here is never silent.
      log.error('[chat:bg] onMessage handler threw outside inner try', e);
      try {
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
        send({ type: 'done' });
      } catch (sendErr) {
        log.error('[chat:bg] failed to report outer error to panel', sendErr);
      }
      if (activeRun) {
        if (activeRun.disconnectTimeout) {
          clearTimeout(activeRun.disconnectTimeout);
        }
        activeRun = null;
      }
      setAgentActive(false);
      setRunningConversation(null);
    }
  });

  port.onDisconnect.addListener(() => {
    if (chrome.runtime.lastError) {
      log.warn('[chat:bg] port disconnected', chrome.runtime.lastError);
    }
    // Resolve any in-flight ask_user before aborting — otherwise the promise
    // leaks forever when the panel disconnects mid-question (H-EXT-3).
    // Wait, if it's a transient disconnect, we do NOT want to abort immediately.
    // We set a timeout to check if a reconnect happened.
    if (activeRun && activeRun.send === localSend) {
      activeRun.disconnectTimeout = setTimeout(() => {
        log.debug('[chat:bg] disconnect grace period expired, aborting run');
        if (activeRun && activeRun.send === localSend) {
          activeRun.pendingAsk?.({});
          activeRun.pendingAsk = null;
          activeRun.abortController.abort();
          activeRun = null;
          setRunningConversation(null);
        }
      }, 3000);
    }
  });
});
