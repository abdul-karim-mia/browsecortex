import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import * as vfs from '@/fs/vfs';
import { getStorageEstimate } from '@/storage/quota';
import { Icon } from '@/components/Icon';
import type { VFile } from '@/types';

interface Props {
  conversationId: string;
}

/** Files tab (PLAN §7, §14, §41): per-conversation virtual filesystem browser. */
export function FilesTab({ conversationId }: Props) {
  const [files, setFiles] = useState<VFile[]>([]);
  const [selected, setSelected] = useState<VFile | null>(null);
  const [percent, setPercent] = useState(0);
  const [query, setQuery] = useState('');

  const refresh = () =>
    Storage.files.byConversation(conversationId).then((f) => setFiles(f.filter((x) => !x.isFolder)));
  useEffect(() => {
    refresh();
    getStorageEstimate().then((e) => setPercent(e.percent));
  }, [conversationId]);

  // Storage pressure banner (PLAN §41): soft >70%, strong >85%.
  const banner =
    percent > 85
      ? { cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200', msg: `Storage ${percent.toFixed(0)}% full — export and delete large files.` }
      : percent > 70
        ? { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200', msg: `Storage ${percent.toFixed(0)}% full.` }
        : null;

  const del = async (file: VFile) => {
    await vfs.deleteFile(conversationId, file.path);
    if (selected?.id === file.id) setSelected(null);
    await refresh();
  };

  const exportFile = (file: VFile) => {
    const blob = new Blob([file.content ?? ''], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div class="flex h-full flex-col text-sm">
      {banner && <div class={`px-3 py-1 text-xs ${banner.cls}`}>{banner.msg}</div>}
      {files.length > 0 && (
        <div class="relative px-3 pt-2">
          <span class="pointer-events-none absolute left-5 top-1/2 text-gray-400">
            <Icon name="search" size={13} />
          </span>
          <input
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder="Filter files…"
            class="w-full rounded border border-gray-300 py-1 pl-7 pr-2 text-xs dark:border-gray-600 dark:bg-gray-800"
          />
        </div>
      )}
      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        {files.length === 0 ? (
          <p class="mt-8 text-center text-gray-400">No files yet.</p>
        ) : (
          <ul class="space-y-1">
            {files
              .filter((f) => f.path.toLowerCase().includes(query.toLowerCase()))
              .map((f) => (
              <li key={f.id} class="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(f)}
                  class="flex flex-1 items-center gap-1.5 truncate text-left hover:underline"
                  title={f.path}
                >
                  <Icon name="file" size={14} class="shrink-0 text-gray-400" />
                  <span class="truncate">{f.path}</span>
                </button>
                <span class="flex shrink-0 items-center gap-2 text-gray-500">
                  <button type="button" onClick={() => exportFile(f)} title="Download">
                    <Icon name="download" size={14} />
                  </button>
                  <button type="button" onClick={() => del(f)} class="text-red-500" title="Delete">
                    <Icon name="trash" size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div class="max-h-[45%] overflow-y-auto border-t border-gray-200 p-3 dark:border-gray-700">
          <div class="mb-1 flex items-center justify-between">
            <span class="font-medium">{selected.name}</span>
            <button type="button" onClick={() => setSelected(null)} class="text-xs text-gray-400">
              close
            </button>
          </div>
          <pre class="whitespace-pre-wrap break-words text-xs text-gray-600 dark:text-gray-300">
            {selected.content}
          </pre>
        </div>
      )}
    </div>
  );
}
