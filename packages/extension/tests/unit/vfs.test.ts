import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { VFile } from '@/types';

// In-memory stand-in for the Storage.files layer the vfs builds on.
const store = new Map<string, VFile>();
vi.mock('@/storage', () => ({
  Storage: {
    files: {
      byConversation: async (cid: string) =>
        [...store.values()].filter((f) => f.conversationId === cid),
      get: async (id: string) => store.get(id),
      save: async (f: VFile) => void store.set(f.id, f),
      remove: async (id: string) => void store.delete(id),
    },
  },
}));

import * as vfs from '@/fs/vfs';

const C = 'conv-1';

beforeEach(() => store.clear());

describe('vfs (conversation-scoped)', () => {
  it('creates a file and reads it back', async () => {
    await vfs.createFile(C, '/notes.md', 'hello');
    expect(await vfs.readFile(C, '/notes.md')).toBe('hello');
  });

  it('auto-creates parent folders', async () => {
    await vfs.createFile(C, '/projects/app/todo.txt', 'x');
    const top = await vfs.listDir(C, '/');
    expect(top.some((e) => e.name === 'projects' && e.isFolder)).toBe(true);
  });

  it('appends to a file', async () => {
    await vfs.createFile(C, '/a.txt', 'one');
    await vfs.updateFile(C, '/a.txt', 'two', true);
    expect(await vfs.readFile(C, '/a.txt')).toBe('onetwo');
  });

  it('rejects duplicate file creation', async () => {
    await vfs.createFile(C, '/dup.txt', '1');
    await expect(vfs.createFile(C, '/dup.txt', '2')).rejects.toThrow(/already exists/);
  });

  it('deletes a folder and its descendants', async () => {
    await vfs.createFile(C, '/dir/a.txt', '1');
    await vfs.createFile(C, '/dir/b.txt', '2');
    await vfs.deleteFile(C, '/dir');
    expect(await vfs.listDir(C, '/')).toEqual([]);
  });

  it('isolates files between conversations', async () => {
    await vfs.createFile(C, '/shared.md', 'from c1');
    await vfs.createFile('conv-2', '/shared.md', 'from c2');
    expect(await vfs.readFile(C, '/shared.md')).toBe('from c1');
    expect(await vfs.readFile('conv-2', '/shared.md')).toBe('from c2');
    expect(await vfs.listDir(C, '/')).toHaveLength(1);
  });

  it('searches by name and content within the conversation', async () => {
    await vfs.createFile(C, '/readme.md', 'find this needle');
    expect((await vfs.search(C, 'readme'))[0]?.match).toBe('name');
    expect((await vfs.search(C, 'needle'))[0]?.match).toBe('content');
  });
});
