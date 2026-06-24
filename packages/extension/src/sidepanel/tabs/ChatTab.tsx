import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '@/i18n';
import { usePort } from '../usePort';
import type { ServerMessage } from '@/background/protocol';
import { Storage } from '@/storage';
import { messagesToLines, type ChatLine } from '../displayLines';
import { AskUserWidget, type AskUserPayload } from '../AskUserWidget';
import { MessageBubble } from '../MessageBubble';
import { WorkingBlock } from '../WorkingBlock';
import { RunStatusBar } from '../RunStatusBar';
import { Icon } from '@/components/Icon';
import type { Attachment } from '@/background/protocol';
import type { Settings } from '@/types';
import { ModelPickerPopup } from '../ModelPickerPopup';
import { ModePickerPopup } from '../ModePickerPopup';
import { forkConversation } from '@/conversations/manager';

type Block = { kind: 'working'; lines: ChatLine[] } | { kind: 'message'; line: ChatLine };

/** Group consecutive tool/thinking lines into one "working" block (PLAN §7),
 * so reasoning and tool calls before the final reply render as a single
 * collapsible section instead of separate disjoint boxes. */
function groupLines(lines: ChatLine[]): Block[] {
  const blocks: Block[] = [];
  for (const line of lines) {
    if (line.role === 'tool' || line.role === 'thinking') {
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'working') last.lines.push(line);
      else blocks.push({ kind: 'working', lines: [line] });
    } else {
      blocks.push({ kind: 'message', line });
    }
  }
  return blocks;
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function readFileAsAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isImage = IMAGE_TYPES.includes(file.type);
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.onload = () =>
      resolve(
        isImage
          ? { name: file.name, kind: 'image', dataUrl: reader.result as string }
          : { name: file.name, kind: 'text', text: (reader.result as string).slice(0, 100_000) },
      );
    if (isImage) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

const EXAMPLE_PROMPTS = [
  "Summarize the page I'm on",
  'Open Hacker News in a new tab',
  'List all my open tabs',
];

/** Chat actions surfaced in the app header (clear/new live there now). */
export interface ChatControls {
  clearChat: () => void;
  canClear: boolean;
  running: boolean;
}

interface Props {
  /** The conversation this chat is bound to (owned by App). */
  conversationId: string;
  /** Lets the App header render this tab's clear/new controls (PLAN §7). */
  registerControls?: (controls: ChatControls | null) => void;
  /** Switch the app to a newly-forked conversation (B8). */
  onForked?: (newConversationId: string) => void;
}

