import { useEffect, useState } from 'preact/hooks';
import { Storage } from '@/storage';
import * as vfs from '@/fs/vfs';
import { getStorageEstimate } from '@/storage/quota';
import { Icon } from '@/components/Icon';
import type { VFile } from '@/types';
import { renderMarkdown } from '../utils/markdown';
import { highlightCode, highlightJSON } from '../utils/highlighter';

interface Props {
  conversationId: string;
}

/** Parses CSV text into a 2D string array. Handles delimiters dynamically and supports quoted cells. */
function parseCSV(text: string): string[][] {
  let delimiter = ',';
  const firstLine = text.split('\n')[0] || '';
  if (firstLine.includes(';') && !firstLine.includes(',')) {
    delimiter = ';';
  } else if (firstLine.includes('\t') && !firstLine.includes(',')) {
    delimiter = '\t';
  }

  const lines: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        row.push(cell);
        cell = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(cell);
        lines.push(row);
        row = [];
        cell = '';
      } else {
        cell += char;
      }
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    lines.push(row);
  }
  return lines.filter((r) => r.length > 0 && r.some((c) => c.trim() !== ''));
}


function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

interface LanguageSpec {
  isImage: boolean;
  isMarkdown: boolean;
  isCsv: boolean;
  isHtml: boolean;
  isJson: boolean;
  isCss: boolean;
  isSql: boolean;
  isYaml: boolean;
  isJsTs: boolean;
  isXml: boolean;
  isCodeLanguage: boolean;
}

/** Detects file type using extension, mimeType, and content-sniffing for extensionless/plain-text files. */
function detectLanguage(name: string, mimeType: string, content: string): LanguageSpec {
  const nameLower = name.toLowerCase();
  const mimeLower = mimeType.toLowerCase();
  const contentTrimmed = content.trim();

  // Sniff HTML: start with standard doctype/html tag or contain close tags
  const isHtmlSniffed = contentTrimmed.startsWith('<!DOCTYPE html') || 
                        contentTrimmed.toLowerCase().startsWith('<html') ||
                        (contentTrimmed.startsWith('<') && (contentTrimmed.includes('</html') || contentTrimmed.includes('</head>') || contentTrimmed.includes('</body>') || contentTrimmed.includes('</style>')));

  // Sniff JSON: verify structured brackets parse successfully
  let isJsonSniffed = false;
  try {
    if (contentTrimmed.startsWith('{') || contentTrimmed.startsWith('[')) {
      JSON.parse(contentTrimmed);
      isJsonSniffed = true;
    }
  } catch {
    // not valid JSON
  }

  // Sniff CSS: match standard property/bracket syntax if not HTML
  const isCssSniffed = !isHtmlSniffed && contentTrimmed.includes('{') && contentTrimmed.includes('}') && 
                       (contentTrimmed.includes('margin:') || contentTrimmed.includes('padding:') || contentTrimmed.includes('color:') || contentTrimmed.includes('background-') || contentTrimmed.includes('--bg:'));

  const isImage = mimeLower.startsWith('image/') || content.startsWith('data:image/') || /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(nameLower);
  const isMarkdown = mimeLower === 'text/markdown' || /\.(md|markdown)$/i.test(nameLower);
  const isCsv = mimeLower === 'text/csv' || nameLower.endsWith('.csv');
  const isHtml = mimeLower === 'text/html' || /\.(html?)$/i.test(nameLower) || isHtmlSniffed;
  
  const isJson = mimeLower === 'application/json' || nameLower.endsWith('.json') || isJsonSniffed;
  const isCss = mimeLower === 'text/css' || nameLower.endsWith('.css') || isCssSniffed;
  const isSql = mimeLower === 'application/sql' || nameLower.endsWith('.sql');
  const isYaml = mimeLower === 'text/yaml' || mimeLower === 'application/yaml' || /\.(ya?ml)$/i.test(nameLower);
  const isJsTs = mimeLower === 'application/javascript' || mimeLower === 'application/x-typescript' || /\.(jsx?|tsx?|mjs|cjs)$/i.test(nameLower);
  const isXml = mimeLower === 'application/xml' || mimeLower === 'image/svg+xml' || /\.(xml|svg)$/i.test(nameLower) || contentTrimmed.startsWith('<?xml') || contentTrimmed.startsWith('<svg');

  const isCodeLanguage = isCss || isSql || isYaml || isJsTs || isXml;

  return {
    isImage,
    isMarkdown,
    isCsv,
    isHtml,
    isJson,
    isCss,
    isSql,
    isYaml,
    isJsTs,
    isXml,
    isCodeLanguage
  };
}

