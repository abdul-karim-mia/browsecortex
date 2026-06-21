/**
 * Memory tools (PLAN §11, §12). AI-created memories via save_memory.
 */
import type { ToolDefinition } from '../types';
import { Storage } from '@/storage';
import { extractKeywords, retrieveMemories } from '@/memory/retrieval';
import type { Memory, MemoryType } from '@/types';

const TYPES: MemoryType[] = ['user', 'agent', 'global', 'conversation'];

export const saveMemory: ToolDefinition = {
  name: 'save_memory',
  description:
    'Save a fact worth remembering across conversations. Types: user (about the person), ' +
    'agent (tool/provider patterns), global (preferences), conversation (current task context).',
  parameters: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      type: { type: 'string', enum: TYPES },
    },
    required: ['content'],
  },
  destructive: false,
  timeout: 'instant',
  async execute(args, ctx) {
    const type = (TYPES.includes(args.type as MemoryType) ? args.type : 'global') as MemoryType;
    const now = new Date().toISOString();
    const memory: Memory = {
      id: crypto.randomUUID(),
      type,
      content: String(args.content),
      keywords: extractKeywords(String(args.content)),
      conversationId: type === 'conversation' ? ctx.conversationId : undefined,
      createdAt: now,
      updatedAt: now,
      source: 'ai',
    };
    await Storage.memories.save(memory);
    return { saved: memory.id, type };
  },
};

export const searchMemories: ToolDefinition = {
  name: 'search_memories',
  description: 'Search saved memories by keyword.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  destructive: false,
  timeout: 'instant',
  async execute(args) {
    const results = await retrieveMemories(String(args.query), 10);
    return { memories: results.map((m) => ({ id: m.id, type: m.type, content: m.content })) };
  },
};

export const deleteMemory: ToolDefinition = {
  name: 'delete_memory',
  description: 'Delete a memory by its id.',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  destructive: true,
  timeout: 'instant',
  async execute(args) {
    await Storage.memories.remove(String(args.id));
    return { deleted: String(args.id) };
  },
};

export const memoryTools = [saveMemory, searchMemories, deleteMemory];
