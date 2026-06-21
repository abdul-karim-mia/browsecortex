import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import { extractKeywords } from '@/memory/retrieval';
import type { Memory, MemoryType } from '@/types';

const TYPES: MemoryType[] = ['user', 'agent', 'global', 'conversation'];

/** Memory Manager (PLAN §12). List, add, and delete memories. */
export function MemoryTab() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [content, setContent] = useState('');
  const [type, setType] = useState<MemoryType>('global');

  const refresh = () => Storage.memories.list().then(setMemories);
  useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    if (!content.trim()) return;
    const now = new Date().toISOString();
    await Storage.memories.save({
      id: crypto.randomUUID(),
      type,
      content: content.trim(),
      keywords: extractKeywords(content),
      createdAt: now,
      updatedAt: now,
      source: 'user',
    });
    setContent('');
    await refresh();
  };

  const remove = async (id: string) => {
    await Storage.memories.remove(id);
    await refresh();
  };

  return (
    <div class="space-y-6 text-sm">
      <div class="space-y-2 rounded border border-gray-200 p-4 dark:border-gray-700">
        <textarea
          rows={2}
          value={content}
          onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
          placeholder="Something to remember…"
          class="w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
        />
        <div class="flex items-center gap-2">
          <select
            value={type}
            onChange={(e) => setType((e.target as HTMLSelectElement).value as MemoryType)}
            class="rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
          >
            {TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {tp}
              </option>
            ))}
          </select>
          <button type="button" onClick={add} class="rounded bg-blue-500 px-3 py-1 text-white">
            Add memory
          </button>
        </div>
      </div>

      {memories.length === 0 ? (
        <p class="text-gray-400">No memories yet.</p>
      ) : (
        <ul class="space-y-2">
          {memories.map((m) => (
            <li
              key={m.id}
              class="flex items-start justify-between rounded border border-gray-200 px-3 py-2 dark:border-gray-700"
            >
              <div>
                <span class="mr-2 rounded bg-gray-200 px-1 text-xs dark:bg-gray-700">{m.type}</span>
                {m.content}
                <div class="text-xs text-gray-400">{m.source}</div>
              </div>
              <button
                type="button"
                onClick={() => remove(m.id)}
                class="text-xs text-red-500 hover:underline"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
