/** Chat messages list with auto-scroll and message rendering */

import { RefObject } from 'preact';
import { Icon } from '@/components/Icon';
import { MessageBubble } from '../message/MessageBubble';
import { WorkingBlock } from '../working/WorkingBlock';
import { t } from '@/i18n';
import type { ChatLine } from '../../types/chat';
import { groupLines } from '../../utils/displayLines';
import { useAutoScroll } from '../../hooks/useAutoScroll';

interface Props {
  lines: ChatLine[];
  running: boolean;
  scrollRef: RefObject<HTMLDivElement>;
  onRetry?: () => void;
  errored?: boolean;
}

const EXAMPLE_PROMPTS = [
  "Summarize the page I'm on",
  'Open Hacker News in a new tab',
  'List all my open tabs',
];

export function ChatMessages({
  lines,
  running,
  scrollRef,
  onRetry,
  errored,
}: Props) {
  const { atBottom, onScroll, scrollToBottom } = useAutoScroll(scrollRef);
  const blocks = groupLines(lines);

  return (
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
            <p class="mb-3">{t('type_a_message')}</p>
            <div class="flex flex-col items-center gap-1.5">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    // This would need to be passed as a prop
                    console.log('Example prompt clicked:', p);
                  }}
                  class="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {blocks.map((block, i) =>
          block.kind === 'working' ? (
            <WorkingBlock key={`g${i}`} items={block.lines} runActive={running} />
          ) : (
            <MessageBubble
              key={block.line.messageId ?? `m${i}`}
              line={block.line}
            />
          ),
        )}
        {errored && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            class="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Icon name="refresh" size={13} /> Retry last message
          </button>
        )}
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
  );
}
