/**
 * Utility tools (PLAN §11).
 */
import type { ToolDefinition } from '../types';

export const getCurrentDatetime: ToolDefinition = {
  name: 'get_current_datetime',
  description: 'Get the current date and time (ISO string and local format).',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'instant',
  async execute() {
    const now = new Date();
    return { iso: now.toISOString(), local: now.toString() };
  },
};

export const wait: ToolDefinition = {
  name: 'wait',
  description: 'Pause for a number of seconds before continuing.',
  parameters: {
    type: 'object',
    properties: { seconds: { type: 'number', description: 'Seconds to wait (max 30).' } },
    required: ['seconds'],
  },
  destructive: false,
  timeout: 'navigation',
  async execute(args) {
    const seconds = Math.min(Math.max(Number(args.seconds) || 0, 0), 30);
    await new Promise((r) => setTimeout(r, seconds * 1000));
    return { waited: seconds };
  },
};

export const utilityTools = [getCurrentDatetime, wait];
