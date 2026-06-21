import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import { Icon } from '@/components/Icon';
import type { Conversation } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  currentId: string;
  onSelect: (id: string) => void;
}

/** Sliding conversation list (PLAN §7, §8). Search, star, open, delete. */
type Filter = 'all' | 'starred' | 'today' | 'week';

function inRange(iso: string, filter: Filter): boolean {
  if (filter !== 'today' && filter !== 'week') return true;
  const then = new Date(iso).getTime();
  const days = (Date.now() - then) / 86_400_000;
  return filter === 'today' ? days < 1 : days < 7;
}

export function ConversationDrawer({ open, onClose, currentId, onSelect }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

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

  const del = async (c: Conversation, e: Event) => {
    e.stopPropagation();
    await Storage.conversations.remove(c.id);
    await refresh();
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
                  class={`flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm ${
                    c.id === currentId
                      ? 'bg-blue-100 dark:bg-blue-950'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <span
                    class="flex items-center gap-1 truncate"
                    onDblClick={(e) => rename(c, e)}
                    title="Double-click to rename"
                  >
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
                      onClick={(e) => del(c, e)}
                      class="text-red-500"
                      title="Delete"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
