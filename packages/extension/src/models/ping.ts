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
  streaming: boolean;
}

async function post(provider: Provider, body: unknown): Promise<Response> {
  return fetch(joinUrl(provider.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: authHeaders(provider),
    body: JSON.stringify(body),
  });
}

export async function pingCapabilities(provider: Provider, modelId: string): Promise<PingResult> {
  // Tool calling — send a trivial tool and a prompt that should invoke it.
  let hasToolCalling = false;
  try {
    const res = await post(provider, {
      model: modelId,
      max_tokens: 20,
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
    hasToolCalling = res.ok;
  } catch {
    /* leave false */
  }

  // Vision — send a tiny image; success (non-4xx) implies acceptance.
  let hasVision = false;
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
    hasVision = res.ok;
  } catch {
    /* leave false */
  }

  // Streaming — verify a stream response opens.
  let streaming = false;
  try {
    const res = await post(provider, {
      model: modelId,
      max_tokens: 5,
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    });
    streaming = res.ok && !!res.body;
    res.body?.cancel().catch(() => {});
  } catch {
    /* leave false */
  }

  return { hasVision, hasToolCalling, streaming };
}
