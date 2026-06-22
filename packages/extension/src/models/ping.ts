/**
 * On-demand capability ping test (PLAN §6). For models LiteLLM doesn't know
 * (local/custom), probe vision, tool-calling, and streaming with tiny requests.
 * Run only on user request — never in bulk — to avoid burning tokens.
 */
import type { Provider } from '@/types';
import { authHeaders, joinUrl } from '@/providers/client';

// 1x1 transparent PNG.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export interface PingResult {
  hasVision: boolean;
  hasToolCalling: boolean;
  hasToolChoice: boolean;
  hasReasoning: boolean;
  streaming: boolean;
}

async function post(provider: Provider, body: unknown): Promise<Response> {
  return fetch(joinUrl(provider.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: authHeaders(provider),
    body: JSON.stringify(body),
  });
}

async function probeToolCalling(provider: Provider, modelId: string): Promise<boolean> {
  try {
    const res = await post(provider, {
      model: modelId,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Call the ping tool.' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'ping',
            description: 'Returns pong.',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
      tool_choice: 'auto',
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function probeVision(provider: Provider, modelId: string): Promise<boolean> {
  try {
    const res = await post(provider, {
      model: modelId,
      max_tokens: 5,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'ok?' },
            { type: 'image_url', image_url: { url: TINY_PNG } },
          ],
        },
      ],
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function probeStreaming(provider: Provider, modelId: string): Promise<{ streaming: boolean; hasReasoning: boolean }> {
  try {
    const res = await post(provider, {
      model: modelId,
      max_tokens: 15,
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    });
    if (!res.ok || !res.body) {
      return { streaming: false, hasReasoning: false };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const streaming = true;
    let hasReasoning = false;
    let buffer = '';

    // Read a few chunks to detect reasoning tokens
    for (let i = 0; i < 8; i++) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes('reasoning_content') || buffer.includes('"reasoning"')) {
        hasReasoning = true;
        break;
      }
    }
    reader.cancel().catch(() => {});
    return { streaming, hasReasoning };
  } catch {
    return { streaming: false, hasReasoning: false };
  }
}

export async function pingCapabilities(provider: Provider, modelId: string): Promise<PingResult> {
  const [hasToolCalling, hasVision, streamResult] = await Promise.all([
    probeToolCalling(provider, modelId),
    probeVision(provider, modelId),
    probeStreaming(provider, modelId),
  ]);

  return {
    hasVision,
    hasToolCalling,
    hasToolChoice: hasToolCalling, // If tool calling succeeds, tool choice is supported
    hasReasoning: streamResult.hasReasoning,
    streaming: streamResult.streaming,
  };
}
