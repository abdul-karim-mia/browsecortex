/**
 * Task tools (PLAN §11, §13). AI manages its own task list as it works.
 */
import type { ToolDefinition } from '../types';
import { Storage } from '@/storage';
import type { Subtask, Task } from '@/types';

function parseSubtasks(value: unknown): Subtask[] {
  if (!Array.isArray(value)) return [];
  return value.map((s) => ({ title: String(s), done: false }));
}

export const createTask: ToolDefinition = {
  name: 'create_task',
  description: 'Create a task with an optional list of subtask titles.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      subtasks: { type: 'array', items: { type: 'string' } },
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
  description: 'Update a task: mark subtasks done by index, change status, or set notes.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      complete_subtasks: { type: 'array', items: { type: 'number' } },
      notes: { type: 'string' },
    },
    required: ['id'],
  },
  destructive: false,
  timeout: 'instant',
  async execute(args) {
    const task = (await Storage.tasks.list()).find((t) => t.id === String(args.id));
    if (!task) return { error: 'Task not found.' };
    for (const idx of (args.complete_subtasks as number[]) ?? []) {
      if (task.subtasks[idx]) task.subtasks[idx].done = true;
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

export const taskTools = [createTask, updateTask, completeTask, failTask, getTasks];
