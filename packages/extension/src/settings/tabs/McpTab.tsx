import { useEffect, useMemo, useState } from 'preact/hooks';
import { fetchTools, listServers, removeServer, saveServer } from '@/mcp/client';
import {
  clearServerDefinitionCache,
  getIndex,
  getServerDefinition,
  getSyncTime,
  syncIndex,
} from '@/mcp/directory';
import { connectApiKey, connectNone, connectOAuth, testConnection } from '@/mcp/connect';
import { detectAuthMethod } from '@/mcp/directory-types';
import type { McpCategory, McpDirectoryEntry, McpServerDefinition } from '@/mcp/directory-types';
import type { McpServer } from '@/mcp/types';

const CATEGORIES: { id: 'all' | McpCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'code', label: 'Code' },
  { id: 'communication', label: 'Comm' },
  { id: 'data', label: 'Data' },
  { id: 'design', label: 'Design' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'local', label: 'Local' },
  { id: 'community', label: 'Community' },
];

const inputCls =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800';

/** MCP Directory marketplace (MCP_DIRECTORY_PLAN). Browse, connect, manage. */
export function McpTab() {
  const [entries, setEntries] = useState<McpDirectoryEntry[]>([]);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | McpCategory>('all');
  const [syncTime, setSyncTime] = useState<string | undefined>();
  const [status, setStatus] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null); // selected directory id
  const [showCustom, setShowCustom] = useState(false);

  const refreshServers = () => listServers().then(setServers);

  useEffect(() => {
    refreshServers();
    getSyncTime().then(setSyncTime);
    getIndex()
      .then(setEntries)
      .catch((e) => setStatus(`Couldn't load directory: ${e instanceof Error ? e.message : e}`));
  }, []);

  const connectedById = useMemo(() => new Map(servers.map((s) => [s.id, s])), [servers]);

  const sync = async () => {
    setStatus('Syncing…');
    try {
      const fresh = await syncIndex();
      await clearServerDefinitionCache(fresh);
      setEntries(fresh);
      setSyncTime(await getSyncTime());
      setStatus('Synced.');
    } catch (e) {
      setStatus(`Sync failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  if (detail) {
    const entry = entries.find((e) => e.id === detail);
    return (
      <DetailView
        entry={entry}
        connected={entry ? connectedById.get(entry.id) : undefined}
        onBack={() => setDetail(null)}
        onChanged={refreshServers}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const matches = (e: McpDirectoryEntry) =>
    (category === 'all' || e.category === category) &&
    (!q ||
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q));

  const featured = entries
    .filter((e) => e.tier === 'featured' && matches(e))
    .sort((a, b) => a.popularity - b.popularity);
  const community = entries.filter((e) => e.tier === 'community' && matches(e));

  return (
    <div class="space-y-4 text-sm">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">MCP Servers</h2>
        <div class="flex items-center gap-3 text-xs">
          {syncTime && (
            <span class="text-gray-400">Synced {new Date(syncTime).toLocaleDateString()}</span>
          )}
          <button type="button" onClick={sync} class="text-blue-500 hover:underline">
            ↻ Sync
          </button>
        </div>
      </div>

      {status && <p class="text-xs text-gray-500">{status}</p>}

      <input
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        placeholder="🔍 Search connectors…"
        class={inputCls}
      />

      <div class="flex flex-wrap gap-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            class={`rounded-full px-2.5 py-0.5 text-xs ${
              category === c.id
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {servers.length > 0 && (
        <section>
          <h3 class="mb-1 text-xs font-semibold uppercase text-gray-400">
            Connected ({servers.length})
          </h3>
          <ul class="space-y-1">
            {servers.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (entries.some((e) => e.id === s.id)) setDetail(s.id);
                  }}
                  class="flex w-full items-center justify-between rounded border border-gray-200 px-3 py-2 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <span class="flex items-center gap-2">
                    <ServerIcon icon={s.icon} />
                    <span class="font-medium">{s.label ?? s.name}</span>
                  </span>
                  <span class="text-xs text-gray-400">
                    {s.enabled ? '🟢' : '⚪'}{' '}
                    {s.tools.length - (s.disabledTools?.length ?? 0)} tools
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {featured.length > 0 && (
        <Section title="Featured" entries={featured} connectedById={connectedById} onOpen={setDetail} />
      )}
      {community.length > 0 && (
        <Section
          title="Community"
          entries={community}
          connectedById={connectedById}
          onOpen={setDetail}
        />
      )}
      {featured.length === 0 && community.length === 0 && (
        <p class="text-gray-400">No connectors match.</p>
      )}

      <button
        type="button"
        onClick={() => setShowCustom((v) => !v)}
        class="text-xs text-blue-500 hover:underline"
      >
        + Add custom MCP server
      </button>
      {showCustom && <CustomServerForm onSaved={refreshServers} />}
    </div>
  );
}

function Section({
  title,
  entries,
  connectedById,
  onOpen,
}: {
  title: string;
  entries: McpDirectoryEntry[];
  connectedById: Map<string, McpServer>;
  onOpen: (id: string) => void;
}) {
  return (
    <section>
      <h3 class="mb-1 text-xs font-semibold uppercase text-gray-400">{title}</h3>
      <ul class="space-y-1">
        {entries.map((e) => (
          <li
            key={e.id}
            class="flex items-center justify-between rounded border border-gray-200 px-3 py-2 dark:border-gray-700"
          >
            <span class="flex min-w-0 items-center gap-2">
              <ServerIcon icon={e.icon} />
              <span class="min-w-0">
                <span class="font-medium">{e.name}</span>
                <span class="ml-2 truncate text-xs text-gray-400">{e.description}</span>
              </span>
            </span>
            <span class="ml-2 shrink-0">
              {connectedById.has(e.id) ? (
                <button
                  type="button"
                  onClick={() => onOpen(e.id)}
                  class="text-xs text-green-600 hover:underline"
                >
                  🟢 Manage
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpen(e.id)}
                  class="text-xs text-blue-500 hover:underline"
                >
                  View
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ServerIcon({ icon }: { icon?: string }) {
  const [broken, setBroken] = useState(false);
  if (!icon || broken) return <span class="text-base">🧩</span>;
  return (
    <img src={icon} alt="" width={20} height={20} class="rounded" onError={() => setBroken(true)} />
  );
}

// ── Detail / Connect / Manage ─────────────────────────────────────

function DetailView({
  entry,
  connected,
  onBack,
  onChanged,
}: {
  entry?: McpDirectoryEntry;
  connected?: McpServer;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [def, setDef] = useState<McpServerDefinition | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'none' | 'api_key' | 'url'>('none');
  const [secret, setSecret] = useState('');
  const [urlField, setUrlField] = useState('');
  const [showAllTools, setShowAllTools] = useState(false);

  useEffect(() => {
    if (!entry) return;
    getServerDefinition(entry)
      .then((d) => {
        setDef(d);
        setUrlField(d.url);
      })
      .catch((e) => setStatus(`Failed to load: ${e instanceof Error ? e.message : e}`));
  }, [entry?.id]);

  if (!entry) {
    return (
      <div class="text-sm">
        <button type="button" onClick={onBack} class="text-blue-500 hover:underline">
          ← Back
        </button>
        <p class="mt-4 text-gray-400">Server not found.</p>
      </div>
    );
  }
  if (!def) {
    return (
      <div class="text-sm">
        <button type="button" onClick={onBack} class="text-blue-500 hover:underline">
          ← Back
        </button>
        <p class="mt-4 text-gray-400">{status ?? 'Loading…'}</p>
      </div>
    );
  }

  const auth = detectAuthMethod(def);

  const copyPrompt = (p: string) => {
    navigator.clipboard.writeText(p).catch(() => {});
    setStatus('Prompt copied — paste it into chat.');
  };

  const startConnect = async () => {
    if (auth === 'api_key') return setMode('api_key');
    if (auth === 'none') return setMode('url');
    // OAuth
    setBusy(true);
    setStatus('Opening OAuth…');
    try {
      if (chrome.permissions?.request) {
        await chrome.permissions.request({ permissions: ['identity'] });
      }
      await connectOAuth(def);
      setStatus('Connected.');
      onChanged();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (def.authFallback === 'api_key' && def.apiKeyConfig) {
        setStatus(`OAuth didn't work (${msg}). Use an API key instead?`);
        setMode('api_key');
      } else {
        setStatus(`OAuth failed: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitApiKey = async () => {
    if (!secret.trim()) return;
    setBusy(true);
    setStatus('Testing connection…');
    try {
      await connectApiKey(def, secret.trim());
      setSecret('');
      setMode('none');
      setStatus('Connected.');
      onChanged();
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const submitNone = async () => {
    setBusy(true);
    setStatus('Testing connection…');
    try {
      await connectNone(def, urlField.trim());
      setMode('none');
      setStatus('Connected.');
      onChanged();
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const visibleTools = showAllTools ? def.tools : def.tools.slice(0, 8);

  return (
    <div class="space-y-4 text-sm">
      <div class="flex items-center justify-between">
        <button type="button" onClick={onBack} class="text-blue-500 hover:underline">
          ← {def.name}
        </button>
        {connected && <span class="text-xs text-green-600">🟢 Connected</span>}
      </div>

      <div class="flex items-start gap-3">
        <ServerIcon icon={def.icon} />
        <div class="flex-1">
          <div class="font-semibold">{def.name}</div>
          <p class="text-xs text-gray-500">{def.description}</p>
        </div>
        {!connected && (
          <button
            type="button"
            disabled={busy}
            onClick={startConnect}
            class="rounded bg-blue-500 px-4 py-1.5 font-medium text-white disabled:opacity-50"
          >
            Connect
          </button>
        )}
      </div>

      {status && <p class="text-xs text-gray-500">{status}</p>}

      {mode === 'api_key' && def.apiKeyConfig && (
        <div class="space-y-2 rounded border border-gray-200 p-3 dark:border-gray-700">
          <label class="text-xs font-medium">{def.apiKeyConfig.label}</label>
          <input
            type="password"
            value={secret}
            onInput={(e) => setSecret((e.target as HTMLInputElement).value)}
            placeholder={def.apiKeyConfig.placeholder ?? ''}
            class={inputCls}
          />
          {def.apiKeyConfig.helperText && (
            <p class="text-xs text-gray-400">
              {def.apiKeyConfig.helperText}
              {def.apiKeyConfig.helperUrl && (
                <>
                  {' '}
                  <a
                    href={def.apiKeyConfig.helperUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-500"
                  >
                    Get one ↗
                  </a>
                </>
              )}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={submitApiKey}
            class="rounded bg-blue-500 px-4 py-1.5 font-medium text-white disabled:opacity-50"
          >
            Test &amp; Connect
          </button>
        </div>
      )}

      {mode === 'url' && (
        <div class="space-y-2 rounded border border-gray-200 p-3 dark:border-gray-700">
          <label class="text-xs font-medium">Server URL</label>
          <input
            value={urlField}
            onInput={(e) => setUrlField((e.target as HTMLInputElement).value)}
            class={inputCls}
          />
          <button
            type="button"
            disabled={busy}
            onClick={submitNone}
            class="rounded bg-blue-500 px-4 py-1.5 font-medium text-white disabled:opacity-50"
          >
            Test &amp; Connect
          </button>
        </div>
      )}

      {def.examplePrompts && def.examplePrompts.length > 0 && (
        <section>
          <h3 class="mb-1 text-xs font-semibold uppercase text-gray-400">Example Prompts</h3>
          <ul class="space-y-1">
            {def.examplePrompts.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => copyPrompt(p)}
                  class="flex w-full items-center justify-between gap-2 rounded border border-gray-200 px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <span class="truncate">“{p}”</span>
                  <span class="shrink-0 text-blue-500">➜</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {def.longDescription && <p class="text-xs text-gray-600 dark:text-gray-300">{def.longDescription}</p>}

      <section>
        <h3 class="mb-1 text-xs font-semibold uppercase text-gray-400">
          Tools ({def.tools.length})
        </h3>
        <div class="flex flex-wrap gap-1">
          {visibleTools.map((t) => (
            <span
              key={t}
              class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            >
              {t}
            </span>
          ))}
          {!showAllTools && def.tools.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAllTools(true)}
              class="text-xs text-blue-500 hover:underline"
            >
              +{def.tools.length - 8} more
            </button>
          )}
        </div>
      </section>

      <section class="space-y-0.5 text-xs text-gray-500">
        <div>
          Tier: {def.tier === 'featured' ? 'Featured · Verified ✓' : `Community · by @${def.submittedBy ?? def.author}`}
        </div>
        <div>
          Auth: {auth === 'oauth' ? `OAuth${def.authFallback === 'api_key' ? ' + API key fallback' : ''}` : auth === 'api_key' ? 'API key' : 'None'}
        </div>
        <div>Transport: {def.transport}</div>
        {def.docsUrl && (
          <a href={def.docsUrl} target="_blank" rel="noopener noreferrer" class="text-blue-500">
            Documentation ↗
          </a>
        )}
      </section>

      {connected && <ManagePanel server={connected} onChanged={onChanged} onBack={onBack} />}
    </div>
  );
}

function ManagePanel({
  server,
  onChanged,
  onBack,
}: {
  server: McpServer;
  onChanged: () => void;
  onBack: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const disabled = new Set(server.disabledTools ?? []);

  const toggleTool = async (tool: string) => {
    const next = new Set(disabled);
    if (next.has(tool)) next.delete(tool);
    else next.add(tool);
    await saveServer({ ...server, disabledTools: [...next] });
    onChanged();
  };

  const enableAll = async () => {
    await saveServer({ ...server, disabledTools: [] });
    onChanged();
  };

  const test = async () => {
    setStatus('Testing…');
    try {
      const n = await testConnection(server);
      setStatus(`OK — ${n} tools.`);
      onChanged();
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const disconnect = async () => {
    await removeServer(server.id); // wipes credentials (plan §13)
    onChanged();
    onBack();
  };

  return (
    <section class="space-y-2 rounded border border-gray-200 p-3 dark:border-gray-700">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-semibold uppercase text-gray-400">
          Tools ({server.tools.length})
        </h3>
        <button type="button" onClick={enableAll} class="text-xs text-blue-500 hover:underline">
          Enable all
        </button>
      </div>
      <ul class="max-h-48 space-y-0.5 overflow-y-auto">
        {server.tools.map((t) => (
          <li key={t.name}>
            <label class="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!disabled.has(t.name)}
                onChange={() => toggleTool(t.name)}
              />
              <span class={disabled.has(t.name) ? 'text-gray-400 line-through' : ''}>{t.name}</span>
            </label>
          </li>
        ))}
      </ul>
      {status && <p class="text-xs text-gray-500">{status}</p>}
      <div class="flex gap-3 pt-1 text-xs">
        <button type="button" onClick={test} class="text-blue-500 hover:underline">
          Test Connection
        </button>
        <button type="button" onClick={disconnect} class="text-red-500 hover:underline">
          Disconnect
        </button>
      </div>
    </section>
  );
}

// ── Custom (off-directory) server form ────────────────────────────

function CustomServerForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const add = async () => {
    if (!name.trim() || !url.trim()) {
      setStatus('Name and URL are required.');
      return;
    }
    setStatus('Connecting…');
    const server: McpServer = {
      id: crypto.randomUUID(),
      name: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label: name.trim(),
      url: url.trim(),
      authToken: token.trim() || undefined,
      enabled: true,
      tools: [],
      auth: token.trim() ? 'api_key' : 'none',
      connectedAt: new Date().toISOString(),
    };
    try {
      const tools = await fetchTools(server);
      await saveServer({ ...server, tools });
      setStatus(`Connected — ${tools.length} tools.`);
      setName('');
      setUrl('');
      setToken('');
      onSaved();
    } catch (e) {
      setStatus(`Connection failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <div class="space-y-2 rounded border border-gray-200 p-3 dark:border-gray-700">
      <input
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        placeholder="Name (e.g. my-server)"
        class={inputCls}
      />
      <input
        value={url}
        onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
        placeholder="http://localhost:3000/mcp"
        class={inputCls}
      />
      <input
        value={token}
        onInput={(e) => setToken((e.target as HTMLInputElement).value)}
        placeholder="Auth token (optional)"
        class={inputCls}
      />
      <button
        type="button"
        onClick={add}
        class="rounded bg-blue-500 px-4 py-1.5 font-medium text-white"
      >
        Connect &amp; Save
      </button>
      {status && <p class="text-xs text-gray-500">{status}</p>}
    </div>
  );
}
