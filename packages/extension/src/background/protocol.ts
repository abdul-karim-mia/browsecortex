/**
 * Port message protocol between side panel and service worker (PLAN §23).
 * The side panel opens a long-lived port named 'chat'; the worker streams
 * tokens, tool calls, and results back over it.
 */
import type { ToolCall } from '@/types';

/** A user-attached file (PLAN §15). Images carry a data URL; text carries
 * extracted plain text. */
export interface Attachment {
  name: string;
  kind: 'image' | 'text';
  /** data:URL for images. */
  dataUrl?: string;
  /** extracted text for text/CSV/markdown files. */
  text?: string;
}

/** Side panel → worker. */
export type ClientMessage =
  | { type: 'send'; conversationId: string; content: string; attachments?: Attachment[] }
  | { type: 'abort' }
  | { type: 'ask_user_response'; answers: Record<string, unknown> };

/** Worker → side panel. */
export type ServerMessage =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; toolCallId: string; content: string; isError?: boolean }
  | { type: 'ask_user'; questions: unknown }
  | { type: 'done' }
  | { type: 'error'; message: string };

export const PORT_NAME = 'chat';
