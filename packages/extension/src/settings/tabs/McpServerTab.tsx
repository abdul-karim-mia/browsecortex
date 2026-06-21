import { useEffect, useState } from 'preact/hooks';
import { getConfig, regenerateToken, setConfig, type McpServerConfig } from '@/mcp-server/config';

/** BrowseCortex as MCP server settings (PLAN §21). */
export function McpServerTab() {
  const [cfg, setCfg] = useState<McpServerConfig | null>(null);
  const [status, setStatus] = useState<'unknown' | 'up' | 'down'>('unknown');

  useEffect(() => {
    getConfig().then(setCfg);
  }, []);

  // Poll the relay's /status endpoint to show connection state.
  useEffect(() => {
    if (!cfg?.enabled) return;
    const check = () =>
      fetch(`http://localhost:${cfg.port}/status`)
        .then((r) => r.json())
        .then((j) => setStatus(j.extensionConnected ? 'up' : 'down'))
        .catch(() => setStatus('down'));
    check();
    const t = setInterval(check, 4000);
    return () => clearInterval(t);
  }, [cfg?.enabled, cfg?.port]);

  if (!cfg) return null;

  const update = async (patch: Partial<McpServerConfig>) => setCfg(await setConfig(patch));
  const copy = (text: string) => navigator.clipboard.writeText(text).catch(() => {});

  return (
    <div class="space-y-6 text-sm">
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => update({ enabled: (e.target as HTMLInputElement).checked })}
        />
        <span class="font-semibold">Enable BrowseCortex as an MCP server</span>
      </label>
      <p class="text-xs text-gray-500">
        Lets external agents (Claude Code, any MCP client) control this browser. Off by default,
        localhost only, token required.
      </p>

      <section class="space-y-2 rounded border border-gray-200 p-4 dark:border-gray-700">
        <h2 class="text-sm font-semibold">Setup</h2>
        <ol class="list-decimal space-y-1 pl-5 text-xs text-gray-600 dark:text-gray-300">
          <li>Install Node.js</li>
          <li class="flex items-center gap-2">
            Run:
            <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">
              npx browsecortex-relay --port {cfg.port} --token {cfg.token.slice(0, 10)}…
            </code>
            <button
              type="button"
              onClick={() => copy(`npx browsecortex-relay --port ${cfg.port} --token ${cfg.token}`)}
              class="text-blue-500"
            >
              Copy
            </button>
          </li>
          <li class="flex items-center gap-2">
            Connect agents to:
            <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">
              http://localhost:{cfg.port}/sse
            </code>
            <button type="button" onClick={() => copy(`http://localhost:${cfg.port}/sse`)} class="text-blue-500">
              Copy
            </button>
          </li>
        </ol>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-semibold">Security</h2>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">Auth token:</span>
          <code class="flex-1 truncate rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">
            {cfg.token}
          </code>
          <button type="button" onClick={() => copy(cfg.token)} class="text-xs text-blue-500">
            Copy
          </button>
          <button
            type="button"
            onClick={async () => setCfg(await regenerateToken())}
            class="text-xs text-amber-600"
          >
            Regenerate
          </button>
        </div>
        <label class="flex items-center gap-2">
          <span class="text-xs text-gray-500">Port:</span>
          <input
            type="number"
            value={cfg.port}
            onInput={(e) => update({ port: Number((e.target as HTMLInputElement).value) || 7822 })}
            class="w-24 rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
          />
        </label>
        <div>
          <span class="text-xs text-gray-500">Tool access:</span>
          <div class="mt-1 space-y-1">
            {(['all', 'safe', 'custom'] as const).map((mode) => (
              <label key={mode} class="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="toolAccess"
                  checked={cfg.toolAccess === mode}
                  onChange={() => update({ toolAccess: mode })}
                />
                {mode === 'all'
                  ? 'All tools'
                  : mode === 'safe'
                    ? 'Safe tools only (no destructive / run_javascript)'
                    : 'Custom list'}
              </label>
            ))}
          </div>
          {cfg.toolAccess === 'custom' && (
            <input
              value={cfg.customTools.join(', ')}
              onInput={(e) =>
                update({
                  customTools: (e.target as HTMLInputElement).value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="comma-separated tool names"
              class="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
            />
          )}
        </div>
      </section>

      <div class="text-xs">
        Status:{' '}
        {!cfg.enabled
          ? '⚪ Disabled'
          : status === 'up'
            ? '🟢 Connected'
            : '🔴 Relay not detected'}
      </div>
    </div>
  );
}
