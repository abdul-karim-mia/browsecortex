/** Global chat context to eliminate prop drilling */

import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { ChatLine } from '../types/chat';

export interface ChatContextValue {
  lines: ChatLine[];
  running: boolean;
  conversationId: string;
  onPin: (messageId: string, pinned: boolean) => void;
  onDelete: (messageId: string) => void;
  onFork: (messageId: string) => void;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChatContext must be used within ChatProvider');
  }
  return ctx;
}
