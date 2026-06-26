import { renderMarkdown } from '../../utils/markdown';
import { MessageActions } from './MessageActions';
import { useChatContext } from '../../context/ChatContext';
import type { ChatLine } from '../../types/chat';

interface Props {
  line: ChatLine;
}

/** Check glyph swapped in briefly after a code-block copy (delegated handler). */
const CHECK_GLYPH =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

/** A chat message bubble: markdown for assistant, plain for user, with copy /
 * pin / delete / fork actions on hover (PLAN §7, B8). */
export function MessageBubble({ line }: Props) {
  const { onPin, onDelete, onFork } = useChatContext();

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
        <MessageActions line={line} onPin={onPin} onDelete={onDelete} onFork={onFork} />
      )}
    </div>
  );
}
