import { useState } from 'preact/hooks';
import { Icon } from '@/components/Icon';
import type { ChatLine } from '../../types/chat';

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

export function ToolCallRow({ line }: { line: ChatLine }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const done = line.content !== '…';
  const isError = line.tool?.isError;
  const running = !done;

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(pretty(line.content));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div class="relative">
      {/* timeline node */}
      <span class="absolute -left-[21px] top-1.5 text-blue-400">
        <Icon
          name={isError ? 'alert' : 'tool'}
          size={13}
          class={isError ? 'text-red-500' : running ? 'animate-pulse text-blue-400' : ''}
        />
      </span>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        class={`flex w-full items-center gap-1.5 py-0.5 text-left text-xs hover:text-gray-700 dark:hover:text-gray-300 ${
          running ? 'animate-pulse text-blue-400' : 'text-gray-500'
        }`}
      >
        <span class="font-medium">{line.tool?.name}</span>
        {running && <span class="text-gray-400">running…</span>}
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
              <div class="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Result
                <button
                  type="button"
                  onClick={copyResult}
                  class="ml-auto rounded p-1 text-gray-600 hover:bg-blue-200 hover:text-blue-700 dark:text-gray-300 dark:hover:bg-blue-500 dark:hover:text-white transition-colors"
                  title="Copy result"
                  aria-label={copied ? 'Copied' : 'Copy result'}
                >
                  <Icon name={copied ? 'check' : 'copy'} size={12} />
                </button>
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
