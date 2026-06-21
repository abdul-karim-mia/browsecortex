import { useMemo, useState } from 'preact/hooks';
import { listTools } from '@/tools/registry';

/**
 * Tool Playground (PLAN §38, dev only). Pick a tool, fill params from its JSON
 * schema, run it against the active tab, and see the result + timing.
 */
export function PlaygroundTab() {
  const tools = useMemo(() => listTools().sort((a, b) => a.name.localeCompare(b.name)), []);
  const [name, setName] = useState(tools[0]?.name ?? '');
  const [args, setArgs] = useState<Record<string, string>>({});
  const [output, setOutput] = useState<string>('');
  const [ms, setMs] = useState<number | null>(null);

  const tool = tools.find((t) => t.name === name);
  const props = (tool?.parameters?.properties ?? {}) as Record<string, { type?: string; description?: string }>;

  const run = async () => {
    setOutput('Running…');
    setMs(null);
    // Coerce values by declared type.
    const parsed: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(args)) {
      if (val === '') continue;
      const type = props[key]?.type;
      parsed[key] =
        type === 'number' ? Number(val) : type === 'boolean' ? val === 'true' : val;
    }
    try {
      const res = await chrome.runtime.sendMessage({ type: 'playground_run', name, args: parsed });
      setOutput(JSON.stringify(res.result, null, 2));
      setMs(res.ms);
    } catch (e) {
      setOutput(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div class="space-y-3 text-sm">
      <p class="text-xs text-gray-500">
        Dev-only. Runs a single tool against the current active tab. {tools.length} tools.
      </p>
      <select
        value={name}
        onChange={(e) => {
          setName((e.target as HTMLSelectElement).value);
          setArgs({});
          setOutput('');
        }}
        class="w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
      >
        {tools.map((t) => (
          <option key={t.name} value={t.name}>
            {t.name}
            {t.destructive ? ' (destructive)' : ''}
          </option>
        ))}
      </select>

      {tool && <p class="text-xs text-gray-500">{tool.description}</p>}

      <div class="space-y-2">
        {Object.entries(props).map(([key, schema]) => (
          <label key={key} class="block">
            <span class="text-xs text-gray-500">
              {key} <span class="opacity-60">({schema.type ?? 'string'})</span>
            </span>
            <input
              value={args[key] ?? ''}
              onInput={(e) => setArgs((a) => ({ ...a, [key]: (e.target as HTMLInputElement).value }))}
              placeholder={schema.description}
              class="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
            />
          </label>
        ))}
      </div>

      <button type="button" onClick={run} class="rounded bg-blue-500 px-3 py-1 text-white">
        ▶ Execute
      </button>

      {output && (
        <div>
          {ms !== null && <div class="text-xs text-gray-400">Duration: {ms}ms</div>}
          <pre class="mt-1 max-h-80 overflow-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-800">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
