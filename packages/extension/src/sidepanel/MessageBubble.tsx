import { useState } from 'preact/hooks';
import { renderMarkdown } from './markdown';
import { Icon } from '@/components/Icon';
import type { ChatLine } from './displayLines';

interface Props {
  line: ChatLine;
  onPin?: (messageId: string, pinned: boolean) => void;
  onDelete?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
}

/** Check glyph swapped in briefly after a code-block copy (delegated handler). */
const CHECK_GLYPH =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

/** A chat message bubble: markdown for assistant, plain for user, with copy /
 * pin / delete / fork actions on hover (PLAN §7, B8). */
export function MessageBubble({ line, onPin, onDelete, onFork }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(line.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  // Code-block copy is wired by delegation since the markdown is injected via
  // dangerouslySetInnerHTML and can't carry Preact handlers (§1a).
  const onMdClick = async (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.code-copy');
    if (!btn) return;
    const code = btn.closest('.code-block')?.querySelector('code');
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.textContent ?? '');
      const original = btn.innerHTML;
      btn.innerHTML = CHECK_GLYPH;
      setTimeout(() => {
        btn.innerHTML = original;
      }, 1200);
    } catch {
      /* ignore */
    }
  };

  const isUser = line.role === 'user';

  return (
    <div class={`group relative max-w-[88%] ${isUser ? 'ml-auto' : ''}`}>
      <div
        class={`rounded-lg px-3 py-2 text-sm ${
          isUser ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800'
        } ${line.pinned ? 'ring-1 ring-amber-400' : ''}`}
      >
        {line.pinned && (
          <span class="mb-1 flex items-center gap-1 text-xs opacity-70">
            <Icon name="pin" size={11} /> Pinned
          </span>
        )}
        {isUser ? (
          <span class="whitespace-pre-wrap break-words">{line.content || '…'}</span>
        ) : (
          <div class="md" onClick={onMdClick}>
            <span dangerouslySetInnerHTML={{ __html: renderMarkdown(line.content || '…') }} />
            {line.streaming && <span class="stream-caret" aria-hidden="true" />}
          </div>
        )}
      </div>
      {line.content && (
        <div class="absolute -top-2 right-1 hidden gap-1 group-hover:flex">
          <button
            type="button"
            onClick={copy}
            class="rounded bg-white p-1 text-gray-500 shadow dark:bg-gray-700"
            title="Copy"
            aria-label={copied ? 'Copied' : 'Copy message'}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
          </button>
          {line.messageId && onPin && (
            <button
              type="button"
              onClick={() => onPin(line.messageId!, !line.pinned)}
              class={`rounded bg-white p-1 shadow dark:bg-gray-700 ${line.pinned ? 'text-amber-500' : 'text-gray-500'}`}
              title={line.pinned ? 'Unpin' : 'Pin'}
              aria-label={line.pinned ? 'Unpin message' : 'Pin message'}
              aria-pressed={!!line.pinned}
            >
              <Icon name="pin" size={13} />
            </button>
          )}
          {line.messageId && onFork && (
            <button
              type="button"
              onClick={() => onFork(line.messageId!)}
              class="rounded bg-white p-1 text-gray-500 shadow dark:bg-gray-700"
              title="Fork conversation from here"
              aria-label="Fork conversation from here"
            >
              <Icon name="fork" size={13} />
            </button>
          )}
          {line.messageId && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(line.messageId!)}
              class="rounded bg-white p-1 text-gray-500 shadow hover:text-red-500 dark:bg-gray-700"
              title="Delete"
              aria-label="Delete message"
            >
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
