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

export async function createFile(
  conversationId: string,
  path: string,
  content: string,
): Promise<VFile> {
  if (await isStorageFull()) {
    throw new Error('Storage is nearly full — export and delete some files before creating more.');
  }
  if (await findByPath(conversationId, path)) throw new Error(`File already exists: ${path}`);
  const parentId = await ensureParent(conversationId, path);
  const now = new Date().toISOString();
  const file: VFile = {
    id: crypto.randomUUID(),
    conversationId,
    name: baseName(path),
    path: normalize(path),
    parentId,
    content,
    isFolder: false,
    mimeType: guessMime(path),
    size: content.length,
    createdAt: now,
    updatedAt: now,
  };
  await Storage.files.save(file);
  return file;
}

export async function readFile(conversationId: string, path: string): Promise<string> {
  const file = await findByPath(conversationId, path);
  if (!file || file.isFolder) throw new Error(`File not found: ${path}`);
  return file.content ?? '';
}

export async function updateFile(
  conversationId: string,
  path: string,
  content: string,
  append: boolean,
): Promise<VFile> {
  const file = await findByPath(conversationId, path);
  if (!file || file.isFolder) {
    if (append) return createFile(conversationId, path, content);
    throw new Error(`File not found: ${path}`);
  }
  file.content = append ? (file.content ?? '') + content : content;
  file.size = file.content.length;
  file.updatedAt = new Date().toISOString();
  await Storage.files.save(file);
  return file;
}

export async function deleteFile(conversationId: string, path: string): Promise<void> {
  const file = await findByPath(conversationId, path);
  if (!file) throw new Error(`Not found: ${path}`);
  // Delete the node and any descendants (for folders), within this conversation.
  const all = await Storage.files.byConversation(conversationId);
  const toDelete = all.filter((f) => f.path === file.path || f.path.startsWith(file.path + '/'));
  for (const f of toDelete) await Storage.files.remove(f.id);
}

export async function listDir(
  conversationId: string,
  path: string,
): Promise<{ name: string; isFolder: boolean; path: string }[]> {
  const norm = normalize(path);
  const all = await Storage.files.byConversation(conversationId);
  return all
    .filter((f) => parentPath(f.path) === norm && f.path !== norm)
    .map((f) => ({ name: f.name, isFolder: f.isFolder, path: f.path }));
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
): Promise<{ path: string; match: 'name' | 'content' }[]> {
  const q = query.toLowerCase();
  const all = await Storage.files.byConversation(conversationId);
  const hits: { path: string; match: 'name' | 'content' }[] = [];
  for (const f of all) {
    if (f.name.toLowerCase().includes(q)) hits.push({ path: f.path, match: 'name' });
    else if (f.content?.toLowerCase().includes(q)) hits.push({ path: f.path, match: 'content' });
  }
  return hits;
}
