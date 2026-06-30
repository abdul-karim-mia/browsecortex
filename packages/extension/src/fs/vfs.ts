/**
 * Virtual filesystem service (PLAN §14). Path-addressed files/folders in
 * IndexedDB, scoped per conversation — each chat has its own workspace, so the
 * same path in two conversations is two different files.
 *
 * Every operation takes the owning conversationId; lookups and listings are
 * filtered to that conversation.
 */
import { Storage } from '@/storage';
import { isStorageFull } from '@/storage/quota';
import type { VFile } from '@/types';

function normalize(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return '/' + parts.join('/');
}

function parentPath(path: string): string {
  const norm = normalize(path);
  const idx = norm.lastIndexOf('/');
  return idx <= 0 ? '/' : norm.slice(0, idx);
}

function baseName(path: string): string {
  const norm = normalize(path);
  return norm.slice(norm.lastIndexOf('/') + 1);
}

async function findByPath(conversationId: string, path: string): Promise<VFile | undefined> {
  const norm = normalize(path);
  return (await Storage.files.byConversation(conversationId)).find((f) => f.path === norm);
}

function guessMime(name: string): string {
  if (name.endsWith('.md')) return 'text/markdown';
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.html')) return 'text/html';
  if (name.endsWith('.csv')) return 'text/csv';
  return 'text/plain';
}

async function ensureParent(conversationId: string, path: string): Promise<string | null> {
  const parent = parentPath(path);
  if (parent === '/') return null;
  const existing = await findByPath(conversationId, parent);
  if (existing) return existing.id;
  await createFolder(conversationId, parent);
  return (await findByPath(conversationId, parent))?.id ?? null;
}

export async function createFolder(conversationId: string, path: string): Promise<VFile> {
  const existing = await findByPath(conversationId, path);
  if (existing) return existing;
  const parentId = await ensureParent(conversationId, path);
  const now = new Date().toISOString();
  const folder: VFile = {
    id: crypto.randomUUID(),
    conversationId,
    name: baseName(path),
    path: normalize(path),
    parentId,
    content: null,
    isFolder: true,
    mimeType: 'inode/directory',
    size: 0,
    createdAt: now,
    updatedAt: now,
  };
  await Storage.files.save(folder);
  return folder;
}

export async function exists(conversationId: string, path: string): Promise<boolean> {
  return !!(await findByPath(conversationId, path));
}

export async function getInfo(conversationId: string, path: string): Promise<VFile> {
  const file = await findByPath(conversationId, path);
  if (!file) throw new Error(`Not found: ${path}`);
  return file;
}

export async function copy(conversationId: string, from: string, to: string): Promise<void> {
  const file = await findByPath(conversationId, from);
  if (!file) throw new Error(`Not found: ${from}`);

  const normTo = normalize(to);
  const destFile = await findByPath(conversationId, normTo);
  let targetPath = normTo;

  if (destFile?.isFolder) {
    targetPath = normalize(normTo + '/' + file.name);
  }

  if (await findByPath(conversationId, targetPath)) {
    throw new Error(`Destination already exists: ${targetPath}`);
  }

  const all = await Storage.files.byConversation(conversationId);

  if (file.isFolder) {
    const toCopy = all
      .filter((f) => f.path === file.path || f.path.startsWith(file.path + '/'))
      .sort((a, b) => a.path.length - b.path.length);

    for (const f of toCopy) {
      const rel = f.path.slice(file.path.length);
      const newPath = normalize(targetPath + rel);

      if (f.isFolder) {
        await createFolder(conversationId, newPath);
      } else {
        await createFile(conversationId, newPath, f.content ?? '');
      }
    }
  } else {
    await createFile(conversationId, targetPath, file.content ?? '');
  }
}

