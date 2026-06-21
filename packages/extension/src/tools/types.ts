/**
 * Tool framework types (PLAN §11, §45).
 *
 * A ToolDefinition couples the AI-facing schema (name/description/parameters)
 * with an execute function and metadata the agent loop needs: whether it is
 * destructive (PLAN §34) and which timeout bucket it falls in (PLAN §45).
 */
import type { ApiToolDefinition } from '@/providers/chat-types';

export type TimeoutCategory =
  | 'tab'
  | 'page_read'
  | 'page_interact'
  | 'navigation'
  | 'network_idle'
  | 'file'
  | 'history'
  | 'mcp'
  | 'instant';

/** Default per-category timeouts in ms (PLAN §45). Scaled by user multiplier. */
export const TIMEOUTS: Record<TimeoutCategory, number> = {
  tab: 5_000,
  page_read: 10_000,
  page_interact: 8_000,
  navigation: 15_000,
  network_idle: 10_000,
  file: 10_000,
  history: 5_000,
  mcp: 30_000,
  instant: 5_000,
};

export interface ToolContext {
  /** Resolves the tab the agent is acting on (active tab unless specified). */
  getActiveTabId(): Promise<number>;
  /** The conversation this run belongs to — used by memory/task tools. */
  conversationId?: string;
  /** Asks the user questions inline and resolves with their answers (PLAN §18). */
  askUser?(questions: unknown): Promise<Record<string, unknown>>;
}

export type ToolResult = Record<string, unknown> | { error: string };

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  destructive: boolean;
  timeout: TimeoutCategory;
  /** Reads untrusted external content → triggers injection guard (PLAN §28). */
  readsExternal?: boolean;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

/** Convert a ToolDefinition to the wire schema sent to the provider. */
export function toApiTool(def: ToolDefinition): ApiToolDefinition {
  return {
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    },
  };
}
