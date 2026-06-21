/**
 * Bridges MCP server tools into the agent loop (PLAN §20). Enabled servers'
 * cached tools are exposed as namespaced ApiToolDefinitions, and calls are
 * routed back to the originating server.
 */
import type { ApiToolDefinition } from '@/providers/chat-types';
import type { ToolResult } from '@/tools/types';
import { callTool, listServers } from './client';
import { mcpToolName, parseMcpToolName } from './types';

/** API tool schemas for every tool on every enabled MCP server. */
export async function getMcpApiTools(): Promise<ApiToolDefinition[]> {
  const servers = await listServers();
  const out: ApiToolDefinition[] = [];
  for (const server of servers) {
    if (!server.enabled) continue;
    for (const tool of server.tools) {
      out.push({
        type: 'function',
        function: {
          name: mcpToolName(server.name, tool.name),
          description: `[MCP:${server.name}] ${tool.description ?? tool.name}`,
          parameters: tool.inputSchema ?? { type: 'object', properties: {} },
        },
      });
    }
  }
  return out;
}

export function isMcpTool(name: string): boolean {
  return name.startsWith('mcp:');
}

/** Route an mcp:<server>:<tool> call to its server. */
export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const parsed = parseMcpToolName(name);
  if (!parsed) return { error: `Invalid MCP tool name: ${name}` };
  const server = (await listServers()).find((s) => s.name === parsed.server);
  if (!server) return { error: `MCP server not found: ${parsed.server}` };
  if (!server.enabled) return { error: `MCP server disabled: ${parsed.server}` };
  try {
    const result = await callTool(server, parsed.tool, args);
    return { result } as ToolResult;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
