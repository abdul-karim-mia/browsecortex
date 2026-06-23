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
    await vfs.updateFile(C, '/a.txt', 'two', { append: true });
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

  it('checks file/folder existence', async () => {
    expect(await vfs.exists(C, '/notes.md')).toBe(false);
    await vfs.createFile(C, '/notes.md', 'hello');
    expect(await vfs.exists(C, '/notes.md')).toBe(true);
    await vfs.createFolder(C, '/folder');
    expect(await vfs.exists(C, '/folder')).toBe(true);
  });

  it('retrieves file/folder metadata with getInfo', async () => {
    await vfs.createFile(C, '/notes.md', 'hello');
    const info = await vfs.getInfo(C, '/notes.md');
    expect(info.name).toBe('notes.md');
    expect(info.size).toBe(5);
    expect(info.isFolder).toBe(false);
    expect(info.mimeType).toBe('text/markdown');
  });

  it('copies files and folders', async () => {
    // Copy file
    await vfs.createFile(C, '/a.txt', 'hello');
    await vfs.copy(C, '/a.txt', '/b.txt');
    expect(await vfs.readFile(C, '/b.txt')).toBe('hello');

    // Copy file into folder
    await vfs.createFolder(C, '/folder');
    await vfs.copy(C, '/a.txt', '/folder');
    expect(await vfs.readFile(C, '/folder/a.txt')).toBe('hello');

    // Copy folder recursively
    await vfs.createFile(C, '/src/nested/file.js', 'console.log()');
    await vfs.copy(C, '/src', '/dist');
    expect(await vfs.exists(C, '/dist/nested/file.js')).toBe(true);
    expect(await vfs.readFile(C, '/dist/nested/file.js')).toBe('console.log()');
  });

  it('creates and decodes base64 file content', async () => {
    const base64Content = btoa('hello world');
    await vfs.createFile(C, '/bin.txt', base64Content, 'base64');
    expect(await vfs.readFile(C, '/bin.txt')).toBe('hello world');
  });

  it('reads specific byte/line ranges or encodes to base64', async () => {
    await vfs.createFile(C, '/multiline.txt', 'line1\nline2\nline3\nline4');
    
    // Line range
    const lines = await vfs.readFile(C, '/multiline.txt', { lines: [2, 3] });
    expect(lines).toBe('line2\nline3');

    // Byte range
    const bytes = await vfs.readFile(C, '/multiline.txt', { bytes: [6, 10] });
    expect(bytes).toBe('line2');

    // Base64 encoding
    const b64 = await vfs.readFile(C, '/multiline.txt', { encoding: 'base64' });
    expect(atob(b64)).toBe('line1\nline2\nline3\nline4');
  });

  it('updates file with prepend, insertAtLine, and find/replace options', async () => {
    await vfs.createFile(C, '/edit.txt', 'one\ntwo\nthree');

    // Prepend
    await vfs.updateFile(C, '/edit.txt', 'zero\n', { prepend: true });
    expect(await vfs.readFile(C, '/edit.txt')).toBe('zero\none\ntwo\nthree');

    // Insert at line
    await vfs.updateFile(C, '/edit.txt', 'inserted', { insertAtLine: 3 });
    expect(await vfs.readFile(C, '/edit.txt')).toBe('zero\none\ninserted\ntwo\nthree');

    // Find and replace
    await vfs.updateFile(C, '/edit.txt', '', { find: 'two', replace: 'dos' });
    expect(await vfs.readFile(C, '/edit.txt')).toBe('zero\none\ninserted\ndos\nthree');
  });

  it('lists directory content with recursion and glob filtering', async () => {
    await vfs.createFile(C, '/proj/src/index.js', 'js');
    await vfs.createFile(C, '/proj/src/style.css', 'css');
    await vfs.createFile(C, '/proj/config.json', 'json');

    // Recursive list
    const rec = await vfs.listDir(C, '/proj', { recurse: true });
    expect(rec).toHaveLength(4); // /proj/src, /proj/src/index.js, /proj/src/style.css, /proj/config.json
    expect(rec.map(e => e.path)).toContain('/proj/src/index.js');

    // Glob filter
    const filtered = await vfs.listDir(C, '/proj', { recurse: true, glob: '*.js' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('index.js');
  });

  it('searches for query and returns line number occurrences and snippets', async () => {
    await vfs.createFile(C, '/code.py', 'def test():\n    print("needle")\n    # another needle comment');
    const results = await vfs.search(C, 'needle');
    expect(results).toHaveLength(1);
    expect(results[0].match).toBe('content');
    expect(results[0].occurrences).toHaveLength(2);
    expect(results[0].occurrences?.[0]).toEqual({ line: 2, text: '    print("needle")' });
    expect(results[0].occurrences?.[1]).toEqual({ line: 3, text: '    # another needle comment' });
  });
});