export async function createFile(
  conversationId: string,
  path: string,
  content: string,
  encoding?: 'utf-8' | 'base64',
): Promise<VFile> {
  if (await isStorageFull()) {
    throw new Error('Storage is nearly full — export and delete some files before creating more.');
  }
  if (await findByPath(conversationId, path)) throw new Error(`File already exists: ${path}`);
  const parentId = await ensureParent(conversationId, path);
  const now = new Date().toISOString();

  let finalContent = content;
  if (encoding === 'base64') {
    try {
      finalContent = atob(content);
    } catch (err) {
      throw new Error(`Invalid base64 content: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const file: VFile = {
    id: crypto.randomUUID(),
    conversationId,
    name: baseName(path),
    path: normalize(path),
    parentId,
    content: finalContent,
    isFolder: false,
    mimeType: guessMime(path),
    size: finalContent.length,
    createdAt: now,
    updatedAt: now,
  };
  await Storage.files.save(file);
  return file;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function readFile(
  conversationId: string,
  path: string,
  options?: {
    encoding?: 'utf-8' | 'base64';
    lines?: [number, number];
    bytes?: [number, number];
  },
): Promise<string> {
  const file = await findByPath(conversationId, path);
  if (!file || file.isFolder) throw new Error(`File not found: ${path}`);

  let content = file.content ?? '';

  if (options?.lines) {
    const [startLine, endLine] = options.lines;
    const lines = content.split(/\r?\n/);
    const slicedLines = lines.slice(Math.max(0, startLine - 1), Math.max(0, endLine));
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
    content = slicedLines.join(lineEnding);
  }

  if (options?.bytes) {
    const [startByte, endByte] = options.bytes;
    content = content.slice(Math.max(0, startByte), Math.max(0, endByte + 1));
  }

  if (options?.encoding === 'base64') {
    try {
      content = btoa(content);
    } catch {
      content = bytesToBase64(new TextEncoder().encode(content));
    }
  }

  return content;
}

export async function updateFile(
  conversationId: string,
  path: string,
  content: string,
  options?: {
    append?: boolean;
    prepend?: boolean;
    find?: string;
    replace?: string;
    insertAtLine?: number;
  },
): Promise<VFile> {
  const file = await findByPath(conversationId, path);
  if (!file || file.isFolder) {
    if (options?.append || options?.prepend || options?.insertAtLine !== undefined) {
      return createFile(conversationId, path, content);
    }
    throw new Error(`File not found: ${path}`);
  }

  let nextContent = file.content ?? '';

  if (options?.find !== undefined && options?.replace !== undefined) {
    nextContent = nextContent.replaceAll(options.find, options.replace);
  } else if (options?.insertAtLine !== undefined) {
    const lineEnding = nextContent.includes('\r\n') ? '\r\n' : '\n';
    const lines = nextContent.split(/\r?\n/);
    const idx = Math.max(0, Math.min(options.insertAtLine - 1, lines.length));
    lines.splice(idx, 0, content);
    nextContent = lines.join(lineEnding);
  } else if (options?.prepend) {
    nextContent = content + nextContent;
  } else if (options?.append) {
    nextContent = nextContent + content;
  } else {
    nextContent = content;
  }

  file.content = nextContent;
  file.size = nextContent.length;
  file.updatedAt = new Date().toISOString();
  await Storage.files.save(file);
  return file;
}

export async function deleteFile(conversationId: string, path: string): Promise<void> {
  const file = await findByPath(conversationId, path);
  if (!file) throw new Error(`Not found: ${path}`);
  const all = await Storage.files.byConversation(conversationId);
  const toDelete = all.filter((f) => f.path === file.path || f.path.startsWith(file.path + '/'));
  for (const f of toDelete) await Storage.files.remove(f.id);
}

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const wildcards = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${wildcards}$`, 'i');
}

export async function listDir(
  conversationId: string,
  path: string,
  options?: {
    recurse?: boolean;
    glob?: string;
  },
): Promise<{
  name: string;
  isFolder: boolean;
  path: string;
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
}[]> {
  const norm = normalize(path);
  const all = await Storage.files.byConversation(conversationId);

  let filtered = all.filter((f) => f.path !== norm);

  if (options?.recurse) {
    filtered = filtered.filter((f) =>
      norm === '/' ? true : f.path.startsWith(norm + '/'),
    );
  } else {
    filtered = filtered.filter((f) => parentPath(f.path) === norm);
  }

  if (options?.glob) {
    const regex = globToRegex(options.glob);
    filtered = filtered.filter((f) => regex.test(f.name));
  }

  return filtered.map((f) => ({
    name: f.name,
    isFolder: f.isFolder,
    path: f.path,
    size: f.size,
    mimeType: f.mimeType,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));
}

export async function move(conversationId: string, from: string, to: string): Promise<void> {
  const file = await findByPath(conversationId, from);
  if (!file) throw new Error(`Not found: ${from}`);
  file.path = normalize(to);
  file.name = baseName(to);
  file.parentId = await ensureParent(conversationId, to);
  file.updatedAt = new Date().toISOString();
  await Storage.files.save(file);
}

export async function search(
  conversationId: string,
  query: string,
): Promise<{
  path: string;
  match: 'name' | 'content';
  occurrences?: { line: number; text: string }[];
}[]> {
  const q = query.toLowerCase();
  const all = await Storage.files.byConversation(conversationId);
  const hits: {
    path: string;
    match: 'name' | 'content';
    occurrences?: { line: number; text: string }[];
  }[] = [];

  for (const f of all) {
    const nameMatch = f.name.toLowerCase().includes(q);
    const occurrences: { line: number; text: string }[] = [];

    if (f.content) {
      const lines = f.content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          let text = lines[i];
          if (text.length > 120) {
            const idx = text.toLowerCase().indexOf(q);
            const start = Math.max(0, idx - 40);
            const end = Math.min(text.length, idx + query.length + 60);
            text = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
          }
          occurrences.push({ line: i + 1, text });
        }
      }
    }

    if (nameMatch || occurrences.length > 0) {
      hits.push({
        path: f.path,
        match: occurrences.length > 0 ? 'content' : 'name',
        ...(occurrences.length > 0 ? { occurrences } : {}),
      });
    }
  }
  return hits;
}
