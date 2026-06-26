/** UI-focused chat types for message rendering and state management */

export type ChatLineRole = 'user' | 'assistant' | 'tool' | 'thinking';

export interface ChatLine {
  role: ChatLineRole;
  content: string;
  streaming?: boolean;
  thinkingMs?: number;
  messageId?: string;
  pinned?: boolean;
  id?: string;
  args?: Record<string, unknown>;
  tool?: { name: string; isError?: boolean };
}

// Block type is now in utils/displayLines.ts with groupLines function

export interface ChatState {
  lines: ChatLine[];
  running: boolean;
  thinking: boolean;
  errored: boolean;
  ask: AskUserPayload | null;
  atBottom: boolean;
}

export interface AskUserPayload {
  [key: string]: {
    type: string;
    question: string;
    options?: Array<{ label: string; value: unknown }>;
  };
}

export interface Attachment {
  name: string;
  kind: 'image' | 'text';
  dataUrl?: string;
  text?: string;
}
