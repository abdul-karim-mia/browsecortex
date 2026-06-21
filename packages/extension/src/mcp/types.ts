/** MCP server consumption types (PLAN §20). */

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  authToken?: string;
  enabled: boolean;
  tools: McpToolSchema[];
}

/** Namespaced tool name: mcp:<server>:<tool> (PLAN §20). */
export function mcpToolName(serverName: string, tool: string): string {
  return `mcp:${serverName}:${tool}`;
}

export function parseMcpToolName(name: string): { server: string; tool: string } | null {
  const m = /^mcp:([^:]+):(.+)$/.exec(name);
  return m ? { server: m[1], tool: m[2] } : null;
}
