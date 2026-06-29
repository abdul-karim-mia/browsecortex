/**
 * Tool registry and executor (PLAN §11, §24, §45).
 *
 * Holds all built-in tools, exposes their wire schemas for the API call, and
 * runs a named tool with a per-category timeout. Every execution returns a
 * structured result — tools never throw past this boundary (PLAN §11).
 */
import {
  TIMEOUTS,
  toApiTool,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from './types';
import type { ApiToolDefinition } from '@/providers/chat-types';
import { tabTools } from './builtin/tabs';
import { navigationTools } from './builtin/navigation';
import { pageTools } from './builtin/page';
import { utilityTools } from './builtin/utility';
import { interactionTools } from './builtin/interaction';
import { interactionExtraTools } from './builtin/interaction-extra';
import { annotationTools } from './builtin/annotation';
import { browsingDataTools } from './builtin/browsing-data';
import { memoryTools } from './builtin/memory';
import { taskTools } from './builtin/tasks';
import { filesystemTools } from './builtin/filesystem';
import { miscTools, runJavascript } from './builtin/misc';
import { skillTools } from './builtin/skills';
import { backupTools } from './builtin/backup';
import { advancedTabTools } from './builtin/tabs-advanced';
import { windowCookieTools } from './builtin/windows';
import { pageReadTools } from './builtin/page-read';
import { waitTools } from './builtin/waits';
import { pageExtraTools } from './builtin/page-extras';
import { chromeExtraTools } from './builtin/chrome-extras';
import { askUser } from './builtin/ask-user';
import { subagentTools } from './builtin/subagent';
import { debuggerInteractionTools } from './builtin/debugger-interaction';
import { externalAiTools } from './builtin/external-ai';
import { ocrTools } from './builtin/ocr';
import { mcpTools } from './builtin/mcp';
import { cachingTools } from './builtin/caching';

const ALL_TOOLS: ToolDefinition[] = [
  ...tabTools,
  ...advancedTabTools,
  ...navigationTools,
  ...pageTools,
  ...pageReadTools,
  ...interactionTools,
  ...interactionExtraTools,
  ...debuggerInteractionTools,
  ...annotationTools,
  ...waitTools,
  ...pageExtraTools,
  ...windowCookieTools,
  ...browsingDataTools,
  ...chromeExtraTools,
  ...utilityTools,
  ...memoryTools,
  ...taskTools,
  ...filesystemTools,
  ...skillTools,
  ...backupTools,
  ...miscTools,
  ...ocrTools,
  runJavascript,
  askUser,
  ...subagentTools,
  ...externalAiTools,
  ...mcpTools,
  ...cachingTools,
];

/** Tools that block on user input or run a full nested loop — not timeout-raced. */
const NO_TIMEOUT = new Set(['ask_user', 'spawn_agent', 'ask_external_ai']);

/** Opt-in tools excluded from the API schema unless explicitly enabled. */
const OPT_IN = new Set(['run_javascript', 'ask_external_ai']);

const registry = new Map<string, ToolDefinition>(ALL_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

/** Whether a tool mutates state and may need confirmation (PLAN §34). */
export function isDestructive(name: string, args: Record<string, unknown> = {}): boolean {
  const destructive = registry.get(name)?.destructive ?? false;
  return typeof destructive === 'function' ? destructive(args) : destructive;
}

/** Whether a tool reads untrusted external content (PLAN §28). */
export function readsExternal(name: string): boolean {
  return registry.get(name)?.readsExternal ?? false;
}

export function listTools(): ToolDefinition[] {
  return [...registry.values()];
}

/**
 * Wire schemas for the chat request (PLAN §9). Opt-in tools (run_javascript,
 * ask_external_ai) are excluded unless explicitly enabled.
 */
export function getApiTools(
  opts: { runJavascript?: boolean; externalAi?: boolean } = {},
): ApiToolDefinition[] {
  const enabled: Record<string, boolean | undefined> = {
    run_javascript: opts.runJavascript,
    ask_external_ai: opts.externalAi,
  };
  return listTools()
    .filter((t) => !OPT_IN.has(t.name) || enabled[t.name])
    .map(toApiTool);
}

function timeoutFor(def: ToolDefinition, multiplier: number): number {
  return TIMEOUTS[def.timeout] * multiplier;
}

/**
 * Execute a tool by name with a timeout (PLAN §45). Unknown tools, bad args,
 * timeouts, and thrown errors all resolve to a structured { error } result.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  timeoutMultiplier = 1,
): Promise<ToolResult> {
  const def = registry.get(name);
  if (!def) return { error: `Unknown tool: ${name}` };

  // Tools that block on user input run without a timeout race (PLAN §18).
  if (NO_TIMEOUT.has(name)) {
    try {
      return await def.execute(args, ctx);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  const ms = timeoutFor(def, timeoutMultiplier);
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race<ToolResult>([
      def.execute(args, ctx),
      new Promise<ToolResult>((resolve) => {
        timer = setTimeout(
          () => resolve({ error: 'timeout', tool: name, after_ms: ms } as ToolResult),
          ms,
        );
      }),
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
