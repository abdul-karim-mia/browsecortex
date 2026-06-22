/**
 * Virtual filesystem tools (PLAN §11, §14). Thin wrappers over the vfs service.
 * The workspace is scoped to the active conversation (ctx.conversationId).
 */
import JSZip from 'jszip';
import type { ToolContext, ToolDefinition, ToolResult } from '../types';
import * as vfs from '@/fs/vfs';
import { Storage } from '@/storage';

const FS_READ_LIMIT = 50_000;

/** Run a vfs op with the conversation scope, converting throws to { error }. */
function scoped(ctx: ToolContext, fn: (cid: string) => Promise<ToolResult>): Promise<ToolResult> {
  if (!ctx.conversationId) return Promise.resolve({ error: 'No conversation context for files.' });
  return fn(ctx.conversationId).catch((e) => ({
    error: e instanceof Error ? e.message : String(e),
  }));
}

export const fsCreateFile: ToolDefinition = {
  name: 'fs_create_file',
  description: 'Create a file in this conversation\'s workspace at an absolute path with content.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string' }, content: { type: 'string' } },
    required: ['path', 'content'],
  },
  destructive: false,
  timeout: 'file',
  execute: (args, ctx) =>
    scoped(ctx, async (cid) => {
      const f = await vfs.createFile(cid, String(args.path), String(args.content ?? ''));
      return { created: f.path };
    }),
};

export const fsReadFile: ToolDefinition = {
  name: 'fs_read_file',
  description: 'Read a file from this conversation\'s workspace.',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  destructive: false,
  timeout: 'file',
  execute: (args, ctx) =>
    scoped(ctx, async (cid) => {
      const content = await vfs.readFile(cid, String(args.path));
      const truncated = content.length > FS_READ_LIMIT;
      return {
        content: truncated ? content.slice(0, FS_READ_LIMIT) : content,
        ...(truncated ? { note: `[...truncated, ${content.length} chars total]` } : {}),
      };
    }),
};

export const fsUpdateFile: ToolDefinition = {
  name: 'fs_update_file',
  description: 'Overwrite or append to a file in this conversation\'s workspace.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
      append: { type: 'boolean', description: 'Append instead of overwrite (default false).' },
    },
    required: ['path', 'content'],
  },
  destructive: false,
  timeout: 'file',
  execute: (args, ctx) =>
    scoped(ctx, async (cid) => {
      const f = await vfs.updateFile(cid, String(args.path), String(args.content), args.append === true);
      return { updated: f.path, size: f.size };
    }),
};

export const fsDeleteFile: ToolDefinition = {
  name: 'fs_delete_file',
  description: 'Delete a file or folder (and its contents) from this conversation\'s workspace.',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  destructive: true,
  timeout: 'file',
  execute: (args, ctx) =>
    scoped(ctx, async (cid) => {
      await vfs.deleteFile(cid, String(args.path));
      return { deleted: String(args.path) };
    }),
};

export const fsCreateFolder: ToolDefinition = {
  name: 'fs_create_folder',
  description: 'Create a folder (and any missing parents) in this conversation\'s workspace.',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  destructive: false,
  timeout: 'file',
  execute: (args, ctx) =>
    scoped(ctx, async (cid) => {
      const f = await vfs.createFolder(cid, String(args.path));
      return { created: f.path };
    }),
};

export const fsList: ToolDefinition = {
  name: 'fs_list',
  description: 'List files and folders at a path in this conversation\'s workspace.',
  parameters: { type: 'object', properties: { path: { type: 'string' } } },
  destructive: false,
  timeout: 'file',
  execute: (args, ctx) =>
    scoped(ctx, async (cid) => ({ entries: await vfs.listDir(cid, String(args.path ?? '/')) })),
};

export const fsMove: ToolDefinition = {
  name: 'fs_move',
  description: 'Move or rename a file/folder in this conversation\'s workspace.',
  parameters: {
    type: 'object',
    properties: { from: { type: 'string' }, to: { type: 'string' } },
    required: ['from', 'to'],
  },
  destructive: false,
  timeout: 'file',
  execute: (args, ctx) =>
    scoped(ctx, async (cid) => {
      await vfs.move(cid, String(args.from), String(args.to));
      return { moved: String(args.from), to: String(args.to) };
    }),
};

export const fsSearch: ToolDefinition = {
  name: 'fs_search',
  description: 'Search this conversation\'s workspace by file name or content.',
  parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  destructive: false,
  timeout: 'file',
  execute: (args, ctx) =>
    scoped(ctx, async (cid) => ({ results: await vfs.search(cid, String(args.query)) })),
};

export const fsExport: ToolDefinition = {
  name: 'fs_export',
  description: 'Export a workspace file to the user\'s real Downloads folder.',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  destructive: true,
  timeout: 'file',
  execute: (args, ctx) =>
    scoped(ctx, async (cid) => {
      const content = await vfs.readFile(cid, String(args.path));
      const name = String(args.path).split('/').pop() || 'file.txt';
      const dataUrl = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(content)))}`;
      const id = await chrome.downloads.download({ url: dataUrl, filename: name });
      return { exported: name, downloadId: id };
    }),
};

export const fsCreateZip: ToolDefinition = {
  name: 'fs_create_zip',
  description: 'Zip workspace files (all, or those under a path prefix) and export the archive.',
  parameters: {
    type: 'object',
    properties: {
      path_prefix: { type: 'string', description: 'Only include files under this path (default all).' },
      filename: { type: 'string' },
    },
  },
  destructive: true,
  timeout: 'file',
  execute: (args, ctx) =>
    scoped(ctx, async (cid) => {
      const prefix = args.path_prefix ? String(args.path_prefix) : '/';
      const files = (await Storage.files.byConversation(cid)).filter(
        (f) => !f.isFolder && f.path.startsWith(prefix),
      );
      if (files.length === 0) return { error: 'No files to zip.' };
      const zip = new JSZip();
      for (const f of files) zip.file(f.path.replace(/^\//, ''), f.content ?? '');
      const base64 = await zip.generateAsync({ type: 'base64' });
      const name = args.filename ? String(args.filename) : 'workspace.zip';
      const id = await chrome.downloads.download({
        url: `data:application/zip;base64,${base64}`,
        filename: name,
      });
      return { zipped: files.length, filename: name, downloadId: id };
    }),
};

export const filesystemTools = [
  fsCreateFile,
  fsReadFile,
  fsUpdateFile,
  fsDeleteFile,
  fsCreateFolder,
  fsList,
  fsMove,
  fsSearch,
  fsExport,
  fsCreateZip,
];
