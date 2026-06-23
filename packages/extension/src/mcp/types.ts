/** MCP server consumption types (PLAN §20). */

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServer {
  id: string;
  /** Stable namespace key (the directory id). Used in `mcp:<name>:<tool>`. */
  name: string;
  url: string;
  authToken?: string;
  enabled: boolean;
  tools: McpToolSchema[];
  /** Human-facing name shown in the UI (directory `name`); falls back to `name`. */
  label?: string;
  icon?: string;
  category?: string;
  tier?: 'featured' | 'community';
  /** How this server was connected, for the management view. */
  auth?: 'oauth' | 'api_key' | 'none';
  docsUrl?: string;
  transport?: string;
  examplePrompts?: string[];
  /** Tool names the user has disabled; excluded from the agent's tool list. */
  disabledTools?: string[];
  connectedAt?: string;
  /** ISO expiry for OAuth tokens, if known. */
  tokenExpiresAt?: string;
}

/** Namespaced tool name: mcp:<server>:<tool> (PLAN §20). */
export function mcpToolName(serverName: string, tool: string): string {
  return `mcp:${serverName}:${tool}`;
}

export function parseMcpToolName(name: string): { server: string; tool: string } | null {
  const m = /^mcp:([^:]+):(.+)$/.exec(name);
  return m ? { server: m[1], tool: m[2] } : null;
}
