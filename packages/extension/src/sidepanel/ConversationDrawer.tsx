import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import { Icon } from '@/components/Icon';
import { buildExport, type ExportFormat } from '@/conversations/export';
import { summarizeConversation } from '@/conversations/summarize';
import type { Conversation } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  currentId: string;
  onSelect: (id: string) => void;
  /** Conversation with a live agent run, shown with a pulsing dot (PLAN §48). */
  runningId?: string | null;
}

/** Sliding conversation list (PLAN §7, §8). Search, star, open, delete. */
type Filter = 'all' | 'starred' | 'today' | 'week';

function inRange(iso: string, filter: Filter): boolean {
  if (filter !== 'today' && filter !== 'week') return true;
  const then = new Date(iso).getTime();
  const days = (Date.now() - then) / 86_400_000;
  return filter === 'today' ? days < 1 : days < 7;
}

export function ConversationDrawer({ open, onClose, currentId, onSelect, runningId }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // Cascade-delete dialog state (PLAN §44).
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const [linked, setLinked] = useState({ tasks: 0, memories: 0 });
  const [delTasks, setDelTasks] = useState(false);
  const [delMemories, setDelMemories] = useState(false);
  // Export dialog (B1).
  const [exportTarget, setExportTarget] = useState<Conversation | null>(null);
  // Conversation being summarized (B6).
  const [summarizingId, setSummarizingId] = useState<string | null>(null);

  const refresh = () => Storage.conversations.list(100).then(setConversations);
  useEffect(() => {
    if (open) refresh();
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = conversations
    .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    .filter((c) => (filter === 'starred' ? c.starred : true))
    .filter((c) => inRange(c.updatedAt, filter))
    // Pinned first, then by recency.
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'starred', label: '⭐ Starred' },
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
  ];

  const star = async (c: Conversation, e: Event) => {
    e.stopPropagation();
    await Storage.conversations.save({ ...c, starred: !c.starred });
    await refresh();
  };

  const pin = async (c: Conversation, e: Event) => {
    e.stopPropagation();
    await Storage.conversations.save({ ...c, pinned: !c.pinned });
    await refresh();
  };

  const rename = async (c: Conversation, e: Event) => {
    e.stopPropagation();
    const name = prompt('Rename conversation', c.name)?.trim();
    if (name && name !== c.name) {
      await Storage.conversations.save({ ...c, name });
      await refresh();
    }
  };

  const askDelete = async (c: Conversation, e: Event) => {
    e.stopPropagation();
    const counts = await Storage.conversations.linkedCounts(c.id);
    setLinked(counts);
    setDelTasks(false);
    setDelMemories(false);
    setPendingDelete(c);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await Storage.conversations.remove(pendingDelete.id, {
      deleteTasks: delTasks,
      deleteMemories: delMemories,
    });
    setPendingDelete(null);
    await refresh();
  };

  const summarize = async (c: Conversation, e: Event) => {
    e.stopPropagation();
    if (summarizingId) return;
    setSummarizingId(c.id);
    try {
      await summarizeConversation(c.id);
      await refresh();
    } finally {
      setSummarizingId(null);
    }
  };

  const doExport = async (format: ExportFormat) => {
    if (!exportTarget) return;
    const out = await buildExport(exportTarget.id, format);
    setExportTarget(null);
    if (!out) return;
    const blob = new Blob([out.content], { type: out.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = out.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  return (
    <div class="absolute inset-0 z-20 flex" onClick={onClose}>
      <div class="absolute inset-0 bg-black/30" />
      <aside
        class="relative h-full w-72 max-w-[80%] overflow-y-auto bg-white p-3 shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="relative mb-2">
          <span class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">
            <Icon name="search" size={14} />
          </span>
          <input
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder="Search conversations…"
            class="w-full rounded border border-gray-300 py-1 pl-7 pr-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
        </div>
        <div class="mb-3 flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              class={`rounded-full px-2 py-0.5 text-xs ${
                filter === f.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <p class="text-sm text-gray-400">No conversations.</p>
        ) : (
          <ul class="space-y-1">
            {filtered.map((c) => (
              <li key={c.id}>
                <div
                  onClick={() => {
                    onSelect(c.id);
                    onClose();
                  }}
                  class={`flex cursor-pointer flex-col rounded px-2 py-1 text-sm ${
                    c.id === currentId
                      ? 'bg-blue-100 dark:bg-blue-950'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <div class="flex items-center justify-between">
                  <span
                    class="flex items-center gap-1 truncate"
                    onDblClick={(e) => rename(c, e)}
                    title="Double-click to rename"
                  >
                    {c.id === runningId && (
                      <span
                        class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-green-500"
                        title="Agent running"
                      />
                    )}
                    {c.pinned && <Icon name="pin" size={12} class="shrink-0 text-blue-500" />}
                    {c.name}
                  </span>
                  <span class="flex shrink-0 items-center gap-1.5 opacity-60 hover:opacity-100">
                    <button type="button" onClick={(e) => pin(c, e)} title="Pin to top">
                      <Icon name="pin" size={14} class={c.pinned ? 'text-blue-500' : ''} />
                    </button>
                    <button type="button" onClick={(e) => star(c, e)} title="Star">
                      <Icon
                        name={c.starred ? 'star-filled' : 'star'}
                        size={14}
                        class={c.starred ? 'text-amber-400' : ''}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => summarize(c, e)}
                      disabled={summarizingId === c.id}
                      title="Summarize conversation"
                    >
                      <Icon
                        name="sparkle"
                        size={14}
                        class={summarizingId === c.id ? 'animate-pulse text-blue-500' : ''}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExportTarget(c);
                      }}
                      title="Export"
                    >
                      <Icon name="download" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => askDelete(c, e)}
                      class="text-red-500"
                      title="Delete"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </span>
                  </div>
                  {c.summary && (
                    <p class="mt-0.5 truncate text-xs text-gray-400" title={c.summary}>
                      {c.summary}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {pendingDelete && (
        <div
          class="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            e.stopPropagation();
            setPendingDelete(null);
          }}
        >
          <div
            class="w-full max-w-xs rounded-lg bg-white p-4 shadow-xl dark:bg-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <p class="mb-3 text-sm font-medium">
              Delete “{pendingDelete.name}”?
            </p>
            {(linked.tasks > 0 || linked.memories > 0) && (
              <div class="mb-3 space-y-1.5 text-sm">
                {linked.tasks > 0 && (
                  <label class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={delTasks}
                      onChange={(e) => setDelTasks((e.target as HTMLInputElement).checked)}
                    />
                    Also delete linked tasks ({linked.tasks})
                  </label>
                )}
                {linked.memories > 0 && (
                  <label class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={delMemories}
                      onChange={(e) => setDelMemories((e.target as HTMLInputElement).checked)}
                    />
                    Also delete linked memories ({linked.memories})
                  </label>
                )}
              </div>
            )}
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                class="rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                class="rounded bg-red-500 px-3 py-1 text-sm font-medium text-white hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {exportTarget && (
        <div
          class="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            e.stopPropagation();
            setExportTarget(null);
          }}
        >
          <div
            class="w-full max-w-xs rounded-lg bg-white p-4 shadow-xl dark:bg-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <p class="mb-3 text-sm font-medium">Export “{exportTarget.name}”</p>
            <div class="flex gap-2">
              <button
                type="button"
                onClick={() => doExport('markdown')}
                class="flex-1 rounded bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
              >
                Markdown
              </button>
              <button
                type="button"
                onClick={() => doExport('json')}
                class="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
