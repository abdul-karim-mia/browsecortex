/**
 * `spawn_agent` — delegate a self-contained sub-task to a sandboxed subagent.
 *
 * The tool only declares the schema and forwards to `ctx.spawnAgent`, which the
 * agent loop wires up (it owns provider/model/emit and enforces depth). The
 * tool is stripped from subagents' own toolsets, so delegation is one level deep.
 */
import type { ToolDefinition } from '../types';
import { SUBAGENTS } from '@/agent/subagents';

const spawnAgent: ToolDefinition = {
  name: 'spawn_agent',
  description:
    'Delegate a focused, self-contained sub-task to a specialized subagent that runs in its own isolated context and returns a summary. Use this to keep your own context clean for big sub-tasks, or to apply a restricted/specialized toolset. Runs to completion before returning; you cannot run two at once.',
  parameters: {
    type: 'object',
    properties: {
      agent_type: {
        type: 'string',
        enum: SUBAGENTS.map((a) => a.name),
        description: SUBAGENTS.map((a) => `${a.name}: ${a.description}`).join(' | '),
      },
      task: {
        type: 'string',
        description:
          'A complete, standalone description of the sub-task. The subagent has no access to this conversation, so include all needed context and the data it should use.',
      },
    },
    required: ['agent_type', 'task'],
  },
  destructive: false,
  timeout: 'instant', // not used — registered as NO_TIMEOUT; the subagent runs its own loop
  async execute(args, ctx) {
    const agentType = String(args.agent_type ?? '');
    const task = String(args.task ?? '');
    if (!task.trim()) return { error: 'task is required' };
    if (!SUBAGENTS.some((a) => a.name === agentType)) {
      return { error: `Unknown agent_type '${agentType}'.` };
    }
    if (!ctx.spawnAgent) {
      return { error: 'Subagents cannot spawn further subagents.' };
    }
    const summary = await ctx.spawnAgent(agentType, task);
    return { summary };
  },
};

export const subagentTools: ToolDefinition[] = [spawnAgent];
