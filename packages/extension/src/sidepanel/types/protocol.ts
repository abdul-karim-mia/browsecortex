/** Port communication protocol types between UI and background */

import type { Attachment } from './chat';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ClientMessage =
  | {
      type: 'send';
      conversationId: string;
      content: string;
      attachments?: Attachment[];
    }
  | { type: 'abort' }
  | { type: 'ask_user_response'; answers: Record<string, unknown> };

export type ServerMessage =
  | { type: 'token'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'reasoning_done'; ms: number }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; toolCallId: string; content: string; isError?: boolean }
  | { type: 'ask_user'; questions: Record<string, unknown> }
  | { type: 'done' }
  | { type: 'error'; message: string };
