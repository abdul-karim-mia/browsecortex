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

export interface Question {
  id?: string;
  type?: 'text' | 'single_select' | 'multi_select' | 'confirm';
  question: string;
  placeholder?: string;
  options?: string[];
  allow_custom?: boolean;
  required?: boolean;
}

export interface AskUserPayload {
  message?: string;
  questions: Question[];
}

export interface Attachment {
  name: string;
  kind: 'image' | 'text';
  dataUrl?: string;
  text?: string;
}
