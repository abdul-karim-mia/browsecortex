/**
 * Vision fallback (PLAN §17). Resolves a vision-capable target — the configured
 * fallback provider/model, or the active model if it already has vision — and
 * runs a multimodal completion to describe an image. Used by the analyze_image
 * tool so a text-only main model can still "see".
 */
import { Storage } from '@/storage';
import { authHeaders, joinUrl } from '@/providers/client';
import type { Model, Provider } from '@/types';

interface VisionTarget {
  provider: Provider;
  model: string;
}

export async function resolveVisionTarget(): Promise<VisionTarget | { error: string }> {
  const settings = await Storage.settings.get();

  // Explicit fallback provider/model configured.
  if (
    settings.visionFallbackMode === 'provider' &&
    settings.visionFallbackProviderId &&
    settings.visionFallbackModel
  ) {
    const provider = await Storage.providers.get(settings.visionFallbackProviderId);
    if (!provider) return { error: 'Configured vision fallback provider no longer exists.' };
    return { provider, model: settings.visionFallbackModel };
  }

  // Otherwise, the active model itself if it supports vision.
  if (settings.selectedProviderId && settings.selectedModel) {
    const provider = await Storage.providers.get(settings.selectedProviderId);
    const model: Model | undefined = (
      await Storage.models.listByProvider(settings.selectedProviderId)
    ).find((m) => m.id === settings.selectedModel);
    if (provider && model?.hasVision) return { provider, model: model.id };
  }

  return {
    error:
      'No vision-capable model available. Enable vision fallback in Settings → General and pick a vision model.',
  };
}

/** Non-streaming multimodal completion: describe an image given a prompt. */
export async function analyzeImage(prompt: string, imageDataUrl: string): Promise<string> {
  const target = await resolveVisionTarget();
  if ('error' in target) throw new Error(target.error);

  const body = {
    model: target.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    stream: false,
  };

  const res = await fetch(joinUrl(target.provider.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: authHeaders(target.provider),
    body: JSON.stringify(body),
    // Don't let a slow vision provider block the agent loop forever (M-EXT-8).
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Vision call failed: ${res.status} ${res.statusText}`);

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? '';
}
