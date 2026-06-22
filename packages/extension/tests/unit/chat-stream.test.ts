import { describe, it, expect, vi, afterEach } from 'vitest';
import { streamChat } from '@/providers/chat';
import type { Provider, Model } from '@/types';

const provider: Provider = {
  id: 'p',
  name: 'P',
  baseUrl: 'https://example.com/v1',
  apiKey: 'k',
  createdAt: '',
};
const model: Model = { id: 'm', providerId: 'p', enabled: true, capabilitySource: 'unknown' };

/** Build a fake SSE Response from raw `data:` chunk strings. */
function sseResponse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(`data: ${c}\n\n`));
      controller.enqueue(enc.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** One SSE delta chunk carrying a partial tool call. */
function toolDelta(index: number, fn: { name?: string; arguments?: string }, id?: string): string {
  const tc: Record<string, unknown> = { index, function: fn };
  if (id) tc.id = id;
  return JSON.stringify({ choices: [{ delta: { tool_calls: [tc] } }] });
}

async function collect(model_: Model, chunks: string[]) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse(chunks));
  const events = [];
  for await (const ev of streamChat({ provider, model: model_, messages: [] })) events.push(ev);
  return events;
}

afterEach(() => vi.restoreAllMocks());

describe('streamChat tool-call assembly', () => {
  it('does not double the tool name when a provider resends it (H-EXT-1)', async () => {
    // Azure-style: full name repeated in a later chunk, args split across chunks.
    const events = await collect(model, [
      toolDelta(0, { name: 'click_element', arguments: '{"a"' }, 'c1'),
      toolDelta(0, { name: 'click_element', arguments: ':1}' }),
    ]);
    const toolEvent = events.find((e) => e.type === 'tool_calls');
    expect(toolEvent).toBeDefined();
    const call = (toolEvent as { calls: { name: string; arguments: string }[] }).calls[0];
    expect(call.name).toBe('click_element');
    expect(call.arguments).toBe('{"a":1}');
  });

  it('surfaces the finish reason in the done event', async () => {
    const events = await collect(model, [
      JSON.stringify({ choices: [{ delta: { content: 'hi' }, finish_reason: 'content_filter' }] }),
    ]);
    const done = events.find((e) => e.type === 'done');
    expect(done).toEqual({ type: 'done', finishReason: 'content_filter' });
  });
});
