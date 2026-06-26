/**
 * Relay client (PLAN §21). Connects the extension to a running `browsecortex-relay`
 * over WebSocket and answers the relay's RPCs:
 *   - list_tools → the built-in tool schemas (filtered by tool-access policy)
 *   - call_tool  → execute a built-in tool, or run the agent loop via use_agent
 *
 * External agents reach these through the relay's MCP SSE endpoint.
 */
import { getApiTools, executeTool, getTool, isDestructive } from '@/tools/registry';
import type { ToolContext } from '@/tools/types';
import { log } from '@/log';
import { getConfig } from './config';
import { runUseAgent } from './use-agent';
import { setWebSocketConnected } from './connection-manager';

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connected = false;
// Backs off after repeated failures (no relay server running) instead of
// retrying every 5s forever, which just spams the console with connection
// errors. Resets whenever `connect()` is called explicitly (e.g. the user
// toggles the setting, changes the port, or reopens the panel).
let failedAttempts = 0;
const MAX_BACKOFF_MS = 5 * 60_000;

const SAFE_BLOCKLIST = new Set(['run_javascript']);

function isToolAllowed(name: string, access: string, custom: string[]): boolean {
  if (access === 'all') return true;
  if (access === 'custom') return custom.includes(name);
  // 'safe' — exclude destructive tools and run_javascript. No call args are
  // known when just listing/filtering tools, so per-call exemptions (e.g.
  // close_tab on an agent-opened tab) conservatively still count as destructive.
  const def = getTool(name);
  return !!def && !isDestructive(name) && !SAFE_BLOCKLIST.has(name);
}

const ctx: ToolContext = {
  conversationId: 'mcp-server',
  async getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error('No active tab.');
    return tab.id;
  },
};

async function handleRpc(method: string, params: Record<string, unknown>): Promise<unknown> {
  const cfg = await getConfig();

  if (method === 'list_tools') {
    const useAgentTool = {
      type: 'function' as const,
      function: {
        name: 'use_agent',
        description:
          "Give a natural-language instruction to BrowseCortex's AI agent. It autonomously " +
          'plans and executes using all browser tools and returns the result.',
        parameters: {
          type: 'object',
          properties: { prompt: { type: 'string' } },
          required: ['prompt'],
        },
      },
    };
    const tools = getApiTools()
      .filter((t) => isToolAllowed(t.function.name, cfg.toolAccess, cfg.customTools))
      .concat(useAgentTool)
      .map((t) => ({
        name: t.function.name,
        description: t.function.description,
        inputSchema: t.function.parameters,
      }));
    return { tools };
  }

  if (method === 'call_tool') {
    const name = String(params.name);
    const args = (params.arguments as Record<string, unknown>) ?? {};
    let result: unknown;
    if (name === 'use_agent') {
      result = await runUseAgent(String(args.prompt ?? ''));
    } else if (!isToolAllowed(name, cfg.toolAccess, cfg.customTools)) {
      result = { error: `Tool '${name}' is not permitted by the current access policy.` };
    } else {
      result = await executeTool(name, args, ctx);
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }

  throw new Error(`Unknown RPC method: ${method}`);
}

export function isConnected(): boolean {
  return connected;
}

export function disconnect(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  socket?.close();
  socket = null;
  connected = false;
}

/** Connect (or reconnect) to the relay using the stored config. */
export async function connect(): Promise<void> {
  failedAttempts = 0; // explicit connect (toggle/port change/panel open) — start fresh
  return attemptConnect();
}

async function attemptConnect(): Promise<void> {
  const cfg = await getConfig();
  if (!cfg.enabled) return disconnect();

  disconnect();
  // Auth via the `token.<value>` sub-protocol keeps the token out of the URL
  // (which would otherwise leak into devtools, logs, and process memory).
  const url = `ws://localhost:${cfg.port}/ws`;
  try {
    socket = new WebSocket(url, [`token.${cfg.token}`]);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    connected = true;
    failedAttempts = 0;
    log.debug('[relay] WebSocket connected at port', cfg.port);
    setWebSocketConnected(true);
  };
  socket.onclose = () => {
    connected = false;
    failedAttempts++;
    log.debug('[relay] WebSocket disconnected. Reconnection attempt', failedAttempts);
    setWebSocketConnected(false);
    scheduleReconnect();
  };
  socket.onerror = (ev) => {
    log.warn('[relay] WebSocket error:', (ev as Event).type);
    socket?.close();
  };
  socket.onmessage = async (ev) => {
    let msg: { type?: string; id?: string; method?: string; params?: Record<string, unknown> };
    try {
      msg = JSON.parse(ev.data as string);
    } catch {
      return;
    }
    if (msg.type !== 'rpc' || !msg.id) return;
    try {
      const result = await handleRpc(msg.method ?? '', msg.params ?? {});
      socket?.send(JSON.stringify({ type: 'rpc_result', id: msg.id, result }));
    } catch (e) {
      socket?.send(
        JSON.stringify({
          type: 'rpc_error',
          id: msg.id,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  // Exponential backoff (5s, 10s, 20s, ... capped at 5min) so a relay that
  // isn't running doesn't retry-and-log every 5s indefinitely.
  const delay = Math.min(5000 * 2 ** failedAttempts, MAX_BACKOFF_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    attemptConnect();
  }, delay);
}
