/**
 * Agent loop (PLAN §9, §10, §24).
 *
 * Drives the call → tool-execution → call cycle until the model returns a final
 * answer with no tool calls, or the iteration cap is hit (PLAN §10). Tool calls
 * in one response run in parallel (PLAN §24). Streams tokens, tool calls, and
 * results to the caller via `emit`.
 */
import type { Model, Provider, Settings } from '@/types';
import type { ApiMessage, ApiToolCall, ContentPart } from '@/providers/chat-types';
import type { Attachment } from '@/background/protocol';
import { ChatHttpError, streamChat } from '@/providers/chat';
import { recordRateLimit } from '@/providers/cooldown';
import { analyzeImage } from './vision';
import { executeTool, getApiTools, isDestructive, readsExternal } from '@/tools/registry';
import type { ToolContext } from '@/tools/types';
import { executeMcpTool, getMcpApiTools, isMcpTool } from '@/mcp/integration';
import type { ServerMessage } from '@/background/protocol';
import { retrieveMemories } from '@/memory/retrieval';
import { buildSystemPrompt } from './system-prompt';
import { compact, shouldCompact } from './compaction';

const RESULT_LIMIT = 10_000;

export interface RunArgs {
  provider: Provider;
  model: Model;
  settings: Settings;
  /** Prior turns (assistant/user/tool), excluding the system message. */
  history: ApiMessage[];
  userContent: string;
  attachments?: Attachment[];
  /** Contents of pinned messages, never compacted (PLAN §31). */
  pinnedContents?: string[];
  conversationId: string;
  activeTabUrl?: string;
  signal: AbortSignal;
  emit: (msg: ServerMessage) => void;
  /** Blocks the loop until the user answers an ask_user question (PLAN §18). */
  askUser(questions: unknown): Promise<Record<string, unknown>>;
  /** Called after each tool round with the current messages (PLAN §22 L3). */
  onCheckpoint?(messages: ApiMessage[]): void;
}

function truncate(value: string): string {
  if (value.length <= RESULT_LIMIT) return value;
  return `${value.slice(0, RESULT_LIMIT)}\n[...truncated, ${value.length} chars total]`;
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export type LoopOutcome = 'completed' | 'error' | 'aborted' | 'capped';

export interface RunResult {
  messages: ApiMessage[];
  outcome: LoopOutcome;
  /** How many tool-execution rounds ran (used to gate notifications). */
  toolRounds: number;
}

/**
 * Runs the loop. Returns the full updated history (including the final
 * assistant message) plus an outcome so the caller can report status
 * accurately (a self-handled error/abort must not look like success).
 */
export async function runAgentLoop(args: RunArgs): Promise<RunResult> {
  const { provider, model, settings, signal, emit } = args;
  let toolRounds = 0;

  const memories = await retrieveMemories(args.userContent);
  const system = buildSystemPrompt({
    settings,
    memories,
    activeTabUrl: args.activeTabUrl,
  });

  const userMessage = await buildUserMessage(args.userContent, args.attachments ?? [], model);

  const messages: ApiMessage[] = [
    { role: 'system', content: system },
    ...args.history,
    userMessage,
  ];

  const ctx: ToolContext = {
    conversationId: args.conversationId,
    askUser: args.askUser,
    async getActiveTabId() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) throw new Error('No active tab.');
      return tab.id;
    },
  };

  const tools = model.hasToolCalling
    ? [
        ...getApiTools({ runJavascript: settings.runJavascriptEnabled }),
        ...(await getMcpApiTools()),
      ]
    : undefined;
  const maxLoops = settings.maxToolCallLoops;
  // Tracks whether untrusted external content has been read — once true,
  // destructive actions require confirmation regardless of mode (PLAN §28).
  let externalContentRead = false;

  for (let iteration = 0; iteration < maxLoops; iteration++) {
    if (signal.aborted) return { messages, outcome: 'aborted', toolRounds };

    // Compact older turns if we're approaching the context limit (PLAN §31).
    const body = messages.slice(1); // exclude system
    if (shouldCompact(body, settings, model)) {
      const compacted = await compact(body, provider, model, signal, args.pinnedContents);
      if (compacted.length < body.length) {
        messages.splice(1, body.length, ...compacted);
        emit({ type: 'token', content: '\n_[Context compacted]_\n' });
      }
    }

    let assistantText = '';
    let toolCalls: ApiToolCall[] = [];

    try {
      // Retry once on a transient failure (5xx / network) — but only when
      // nothing has streamed yet, to avoid duplicating output (PLAN §30).
      for (let attempt = 0; ; attempt++) {
        let streamed = false;
        try {
          for await (const event of streamChat({ provider, model, messages, tools, signal })) {
            if (event.type === 'token') {
              streamed = true;
              assistantText += event.content;
              emit({ type: 'token', content: event.content });
            } else if (event.type === 'reasoning') {
              if (settings.showReasoningTokens) emit({ type: 'token', content: event.content });
            } else if (event.type === 'tool_calls') {
              streamed = true;
              toolCalls = event.calls.map((c) => ({
                id: c.id || crypto.randomUUID(),
                type: 'function',
                function: { name: c.name, arguments: c.arguments },
              }));
            }
          }
          break;
        } catch (err) {
          const transient =
            !(err instanceof ChatHttpError) || err.status >= 500;
          if (attempt === 0 && transient && !streamed && !signal.aborted) {
            await new Promise((r) => setTimeout(r, 1000));
            assistantText = '';
            toolCalls = [];
            continue;
          }
          throw err;
        }
      }
    } catch (e) {
      if (signal.aborted) return { messages, outcome: 'aborted', toolRounds };
      // Put the provider into cooldown on a 429 so the next request can route
      // to a fallback or wait (PLAN §40).
      if (e instanceof ChatHttpError && e.status === 429) {
        await recordRateLimit(provider.id, e.retryAfter);
      }
      emit({ type: 'error', message: describeError(e) });
      return { messages, outcome: 'error', toolRounds };
    }

    // No tool calls → final answer, loop terminates (PLAN §24). 'done' is sent
    // by the caller after persistence, so the UI can safely reload from storage.
    if (toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: assistantText });
      return { messages, outcome: 'completed', toolRounds };
    }

    // Record the assistant turn with its tool calls.
    messages.push({ role: 'assistant', content: assistantText || null, tool_calls: toolCalls });

    // Destructive-action confirmation (PLAN §28, §34). Confirm once for the
    // batch when the agent mode requires it, or after external content was read
    // this conversation (prompt-injection guard — overrides the mode).
    const destructiveCalls = toolCalls.filter((tc) => isDestructive(tc.function.name));
    const needsConfirm =
      destructiveCalls.length > 0 &&
      (settings.agentMode === 'confirm_destructive' || externalContentRead);
    let confirmedDestructive = !needsConfirm;
    if (needsConfirm) {
      const names = destructiveCalls.map((tc) => tc.function.name).join(', ');
      const answer = await args.askUser({
        message: `Allow these actions? ${names}`,
        questions: [{ id: 'ok', type: 'confirm', question: 'Proceed?' }],
      });
      confirmedDestructive = answer.ok === true;
    } else if (settings.agentMode === 'notify_only' && destructiveCalls.length > 0) {
      emit({ type: 'token', content: `\n_Running: ${destructiveCalls.map((c) => c.function.name).join(', ')}_\n` });
    }

    // Execute all tool calls in parallel (PLAN §24).
    toolRounds++;
    const results = await Promise.all(
      toolCalls.map(async (tc) => {
        const callArgs = parseArgs(tc.function.arguments);
        emit({ type: 'tool_call', call: { id: tc.id, name: tc.function.name, arguments: callArgs } });
        let result;
        if (isDestructive(tc.function.name) && !confirmedDestructive) {
          result = { error: 'User declined this action.' };
        } else if (isMcpTool(tc.function.name)) {
          result = await executeMcpTool(tc.function.name, callArgs);
        } else {
          result = await executeTool(tc.function.name, callArgs, ctx, settings.toolTimeoutMultiplier);
        }
        if (readsExternal(tc.function.name) && !('error' in result)) externalContentRead = true;
        const content = truncate(JSON.stringify(result));
        const isError = 'error' in result;
        emit({ type: 'tool_result', toolCallId: tc.id, content, isError });
        return { tool_call_id: tc.id, content };
      }),
    );

    for (const r of results) {
      messages.push({ role: 'tool', tool_call_id: r.tool_call_id, content: r.content });
    }

    // Checkpoint after each tool round so an interrupted task can be recovered.
    args.onCheckpoint?.(messages);
  }

  // Iteration cap reached (PLAN §10). 'done' is sent by the caller after persist.
  emit({
    type: 'token',
    content: `\n\n_Reached the ${maxLoops}-step limit for this task. Let me know how you'd like to proceed._`,
  });
  return { messages, outcome: 'capped', toolRounds };
}

