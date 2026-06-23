/**
 * MCP Directory connect flows (MCP_DIRECTORY_PLAN §8). Turns a directory
 * `McpServerDefinition` into a connected `McpServer`: tests the connection,
 * fetches the tool list, and persists credentials in chrome.storage.local.
 *
 * Connection always goes extension → server directly; BrowseCortex never sees
 * the credentials or the data (plan §13 "Server Connectivity").
 */
import { fetchTools, saveServer } from './client';
import type { McpServerDefinition } from './directory-types';
import type { McpServer } from './types';

/** Build the connected-server record carried over from the directory entry. */
function baseServer(def: McpServerDefinition): Omit<McpServer, 'tools' | 'authToken'> {
  return {
    // `name` is the namespace key; keep it the stable directory id so tool
    // names (`mcp:<id>:<tool>`) survive reconnects and renames.
    id: def.id,
    name: def.id,
    label: def.name,
    url: def.url,
    enabled: true,
    icon: def.icon,
    category: def.category,
    tier: def.tier,
    auth: def.auth,
    docsUrl: def.docsUrl,
    transport: def.transport,
    examplePrompts: def.examplePrompts,
    disabledTools: [],
    connectedAt: new Date().toISOString(),
  };
}

/** Connect a no-auth server (plan §8 "No-Auth Servers"). `url` may override. */
export async function connectNone(
  def: McpServerDefinition,
  url?: string,
): Promise<McpServer> {
  const server: McpServer = { ...baseServer(def), url: url || def.url, tools: [] };
  const tools = await fetchTools(server); // also validates the endpoint
  const connected = { ...server, tools };
  await saveServer(connected);
  return connected;
}

/** Connect with an API key / bearer token (plan §8 "API Key"). */
export async function connectApiKey(
  def: McpServerDefinition,
  key: string,
): Promise<McpServer> {
  const server: McpServer = { ...baseServer(def), authToken: key, tools: [] };
  const tools = await fetchTools(server); // fails before we save a bad key
  const connected = { ...server, tools };
  await saveServer(connected);
  return connected;
}

/**
 * Connect via OAuth 2.0 using chrome.identity.launchWebAuthFlow (plan §8).
 * Requires the `identity` permission and a `clientId` in the server's
 * oauthConfig. Throws a descriptive error otherwise so the UI can offer the
 * API-key fallback.
 */
export async function connectOAuth(def: McpServerDefinition): Promise<McpServer> {
  const cfg = def.oauthConfig;
  if (!cfg) throw new Error('This server has no OAuth configuration.');
  if (!cfg.clientId)
    throw new Error(
      'OAuth is not configured for this server (missing client id). Use an API key instead.',
    );
  if (!chrome.identity?.launchWebAuthFlow)
    throw new Error('OAuth requires the "identity" permission.');

  const redirectUri = chrome.identity.getRedirectURL('mcp-oauth');
  const authUrl = new URL(cfg.authUrl);
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', crypto.randomUUID());
  if (cfg.scopes?.length) authUrl.searchParams.set('scope', cfg.scopes.join(' '));

  const redirect = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });
  if (!redirect) throw new Error('OAuth was cancelled.');

  const code = new URL(redirect).searchParams.get('code');
  if (!code) throw new Error('No authorization code returned by the provider.');

  // Exchange the code for an access token. Some providers block this from an
  // extension origin (CORS) — surface that so the user can fall back.
  const tokenRes = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
  const token = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!token.access_token) throw new Error('Provider did not return an access token.');

  const tokenExpiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : undefined;

  const server: McpServer = {
    ...baseServer(def),
    authToken: token.access_token,
    tokenExpiresAt,
    tools: [],
  };
  const tools = await fetchTools(server);
  const connected = { ...server, tools };
  await saveServer(connected);
  return connected;
}

/** Re-run the tool list against a connected server (plan §7 "Test Connection"). */
export async function testConnection(server: McpServer): Promise<number> {
  const tools = await fetchTools(server);
  await saveServer({ ...server, tools });
  return tools.length;
}
