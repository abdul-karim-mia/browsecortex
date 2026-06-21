/**
 * ask_user tool (PLAN §18). Renders an interactive question widget in chat and
 * blocks the agent loop until the user submits answers. The actual round-trip
 * is provided by the background via ctx.askUser.
 */
import type { ToolDefinition } from '../types';

export const askUser: ToolDefinition = {
  name: 'ask_user',
  description:
    'Ask the user one or more questions and wait for their answers. Use when you need ' +
    'clarification, a decision, or confirmation before continuing.',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Optional intro shown before the questions.' },
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['text', 'single_select', 'multi_select', 'confirm'] },
            question: { type: 'string' },
            placeholder: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            allow_custom: { type: 'boolean' },
            required: { type: 'boolean' },
          },
          required: ['id', 'type', 'question'],
        },
      },
    },
    required: ['questions'],
  },
  destructive: false,
  timeout: 'instant',
  async execute(args, ctx) {
    if (!ctx.askUser) return { error: 'ask_user is not available in this context.' };
    const answers = await ctx.askUser({ message: args.message, questions: args.questions });
    return { answers };
  },
};
