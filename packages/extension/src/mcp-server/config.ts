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
  /** Auto-start relay when enabled (Phase 3). Disabled by default. */
  autoStartRelay?: boolean;
}

const KEY = 'mcp_server_config';
const DEFAULT_PORT = 7822;
const PORT_RANGE = 100; // Try up to port+100

function genToken(): string {
  return 'sk-bc-' + crypto.randomUUID().replace(/-/g, '');
}

/** Check if a port is available by attempting to connect. */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 1000);
    fetch(`http://localhost:${port}/status`, {
      headers: { Authorization: 'Bearer __check__' },
    })
      .then(() => resolve(true))
      .catch(() => resolve(false))
      .finally(() => clearTimeout(timeout));
  });
}

/** Find the next available port starting from DEFAULT_PORT. */
export async function findAvailablePort(start = DEFAULT_PORT): Promise<number> {
  for (let port = start; port < start + PORT_RANGE; port++) {
    if (await isPortAvailable(port)) {
      continue; // Port is in use, skip it
    }
    return port;
  }
  return start; // Fallback to default if all busy
}

export async function getConfig(): Promise<McpServerConfig> {
  const stored = await local.get<McpServerConfig>(KEY);
  if (stored) return stored;

  // Auto-detect port on first setup
  const port = await findAvailablePort(DEFAULT_PORT);
  const created: McpServerConfig = {
    enabled: false,
    port,
    token: genToken(),
    toolAccess: 'safe',
    customTools: [],
    autoStartRelay: false,
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
