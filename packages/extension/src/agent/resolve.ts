/**
 * Resolves the active provider + model from settings for the agent loop,
 * accounting for provider cooldown and fallback routing (PLAN §40).
 *
 * When the selected provider is cooling down, requests route to its configured
 * fallback (if that one is healthy). If there's no usable fallback, resolution
 * fails with a message telling the user how long to wait.
 */
import { Storage } from '@/storage';
import { isCoolingDown, remainingMs } from '@/providers/cooldown';
import type { Model, Provider } from '@/types';

export interface Resolved {
  provider: Provider;
  model: Model;
  /** Set when routing differs from the user's selection (e.g. fallback). */
  note?: string;
}

function synthModel(modelId: string, providerId: string): Model {
  return {
    id: modelId,
    providerId,
    enabled: true,
    hasToolCalling: true,
    hasVision: false,
    hasReasoning: false,
    capabilitySource: 'unknown',
  };
}

async function modelFor(provider: Provider, preferredId: string | null): Promise<Model> {
  const models = await Storage.models.listByProvider(provider.id);
  if (preferredId) {
    const exact = models.find((m) => m.id === preferredId && m.enabled);
    if (exact) return exact;
  }
  const firstEnabled = models.find((m) => m.enabled);
  return firstEnabled ?? synthModel(preferredId ?? models[0]?.id ?? '', provider.id);
}

export async function resolveActive(): Promise<Resolved | { error: string }> {
  const settings = await Storage.settings.get();
  if (!settings.selectedProviderId || !settings.selectedModel) {
    return { error: 'No provider/model selected. Open Settings to configure one.' };
  }

  const provider = await Storage.providers.get(settings.selectedProviderId);
  if (!provider) return { error: 'Selected provider no longer exists. Check settings.' };

  // Healthy primary → use it directly.
  if (!(await isCoolingDown(provider.id))) {
    const stored = (await Storage.models.listByProvider(provider.id)).find(
      (m) => m.id === settings.selectedModel,
    );
    return { provider, model: stored ?? synthModel(settings.selectedModel, provider.id) };
  }

  // Primary is cooling down — try the configured fallback (PLAN §40).
  const seconds = Math.ceil((await remainingMs(provider.id)) / 1000);
  if (provider.fallbackProviderId) {
    const fallback = await Storage.providers.get(provider.fallbackProviderId);
    if (fallback && !(await isCoolingDown(fallback.id))) {
      return {
        provider: fallback,
        model: await modelFor(fallback, settings.selectedModel),
        note: `Using ${fallback.name} — ${provider.name} is rate limited (~${seconds}s).`,
      };
    }
  }

  return {
    error: `${provider.name} is rate limited for ~${seconds}s and no fallback is available. Try again shortly.`,
  };
}
