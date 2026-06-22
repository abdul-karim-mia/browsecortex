/**
 * Task tools (PLAN §11, §13). AI manages its own task list as it works.
 */
import type { ToolDefinition } from '../types';
import { Storage } from '@/storage';
import type { Subtask, Task } from '@/types';

function parseSubtask(value: unknown): Subtask {
  if (typeof value !== 'object' || value === null) {
    return { title: String(value), done: false };
  }
  const obj = value as Record<string, unknown>;
  return {
    title: String(obj.title ?? ''),
    done: false,
    subtasks: Array.isArray(obj.subtasks) ? obj.subtasks.map(parseSubtask) : undefined,
  };
}

function parseSubtasks(value: unknown): Subtask[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseSubtask);
}

function markSubtaskByPath(subtasks: Subtask[], path: string): boolean {
  const parts = path.split('.').map(Number);
  let arr: Subtask[] = subtasks;
  for (let i = 0; i < parts.length; i++) {
    const idx = parts[i];
    if (idx < 0 || idx >= arr.length) return false;
    if (i === parts.length - 1) {
      arr[idx].done = true;
      return true;
    }
    if (!arr[idx].subtasks) return false;
    arr = arr[idx].subtasks!;
  }
  return false;
}

const SUBTASK_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Subtask title' },
    subtasks: {
      type: 'array',
      description: 'Nested sub-subtasks with the same structure (title + optional subtasks).',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          subtasks: {
            type: 'array',
            description: 'Further-nested subtasks, same shape.',
            items: { type: 'object' },
          },
        },
        required: ['title'],
      },
    },
  },
  required: ['title'],
} as const;

export const createTask: ToolDefinition = {
  name: 'create_task',
  description: 'Create a task with an optional nested subtask tree.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      subtasks: {
        type: 'array',
        description:
          'Nested subtasks. Each item has a "title" (string) and optional "subtasks" (same structure, unlimited nesting).',
        items: SUBTASK_SCHEMA,
      },
    },
    required: ['title'],
  },
  destructive: false,
  timeout: 'instant',
  async execute(args, ctx) {
    const task: Task = {
      id: crypto.randomUUID(),
      title: String(args.title),
      status: 'in_progress',
      subtasks: parseSubtasks(args.subtasks),
      conversationId: ctx.conversationId ?? null,
      createdAt: new Date().toISOString(),
      notes: '',
    };
    await Storage.tasks.save(task);
    return { id: task.id, title: task.title };
  },
};

export const updateTask: ToolDefinition = {
  name: 'update_task',
  description: 'Update a task: mark nested subtasks as done by dot-separated path, or set notes.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID' },
      complete_subtasks: {
        type: 'array',
        description:
          'Dot-separated paths to mark done, e.g. ["0", "1.2"] marks subtask index 0 and nested subtask index 2 under subtask index 1.',
        items: { type: 'string' },
      },
      notes: { type: 'string' },
    },
    required: ['id'],
  },
  destructive: false,
  timeout: 'instant',
  async execute(args) {
    const task = (await Storage.tasks.list()).find((t) => t.id === String(args.id));
    if (!task) return { error: 'Task not found.' };
    for (const path of (args.complete_subtasks as string[]) ?? []) {
      markSubtaskByPath(task.subtasks, path);
    }
    if (typeof args.notes === 'string') task.notes = args.notes;
    await Storage.tasks.save(task);
    return { updated: task.id };
  },
};

async function setStatus(id: string, status: Task['status']) {
  const task = (await Storage.tasks.list()).find((t) => t.id === id);
  if (!task) return { error: 'Task not found.' };
  task.status = status;
  if (status === 'done') task.completedAt = new Date().toISOString();
  await Storage.tasks.save(task);
  return { id, status };
}

export const completeTask: ToolDefinition = {
  name: 'complete_task',
  description: 'Mark a task as done.',
  parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  destructive: false,
  timeout: 'instant',
  execute: (args) => setStatus(String(args.id), 'done'),
};

export const failTask: ToolDefinition = {
  name: 'fail_task',
  description: 'Mark a task as failed.',
  parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  destructive: false,
  timeout: 'instant',
  execute: (args) => setStatus(String(args.id), 'failed'),
};

export const getTasks: ToolDefinition = {
  name: 'get_tasks',
  description: 'List all tasks with their status and subtask progress.',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'instant',
  async execute() {
    const tasks = await Storage.tasks.list();
    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        subtasks: t.subtasks,
      })),
    };
  },
};

export const deleteTask: ToolDefinition = {
  name: 'delete_task',
  description: 'Permanently remove a task and all its subtasks from storage.',
  parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  destructive: true,
  timeout: 'instant',
  async execute(args) {
    await Storage.tasks.remove(String(args.id));
    return { deleted: String(args.id) };
  },
};

export const taskTools = [createTask, updateTask, completeTask, failTask, getTasks, deleteTask];
