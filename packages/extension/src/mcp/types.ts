/** MCP server consumption types (PLAN §20). */

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServer {
  id: string;
  /** Stable namespace key (the directory id). Used in `mcp__<name>__<tool>`. */
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

export function escapeMcpName(s: string): string {
  let escaped = s.replace(/_0x/g, '_0x5f_0x');
  escaped = escaped.replace(/[^a-zA-Z0-9_-]/g, (char) => {
    const hex = char.charCodeAt(0).toString(16).toLowerCase();
    return `_0x${hex}_`;
  });
  return escaped;
}

export function unescapeMcpName(s: string): string {
  let unescaped = s.replace(/_0x([0-9a-fA-F]+)_/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  unescaped = unescaped.replace(/_0x5f_0x/g, '_0x');
  return unescaped;
}

/** Namespaced tool name: mcp__<server>__<tool> (PLAN §20). */
export function mcpToolName(serverName: string, tool: string): string {
  return `mcp__${escapeMcpName(serverName)}__${escapeMcpName(tool)}`;
}

export function parseMcpToolName(name: string): { server: string; tool: string } | null {
  if (!name.startsWith('mcp__')) return null;
  const parts = name.slice(5).split('__');
  if (parts.length < 2) return null;
  return {
    server: unescapeMcpName(parts[0]),
    tool: unescapeMcpName(parts.slice(1).join('__')),
  };
}