export function ChatTab({ conversationId, registerControls, onForked }: Props) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  /** True while waiting on the provider with nothing visible yet (no tokens, no tool row). */
  const [thinking, setThinking] = useState(false);
  /** Wall-clock start of the current run (ms epoch) for the status bar's total timer. */
  const [runStart, setRunStart] = useState(0);
  /** Estimated output tokens produced in the current run (status bar). */
  const [runTokens, setRunTokens] = useState(0);
  const [ask, setAsk] = useState<AskUserPayload | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [contextWindow, setContextWindow] = useState<number | null>(null);
  /** Cumulative estimated tokens spent in this conversation (B2). */
  const [convTokens, setConvTokens] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [modelSupportsThinking, setModelSupportsThinking] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);
  const [listening, setListening] = useState(false);
  /** Whether the last run ended in an error (drives the Retry affordance). */
  const [errored, setErrored] = useState(false);
  /** Whether the message list is scrolled to (near) the bottom — gates auto-scroll. */
  const [atBottom, setAtBottom] = useState(true);
  /** True while a file is being dragged over the input (drag-drop attachments). */
  const [dragOver, setDragOver] = useState(false);
  /** Last submitted payload, replayed by the Retry button after an error. */
  const lastSubmitRef = useRef<{ content: string; attachments: Attachment[] } | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Whether the trailing assistant line is still receiving tokens. */
  const openRef = useRef(false);
  /** Whether the trailing thinking line is still receiving reasoning tokens. */
  const openThinkingRef = useRef(false);
  /** Tracks if a new send was issued during the 'done' storage reload (avoids race). */
  const submittedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the selected model's context window for the usage meter (PLAN §31).
  // Re-runs whenever settings change elsewhere (e.g. model switched in the
  // Settings tab while this chat is open) so the meter stays in sync.
  useEffect(() => {
    const loadContextWindow = async () => {
      const s = await Storage.settings.get();
      setSettings(s);
      if (!s.selectedProviderId || !s.selectedModel) {
        setContextWindow(null);
        setModelSupportsThinking(false);
        return;
      }
      const m = (await Storage.models.listByProvider(s.selectedProviderId)).find(
        (x) => x.id === s.selectedModel,
      );
      setContextWindow(m?.contextWindow ?? null);
      setModelSupportsThinking(!!m?.hasReasoning);
    };
    loadContextWindow();
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.settings) loadContextWindow();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [conversationId]);

  // Rough token estimate (~4 chars/token) of the visible conversation.
  const usedTokens = Math.ceil(lines.reduce((n, l) => n + l.content.length, 0) / 4);
  const ctxPercent = contextWindow ? (usedTokens / contextWindow) * 100 : 0;

  // Load this conversation's history (component is keyed by id, so this runs
  // whenever the selected conversation changes) (PLAN §8, §26).
  useEffect(() => {
    Storage.messages.byConversation(conversationId).then((msgs) => setLines(messagesToLines(msgs)));
  }, [conversationId]);

  // Load the conversation's cumulative token count (B2), refreshed after runs.
  const loadConvTokens = () =>
    Storage.conversations.get(conversationId).then((c) => setConvTokens(c?.tokensUsed ?? 0));
  useEffect(() => {
    loadConvTokens();
  }, [conversationId]);

  // Right-click "Send to BrowseCortex" → prefill the input (B4). Consume any
  // text stashed before the panel opened, then listen for live broadcasts.
  useEffect(() => {
    const appendSelection = (text: string) =>
      setInput((prev) => (prev ? `${prev}\n${text}` : text));
    chrome.storage?.session
      ?.get('pending_context_selection')
      .then((res) => {
        const text = res?.pending_context_selection;
        if (typeof text === 'string' && text) {
          appendSelection(text);
          chrome.storage.session.remove('pending_context_selection').catch(() => {});
        }
      })
      .catch(() => {});
    const onMsg = (msg: { type?: string; text?: string }) => {
      if (msg?.type === 'context_selection' && msg.text) appendSelection(msg.text);
    };
    chrome.runtime?.onMessage?.addListener(onMsg);
    return () => chrome.runtime?.onMessage?.removeListener(onMsg);
  }, []);

  // Auto-scroll to the newest content as it streams in — but only when the user
  // is already near the bottom, so scrolling up to read history isn't yanked
  // back down mid-stream (§1b).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [lines, ask, thinking, atBottom]);

  const SCROLL_BOTTOM_THRESHOLD = 80;
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distance <= SCROLL_BOTTOM_THRESHOLD);
  };
  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAtBottom(true);
  };

  // Auto-grow the input as the user types, up to a max height then scroll (§5a).
  const MAX_TEXTAREA_PX = 160;
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [input]);

  // Drag-and-drop file attachments onto the input area (§5b).
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

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
      // Authoritative per-block duration from the loop — same value we persist,
      // so the number never changes when the run completes.
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
        // Match the result to its tool row by call id (handles parallel calls).
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
      // The model needs another round-trip after this result lands — show the
      // waiting indicator again until its next token or tool call arrives.
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
      loadConvTokens();
      // Reload from storage so persisted messages carry ids (enables pin/delete).
      // Reasoning is now persisted too (mappers + messagesToLines), so the
      // reload faithfully reconstructs every thinking block in order — no fragile
      // merge with the live view needed (B-thinking).
      // Guard with submittedRef so a quick second submit doesn't get overwritten.
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
      // The background's abortController can get stuck non-null (e.g. the
      // service worker died mid-run) with no UI affordance to recover, since
      // this panel's own `running` is false so the Stop button never shows.
      // Self-heal by aborting on the background's behalf so the next send works.
      if (msg.message === 'An agent is already running. Stop it first.') {
        send({ type: 'abort' });
      }
      setLines((prev) => [...prev, { role: 'assistant', content: `⚠️ ${msg.message}` }]);
    }
  };

  /** Clears the streaming caret on the trailing assistant line once it's done. */
  const closeAssistantStream = () => {
    setLines((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role !== 'assistant' || !last.streaming) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...last, streaming: false };
      return next;
    });
  };

  /** Marks the trailing thinking line as finished, if one is still open. The
   * duration is set authoritatively by the `reasoning_done` event, not here. */
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

  const { send, connected } = usePort(onServerMessage);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const read = await Promise.all(Array.from(files).map(readFileAsAttachment));
    setAttachments((prev) => [...prev, ...read].slice(0, 10));
  };

  const reportDictationError = (message: string) =>
    setLines((prev) => [...prev, { role: 'assistant', content: `⚠️ ${message}` }]);

  /**
   * Chrome auto-dismisses the getUserMedia prompt inside side panels/popups,
   * so a direct request there fails even on a fresh profile. Falling back to
   * a real tab lets the prompt show; the granted permission is per-origin so
   * the side panel can use the mic afterward too.
   */
  const ensureMicPermission = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      // fall through to the tab-based prompt
    }
    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL('src/mic-permission/index.html'),
    });
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        resolve(false);
      }, 30_000);
      function listener(msg: unknown, sender: chrome.runtime.MessageSender) {
        const result = msg as { type?: string; granted?: boolean } | null;
        if (result?.type === 'mic_permission_result' && sender.tab?.id === tab.id) {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(listener);
          resolve(!!result.granted);
        }
      }
      chrome.runtime.onMessage.addListener(listener);
    });
  };

  const SILENCE_TIMEOUT_MS = 4000;

  /** Replace spoken punctuation words and capitalize sentence starts. */
  const punctuate = (raw: string): string => {
    let text = raw
      .replace(/\s*\bcomma\b\s*/gi, ', ')
      .replace(/\s*\b(full stop|period)\b\s*/gi, '. ')
      .replace(/\s*\bquestion mark\b\s*/gi, '? ')
      .replace(/\s*\bexclamation (mark|point)\b\s*/gi, '! ')
      .replace(/\s*\bnew line\b\s*/gi, '\n')
      .replace(/\s+([.,?!])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
    text = text.replace(/(^\s*\w|[.!?]\s+\w)/g, (m) => m.toUpperCase());
    return text;
  };

  const toggleDictation = async () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      reportDictationError('Voice input is not supported in this browser.');
      return;
    }
    const granted = await ensureMicPermission();
    if (!granted) {
      reportDictationError('Microphone access was not granted.');
      return;
    }
    const recognition: SpeechRecognition = new SpeechRecognitionCtor();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    const baseInput = input;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    // recognition.stop() is async — results already buffered keep firing
    // onresult afterward, and "send" stays at the end of the transcript
    // across several of those events. Guard so submit() fires only once.
    let sendTriggered = false;
    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => recognition.stop(), SILENCE_TIMEOUT_MS);
    };
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      if (sendTriggered) return;
      resetSilenceTimer();
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript + ' ';
      const formatted = punctuate(transcript);
      const sendRequested = /\bsend\b[.!]?$/i.test(formatted);
      const finalText = sendRequested ? formatted.replace(/\bsend\b[.!]?$/i, '').trim() : formatted;
      const combined = (baseInput ? `${baseInput} ` : '') + finalText;
      setInput(combined);
      if (sendRequested) {
        sendTriggered = true;
        recognition.stop();
        if (silenceTimer) clearTimeout(silenceTimer);
        submit(combined);
      }
    };
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setListening(false);
      if (silenceTimer) clearTimeout(silenceTimer);
      reportDictationError(`Voice input error: ${e.error || 'unknown error'}`);
    };
    recognition.onend = () => {
      setListening(false);
      if (silenceTimer) clearTimeout(silenceTimer);
    };
    recognitionRef.current = recognition;
    setListening(true);
    resetSilenceTimer();
    recognition.start();
  };

  const submit = (override?: string) => {
    const content = (override ?? input).trim();
    if ((!content && attachments.length === 0) || running) return;
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
    const atts = attachments;
    const displayed = atts.length
      ? `${content}\n📎 ${atts.map((a) => a.name).join(', ')}`
      : content;
    lastSubmitRef.current = { content, attachments: atts };
    setInput('');
    setAttachments([]);
    setErrored(false);
    setRunning(true);
    setThinking(true);
    setAtBottom(true);
    setRunStart(Date.now());
    setRunTokens(0);
    openRef.current = false;
    submittedRef.current = true;
    setLines((prev) => [...prev, { role: 'user', content: displayed }]);
    send({ type: 'send', conversationId, content, attachments: atts.length ? atts : undefined });
  };

  /** Re-send the last payload after an error (§1c). */
  const retry = () => {
    const last = lastSubmitRef.current;
    if (!last || running) return;
    setErrored(false);
    setRunning(true);
    setThinking(true);
    setAtBottom(true);
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

  const agentMode = settings?.agentMode ?? 'bypass';
  const modeLabel = agentMode === 'bypass' ? 'Bypass' : agentMode === 'auto' ? 'Auto' : 'Ask';
  // Colour cue: ask = green (safe), auto = blue, bypass = amber (prompts off).
  const modePillClass =
    agentMode === 'bypass'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
      : agentMode === 'auto'
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
        : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400';

  const reloadFromStore = async () => {
    const m = await Storage.messages.byConversation(conversationId);
    setLines(messagesToLines(m));
  };

  const togglePin = async (messageId: string, pinned: boolean) => {
    const msgs = await Storage.messages.byConversation(conversationId);
    const target = msgs.find((m) => m.id === messageId);
    if (!target) return;
    // Cap at 10 pinned per conversation (PLAN §7).
    if (pinned && msgs.filter((m) => m.pinned).length >= 10) return;
    await Storage.messages.save({ ...target, pinned });
    await reloadFromStore();
  };

  const deleteMessage = async (messageId: string) => {
    await Storage.messages.remove(messageId);
    await reloadFromStore();
  };

  const forkFrom = async (messageId: string) => {
    if (running) return;
    const newId = await forkConversation(conversationId, messageId);
    if (newId) onForked?.(newId);
  };

  const clearChat = async () => {
    if (running || lines.length === 0) return;
    if (!confirm('Clear all messages in this conversation?')) return;
    const msgs = await Storage.messages.byConversation(conversationId);
    await Promise.all(msgs.map((m) => Storage.messages.remove(m.id)));
    setLines([]);
    openRef.current = false;
  };

  const submitAnswers = (answers: Record<string, unknown>) => {
    setAsk(null);
    setLines((prev) => [...prev, { role: 'user', content: `↳ ${JSON.stringify(answers)}` }]);
    send({ type: 'ask_user_response', answers });
  };

  // Surface clear/new state to the App header. Re-register whenever the inputs
  // to clearChat change so the header always holds a fresh closure; deregister
  // on unmount so stale handlers don't linger.
  useEffect(() => {
    registerControls?.({ clearChat, canClear: lines.length > 0, running });
  }, [lines.length, running, conversationId]);
  useEffect(() => () => registerControls?.(null), [registerControls]);

  // Derive the live phase shown in the run-status bar from the current state.
  const runningToolLine = running
    ? [...lines].reverse().find((l) => l.role === 'tool' && l.content === '…')
    : undefined;
  const lastLine = lines[lines.length - 1];
  const runPhase: { label: string; detail?: string } = runningToolLine
    ? { label: 'Working', detail: `Running ${runningToolLine.tool?.name ?? 'tool'}` }
    : lastLine?.role === 'thinking' && lastLine.streaming
      ? { label: 'Thinking' }
      : lastLine?.role === 'assistant' && lastLine.streaming
        ? { label: 'Responding' }
        : thinking
          ? { label: 'Thinking more', detail: 'Reasoning about the next step…' }
          : { label: 'Working' };

  return (
    <div class="flex h-full flex-col">
      {/* Context + token meter. The context readout shows a % when the model's
       * window is known, otherwise the raw in-context token estimate — so it
       * still appears for models with no catalogued context window. */}
      {(contextWindow || usedTokens > 0 || convTokens > 0) && (
        <div class="flex items-center gap-2 px-2 py-1">
          {contextWindow ? (
            <span
              class={`text-xs ${ctxPercent >= 80 ? 'text-amber-600' : 'text-gray-400'}`}
              title={`~${usedTokens.toLocaleString()} / ${contextWindow.toLocaleString()} tokens`}
            >
              {ctxPercent < 1 ? 'context: empty' : `context ${ctxPercent.toFixed(0)}%`}
            </span>
          ) : usedTokens > 0 ? (
            <span class="text-xs text-gray-400" title={`~${usedTokens.toLocaleString()} tokens in context`}>
              context ~{usedTokens >= 1000 ? `${(usedTokens / 1000).toFixed(1)}k` : usedTokens}
            </span>
          ) : null}
          {convTokens > 0 && (
            <span class="text-xs text-gray-400" title="Estimated tokens used in this conversation">
              {contextWindow || usedTokens > 0 ? '· ' : ''}
              {convTokens >= 1000 ? `${(convTokens / 1000).toFixed(1)}k` : convTokens} tokens used
            </span>
          )}
        </div>
      )}
      {ctxPercent >= 80 && (
        <div class="bg-amber-100 px-3 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Context window {ctxPercent.toFixed(0)}% full — older turns will be compacted
          automatically.
        </div>
      )}

      {/* Messages */}
      <div class="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-label="Conversation"
        aria-busy={running}
        class="h-full space-y-3 overflow-y-auto p-3"
      >
        {lines.length === 0 && (
          <div class="mt-8 text-center text-sm text-gray-400">
            {connected ? (
              <>
                <p class="mb-3">{t('type_a_message')}</p>
                <div class="flex flex-col items-center gap-1.5">
                  {EXAMPLE_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setInput(p)}
                      class="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              t('no_provider')
            )}
          </div>
        )}
        {groupLines(lines).map((block, i) =>
          block.kind === 'working' ? (
            <WorkingBlock key={`g${i}`} items={block.lines} />
          ) : (
            <MessageBubble
              key={block.line.messageId ?? `m${i}`}
              line={block.line}
              onPin={togglePin}
              onDelete={deleteMessage}
              onFork={forkFrom}
            />
          ),
        )}
        {errored && !running && lastSubmitRef.current && (
          <button
            type="button"
            onClick={retry}
            class="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Icon name="refresh" size={13} /> Retry last message
          </button>
        )}
        {ask && <AskUserWidget payload={ask} onSubmit={submitAnswers} />}
      </div>
        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to latest"
            title="Scroll to latest"
            class="absolute bottom-3 right-3 flex items-center justify-center rounded-full border border-gray-200 bg-white p-2 text-gray-600 shadow-md hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Icon name="chevron-down" size={16} />
          </button>
        )}
      </div>

      {/* Persistent run-status bar — phase, total time, output tokens (§run). */}
      {running && (
        <RunStatusBar
          phase={runPhase.label}
          detail={runPhase.detail}
          startMs={runStart}
          outputTokens={runTokens}
        />
      )}

      {/* Input */}
      <div class="border-t border-gray-200 p-2 dark:border-gray-700">
        {attachments.length > 0 && (
          <div class="mb-2 flex flex-wrap gap-1">
            {attachments.map((a, i) => (
              <span
                key={i}
                class="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800"
              >
                {a.kind === 'image' && a.dataUrl ? (
                  <img
                    src={a.dataUrl}
                    alt={a.name}
                    class="h-6 w-6 rounded object-cover"
                  />
                ) : (
                  <Icon name={a.kind === 'image' ? 'image' : 'file'} size={12} />
                )}
                {a.name}
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  class="text-gray-400 hover:text-red-500"
                  aria-label={`Remove ${a.name}`}
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          class={`rounded-2xl border bg-white px-3 py-2 dark:bg-gray-900 ${
            dragOver
              ? 'border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700'
              : 'border-gray-300 dark:border-gray-600'
          }`}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            aria-label={t('type_a_message')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape') {
                if (running) stop();
                else if (input === '') (e.target as HTMLTextAreaElement).blur();
              } else if (e.key === 'ArrowUp' && input === '' && !running) {
                // Edit the last user message (PLAN §43).
                const lastUser = [...lines].reverse().find((l) => l.role === 'user');
                if (lastUser) {
                  e.preventDefault();
                  setInput(lastUser.content);
                }
              }
            }}
            placeholder={t('type_a_message')}
            rows={1}
            class="max-h-40 min-h-[40px] w-full resize-none overflow-y-auto border-none bg-transparent p-0 text-sm focus:outline-none"
          />
          <div class="mt-2 flex items-center justify-between">
            <div class="relative flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowModePicker((v) => !v)}
                title="Agent permission mode"
                aria-label={`Agent permission mode: ${modeLabel}`}
                aria-haspopup="menu"
                aria-expanded={showModePicker}
                class={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${modePillClass}`}
              >
                {modeLabel}
                <Icon name="chevron-down" size={12} />
              </button>
              {showModePicker && (
                <ModePickerPopup
                  settings={settings}
                  onClose={() => setShowModePicker(false)}
                  onChange={setSettings}
                />
              )}
              <label
                class="flex cursor-pointer items-center rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Attach files"
              >
                <Icon name="plus" size={16} title="Attach files" />
                <input
                  type="file"
                  multiple
                  accept="image/*,.txt,.md,.csv,.json"
                  class="hidden"
                  aria-label="Attach files"
                  onChange={(e) => {
                    addFiles((e.target as HTMLInputElement).files);
                    (e.target as HTMLInputElement).value = '';
                  }}
                />
              </label>
              <button
                type="button"
                onClick={toggleDictation}
                title={listening ? 'Stop dictation' : 'Dictate message'}
                aria-label={listening ? 'Stop dictation' : 'Dictate message'}
                aria-pressed={listening}
                class={`flex items-center rounded p-1.5 ${
                  listening
                    ? 'text-red-500'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Icon name="mic" size={16} />
              </button>
              {input.trim() && (
                <span class="ml-1 text-[11px] tabular-nums text-gray-400" aria-hidden="true">
                  {input.trim().split(/\s+/).length}w · {input.length}c
                </span>
              )}
            </div>
            <div class="relative flex items-center gap-2 text-xs text-gray-400">
              <button
                type="button"
                onClick={() => setShowModelPicker((v) => !v)}
                aria-label="Select model"
                aria-haspopup="menu"
                aria-expanded={showModelPicker}
                class="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {settings?.selectedModel && <span>{settings.selectedModel}</span>}
                {modelSupportsThinking && (
                  <span class="capitalize">{settings?.reasoningEffort ?? 'medium'}</span>
                )}
                <Icon name="chevron-down" size={14} />
              </button>
              {showModelPicker && (
                <ModelPickerPopup
                  settings={settings}
                  onClose={() => setShowModelPicker(false)}
                  onChange={setSettings}
                />
              )}
              {running ? (
                <button
                  type="button"
                  onClick={stop}
                  class="flex items-center rounded-full bg-red-500 p-1.5 text-white"
                  title={t('stop')}
                  aria-label={t('stop')}
                >
                  <Icon name="stop" size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => submit()}
                  class="flex items-center rounded-full bg-blue-500 p-1.5 text-white disabled:opacity-50"
                  title={t('send_message')}
                  aria-label={t('send_message')}
                >
                  <Icon name="send" size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
