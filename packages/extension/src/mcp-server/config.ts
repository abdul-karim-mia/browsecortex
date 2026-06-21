/**
 * BrowseCortex-as-MCP-server config (PLAN §21). Stored in chrome.storage.local.
 * Disabled by default; localhost only; token required for all connections.
 */
import * as local from '@/storage/local';

export type ToolAccess = 'all' | 'safe' | 'custom';

export interface McpServerConfig {
  enabled: boolean;
  port: number;
  token: string;
  toolAccess: ToolAccess;
  /** Allowed tool names when toolAccess is 'custom'. */
  customTools: string[];
}

const KEY = 'mcp_server_config';

function genToken(): string {
  return 'sk-bc-' + crypto.randomUUID().replace(/-/g, '');
}

export async function getConfig(): Promise<McpServerConfig> {
  const stored = await local.get<McpServerConfig>(KEY);
  if (stored) return stored;
  const created: McpServerConfig = {
    enabled: false,
    port: 7822,
    token: genToken(),
    toolAccess: 'safe',
    customTools: [],
  };
  await local.set(KEY, created);
  return created;
}

export async function setConfig(patch: Partial<McpServerConfig>): Promise<McpServerConfig> {
  const next = { ...(await getConfig()), ...patch };
  await local.set(KEY, next);
  return next;
}

export async function regenerateToken(): Promise<McpServerConfig> {
  return setConfig({ token: genToken() });
}
