import { useEffect, useState } from 'preact/hooks';
import { Icon } from '@/components/Icon';
import type { ChatLine } from './displayLines';
import { ToolCallRow } from './ToolCallGroup';

/** Build a human-readable summary of which tools ran, e.g. "read_page, click +2 more". */
function summarizeNames(tools: ChatLine[]): string {
  const names: string[] = [];
  for (const t of tools) {
    const name = t.tool?.name ?? 'tool';
    if (names[names.length - 1] !== name) names.push(name);
  }
  const shown = names.slice(0, 2);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest} more` : shown.join(', ');
}

/**
 * One collapsible group covering everything the model did before its final
 * reply — reasoning and tool calls interleaved in the order they happened.
 * Previously these rendered as separate ThinkBlock/ToolCallGroup elements;
 * grouping them avoids a wall of disjoint boxes while the agent is working.
 */
export function WorkingBlock({ items }: { items: ChatLine[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const thinkingLines = items.filter((l) => l.role === 'thinking');
  const toolLines = items.filter((l) => l.role === 'tool');
  const stillThinking = thinkingLines.some((l) => l.streaming);
  const runningTool = toolLines.find((l) => l.content === '…');
  const running = stillThinking || !!runningTool;
  const errors = toolLines.filter((l) => l.tool?.isError).length;

  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const interval = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [running]);

  // Collapse automatically once everything settles, unless the user has it open.
  useEffect(() => {
    if (!running) setCollapsed(true);
  }, [running]);

  const summaryParts: string[] = [];
  if (thinkingLines.length) summaryParts.push(`Thought for ${elapsed}s`);
  if (toolLines.length) {
    summaryParts.push(
      `Ran ${summarizeNames(toolLines)}${toolLines.length > 1 ? ` (${toolLines.length})` : ''}`,
    );
  }
  if (errors > 0) summaryParts.push(`${errors} error${errors > 1 ? 's' : ''}`);

  return (
    <div class="my-1">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        class="flex w-full items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <Icon
          name={stillThinking ? 'sparkle' : 'tool'}
          size={13}
          class={running ? 'animate-pulse text-blue-400' : ''}
        />
        <span class={running ? 'animate-pulse text-blue-400' : ''}>
          {running
            ? stillThinking
              ? 'Thinking…'
              : `Running ${runningTool?.tool?.name}…`
            : summaryParts.join(' · ')}
        </span>
        <span class="ml-auto opacity-60">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div class="ml-2 mt-1 space-y-2 border-l-2 border-gray-200 pl-4 dark:border-gray-700">
          {items.map((line, i) =>
            line.role === 'thinking' ? (
              <pre
                key={`th${i}`}
                class="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs italic text-gray-500 dark:text-gray-400"
              >
                {line.content}
              </pre>
            ) : (
              <ToolCallRow key={line.id ?? `t${i}`} line={line} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
