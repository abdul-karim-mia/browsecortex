import { useEffect, useState } from 'preact/hooks';
import { fetchTools, listServers, removeServer, saveServer } from '@/mcp/client';
import type { McpServer } from '@/mcp/types';

const empty = (): McpServer => ({
  id: crypto.randomUUID(),
  name: '',
  url: '',
  authToken: '',
  enabled: true,
  tools: [],
});

/** MCP server management (PLAN §20). Add HTTP/SSE servers and list their tools. */
export function McpTab() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [draft, setDraft] = useState<McpServer>(empty());
  const [status, setStatus] = useState<string | null>(null);

  const refresh = () => listServers().then(setServers);
  useEffect(() => {
    refresh();
  }, []);

  const addAndConnect = async () => {
    if (!draft.name || !draft.url) {
      setStatus('Name and URL are required.');
      return;
    }
    setStatus('Connecting…');
    try {
      const tools = await fetchTools(draft);
      await saveServer({ ...draft, tools });
      setStatus(`Connected — ${tools.length} tools available.`);
      setDraft(empty());
      await refresh();
    } catch (e) {
      setStatus(`Connection failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const toggle = async (server: McpServer) => {
    await saveServer({ ...server, enabled: !server.enabled });
    await refresh();
  };

  const reconnect = async (server: McpServer) => {
    setStatus(`Reconnecting ${server.name}…`);
    try {
      const tools = await fetchTools(server);
      await saveServer({ ...server, tools });
      setStatus(`${server.name}: ${tools.length} tools.`);
      await refresh();
    } catch (e) {
      setStatus(`${server.name} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const del = async (id: string) => {
    await removeServer(id);
    await refresh();
  };

  return (
    <div class="space-y-6 text-sm">
      <section>
        <h2 class="mb-2 text-sm font-semibold">Connected MCP servers</h2>
        {servers.length === 0 ? (
          <p class="text-sm text-gray-400">No servers yet.</p>
        ) : (
          <ul class="space-y-2">
            {servers.map((s) => (
              <li key={s.id} class="rounded border border-gray-200 px-3 py-2 dark:border-gray-700">
                <div class="flex items-center justify-between">
                  <div>
                    <span class="mr-1">{s.enabled ? '🟢' : '⚪'}</span>
                    <span class="font-medium">{s.name}</span>
                    <span class="ml-2 text-xs text-gray-400">{s.tools.length} tools</span>
                  </div>
                  <div class="flex gap-2 text-xs">
                    <button type="button" onClick={() => toggle(s)} class="hover:underline">
                      {s.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button type="button" onClick={() => reconnect(s)} class="hover:underline">
                      Reconnect
                    </button>
                    <button
                      type="button"
                      onClick={() => del(s.id)}
                      class="text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {s.tools.length > 0 && (
                  <div class="mt-1 text-xs text-gray-400">
                    {s.tools.map((t) => t.name).join(', ')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="space-y-2 rounded border border-gray-200 p-4 dark:border-gray-700">
        <h2 class="text-sm font-semibold">Add a server</h2>
        <input
          value={draft.name}
          onInput={(e) => setDraft({ ...draft, name: (e.target as HTMLInputElement).value })}
          placeholder="Name (e.g. github)"
          class={inputCls}
        />
        <input
          value={draft.url}
          onInput={(e) => setDraft({ ...draft, url: (e.target as HTMLInputElement).value })}
          placeholder="http://localhost:3000/mcp"
          class={inputCls}
        />
        <input
          value={draft.authToken}
          onInput={(e) => setDraft({ ...draft, authToken: (e.target as HTMLInputElement).value })}
          placeholder="Auth token (optional)"
          class={inputCls}
        />
        <button type="button" onClick={addAndConnect} class="rounded bg-blue-500 px-4 py-1.5 font-medium text-white">
          Connect &amp; Save
        </button>
        {status && <p class="text-sm text-gray-500">{status}</p>}
      </section>
    </div>
  );
}

const inputCls = 'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800';
