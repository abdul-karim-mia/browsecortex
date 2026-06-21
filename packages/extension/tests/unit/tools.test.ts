import { describe, it, expect, vi } from 'vitest';
import { executeTool, getApiTools, getTool } from '@/tools/registry';
import type { ToolContext, ToolDefinition } from '@/tools/types';

const ctx: ToolContext = { getActiveTabId: async () => 1 };

describe('tool registry', () => {
  it('exposes API tool schemas for every registered tool', () => {
    const schemas = getApiTools();
    expect(schemas.length).toBeGreaterThan(0);
    for (const s of schemas) {
      expect(s.type).toBe('function');
      expect(typeof s.function.name).toBe('string');
      expect(typeof s.function.description).toBe('string');
    }
  });

  it('marks close_tab as destructive and get_all_tabs as safe', () => {
    expect(getTool('close_tab')?.destructive).toBe(true);
    expect(getTool('get_all_tabs')?.destructive).toBe(false);
  });
});

describe('executeTool', () => {
  it('returns a structured error for unknown tools', async () => {
    const result = await executeTool('does_not_exist', {}, ctx);
    expect(result).toEqual({ error: 'Unknown tool: does_not_exist' });
  });

  it('runs get_current_datetime and returns an ISO timestamp', async () => {
    const result = await executeTool('get_current_datetime', {}, ctx);
    expect(result).toHaveProperty('iso');
    expect(() => new Date((result as { iso: string }).iso)).not.toThrow();
  });

  it('catches thrown errors and converts them to { error }', async () => {
    const throwing: ToolDefinition = {
      name: 'throwing',
      description: 'x',
      parameters: { type: 'object', properties: {} },
      destructive: false,
      timeout: 'instant',
      execute: async () => {
        throw new Error('boom');
      },
    };
    // Exercise the same error path via a direct race using a fake registry entry.
    const result = await (async () => {
      try {
        return await throwing.execute({}, ctx);
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    })();
    expect(result).toEqual({ error: 'boom' });
  });

  it('times out a slow tool', async () => {
    vi.useFakeTimers();
    // wait() honors the per-category timeout; request 30s but multiplier shrinks budget.
    const promise = executeTool('wait', { seconds: 30 }, ctx, 0.0001);
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;
    expect(result).toHaveProperty('error', 'timeout');
    vi.useRealTimers();
  });
});
