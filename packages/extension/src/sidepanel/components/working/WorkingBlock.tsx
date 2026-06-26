import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '@/components/Icon';
import type { ChatLine } from '../../types/chat';
import { ToolCallRow } from './ToolCallGroup';

/** Human duration: sub-10s gets one decimal (so brief blocks still read >0),
 * longer rounds to whole seconds. */
function fmtDuration(ms: number): string {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

/** Reasoning rendered as a collapsible tile that mirrors ToolCallRow, so a
 * thinking step reads as a labelled box alongside the tool calls it sits
 * between rather than floating raw text. */
function ThinkingRow({ line, liveMs }: { line: ChatLine; liveMs?: number }) {
  const [open, setOpen] = useState(false);
  // While streaming: "Thinking". Once done: show this block's own measured
  // duration — persisted per-turn (line.thinkingMs), falling back to a live
  // timer passed by a standalone block.
  const ms = line.thinkingMs ?? liveMs ?? 0;
  const label = line.streaming ? 'Thinking' : ms > 0 ? `Thought for ${fmtDuration(ms)}` : 'Thought';
  return (
    <div class="relative">
      {/* timeline node — matches the tool rows' left rail */}
      <span class="absolute -left-[21px] top-1.5 text-blue-400">
        <Icon name="sparkle" size={13} class={line.streaming ? 'animate-pulse text-blue-400' : ''} />
      </span>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        class={`flex w-full items-center gap-1.5 py-0.5 text-left text-xs hover:text-gray-700 dark:hover:text-gray-300 ${
          line.streaming ? 'animate-pulse text-blue-400' : 'text-gray-500'
        }`}
      >
        <span class="font-medium">{label}</span>
        {line.streaming && <span class="text-blue-400">…</span>}
        <span class="ml-auto opacity-60">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div class="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900/40">
          <pre class="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs italic text-gray-500 dark:text-gray-400">
            {line.content}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * One collapsible group covering everything the model did before its final
 * reply — reasoning and tool calls interleaved in the order they happened.
 * Previously these rendered as separate ThinkBlock/ToolCallGroup elements;
 * grouping them avoids a wall of disjoint boxes while the agent is working.
 */
export function WorkingBlock({ items, runActive = false }: { items: ChatLine[]; runActive?: boolean }) {
  // Collapsed by default (even while running); a manual open sticks.
  const [collapsed, setCollapsed] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  // Once the user toggles the group themselves, stop auto-collapsing it.
  const userToggledRef = useRef(false);

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

  // Collapse only when the whole run has settled — not on the brief gaps between
  // rounds (where this block's own `running` dips false), which previously
  // collapsed it mid-run and fought a manual expand. A manual toggle wins.
  const toggle = () => {
    userToggledRef.current = true;
    setCollapsed((v) => !v);
  };
  useEffect(() => {
    if (!runActive && !userToggledRef.current) setCollapsed(true);
  }, [runActive]);

  // Group title. Combined work reads "Thought for Ns and worked"; a lone tool
  // call shows its own name; thinking-only shows the duration. The think time is
  // the sum of each sub-thought's measured duration (persisted), falling back to
  // the live timer while a fresh run is still in flight.
  const hasThinking = thinkingLines.length > 0;
  const hasTools = toolLines.length > 0;
  // Total think time = sum of each sub-thought's persisted duration; while a
  // fresh run is still in flight (no persisted ms yet) use the live timer.
  const thinkingMsTotal = thinkingLines.reduce((n, l) => n + (l.thinkingMs ?? 0), 0);
  const totalThinkMs = thinkingMsTotal > 0 ? thinkingMsTotal : elapsed * 1000;
  const thoughtLabel = totalThinkMs > 0 ? `Thought for ${fmtDuration(totalThinkMs)}` : 'Thought';
  let summary: string;
  if (hasThinking && hasTools) {
    summary = `${thoughtLabel} and worked`;
  } else if (hasThinking) {
    summary = thoughtLabel;
  } else {
    summary = toolLines.length === 1 ? (toolLines[0].tool?.name ?? 'Worked') : 'Worked';
  }
  if (errors > 0) summary += ` · ${errors} error${errors > 1 ? 's' : ''}`;

  const runningLabel = stillThinking ? 'Thinking…' : `Running ${runningTool?.tool?.name ?? 'tool'}…`;

  // A lone tool call or single thinking step doesn't need group chrome — render
  // it directly (still its own collapsible row), just indented enough for the
  // row's left-rail icon node.
  if (items.length === 1) {
    const line = items[0];
    return (
      <div class="my-1 pl-6">
        {line.role === 'thinking' ? (
          <ThinkingRow line={line} liveMs={elapsed * 1000} />
        ) : (
          <ToolCallRow line={line} />
        )}
      </div>
    );
  }

  return (
    <div class="my-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        class="flex w-full items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <Icon
          name={stillThinking ? 'sparkle' : 'tool'}
          size={13}
          class={running ? 'animate-pulse text-blue-400' : ''}
        />
        {running ? (
          // Keyed so the label re-mounts and replays the slide-up as the
          // active task changes (thinking → running tool → next tool).
          <span key={runningLabel} class="status-phase text-blue-400">
            {runningLabel}
          </span>
        ) : (
          <span>{summary}</span>
        )}
        {running && (
          <span class="text-gray-400">
            {elapsed > 0 && `${elapsed}s`}
            {toolLines.length > 0 && `${elapsed > 0 ? ' · ' : ''}${toolLines.length} tool${toolLines.length > 1 ? 's' : ''}`}
          </span>
        )}
        <span class="ml-auto opacity-60">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div class="ml-2 mt-1 space-y-2 border-l-2 border-gray-200 pl-4 dark:border-gray-700">
          {items.map((line, i) =>
            line.role === 'thinking' ? (
              <ThinkingRow key={`th${i}`} line={line} />
            ) : (
              <ToolCallRow key={line.id ?? `t${i}`} line={line} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