/**
 * Build the user API message from text + attachments (PLAN §15).
 * Text files are folded into the prompt. Images go as multimodal parts when the
 * model supports vision; otherwise each is described via the vision fallback and
 * the description is folded in as text.
 */
async function buildUserMessage(
  text: string,
  attachments: Attachment[],
  model: Model,
): Promise<ApiMessage> {
  const textFiles = attachments.filter((a) => a.kind === 'text' && a.text);
  const images = attachments.filter((a) => a.kind === 'image' && a.dataUrl);

  let prompt = text;
  for (const f of textFiles) {
    prompt += `\n\n--- Attached file: ${f.name} ---\n${f.text}`;
  }

  if (images.length === 0) return { role: 'user', content: prompt };

  if (model.hasVision) {
    const parts: ContentPart[] = [{ type: 'text', text: prompt || 'See the attached image(s).' }];
    for (const img of images) parts.push({ type: 'image_url', image_url: { url: img.dataUrl! } });
    return { role: 'user', content: parts };
  }

  // No native vision — describe each image via the vision fallback (PLAN §17).
  for (const img of images) {
    try {
      const desc = await analyzeImage(prompt || 'Describe this image in detail.', img.dataUrl!);
      prompt += `\n\n--- Image "${img.name}" (described by vision model) ---\n${desc}`;
    } catch (e) {
      prompt += `\n\n--- Image "${img.name}" could not be analyzed: ${
        e instanceof Error ? e.message : String(e)
      } ---`;
    }
  }
  return { role: 'user', content: prompt };
}

function describeError(e: unknown): string {
  if (e instanceof ChatHttpError) {
    if (e.status === 401) return 'Invalid API key for this provider. Check settings.';
    if (e.status === 404) return 'Model not found. Check settings.';
    if (e.status === 429) {
      return e.retryAfter
        ? `Rate limited. Retry in ~${e.retryAfter}s.`
        : 'Rate limited by the provider. Try again shortly.';
    }
    return `Provider error ${e.status}: ${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}
