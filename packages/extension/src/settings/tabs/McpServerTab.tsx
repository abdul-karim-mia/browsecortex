import { useEffect, useState } from 'preact/hooks';
import { getConfig, regenerateToken, setConfig, type McpServerConfig } from '@/mcp-server/config';
import { getRelayCommand } from '@/mcp-server/launcher';
import {
  subscribeToConnectionState,
  startMonitoring,
  stopMonitoring,
  type ConnectionState,
} from '@/mcp-server/connection-manager';
import { startRelayProcess, getStartupInstructions } from '@/mcp-server/relay-spawner';

/** BrowseCortex as MCP server settings (PLAN §21). */
export function McpServerTab() {
  const [cfg, setCfg] = useState<McpServerConfig | null>(null);
  const [connState, setConnState] = useState<ConnectionState>({
    status: 'disabled',
    message: 'Loading...',
  });
  const [copied, setCopied] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    getConfig().then(setCfg);
  }, []);

  // Subscribe to connection state changes and start monitoring
  useEffect(() => {
    const unsubscribe = subscribeToConnectionState(setConnState);
    startMonitoring(3000); // Check every 3 seconds
    return () => {
      unsubscribe();
      stopMonitoring();
    };
  }, []);

  if (!cfg) return null;

  const update = async (patch: Partial<McpServerConfig>) => setCfg(await setConfig(patch));
  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleStartRelay = async () => {
    const result = await startRelayProcess();
    if (!result.success) {
      const instr = await getStartupInstructions();
      setInstructions(instr);
      setShowInstructions(true);
    }
  };

  const relayCmd = getRelayCommand(cfg.port, cfg.token);

  // Zero-config client setup: the stdio bridge auto-spawns the relay, so the
  // user only pastes this into their MCP client (Claude Desktop, Cursor, …).
  const mcpClientConfig = JSON.stringify(
    {
      mcpServers: {
        browsecortex: {
          command: 'npx',
          args: ['browsecortex-mcp', '--token', cfg.token, '--port', String(cfg.port)],
        },
      },
    },
    null,
    2,
  );
  const streamableUrl = `http://localhost:${cfg.port}/mcp`;

  const statusEmojis: Record<string, string> = {
    disabled: '⚪',
    'waiting-for-relay': '⏳',
    connected: '🟢',
    failed: '🔴',
  };

  const bgColor =
    connState.status === 'connected'
      ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900'
      : connState.status === 'failed'
        ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-900'
        : connState.status === 'waiting-for-relay'
          ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-900'
          : 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700';

  return (
    <div class="space-y-6 text-sm">
      {/* Header */}
      <div>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => update({ enabled: (e.target as HTMLInputElement).checked })}
          />
          <span class="font-semibold">Enable BrowseCortex as an MCP server</span>
        </label>
        <p class="mt-1 text-xs text-gray-500">
          Lets external agents (Claude Code, Cursor, etc.) control this browser. Localhost only,
          token-authenticated.
        </p>
      </div>

      {/* Status Bar */}
      <div class={`rounded border p-4 transition-colors ${bgColor}`}>
        <div class="flex items-center gap-3">
          <span class="text-2xl">{statusEmojis[connState.status]}</span>
          <div class="flex-1">
            <div class="font-semibold">{connState.message}</div>
            {connState.suggestion && (
              <div class="mt-1 text-xs text-gray-600 dark:text-gray-300">
                {connState.suggestion}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Setup Checklist */}
      {cfg.enabled && (
        <section class="space-y-3 rounded border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-blue-900 dark:text-blue-100">Setup Checklist</h2>
            {connState.status !== 'connected' && (
              <button
                type="button"
                onClick={handleStartRelay}
                class="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
              >
                ▶️ Start Relay
              </button>
            )}
          </div>

          {/* Recommended: zero-config stdio bridge (auto-starts the relay) */}
          <div class="rounded-lg border border-blue-300 bg-white p-3 dark:border-blue-800 dark:bg-gray-900">
            <div class="text-xs font-semibold text-blue-900 dark:text-blue-100">
              ⭐ Recommended — one-command setup
            </div>
            <p class="mt-1 text-xs text-gray-600 dark:text-gray-300">
              Paste this into your MCP client config (Claude Desktop, Cursor, …). The{' '}
              <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">browsecortex-mcp</code> bridge
              auto-starts the relay for you — no separate terminal command needed (Node.js 20+
              required).
            </p>
            <div class="mt-2 flex items-start gap-2">
              <pre class="flex-1 overflow-x-auto rounded bg-gray-100 px-2 py-2 text-xs dark:bg-gray-800 font-mono">
                {mcpClientConfig}
              </pre>
              <button
                type="button"
                onClick={() => copy(mcpClientConfig, 'mcpjson')}
                class="whitespace-nowrap rounded bg-blue-500 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-600"
              >
                {copied === 'mcpjson' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div class="pt-1 text-xs font-semibold text-blue-900 dark:text-blue-100">
            Advanced — run the relay manually instead:
          </div>

          {/* Step 1 */}
          <div class="flex gap-3">
            <div class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white flex-shrink-0">
              1
            </div>
            <div class="flex-1">
              <div class="text-xs font-semibold">Install Node.js 20+</div>
              <div class="text-xs text-gray-600 dark:text-gray-300">
                Check: <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">node --version</code>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div class="flex gap-3">
            <div class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white flex-shrink-0">
              2
            </div>
            <div class="flex-1">
              <div class="text-xs font-semibold">Copy & run relay command</div>
              <div class="flex gap-2 items-center mt-1">
                <code class="flex-1 truncate rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800 font-mono">
                  {relayCmd.command}
                </code>
                <button
                  type="button"
                  onClick={() => copy(relayCmd.command, 'cmd')}
                  class="whitespace-nowrap rounded bg-blue-500 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-600"
                >
                  {copied === 'cmd' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div class="mt-1 text-xs text-gray-600 dark:text-gray-300">
                {relayCmd.description} ({relayCmd.shell})
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div class="flex gap-3">
            <div class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white flex-shrink-0">
              3
            </div>
            <div class="flex-1">
              <div class="text-xs font-semibold">Configure your agent</div>
              <div class="mt-1 space-y-2">
                <div>
                  <div class="text-xs text-gray-600 dark:text-gray-300 mb-1">
                    StreamableHTTP endpoint <span class="text-green-600 dark:text-green-400">(recommended)</span>:
                  </div>
                  <div class="flex gap-2 items-center">
                    <code class="flex-1 truncate rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800 font-mono">
                      {streamableUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => copy(streamableUrl, 'mcp')}
                      class="text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {copied === 'mcp' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div>
                  <div class="text-xs text-gray-600 dark:text-gray-300 mb-1">
                    MCP SSE endpoint <span class="text-gray-400">(legacy)</span>:
                  </div>
                  <div class="flex gap-2 items-center">
                    <code class="flex-1 truncate rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800 font-mono">
                      http://localhost:{cfg.port}/sse
                    </code>
                    <button
                      type="button"
                      onClick={() => copy(`http://localhost:${cfg.port}/sse`, 'sse')}
                      class="text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {copied === 'sse' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div>
                  <div class="text-xs text-gray-600 dark:text-gray-300 mb-1">Auth token:</div>
                  <div class="flex gap-2 items-center">
                    <code class="flex-1 truncate rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800 font-mono">
                      {cfg.token.slice(0, 20)}…
                    </code>
                    <button
                      type="button"
                      onClick={() => copy(cfg.token, 'token')}
                      class="text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {copied === 'token' ? '✓ Copied' : 'Copy full'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Configuration Section */}
      <section class="space-y-4 rounded border border-gray-200 p-4 dark:border-gray-700">
        <h2 class="font-semibold">Configuration</h2>

        {/* Port */}
        <div>
          <label class="text-xs font-semibold text-gray-700 dark:text-gray-300">Port</label>
          <div class="mt-1 flex items-center gap-2">
            <input
              type="number"
              value={cfg.port}
              onInput={(e) => update({ port: Number((e.target as HTMLInputElement).value) || 7822 })}
              class="w-24 rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
            />
            <span class="text-xs text-gray-500">
              {cfg.port === 7822 ? '(default)' : '(custom)'}
            </span>
          </div>
        </div>

        {/* Token */}
        <div>
          <label class="text-xs font-semibold text-gray-700 dark:text-gray-300">Auth Token</label>
          <div class="mt-1 flex items-center gap-2">
            <code class="flex-1 truncate rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">
              {cfg.token}
            </code>
            <button
              type="button"
              onClick={() => copy(cfg.token, 'token')}
              class="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={async () => setCfg(await regenerateToken())}
              class="text-xs text-amber-600 hover:underline dark:text-amber-500"
            >
              Regenerate
            </button>
          </div>
        </div>

        {/* Tool Access */}
        <div>
          <label class="text-xs font-semibold text-gray-700 dark:text-gray-300">Tool Access</label>
          <div class="mt-2 space-y-2">
            {(['safe', 'all', 'custom'] as const).map((mode) => (
              <label key={mode} class="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="toolAccess"
                  checked={cfg.toolAccess === mode}
                  onChange={() => update({ toolAccess: mode })}
                />
                <span>
                  {mode === 'safe'
                    ? '🔒 Safe (no destructive/run_javascript)'
                    : mode === 'all'
                      ? '⚡ All tools'
                      : '✓ Custom whitelist'}
                </span>
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
              placeholder="click_element, scroll, type_text, ..."
              class="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
            />
          )}
        </div>
      </section>

      {/* Info */}
      <div class="text-xs text-gray-500 dark:text-gray-400">
        <strong>Security:</strong> Relay is localhost-only and requires authentication. Regenerate
        token anytime to revoke access.
      </div>

      {/* Instructions Modal */}
      {showInstructions && (
        <div
          class="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowInstructions(false)}
        >
          <div
            class="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800 max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="mb-4 font-semibold text-gray-900 dark:text-gray-100">Start Relay Server</h3>
            <div class="mb-4 rounded bg-gray-100 p-3 text-xs font-mono dark:bg-gray-900">
              <pre class="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{instructions}</pre>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  copy(instructions, 'instructions');
                  setShowInstructions(false);
                }}
                class="flex-1 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                {copied === 'instructions' ? '✓ Copied' : 'Copy Command'}
              </button>
              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                class="flex-1 rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
