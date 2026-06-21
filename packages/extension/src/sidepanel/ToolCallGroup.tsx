import { useState } from 'preact/hooks';
import { Icon } from '@/components/Icon';
import type { ChatLine } from './displayLines';

/** Pretty-print a JSON-ish value; falls back to the raw string. */
function pretty(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function ToolCallRow({ line }: { line: ChatLine }) {
  const [open, setOpen] = useState(false);
  const done = line.content !== '…';
  const isError = line.tool?.isError;

  return (
    <div class="relative">
      {/* timeline node */}
      <span class="absolute -left-[21px] top-1.5 text-blue-400">
        <Icon name={isError ? 'alert' : 'tool'} size={13} class={isError ? 'text-red-500' : ''} />
      </span>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        class="flex w-full items-center gap-1.5 py-0.5 text-left text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <span class="font-medium">{line.tool?.name}</span>
        {!done && <span class="text-gray-400">· running…</span>}
        {isError && <span class="text-red-500">· error</span>}
        <span class="ml-auto opacity-60">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div class="mt-1 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900/40">
          {line.args && Object.keys(line.args).length > 0 && (
            <div>
              <div class="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Request
              </div>
              <pre class="overflow-x-auto whitespace-pre-wrap break-words text-xs text-gray-600 dark:text-gray-300">
                {pretty(line.args)}
              </pre>
            </div>
          )}
          {done && (
            <div>
              <div class="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Result
              </div>
              <pre
                class={`max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs ${
                  isError ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                {pretty(line.content)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A run of consecutive tool calls, rendered as a collapsible timeline group
 * with per-call Request / Result (PLAN §7). */
export function ToolCallGroup({ tools }: { tools: ChatLine[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const running = tools.some((t) => t.content === '…');
  const errors = tools.filter((t) => t.tool?.isError).length;

  return (
    <div class="my-1">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        class="flex w-full items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <Icon name="tool" size={13} />
        <span>
          {tools.length} tool {tools.length === 1 ? 'call' : 'calls'}
          {running && ' · running…'}
          {errors > 0 && ` · ${errors} error${errors > 1 ? 's' : ''}`}
        </span>
        <span class="ml-auto opacity-60">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div class="ml-2 mt-1 space-y-1 border-l-2 border-gray-200 pl-4 dark:border-gray-700">
          {tools.map((line, i) => (
            <ToolCallRow key={line.id ?? i} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}
