import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '@/i18n';
import { usePort } from '../usePort';
import type { ServerMessage } from '@/background/protocol';
import { Storage } from '@/storage';
import { messagesToLines, type ChatLine } from '../displayLines';
import { AskUserWidget, type AskUserPayload } from '../AskUserWidget';
import { MessageBubble } from '../MessageBubble';
import { ToolCallGroup } from '../ToolCallGroup';
import { Icon } from '@/components/Icon';
import type { Attachment } from '@/background/protocol';

type Block = { kind: 'tools'; lines: ChatLine[] } | { kind: 'message'; line: ChatLine };

/** Collapse consecutive tool lines into a single group block (PLAN §7). */
function groupLines(lines: ChatLine[]): Block[] {
  const blocks: Block[] = [];
  for (const line of lines) {
    if (line.role === 'tool') {
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'tools') last.lines.push(line);
      else blocks.push({ kind: 'tools', lines: [line] });
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
  'Summarize the page I\'m on',
  'Open Hacker News in a new tab',
  'List all my open tabs',
];

interface Props {
  /** The conversation this chat is bound to (owned by App). */
  conversationId: string;
  onNewChat: () => void;
}

export function ChatTab({ conversationId, onNewChat }: Props) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [ask, setAsk] = useState<AskUserPayload | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [contextWindow, setContextWindow] = useState<number | null>(null);
  /** Whether the trailing assistant line is still receiving tokens. */
  const openRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the selected model's context window for the usage meter (PLAN §31).
  useEffect(() => {
    (async () => {
      const settings = await Storage.settings.get();
      if (!settings.selectedProviderId || !settings.selectedModel) return;
      const m = (await Storage.models.listByProvider(settings.selectedProviderId)).find(
        (x) => x.id === settings.selectedModel,
      );
      setContextWindow(m?.contextWindow ?? null);
    })();
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
  }, [lines, ask]);

  const onServerMessage = (msg: ServerMessage) => {
    if (msg.type === 'token') {
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
    } else if (msg.type === 'ask_user') {
      openRef.current = false;
      setAsk(msg.questions as AskUserPayload);
    } else if (msg.type === 'done') {
      setRunning(false);
      openRef.current = false;
      // Reload from storage so persisted messages carry ids (enables pin/delete).
      Storage.messages.byConversation(conversationId).then((m) => {
        if (m.length) setLines(messagesToLines(m));
      });
    } else if (msg.type === 'error') {
      setRunning(false);
      openRef.current = false;
      setLines((prev) => [...prev, { role: 'assistant', content: `⚠️ ${msg.message}` }]);
    }
  };

  const { send, connected } = usePort(onServerMessage);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const read = await Promise.all(Array.from(files).map(readFileAsAttachment));
    setAttachments((prev) => [...prev, ...read].slice(0, 10));
  };

  const submit = () => {
    const content = input.trim();
    if ((!content && attachments.length === 0) || running) return;
    const atts = attachments;
    const displayed = atts.length ? `${content}\n📎 ${atts.map((a) => a.name).join(', ')}` : content;
    setInput('');
    setAttachments([]);
    setRunning(true);
    openRef.current = false;
    setLines((prev) => [...prev, { role: 'user', content: displayed }]);
    send({ type: 'send', conversationId, content, attachments: atts.length ? atts : undefined });
  };

  const stop = () => {
    send({ type: 'abort' });
    setRunning(false);
  };

  const newChat = () => {
    if (running) return;
    openRef.current = false;
    setAsk(null);
    onNewChat();
  };

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
    setLines((prev) => [
      ...prev,
      { role: 'user', content: `↳ ${JSON.stringify(answers)}` },
    ]);
    send({ type: 'ask_user_response', answers });
  };

  return (
    <div class="flex h-full flex-col">
      {/* Toolbar */}
      <div class="flex items-center justify-between px-2 py-1">
        {contextWindow ? (
          <span
            class={`text-xs ${ctxPercent >= 80 ? 'text-amber-600' : 'text-gray-400'}`}
            title={`~${usedTokens.toLocaleString()} / ${contextWindow.toLocaleString()} tokens`}
          >
            {ctxPercent < 1 ? 'context: empty' : `context ${ctxPercent.toFixed(0)}%`}
          </span>
        ) : (
          <span />
        )}
        <div class="flex items-center gap-1">
          <button
            type="button"
            onClick={clearChat}
            disabled={running || lines.length === 0}
            class="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-800"
            title="Clear chat"
          >
            <Icon name="trash" size={14} />
          </button>
          <button
            type="button"
            onClick={newChat}
            disabled={running}
            class="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-800"
            title={t('new_conversation')}
          >
            <Icon name="plus" size={14} /> {t('new_conversation')}
          </button>
        </div>
      </div>
      {ctxPercent >= 80 && (
        <div class="bg-amber-100 px-3 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Context window {ctxPercent.toFixed(0)}% full — older turns will be compacted automatically.
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
          block.kind === 'tools' ? (
            <ToolCallGroup key={`g${i}`} tools={block.lines} />
          ) : (
            <MessageBubble
              key={block.line.messageId ?? `m${i}`}
              line={block.line}
              onPin={togglePin}
              onDelete={deleteMessage}
            />
          ),
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
        <div class="flex gap-2">
          <label
            class="flex cursor-pointer items-center rounded border border-gray-300 px-2 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
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
            class="min-h-[44px] flex-1 resize-none rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800"
          />
          {running ? (
            <button
              type="button"
              onClick={stop}
              class="flex items-center gap-1 rounded bg-red-500 px-3 text-sm font-medium text-white"
              title={t('stop')}
            >
              <Icon name="stop" size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              class="flex items-center rounded bg-blue-500 px-3 text-sm font-medium text-white disabled:opacity-50"
              title={t('send_message')}
            >
              <Icon name="send" size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
