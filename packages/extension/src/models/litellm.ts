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

function shortName(id: string): string {
  return id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
}

// Suffix index: maps the bare model name (after any provider prefix) to its
// entry. Built once per catalog object so repeated lookups stay cheap.
let suffixIndex: { catalog: Catalog; map: Map<string, LiteLLMEntry> } | null = null;

function getSuffixIndex(catalog: Catalog): Map<string, LiteLLMEntry> {
  if (suffixIndex && suffixIndex.catalog === catalog) return suffixIndex.map;
  const map = new Map<string, LiteLLMEntry>();
  for (const [key, entry] of Object.entries(catalog)) {
    const short = shortName(key);
    // First write wins, so an exact bare key isn't shadowed by a prefixed one.
    if (!map.has(short)) map.set(short, entry);
  }
  suffixIndex = { catalog, map };
  return map;
}

/**
 * Look up an entry by model id. LiteLLM keys are often provider-prefixed
 * (e.g. `groq/llama-3.3-70b-versatile`) while providers return bare ids, so we
 * try: exact key → bare key → suffix match against prefixed catalog keys.
 */
export function lookup(catalog: Catalog, modelId: string): LiteLLMEntry | undefined {
  if (catalog[modelId]) return catalog[modelId];
  const short = shortName(modelId);
  if (catalog[short]) return catalog[short];
  return getSuffixIndex(catalog).get(short);
}
