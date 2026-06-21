/**
 * Relay client (PLAN §21). Connects the extension to a running `browsecortex-relay`
 * over WebSocket and answers the relay's RPCs:
 *   - list_tools → the built-in tool schemas (filtered by tool-access policy)
 *   - call_tool  → execute a built-in tool, or run the agent loop via use_agent
 *
 * External agents reach these through the relay's MCP SSE endpoint.
 */
import { getApiTools, executeTool, getTool } from '@/tools/registry';
import type { ToolContext } from '@/tools/types';
import { getConfig } from './config';
import { runUseAgent } from './use-agent';

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connected = false;

const SAFE_BLOCKLIST = new Set(['run_javascript']);

function isToolAllowed(name: string, access: string, custom: string[]): boolean {
  if (access === 'all') return true;
  if (access === 'custom') return custom.includes(name);
  // 'safe' — exclude destructive tools and run_javascript.
  const def = getTool(name);
  return !!def && !def.destructive && !SAFE_BLOCKLIST.has(name);
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
          'Give a natural-language instruction to BrowseCortex\'s AI agent. It autonomously ' +
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
  const cfg = await getConfig();
  if (!cfg.enabled) return disconnect();

  disconnect();
  const url = `ws://localhost:${cfg.port}/ws?token=${encodeURIComponent(cfg.token)}`;
  try {
    socket = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    connected = true;
  };
  socket.onclose = () => {
    connected = false;
    scheduleReconnect();
  };
  socket.onerror = () => socket?.close();
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
        JSON.stringify({ type: 'rpc_error', id: msg.id, error: e instanceof Error ? e.message : String(e) }),
      );
    }
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    const cfg = await getConfig();
    if (cfg.enabled) connect();
  }, 5000);
}
