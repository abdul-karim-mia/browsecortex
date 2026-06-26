/**
 * Chat Tab - Main chat interface.
 * Consolidated using extracted hooks (useChat, useAttachments, useTokenTracking)
 * and organized components (ChatMessages, ChatInput).
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '@/i18n';
import { Storage } from '@/storage';
import type { Settings } from '@/types';
import { Icon } from '@/components/Icon';
import { ChatMessages } from '../components/chat/ChatMessages';
import { ChatInput } from '../components/chat/ChatInput';
import { RunStatusBar } from '../components/chat/RunStatusBar';
import { AskUserWidget } from '../components/chat/AskUserWidget';
import { ModelPickerPopup } from '../components/modals/ModelPickerPopup';
import { ModePickerPopup } from '../components/modals/ModePickerPopup';
import { useChat } from '../hooks/useChat';
import { useAttachments } from '../hooks/useAttachments';
import { useTokenTracking } from '../hooks/useTokenTracking';
import { ChatContext } from '../context/ChatContext';

export interface ChatControls {
  clearChat: () => void;
  canClear: boolean;
  running: boolean;
}

interface Props {
  conversationId: string;
  registerControls?: (controls: ChatControls | null) => void;
  onForked?: (newConversationId: string) => void;
}

export function ChatTab({ conversationId, registerControls, onForked }: Props) {
  // Extract chat logic into hook
  const {
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
  } = useChat(conversationId);

  // Extract file attachment logic
  const { attachments, addFiles, removeAttachment, setAttachments } = useAttachments();

  // Extract token tracking
  const { usedTokens, contextWindow, ctxPercent, convTokens } =
    useTokenTracking(lines, conversationId);

  // Local UI state
  const [input, setInput] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [modelSupportsThinking, setModelSupportsThinking] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load settings and model capabilities on mount
  useEffect(() => {
    const loadContextWindow = async () => {
      const s = await Storage.settings.get();
      setSettings(s);
      if (!s.selectedProviderId || !s.selectedModel) {
        setModelSupportsThinking(false);
        return;
      }
      const m = (await Storage.models.listByProvider(s.selectedProviderId)).find(
        (x) => x.id === s.selectedModel,
      );
      setModelSupportsThinking(!!m?.hasReasoning);
    };
    loadContextWindow();
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.settings) loadContextWindow();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const MAX_TEXTAREA_PX = 160;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [input]);

  // Register controls for header
  useEffect(() => {
    registerControls?.({ clearChat, canClear: lines.length > 0, running });
  }, [lines.length, running]);
  useEffect(() => () => registerControls?.(null), [registerControls]);

  const handleSubmit = () => {
    submit(input, attachments);
    setInput('');
    setAttachments([]);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    } else {
      const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognitionCtor) {
        alert('Speech recognition not supported in your browser');
        return;
      }

      const recognition = new SpeechRecognitionCtor();
      recognition.lang = navigator.language || 'en-US';
      recognition.interimResults = true;
      recognition.continuous = true;

      const SILENCE_TIMEOUT_MS = 5000;

      const resetSilenceTimer = () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (recognitionRef.current === recognition) {
            recognition.stop();
          }
        }, SILENCE_TIMEOUT_MS);
      };

      recognition.onresult = (e: any) => {
        resetSilenceTimer();
        const transcript = Array.from(e.results)
          .map((result: any) => result[0].transcript)
          .join('')
          .toLowerCase();

        setInput(transcript);

        // Auto-send if user says "send"
        if (transcript.includes('send')) {
          recognition.stop();
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        // Auto-send if transcript contains "send"
        setInput((prevInput) => {
          if (prevInput.toLowerCase().includes('send')) {
            // Remove the word "send" from the message and submit
            const cleanedInput = prevInput.toLowerCase().replace(/\bsend\b/g, '').trim();
            setTimeout(() => {
              if (cleanedInput) {
                submit(cleanedInput, attachments);
                setInput('');
                setAttachments([]);
              }
            }, 0);
          }
          return prevInput;
        });
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
      resetSilenceTimer();
    }
  };

  const agentMode = settings?.agentMode ?? 'bypass';
  const modeLabel = agentMode === 'bypass' ? 'Bypass' : agentMode === 'auto' ? 'Auto' : 'Ask';
  const modePillClass =
    agentMode === 'bypass'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
      : agentMode === 'auto'
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
        : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400';

  const contextValue = {
    lines,
    running,
    conversationId,
    onPin: togglePin,
    onDelete: deleteMessage,
    onFork: forkFrom,
  };

  return (
    <ChatContext.Provider value={contextValue}>
      <div class="flex h-full flex-col">
        {/* Context meter */}
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
      <ChatMessages
        lines={lines}
        running={running}
        scrollRef={scrollRef}
        onRetry={errored ? retry : undefined}
        errored={errored}
      />

      {/* Status bar */}
      {running && (
        <RunStatusBar
          phase={
            thinking
              ? 'Thinking'
              : lines.some((l) => l.role === 'tool' && l.content === '…')
                ? 'Working'
                : 'Responding'
          }
          startMs={runStart}
          outputTokens={runTokens}
        />
      )}

      {/* Ask user widget */}
      {ask && (
        <AskUserWidget
          payload={ask}
          onSubmit={(answers) => {
            // TODO: wire up to useChat
            console.log('Ask user response:', answers);
          }}
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
                  <img src={a.dataUrl} alt={a.name} class="h-6 w-6 rounded object-cover" />
                ) : (
                  <Icon name={a.kind === 'image' ? 'image' : 'file'} size={12} />
                )}
                {a.name}
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
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
          onDrop={handleDrop}
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
                handleSubmit();
              } else if (e.key === 'Escape') {
                if (running) stop();
                else if (input === '') (e.target as HTMLTextAreaElement).blur();
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
                onClick={toggleVoiceInput}
                class={`flex items-center rounded p-1.5 ${
                  isListening
                    ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                title={isListening ? 'Stop recording' : 'Start voice input'}
                aria-label={isListening ? 'Stop recording' : 'Start voice input'}
              >
                <Icon name="mic" size={16} />
              </button>
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
                  onClick={handleSubmit}
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
    </ChatContext.Provider>
  );
}
