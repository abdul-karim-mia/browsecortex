import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '@/i18n';
import { usePort } from '../usePort';
import type { ServerMessage } from '@/background/protocol';
import { Storage } from '@/storage';
import { messagesToLines, type ChatLine } from '../displayLines';
import { AskUserWidget, type AskUserPayload } from '../AskUserWidget';
import { MessageBubble } from '../MessageBubble';
import { WorkingBlock } from '../WorkingBlock';
import { BrainPulse } from '../BrainPulse';
import { Icon } from '@/components/Icon';
import type { Attachment } from '@/background/protocol';
import type { Settings } from '@/types';
import { ModelPickerPopup } from '../ModelPickerPopup';
import { ModePickerPopup } from '../ModePickerPopup';

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
}

export function ChatTab({ conversationId, registerControls }: Props) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  /** True while waiting on the provider with nothing visible yet (no tokens, no tool row). */
  const [thinking, setThinking] = useState(false);
  const [ask, setAsk] = useState<AskUserPayload | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [contextWindow, setContextWindow] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [modelSupportsThinking, setModelSupportsThinking] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
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

  // Auto-scroll to the newest content as it streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, ask, thinking]);

  const onServerMessage = (msg: ServerMessage) => {
    if (msg.type === 'reasoning') {
      setThinking(false);
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
    } else if (msg.type === 'token') {
      setThinking(false);
      closeThinkingLine();
      setLines((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (openRef.current && last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: last.content + msg.content };
        } else {
          next.push({ role: 'assistant', content: msg.content });
          openRef.current = true;
        }
        return next;
      });
    } else if (msg.type === 'tool_call') {
      openRef.current = false;
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
      setThinking(false);
      closeThinkingLine();
      setAsk(msg.questions as AskUserPayload);
    } else if (msg.type === 'done') {
      setRunning(false);
      setThinking(false);
      openRef.current = false;
      closeThinkingLine();
      submittedRef.current = false;
      // Reload from storage so persisted messages carry ids (enables pin/delete).
      // Guard with submittedRef so a quick second submit doesn't get overwritten.
      Storage.messages.byConversation(conversationId).then((m) => {
        if (!m.length || submittedRef.current) return;
        setLines((prev) => {
          const reloaded = messagesToLines(m);
          // Reasoning content isn't persisted (PLAN §8 stores only user/
          // assistant/tool turns), so the reload above drops any thinking
          // lines shown during this run. Splice them back in, just before
          // the final reply, instead of letting them disappear.
          const thinkingLines = prev.filter((l) => l.role === 'thinking');
          if (thinkingLines.length) {
            const lastAssistantIdx = reloaded.map((l) => l.role).lastIndexOf('assistant');
            const insertAt = lastAssistantIdx === -1 ? reloaded.length : lastAssistantIdx;
            reloaded.splice(insertAt, 0, ...thinkingLines);
          }
          return reloaded;
        });
      });
    } else if (msg.type === 'error') {
      setRunning(false);
      setThinking(false);
      openRef.current = false;
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

  /** Marks the trailing thinking line as finished, if one is still open. */
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
    setInput('');
    setAttachments([]);
    setRunning(true);
    setThinking(true);
    openRef.current = false;
    submittedRef.current = true;
    setLines((prev) => [...prev, { role: 'user', content: displayed }]);
    send({ type: 'send', conversationId, content, attachments: atts.length ? atts : undefined });
  };

  const stop = () => {
    send({ type: 'abort' });
    setRunning(false);
    setThinking(false);
  };

  const agentMode = settings?.agentMode ?? 'full_auto';
  const bypassPermissions = agentMode === 'full_auto';
  const modeLabel =
    agentMode === 'full_auto'
      ? 'Bypass permissions'
      : agentMode === 'notify_only'
        ? 'Auto mode'
        : 'Ask permissions';

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

  return (
    <div class="flex h-full flex-col">
      {/* Toolbar — clear/new conversation live in the App header now. */}
      {contextWindow ? (
        <div class="px-2 py-1">
          <span
            class={`text-xs ${ctxPercent >= 80 ? 'text-amber-600' : 'text-gray-400'}`}
            title={`~${usedTokens.toLocaleString()} / ${contextWindow.toLocaleString()} tokens`}
          >
            {ctxPercent < 1 ? 'context: empty' : `context ${ctxPercent.toFixed(0)}%`}
          </span>
        </div>
      ) : null}
      {ctxPercent >= 80 && (
        <div class="bg-amber-100 px-3 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Context window {ctxPercent.toFixed(0)}% full — older turns will be compacted
          automatically.
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
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
            />
          ),
        )}
        {thinking && (
          <div class="flex max-w-[88%] items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-400 dark:bg-gray-800">
            <BrainPulse size={18} />
            Thinking…
          </div>
        )}
        {ask && <AskUserWidget payload={ask} onSubmit={submitAnswers} />}
      </div>

      {/* Input */}
      <div class="border-t border-gray-200 p-2 dark:border-gray-700">
        {attachments.length > 0 && (
          <div class="mb-2 flex flex-wrap gap-1">
            {attachments.map((a, i) => (
              <span
                key={i}
                class="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800"
              >
                <Icon name={a.kind === 'image' ? 'file' : 'file'} size={12} />
                {a.name}
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  class="text-gray-400 hover:text-red-500"
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div class="rounded-2xl border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900">
          <textarea
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
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
            rows={2}
            class="min-h-[40px] w-full resize-none border-none bg-transparent p-0 text-sm focus:outline-none"
          />
          <div class="mt-2 flex items-center justify-between">
            <div class="relative flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowModePicker((v) => !v)}
                title="Agent permission mode"
                class={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  bypassPermissions
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}
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
                <Icon name="plus" size={16} />
                <input
                  type="file"
                  multiple
                  accept="image/*,.txt,.md,.csv,.json"
                  class="hidden"
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
                class={`flex items-center rounded p-1.5 ${
                  listening
                    ? 'text-red-500'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Icon name="mic" size={16} />
              </button>
            </div>
            <div class="relative flex items-center gap-2 text-xs text-gray-400">
              <button
                type="button"
                onClick={() => setShowModelPicker((v) => !v)}
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
                >
                  <Icon name="stop" size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => submit()}
                  class="flex items-center rounded-full bg-blue-500 p-1.5 text-white disabled:opacity-50"
                  title={t('send_message')}
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
