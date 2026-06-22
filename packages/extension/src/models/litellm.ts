/**
 * LiteLLM model capability database (PLAN §6).
 * Enriches the bare /v1/models list with context window, vision, tool-calling,
 * reasoning, and pricing. Cached weekly in chrome.storage.local.
 */
import * as local from '@/storage/local';

const CACHE_KEY = 'litellm_cache';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RAW_JSON_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

export interface LiteLLMEntry {
  max_input_tokens?: number;
  max_output_tokens?: number;
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  supports_parallel_function_calling?: boolean;
  supports_tool_choice?: boolean;
  supports_reasoning?: boolean;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
}

type Catalog = Record<string, LiteLLMEntry>;

interface Cache {
  fetchedAt: number;
  catalog: Catalog;
}

let memo: Catalog | null = null;

/** Returns the catalog, using cache unless stale or forced. */
export async function getCatalog(force = false): Promise<Catalog> {
  if (memo && !force) return memo;

  const cached = await local.get<Cache>(CACHE_KEY);
  if (!force && cached && Date.now() - cached.fetchedAt < WEEK_MS) {
    memo = cached.catalog;
    return memo;
  }

  try {
    const res = await fetch(RAW_JSON_URL);
    if (!res.ok) throw new Error(`${res.status}`);
    const catalog = (await res.json()) as Catalog;
    memo = catalog;
    await local.set<Cache>(CACHE_KEY, { fetchedAt: Date.now(), catalog });
    return catalog;
  } catch {
    // Fall back to stale cache if available, else empty.
    if (cached) {
      memo = cached.catalog;
      return memo;
    }
    return {};
  }
}

function sanitize(id: string): string {
  const cleaned = id
    .replace(/[:\-_/]free\b/gi, '')
    .replace(/\bfree\b/gi, '')
    .trim();
  return cleaned || id;
}

export function fullSanitizedName(id: string): string {
  return sanitize(id).toLowerCase();
}

export function bareSanitizedName(id: string): string {
  const clean = sanitize(id);
  const short = clean.includes('/') ? clean.slice(clean.lastIndexOf('/') + 1) : clean;
  return short.toLowerCase();
}

export function canonicalName(id: string): string {
  return bareSanitizedName(id);
}

// Cached indices for full and bare sanitized name lookups.
// Built once per catalog object so repeated lookups stay cheap.
let cachedIndices: {
  catalog: Catalog;
  fullIndex: Map<string, { key: string; entry: LiteLLMEntry }[]>;
  bareIndex: Map<string, { key: string; entry: LiteLLMEntry }[]>;
} | null = null;

function getIndices(catalog: Catalog) {
  if (cachedIndices && cachedIndices.catalog === catalog) {
    return { fullIndex: cachedIndices.fullIndex, bareIndex: cachedIndices.bareIndex };
  }
  const fullIndex = new Map<string, { key: string; entry: LiteLLMEntry }[]>();
  const bareIndex = new Map<string, { key: string; entry: LiteLLMEntry }[]>();

  for (const [key, entry] of Object.entries(catalog)) {
    const full = fullSanitizedName(key);
    const bare = bareSanitizedName(key);

    if (!fullIndex.has(full)) fullIndex.set(full, []);
    fullIndex.get(full)!.push({ key, entry });

    if (!bareIndex.has(bare)) bareIndex.set(bare, []);
    bareIndex.get(bare)!.push({ key, entry });
  }

  cachedIndices = { catalog, fullIndex, bareIndex };
  return { fullIndex, bareIndex };
}

function getMatchScore(key: string, query: string): number {
  const lowerKey = key.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerKey === lowerQuery) return 3;

  const cleanKey = sanitize(key).toLowerCase();
  const cleanQuery = sanitize(query).toLowerCase();
  if (cleanKey === cleanQuery) return 2;

  const keyPrefix = key.includes('/') ? key.split('/')[0].toLowerCase() : '';
  const queryPrefix = query.includes('/') ? query.split('/')[0].toLowerCase() : '';
  if (keyPrefix && queryPrefix && keyPrefix === queryPrefix) return 1;

  return 0;
}

/**
 * Look up an entry by model id. Sanitizes the model id (removing free keywords),
 * matches against the full name first, then falls back to the bare model name,
 * scores matches, and merges all matching entries (more specific matches override general ones).
 */
export function lookup(catalog: Catalog, modelId: string): LiteLLMEntry | undefined {
  const { fullIndex, bareIndex } = getIndices(catalog);

  // 1. Try matching by full sanitized name first (removing free)
  const queryFull = fullSanitizedName(modelId);
  let matches = fullIndex.get(queryFull);

  // 2. Fall back to bare name without provider (removing free) if no match found
  if (!matches || matches.length === 0) {
    const queryBare = bareSanitizedName(modelId);
    matches = bareIndex.get(queryBare);
  }

  if (!matches || matches.length === 0) return undefined;

  const sorted = [...matches].sort(
    (a, b) => getMatchScore(a.key, modelId) - getMatchScore(b.key, modelId)
  );

  const merged: LiteLLMEntry = {};
  for (const match of sorted) {
    for (const [k, v] of Object.entries(match.entry)) {
      if (v !== undefined && v !== null) {
        (merged as Record<string, unknown>)[k] = v;
      }
    }
  }

  return merged;
}
