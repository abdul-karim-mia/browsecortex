import { useEffect, useState } from 'preact/hooks';
import { BrainPulse } from './BrainPulse';
import { Icon } from '@/components/Icon';

/** mm ss / ss clock for the run's total elapsed time. */
function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

interface Props {
  /** Current high-level activity, e.g. "Thinking", "Working", "Responding". */
  phase: string;
  /** Optional sub-detail revealed on expand (e.g. the running tool's name). */
  detail?: string;
  /** Wall-clock start of the whole run (ms epoch) for the total timer. */
  startMs: number;
  /** Estimated output tokens produced so far this run. */
  outputTokens: number;
}

/**
 * A persistent status bar shown above the input while the agent is running.
 * Reports the live phase (with a slide-up swap on change), total elapsed time,
 * and output token count; expands to show the current sub-activity.
 */
export function RunStatusBar({ phase, detail, startMs, outputTokens }: Props) {
  const [open, setOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Date.now() - startMs);
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [startMs]);

  return (
    <div class="run-status-bar border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300"
      >
        <BrainPulse size={16} />
        {/* keyed so the label re-mounts and replays the slide-up on each change */}
        <span key={phase} class="status-phase font-medium text-blue-500 dark:text-blue-400">
          {phase}
        </span>
        <Icon
          name="chevron-down"
          size={12}
          class={`shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span class="ml-auto tabular-nums text-gray-400">{fmtClock(elapsed)}</span>
        {outputTokens > 0 && (
          <span class="tabular-nums text-gray-400" title="Estimated output tokens this run">
            · {outputTokens.toLocaleString()} tok
          </span>
        )}
      </button>
      {open && (
        <div class="px-3 pb-1.5 pl-9 text-xs text-gray-400">
          {detail || 'Working through the request…'}
        </div>
      )}
    </div>
  );
}
