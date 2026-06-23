/**
 * MCP Directory types (MCP_DIRECTORY_PLAN §2–§3).
 * The directory is a GitHub-hosted marketplace: a lightweight `index.json`
 * listing plus one full JSON file per server under `featured/` or `community/`.
 */

export type McpCategory =
  | 'code'
  | 'communication'
  | 'data'
  | 'design'
  | 'productivity'
  | 'local'
  | 'community';

export type McpTier = 'featured' | 'community';

export type McpAuthMethod = 'oauth' | 'api_key' | 'none';

export type McpTransport = 'streamable_http' | 'sse' | 'stdio';

/** A row in `/mcp/index.json` — enough to render the browse list. */
export interface McpDirectoryEntry {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: McpCategory;
  tier: McpTier;
  popularity: number;
  path: string;
}

export interface McpOAuthConfig {
  authUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  scopes?: string[];
  /** OAuth app client id. Without it the OAuth flow can't run; UI falls back. */
  clientId?: string;
}

export interface McpApiKeyConfig {
  label: string;
  placeholder?: string;
  helperUrl?: string;
  helperText?: string;
  /** Header to send the key in. Defaults to `Authorization: Bearer <key>`. */
  headerName?: string;
  /** Prefix prepended to the key in the header. Defaults to `Bearer `. */
  headerPrefix?: string;
}

/** A full per-server JSON file (`/mcp/featured/<id>.json`). */
export interface McpServerDefinition {
  id: string;
  name: string;
  icon?: string;
  description: string;
  longDescription?: string;
  category: McpCategory;
  tier: McpTier;
  version: string;
  author: string;
  submittedBy?: string | null;
  url: string;
  transport: McpTransport;
  docsUrl?: string;
  auth: McpAuthMethod;
  authFallback?: McpAuthMethod | null;
  oauthConfig?: McpOAuthConfig;
  apiKeyConfig?: McpApiKeyConfig;
  tools: string[];
  examplePrompts?: string[];
}

/**
 * Resolve the effective auth method (plan §9 "Auth Detection"): honour an
 * explicit value, otherwise infer from which config block is present.
 */
export function detectAuthMethod(def: McpServerDefinition): McpAuthMethod {
  if (def.auth && (def.auth as string) !== 'auto') return def.auth;
  if (def.oauthConfig) return 'oauth';
  if (def.apiKeyConfig) return 'api_key';
  return 'none';
}
