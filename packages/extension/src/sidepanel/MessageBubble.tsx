import { useState } from 'preact/hooks';
import { renderMarkdown } from './markdown';
import { Icon } from '@/components/Icon';
import type { ChatLine } from './displayLines';

interface Props {
  line: ChatLine;
  onPin?: (messageId: string, pinned: boolean) => void;
  onDelete?: (messageId: string) => void;
}

/** A chat message bubble: markdown for assistant, plain for user, with copy /
 * pin / delete actions on hover (PLAN §7). */
export function MessageBubble({ line, onPin, onDelete }: Props) {
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
          <div
            class="md"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(line.content || '…') }}
          />
        )}
      </div>
      {line.content && (
        <div class="absolute -top-2 right-1 hidden gap-1 group-hover:flex">
          <button
            type="button"
            onClick={copy}
            class="rounded bg-white p-1 text-gray-500 shadow dark:bg-gray-700"
            title="Copy"
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
          </button>
          {line.messageId && onPin && (
            <button
              type="button"
              onClick={() => onPin(line.messageId!, !line.pinned)}
              class={`rounded bg-white p-1 shadow dark:bg-gray-700 ${line.pinned ? 'text-amber-500' : 'text-gray-500'}`}
              title={line.pinned ? 'Unpin' : 'Pin'}
            >
              <Icon name="pin" size={13} />
            </button>
          )}
          {line.messageId && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(line.messageId!)}
              class="rounded bg-white p-1 text-gray-500 shadow hover:text-red-500 dark:bg-gray-700"
              title="Delete"
            >
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
