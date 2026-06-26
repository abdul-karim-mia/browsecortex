/** Message hover action buttons: copy, pin, fork, delete */

import { useState } from 'preact/hooks';
import { Icon } from '@/components/Icon';
import type { ChatLine } from '../../types/chat';

interface Props {
  line: ChatLine;
  onPin?: (messageId: string, pinned: boolean) => void;
  onDelete?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
}

export function MessageActions({ line, onPin, onDelete, onFork }: Props) {
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

  return (
    <div class="absolute -top-2 right-1 hidden gap-1 group-hover:flex">
      <button
        type="button"
        onClick={copy}
        class="rounded bg-gray-200 p-1.5 text-gray-700 hover:bg-blue-200 hover:text-blue-700 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-blue-500 dark:hover:text-white transition-colors"
        title="Copy"
        aria-label={copied ? 'Copied' : 'Copy message'}
      >
        <Icon name={copied ? 'check' : 'copy'} size={14} />
      </button>
      {line.messageId && onPin && (
        <button
          type="button"
          onClick={() => onPin(line.messageId!, !line.pinned)}
          class={`rounded p-1.5 transition-colors ${
            line.pinned
              ? 'bg-amber-200 text-amber-700 hover:bg-amber-300 dark:bg-amber-500 dark:text-white dark:hover:bg-amber-400'
              : 'bg-gray-200 text-gray-700 hover:bg-amber-200 hover:text-amber-700 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-amber-500 dark:hover:text-white'
          }`}
          title={line.pinned ? 'Unpin' : 'Pin'}
          aria-label={line.pinned ? 'Unpin message' : 'Pin message'}
          aria-pressed={!!line.pinned}
        >
          <Icon name="pin" size={14} />
        </button>
      )}
      {line.messageId && onFork && (
        <button
          type="button"
          onClick={() => onFork(line.messageId!)}
          class="rounded bg-gray-200 p-1.5 text-gray-700 hover:bg-green-200 hover:text-green-700 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-green-500 dark:hover:text-white transition-colors"
          title="Fork conversation from here"
          aria-label="Fork conversation from here"
        >
          <Icon name="fork" size={14} />
        </button>
      )}
      {line.messageId && onDelete && (
        <button
          type="button"
          onClick={() => onDelete(line.messageId!)}
          class="rounded bg-gray-200 p-1.5 text-gray-700 hover:bg-red-200 hover:text-red-700 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-red-500 dark:hover:text-white transition-colors"
          title="Delete"
          aria-label="Delete message"
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  );
}
