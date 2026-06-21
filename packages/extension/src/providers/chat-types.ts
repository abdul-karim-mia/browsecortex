/**
 * OpenAI-compatible chat completion wire types (PLAN §9).
 * These mirror the request/response shape sent to the provider, distinct from
 * BrowseCortex's internal Message type (which is UI/storage oriented).
 */

export interface ApiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** Multimodal content part for vision-capable models (PLAN §15, §17). */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type ApiMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ApiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ApiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatRequest {
  model: string;
  messages: ApiMessage[];
  tools?: ApiToolDefinition[];
  tool_choice?: 'auto' | 'none';
  stream?: boolean;
  /** Standard models. Omitted for reasoning models (PLAN §6). */
  max_tokens?: number;
  /** Reasoning models use this instead of max_tokens (PLAN §6). */
  max_completion_tokens?: number;
  temperature?: number;
}

/** Partial tool call accumulated across stream deltas. */
export interface StreamingToolCall {
  index: number;
  id: string;
  name: string;
  arguments: string;
}

/** Events emitted by the streaming chat call as the response arrives. */
export type ChatStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool_calls'; calls: StreamingToolCall[] }
  | { type: 'done'; finishReason: string | null };
