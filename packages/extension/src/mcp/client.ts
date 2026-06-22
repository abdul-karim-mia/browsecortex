/**
 * Minimal MCP client over Streamable HTTP / JSON-RPC (PLAN §20, Tier 1).
 * Supports initialize, tools/list, and tools/call. Servers that respond with
 * SSE-framed JSON are handled by extracting the JSON from `data:` lines.
 */
import * as local from '@/storage/local';
import type { McpServer, McpToolSchema } from './types';

const SERVERS_KEY = 'mcp_servers';

export async function listServers(): Promise<McpServer[]> {
  return (await local.get<McpServer[]>(SERVERS_KEY)) ?? [];
}

export async function saveServer(server: McpServer): Promise<void> {
  const all = await listServers();
  const idx = all.findIndex((s) => s.id === server.id);
  if (idx >= 0) all[idx] = server;
  else all.push(server);
  await local.set(SERVERS_KEY, all);
}

export async function removeServer(id: string): Promise<void> {
  await local.set(
    SERVERS_KEY,
    (await listServers()).filter((s) => s.id !== id),
  );
}

async function rpc(server: McpServer, method: string, params?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (server.authToken) headers.Authorization = `Bearer ${server.authToken}`;

  const res = await fetch(server.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params: params ?? {} }),
    // Bound the request so a hung MCP server can't wedge the agent loop or leak
    // the socket indefinitely (H-EXT-7).
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

  const text = await res.text();
  const json = extractJson(text);
  if (json.error) throw new Error(json.error.message ?? 'MCP error');
  return json.result;
}

interface RpcResponse {
  result?: unknown;
  error?: { message?: string };
}

/** Handle both plain JSON and SSE-framed (`data: {...}`) responses. */
function extractJson(text: string): RpcResponse {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed) as RpcResponse;
  for (const line of trimmed.split('\n')) {
    const l = line.trim();
    if (l.startsWith('data:')) {
      const data = l.slice(5).trim();
      if (data && data !== '[DONE]') return JSON.parse(data) as RpcResponse;
    }
  }
  throw new Error('Unparseable MCP response.');
}

/** Connect: initialize then fetch the tool list (PLAN §20 connection flow). */
export async function fetchTools(server: McpServer): Promise<McpToolSchema[]> {
  await rpc(server, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'BrowseCortex', version: '1.0.0' },
  });
  const result = (await rpc(server, 'tools/list')) as { tools?: McpToolSchema[] };
  return result.tools ?? [];
}

export async function callTool(
  server: McpServer,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return rpc(server, 'tools/call', { name: tool, arguments: args });
}
