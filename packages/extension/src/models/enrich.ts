/**
 * Model list fetch + enrichment (PLAN §6).
 * Fetches /v1/models for a provider and merges LiteLLM capability data,
 * preserving any user-set overrides on existing model records.
 */
import { fetchModels } from '@/providers/client';
import { Storage } from '@/storage';
import type { Model, Provider } from '@/types';
import { getCatalog, lookup } from './litellm';

/**
 * Sync models for a provider: fetch the list, enrich via LiteLLM, and persist.
 * Existing enabled-state and user-overridden capabilities are preserved.
 */
export async function syncProviderModels(provider: Provider): Promise<Model[]> {
  const [raw, catalog, existing] = await Promise.all([
    fetchModels(provider),
    getCatalog(),
    Storage.models.listByProvider(provider.id),
  ]);
  const prior = new Map(existing.map((m) => [m.id, m]));

  const models: Model[] = raw.map((r) => {
    const before = prior.get(r.id);
    const entry = lookup(catalog, r.id);

    // User-set values always win (PLAN §6 enrichment priority).
    const userOverridden = before?.capabilitySource === 'user';
    if (before && userOverridden) return before;

    return {
      id: r.id,
      providerId: provider.id,
      enabled: before?.enabled ?? true,
      contextWindow: entry?.max_input_tokens,
      maxOutputTokens: entry?.max_output_tokens,
      hasVision: entry?.supports_vision,
      hasToolCalling: entry?.supports_function_calling ?? true,
      hasParallelTools: entry?.supports_parallel_function_calling,
      hasReasoning: entry?.supports_reasoning,
      inputCostPerToken: entry?.input_cost_per_token,
      outputCostPerToken: entry?.output_cost_per_token,
      capabilitySource: entry ? 'litellm' : 'unknown',
    };
  });

  await Storage.models.setForProvider(provider.id, models);
  return models;
}
