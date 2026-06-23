/**
 * MCP Directory store + caching (MCP_DIRECTORY_PLAN §11).
 * Fetches the GitHub-hosted directory index and per-server JSON files, caching
 * each in chrome.storage.local so the browse view loads offline and only hits
 * the network on first load or an explicit Sync.
 */
import * as local from '@/storage/local';
import type { McpDirectoryEntry, McpServerDefinition } from './directory-types';

const DEFAULT_REPO =
  (import.meta.env.VITE_MCP_REPO_URL as string | undefined) ??
  'https://raw.githubusercontent.com/abdul-karim-mia/browsecortex/main/mcp';

const REPO_KEY = 'mcp_repo_url';
const INDEX_KEY = 'mcp_index';
const SYNC_KEY = 'mcp_sync_time';
const SERVER_KEY = (id: string) => `mcp_server_def_${id}`;

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

interface RawIndex {
  version?: string;
  updated?: string;
  servers?: McpDirectoryEntry[];
}

export async function getRepoUrl(): Promise<string> {
  return (await local.get<string>(REPO_KEY)) ?? DEFAULT_REPO;
}

export async function setRepoUrl(url: string): Promise<void> {
  await local.set(REPO_KEY, url || DEFAULT_REPO);
}

export async function getSyncTime(): Promise<string | undefined> {
  return local.get<string>(SYNC_KEY);
}

function base(repo: string): string {
  return repo.replace(/\/$/, '');
}

/**
 * Return the directory listing. Uses the local cache unless it is missing,
 * older than 7 days, or `force` is set (the [Sync] button).
 */
export async function getIndex(force = false): Promise<McpDirectoryEntry[]> {
  const cached = await local.get<McpDirectoryEntry[]>(INDEX_KEY);
  const syncedAt = await local.get<string>(SYNC_KEY);
  const stale =
    !syncedAt || Date.now() - new Date(syncedAt).getTime() > SEVEN_DAYS;

  if (cached && !force && !stale) return cached;

  try {
    return await syncIndex();
  } catch (e) {
    if (cached) return cached; // network down → serve stale cache
    throw e;
  }
}

/** Force-fetch the index from GitHub and refresh the cache (plan §11 Sync). */
export async function syncIndex(): Promise<McpDirectoryEntry[]> {
  const repo = await getRepoUrl();
  const res = await fetch(`${base(repo)}/index.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = (await res.json()) as RawIndex | McpDirectoryEntry[];
  const servers = Array.isArray(json) ? json : (json.servers ?? []);
  await local.set(INDEX_KEY, servers);
  await local.set(SYNC_KEY, new Date().toISOString());
  return servers;
}

/**
 * Load a server's full definition. Cached per-id; `force` re-fetches (used by
 * Sync, which also clears stale per-server caches).
 */
export async function getServerDefinition(
  entry: McpDirectoryEntry,
  force = false,
): Promise<McpServerDefinition> {
  if (!force) {
    const cached = await local.get<McpServerDefinition>(SERVER_KEY(entry.id));
    if (cached) return cached;
  }
  const repo = await getRepoUrl();
  const res = await fetch(`${base(repo)}/${entry.path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const def = (await res.json()) as McpServerDefinition;
  await local.set(SERVER_KEY(entry.id), def);
  return def;
}

/** Drop every cached per-server definition (plan §11 Weekly Refresh). */
export async function clearServerDefinitionCache(
  entries: McpDirectoryEntry[],
): Promise<void> {
  await Promise.all(entries.map((e) => local.remove(SERVER_KEY(e.id))));
}
