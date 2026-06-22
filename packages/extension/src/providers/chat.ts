/**
 * Streaming chat completion call (PLAN §9, §23, §30).
 *
 * Posts an OpenAI-compatible /chat/completions request with stream: true and
 * yields parsed events as the SSE response arrives. Tool-call deltas are
 * accumulated across chunks (providers split arguments arbitrarily).
 *
 * The caller passes an AbortSignal wired to the Stop button (PLAN §10).
 */
import type { Provider, Model } from '@/types';
import { authHeaders, joinUrl } from './client';
import type {
  ApiMessage,
  ApiToolDefinition,
  ChatRequest,
  ChatStreamEvent,
  StreamingToolCall,
} from './chat-types';

export class ChatHttpError extends Error {
  constructor(
    public status: number,
    public retryAfter: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'ChatHttpError';
  }
}

interface ChatOptions {
  provider: Provider;
  model: Model;
  messages: ApiMessage[];
  tools?: ApiToolDefinition[];
  signal?: AbortSignal;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

function buildRequest(opts: ChatOptions): ChatRequest {
  const { model, messages, tools, reasoningEffort } = opts;
  const req: ChatRequest = {
    model: model.id,
    messages,
    stream: true,
  };
  if (tools && tools.length > 0) {
    req.tools = tools;
    req.tool_choice = 'auto';
  }
  // Reasoning models swap parameter names and omit temperature (PLAN §6).
  if (model.hasReasoning) {
    if (model.maxOutputTokens) req.max_completion_tokens = model.maxOutputTokens;
    if (reasoningEffort) req.reasoning_effort = reasoningEffort;
  } else {
    if (model.maxOutputTokens) req.max_tokens = model.maxOutputTokens;
    req.temperature = 0.7;
  }
  return req;
}

interface DeltaChunk {
  choices?: {
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason?: string | null;
  }[];
}

/**
 * Drives one streaming completion. Returns an async generator of events.
 * Tool calls are emitted once, at the end, fully assembled.
 */
export async function* streamChat(opts: ChatOptions): AsyncGenerator<ChatStreamEvent> {
  const url = joinUrl(opts.provider.baseUrl, '/chat/completions');
  console.log(
    '[chat:http] POST',
    url,
    'model:',
    opts.model.id,
    'messages:',
    opts.messages.length,
    'tools:',
    opts.tools?.length ?? 0,
  );
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(opts.provider),
      body: JSON.stringify(buildRequest(opts)),
      signal: opts.signal,
    });
  } catch (e) {
    console.error('[chat:http] fetch threw (network error / CORS / offline?)', e);
    throw e;
  }
  console.log('[chat:http] response status', res.status, res.statusText);

  if (!res.ok) {
    const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
    const body = await res.text().catch(() => '');
    console.error('[chat:http] non-OK response', res.status, body);
    throw new ChatHttpError(res.status, retryAfter, body || `${res.status} ${res.statusText}`);
  }
  if (!res.body) {
    console.error('[chat:http] response had no body');
    throw new Error('No response body from provider.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = new Map<number, StreamingToolCall>();
  let finishReason: string | null = null;
  let buffer = '';

  let chunkCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log(
        `[chat:http] stream done after ${chunkCount} chunks, finishReason=${finishReason}`,
      );
      break;
    }
    chunkCount++;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;

      let chunk: DeltaChunk;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue; // skip malformed lines
      }

      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (!delta) continue;

      if (delta.content) yield { type: 'token', content: delta.content };
      const reasoning = delta.reasoning_content ?? delta.reasoning;
      if (reasoning) yield { type: 'reasoning', content: reasoning };

      for (const tc of delta.tool_calls ?? []) {
        const existing = toolCalls.get(tc.index) ?? {
          index: tc.index,
          id: '',
          name: '',
          arguments: '',
        };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.name += tc.function.name;
        if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        toolCalls.set(tc.index, existing);
      }
    }
  }

  if (toolCalls.size > 0) {
    yield {
      type: 'tool_calls',
      calls: [...toolCalls.values()].sort((a, b) => a.index - b.index),
    };
  }
  yield { type: 'done', finishReason };
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : null;
}