/** Files tab (PLAN §7, §14, §41): per-conversation virtual filesystem browser. */
export function FilesTab({ conversationId }: Props) {
  const [files, setFiles] = useState<VFile[]>([]);
  const [selected, setSelected] = useState<VFile | null>(null);
  const [percent, setPercent] = useState(0);
  const [query, setQuery] = useState('');
  const [isFormatted, setIsFormatted] = useState(true);
  const [copied, setCopied] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  const refresh = () =>
    Storage.files
      .byConversation(conversationId)
      .then((f) => setFiles(f.filter((x) => !x.isFolder)));

  useEffect(() => {
    refresh();
    getStorageEstimate().then((e) => setPercent(e.percent));
    setSelected(null);
  }, [conversationId]);

  useEffect(() => {
    setIsFormatted(true);
    setCopied(false);
    setDimensions(null);
  }, [selected]);

  // Storage pressure banner (PLAN §41): soft >70%, strong >85%.
  const banner =
    percent > 85
      ? {
          cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
          msg: `Storage ${percent.toFixed(0)}% full — export and delete large files.`,
        }
      : percent > 70
        ? {
            cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
            msg: `Storage ${percent.toFixed(0)}% full.`,
          }
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

  const content = selected?.content ?? '';
  const {
    isImage,
    isMarkdown,
    isCsv,
    isHtml,
    isJson,
    isCodeLanguage
  } = detectLanguage(selected?.name ?? '', selected?.mimeType ?? '', content);

  let parsedJson: any = null;
  if (isJson) {
    try {
      parsedJson = JSON.parse(content.trim());
    } catch {
      // ignore
    }
  }

  const showToggle = isImage || isMarkdown || isCsv || isHtml || isJson || isCodeLanguage;

  let copyContent = content;
  if (isJson && parsedJson) {
    copyContent = JSON.stringify(parsedJson, null, 2);
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(copyContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  let previewPanel = null;

  if (isFormatted) {
    if (isImage) {
      previewPanel = (
        <div class="flex flex-col items-center justify-center p-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/10 h-full overflow-y-auto">
          <div class="checkered-pattern flex items-center justify-center p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xs max-w-full max-h-[80%] bg-white dark:bg-gray-950">
            <img
              src={content}
              alt={selected?.name}
              onLoad={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
              }}
              class="max-h-[220px] max-w-full rounded object-contain shadow-md"
            />
          </div>
          <div class="mt-2.5 flex flex-wrap gap-2 text-[10px] text-gray-500 justify-center">
            <span class="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">
              MIME: {selected?.mimeType}
            </span>
            <span class="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">
              Size: {Math.round((content.length * 0.75) / 1024)} KB
            </span>
            {dimensions && (
              <span class="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                Dimensions: {dimensions.width} × {dimensions.height} px
              </span>
            )}
          </div>
        </div>
      );
    } else if (isMarkdown) {
      const html = renderMarkdown(content);
      previewPanel = (
        <div
          class="md select-text p-4 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-800 overflow-y-auto h-full max-h-full"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } else if (isCsv) {
      const rows = parseCSV(content);
      if (rows.length === 0) {
        previewPanel = (
          <div class="p-6 text-center text-gray-400 border border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
            Empty CSV file
          </div>
        );
      } else {
        previewPanel = (
          <div class="overflow-auto border border-gray-200 dark:border-gray-800 rounded-lg max-h-full bg-white dark:bg-gray-950 h-full">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-left border-collapse">
              <thead class="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_rgba(255,255,255,0.02)]">
                <tr>
                  {rows[0]?.map((col, idx) => (
                    <th key={idx} class="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 whitespace-nowrap bg-gray-50 dark:bg-gray-900">
                      {col || `Column ${idx + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-950">
                {rows.slice(1).map((row, rIdx) => (
                  <tr key={rIdx} class="hover:bg-gray-50 dark:hover:bg-gray-900/40 odd:bg-white dark:odd:bg-gray-950 even:bg-gray-50/30 dark:even:bg-gray-900/10">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} class="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 max-w-[200px] truncate select-text" title={cell}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
    } else if (isHtml) {
      previewPanel = (
        <div class="w-full h-full min-h-[300px] bg-white rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden relative">
          <iframe
            srcDoc={content}
            sandbox="allow-scripts"
            class="w-full h-full border-0 bg-white"
            title={selected?.name}
          />
        </div>
      );
    } else if (isJson) {
      if (parsedJson) {
        const prettyJson = JSON.stringify(parsedJson, null, 2);
        const highlightedHtml = highlightJSON(prettyJson);
        previewPanel = (
          <pre
            class="font-mono text-xs p-4 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 overflow-auto h-full max-h-full select-text whitespace-pre"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        );
      } else {
        previewPanel = (
          <div class="flex flex-col gap-2 h-full">
            <div class="px-3 py-2 text-xs bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 rounded border border-red-200 dark:border-red-900">
              Invalid JSON: Could not parse. Showing highlighted text below.
            </div>
            <pre
              class="font-mono text-xs p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 flex-1 overflow-auto whitespace-pre select-text"
              dangerouslySetInnerHTML={{ __html: highlightJSON(content) }}
            />
          </div>
        );
      }
    } else if (isCodeLanguage) {
      const highlightedHtml = highlightCode(content, selected?.name ?? '', selected?.mimeType ?? '');
      previewPanel = (
        <pre
          class="font-mono text-xs p-4 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 overflow-auto h-full max-h-full select-text whitespace-pre"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      );
    } else {
      previewPanel = (
        <pre class="font-mono text-xs p-4 bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-800 select-text overflow-auto h-full max-h-full whitespace-pre">
          {content}
        </pre>
      );
    }
  } else {
    // Raw mode: highlight code languages too, showing original format
    if (isHtml || isJson || isCodeLanguage) {
      const highlightedHtml = isJson
        ? highlightJSON(content)
        : highlightCode(content, selected?.name ?? '', selected?.mimeType ?? '');
      previewPanel = (
        <pre
          class="font-mono text-xs p-4 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 overflow-auto h-full max-h-full select-text whitespace-pre"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      );
    } else {
      previewPanel = (
        <pre class="font-mono text-xs p-4 bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-800 select-text overflow-auto h-full max-h-full whitespace-pre">
          {content}
        </pre>
      );
    }
  }

  return (
    <div class="flex h-full flex-col text-sm relative">
      {banner && <div class={`px-3 py-1 text-xs ${banner.cls}`}>{banner.msg}</div>}
      
      {!selected ? (
        <>
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
                      <span class="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => exportFile(f)}
                          title="Download"
                          class="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
                        >
                          <Icon name="download" size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => del(f)}
                          class="rounded p-1 text-gray-500 hover:bg-red-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/40 dark:hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div class="flex-1 flex flex-col min-h-0 h-full">
          <div class="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-3 py-1.5 bg-gray-50 dark:bg-gray-900/50">
            <div class="flex items-center gap-2 truncate mr-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                class="rounded hover:bg-gray-200 dark:hover:bg-gray-700 p-1 text-gray-500 hover:text-gray-750 dark:text-gray-400 dark:hover:text-gray-200 transition-colors flex items-center justify-center shrink-0"
                title="Back to file list"
              >
                <BackIcon />
              </button>
              <Icon name={isImage ? 'eye' : 'file'} size={14} class="shrink-0 text-gray-400" />
              <span class="font-medium truncate text-xs" title={selected.path}>
                {selected.name}
              </span>
            </div>
            
            <div class="flex items-center gap-2 shrink-0">
              {showToggle && (
                <div class="inline-flex rounded bg-gray-200/50 dark:bg-gray-800/50 p-0.5" role="group">
                  <button
                    type="button"
                    onClick={() => setIsFormatted(true)}
                    class={`rounded px-2 py-0.5 text-[10px] font-medium transition-all ${
                      isFormatted
                        ? 'bg-white text-gray-800 shadow-xs dark:bg-gray-700 dark:text-gray-100'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    Formatted
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFormatted(false)}
                    class={`rounded px-2 py-0.5 text-[10px] font-medium transition-all ${
                      !isFormatted
                        ? 'bg-white text-gray-800 shadow-xs dark:bg-gray-700 dark:text-gray-100'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    Raw
                  </button>
                </div>
              )}

              {(!isImage || !isFormatted) && (
                <button
                  type="button"
                  onClick={handleCopy}
                  class="flex items-center gap-1 rounded bg-white hover:bg-gray-50 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-750 px-1.5 py-0.5 text-[10px] text-gray-700 dark:text-gray-300 transition-colors shadow-2xs"
                >
                  <Icon name={copied ? 'check' : 'copy'} size={11} />
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => exportFile(selected)}
                class="rounded hover:bg-gray-200 dark:hover:bg-gray-700 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex items-center justify-center"
                title="Download file"
              >
                <Icon name="download" size={14} />
              </button>
            </div>
          </div>
          <div class="flex-1 overflow-hidden p-3 min-h-0 bg-white/50 dark:bg-gray-950/20">
            {previewPanel}
          </div>
        </div>
      )}
    </div>
  );
}
