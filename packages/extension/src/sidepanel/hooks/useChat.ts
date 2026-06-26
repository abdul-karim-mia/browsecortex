/** Main chat hook - consolidates chat state and messaging logic */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ServerMessage } from '../types/protocol';
import type { ChatLine, AskUserPayload, Attachment, ChatState } from '../types/chat';
import { usePort } from './usePort';
import { messagesToLines } from '../utils/displayLines';
import { Storage } from '@/storage';

interface UseChatReturn {
  lines: ChatLine[];
  running: boolean;
  thinking: boolean;
  errored: boolean;
  ask: AskUserPayload | null;
  connected: boolean;
  submit: (content: string, attachments: Attachment[]) => void;
  retry: () => void;
  stop: () => void;
  clearChat: () => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  togglePin: (messageId: string, pinned: boolean) => Promise<void>;
  forkFrom: (messageId: string) => Promise<string | null>;
  runStart: number;
  runTokens: number;
}

export function useChat(conversationId: string): UseChatReturn {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [running, setRunning] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [errored, setErrored] = useState(false);
  const [ask, setAsk] = useState<AskUserPayload | null>(null);
  const [runStart, setRunStart] = useState(0);
  const [runTokens, setRunTokens] = useState(0);

  const openRef = useRef(false);
  const openThinkingRef = useRef(false);
  const submittedRef = useRef(false);
  const lastSubmitRef = useRef<{ content: string; attachments: Attachment[] } | null>(null);

  // Load conversation history on mount or when conversationId changes
  useEffect(() => {
    Storage.messages.byConversation(conversationId).then((msgs) => setLines(messagesToLines(msgs)));
  }, [conversationId]);

  // Close streaming caret on assistant line
  const closeAssistantStream = () => {
    setLines((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role !== 'assistant' || !last.streaming) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...last, streaming: false };
      return next;
    });
  };

  // Close thinking line if still open
  const closeThinkingLine = () => {
    if (!openThinkingRef.current) return;
    openThinkingRef.current = false;
    setLines((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'thinking') next[next.length - 1] = { ...last, streaming: false };
      return next;
    });
  };

  // Handle incoming server messages
  const onServerMessage = (msg: ServerMessage) => {
    if (msg.type === 'reasoning') {
      setThinking(false);
      setRunTokens((n) => n + Math.ceil(msg.content.length / 4));
      setLines((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (openThinkingRef.current && last?.role === 'thinking') {
          next[next.length - 1] = { ...last, content: last.content + msg.content };
        } else {
          next.push({ role: 'thinking', content: msg.content, streaming: true });
          openThinkingRef.current = true;
        }
        return next;
      });
    } else if (msg.type === 'reasoning_done') {
      openThinkingRef.current = false;
      setLines((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'thinking')
          next[next.length - 1] = { ...last, streaming: false, thinkingMs: msg.ms };
        return next;
      });
    } else if (msg.type === 'token') {
      setThinking(false);
      setRunTokens((n) => n + Math.ceil(msg.content.length / 4));
      closeThinkingLine();
      setLines((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (openRef.current && last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: last.content + msg.content, streaming: true };
        } else {
          next.push({ role: 'assistant', content: msg.content, streaming: true });
          openRef.current = true;
        }
        return next;
      });
    } else if (msg.type === 'tool_call') {
      openRef.current = false;
      closeAssistantStream();
      setThinking(false);
      closeThinkingLine();
      setLines((prev) => [
        ...prev,
        {
          role: 'tool',
          content: '…',
          id: msg.call.id,
          args: msg.call.arguments,
          tool: { name: msg.call.name },
        },
      ]);
    } else if (msg.type === 'tool_result') {
      setLines((prev) => {
        const next = [...prev];
        const i = next.findIndex((l) => l.role === 'tool' && l.id === msg.toolCallId);
        if (i >= 0) {
          next[i] = {
            ...next[i],
            content: msg.content,
            tool: { ...next[i].tool!, isError: msg.isError },
          };
        }
        return next;
      });
      setThinking(true);
    } else if (msg.type === 'ask_user') {
      openRef.current = false;
      closeAssistantStream();
      setThinking(false);
      closeThinkingLine();
      setAsk(msg.questions as AskUserPayload);
    } else if (msg.type === 'done') {
      setRunning(false);
      setThinking(false);
      openRef.current = false;
      closeAssistantStream();
      closeThinkingLine();
      submittedRef.current = false;
      // Reload from storage to get persisted messages with IDs
      Storage.messages.byConversation(conversationId).then((m) => {
        if (!m.length || submittedRef.current) return;
        setLines(messagesToLines(m));
      });
    } else if (msg.type === 'error') {
      setRunning(false);
      setThinking(false);
      setErrored(true);
      openRef.current = false;
      closeAssistantStream();
      closeThinkingLine();
      if (msg.message === 'An agent is already running. Stop it first.') {
        send({ type: 'abort' });
      }
      setLines((prev) => [...prev, { role: 'assistant', content: `⚠️ ${msg.message}` }]);
    }
  };

  const { send, connected } = usePort(onServerMessage);

  const submit = (content: string, attachments: Attachment[]) => {
    const trimmed = content.trim();
    if ((!trimmed && attachments.length === 0) || running) return;
    if (!connected) {
      setLines((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ Not connected to background. Try closing and reopening the panel.',
        },
      ]);
      return;
    }

    const displayed = attachments.length
      ? `${trimmed}\n📎 ${attachments.map((a) => a.name).join(', ')}`
      : trimmed;

    lastSubmitRef.current = { content: trimmed, attachments };
    setErrored(false);
    setRunning(true);
    setThinking(true);
    setRunStart(Date.now());
    setRunTokens(0);
    openRef.current = false;
    submittedRef.current = true;
    setLines((prev) => [...prev, { role: 'user', content: displayed }]);
    send({
      type: 'send',
      conversationId,
      content: trimmed,
      attachments: attachments.length ? attachments : undefined,
    });
  };

  const retry = () => {
    const last = lastSubmitRef.current;
    if (!last || running) return;
    setErrored(false);
    setRunning(true);
    setThinking(true);
    setRunStart(Date.now());
    setRunTokens(0);
    openRef.current = false;
    submittedRef.current = true;
    send({
      type: 'send',
      conversationId,
      content: last.content,
      attachments: last.attachments.length ? last.attachments : undefined,
    });
  };

  const stop = () => {
    send({ type: 'abort' });
    setRunning(false);
    setThinking(false);
  };

  const reloadFromStore = async () => {
    const m = await Storage.messages.byConversation(conversationId);
    setLines(messagesToLines(m));
  };

  const togglePin = async (messageId: string, pinned: boolean) => {
    const msgs = await Storage.messages.byConversation(conversationId);
    const target = msgs.find((m) => m.id === messageId);
    if (!target) return;
    if (pinned && msgs.filter((m) => m.pinned).length >= 10) return;
    await Storage.messages.save({ ...target, pinned });
    await reloadFromStore();
  };

  const deleteMessage = async (messageId: string) => {
    await Storage.messages.remove(messageId);
    await reloadFromStore();
  };

  const clearChat = async () => {
    if (running || lines.length === 0) return;
    if (!confirm('Clear all messages in this conversation?')) return;
    const msgs = await Storage.messages.byConversation(conversationId);
    await Promise.all(msgs.map((m) => Storage.messages.remove(m.id)));
    setLines([]);
    openRef.current = false;
  };

  const forkFrom = async (messageId: string) => {
    if (running) return null;
    const { forkConversation } = await import('@/conversations/manager');
    const newId = await forkConversation(conversationId, messageId);
    return newId;
  };

  return {
    lines,
    running,
    thinking,
    errored,
    ask,
    connected,
    submit,
    retry,
    stop,
    clearChat,
    deleteMessage,
    togglePin,
    forkFrom,
    runStart,
    runTokens,
  };
}
