/**
 * OpenAI-compatible provider client (PLAN §5, §6, §9).
 * Only the pieces needed so far: connection test + model listing.
 * The streaming chat call lands with the agent loop in Phase 4.
 */
import type { Provider } from '@/types';

export interface RawModel {
  id: string;
  [k: string]: unknown;
}

export function authHeaders(provider: Provider): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  return headers;
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

/** Hits GET /models. Resolves with the model list or throws a readable error. */
export async function fetchModels(provider: Provider): Promise<RawModel[]> {
  const res = await fetch(joinUrl(provider.baseUrl, '/models'), {
    headers: authHeaders(provider),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data?: RawModel[] };
  return json.data ?? [];
}

/** Connection test used on provider save (PLAN §5). */
export async function testConnection(
  provider: Provider,
): Promise<{ ok: true; modelCount: number } | { ok: false; error: string }> {
  try {
    const models = await fetchModels(provider);
    return { ok: true, modelCount: models.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
