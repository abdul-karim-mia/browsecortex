/**
 * Core domain types for BrowseCortex.
 * See PLAN.md sections 5, 6, 8, 12, 13, 14 for the canonical schemas.
 */

// ── Providers & Models (PLAN §5, §6) ──────────────────────────────

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  /** Provider id to route to while this one is cooling down (PLAN §40). */
  fallbackProviderId?: string;
  createdAt: string;
}

export type CapabilitySource = 'litellm' | 'ping' | 'user' | 'unknown';

export interface Model {
  id: string;
  providerId: string;
  enabled: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
  hasVision?: boolean;
  hasToolCalling?: boolean;
  hasParallelTools?: boolean;
  hasToolChoice?: boolean;
  hasReasoning?: boolean;
  inputCostPerToken?: number;
  outputCostPerToken?: number;
  capabilitySource: CapabilitySource;
}

// ── Conversations & Messages (PLAN §8) ────────────────────────────

export interface Conversation {
  id: string;
  name: string;
  starred: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  providerId: string;
  /** Preserved name if the provider was later deleted (PLAN §44). */
  providerName?: string;
  model: string;
  taskIds: string[];
  messageCount: number;
  /** Cumulative estimated tokens spent in this conversation (B2). */
  tokensUsed?: number;
  /** Stored synopsis of the conversation (B6). */
  summary?: string;
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
  pinned?: boolean;
  createdAt: string;
}

// ── Memory (PLAN §12) ─────────────────────────────────────────────

export type MemoryType = 'user' | 'agent' | 'global' | 'conversation';

export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  keywords: string[];
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
  source: 'ai' | 'user';
}

// ── Tasks (PLAN §13) ──────────────────────────────────────────────

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export interface Subtask {
  title: string;
  done: boolean;
  subtasks?: Subtask[];
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  subtasks: Subtask[];
  conversationId: string | null;
  createdAt: string;
  completedAt?: string;
  notes: string;
}

// ── Virtual Filesystem (PLAN §14) ─────────────────────────────────

export interface VFile {
  id: string;
  /** The conversation this file belongs to — the VFS is scoped per chat. */
  conversationId: string;
  name: string;
  path: string;
  parentId: string | null;
  /** Null for folders. */
  content: string | null;
  isFolder: boolean;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

// ── Settings (PLAN §10, §17, §34) ─────────────────────────────────

/**
 * Agent permission mode (PLAN §34, redesigned).
 * - `ask`    → pause and confirm before each destructive action.
 * - `auto`   → run everything; announce destructive steps. Escalates to a
 *              confirm only after untrusted external content was read (the
 *              prompt-injection safety net, PLAN §28).
 * - `bypass` → run everything silently, no prompts at all (the user has
 *              explicitly accepted the risk, including the injection check).
 *
 * Legacy values (`full_auto`/`notify_only`/`confirm_destructive`) are migrated
 * on read — see `Storage.settings.get`.
 */
export type AgentMode = 'ask' | 'auto' | 'bypass';

export type ReasoningEffort = 'low' | 'medium' | 'high';

/** Per-site tool restriction (B5): block these tools while on a matching origin.
 * `pattern` supports `*` wildcards and is matched against the tab's full URL,
 * origin, and hostname. */
export interface SiteToolRule {
  pattern: string;
  blockedTools: string[];
}

export interface Settings {
  selectedProviderId: string | null;
  selectedModel: string | null;
  agentMode: AgentMode;
  /** Reasoning effort passed to reasoning-capable models (PLAN §6). */
  reasoningEffort: ReasoningEffort;
  maxToolCallLoops: number;
  compactionThreshold: 0.5 | 0.7 | 0.8;
  compactionEnabled: boolean;
  /** Recent turns kept verbatim during compaction (PLAN §31). Default 5. */
  compactionKeepRecent?: number;
  runJavascriptEnabled: boolean;
  systemPromptAdditions: string;
  toolTimeoutMultiplier: 0.5 | 1 | 2 | 3;
  density: 'compact' | 'comfortable' | 'spacious';
  showReasoningTokens: boolean;
  locale: string;
  onboardingComplete: boolean;
  /** Vision fallback (PLAN §17): route image tasks to a vision-capable model. */
  visionFallbackMode: 'disabled' | 'provider';
  visionFallbackProviderId: string | null;
  visionFallbackModel: string | null;
  /** Local recovery-snapshot interval in days; 0 = off (PLAN §32). */
  autoBackupDays: number;
  /** Model id used for spawned subagents; '' = same as the main model. */
  subagentModel: string;
  /** Per-site tool restrictions (B5). */
  siteToolRules: SiteToolRule[];
  /** Prepend a conversation's stored summary to context on resume (B6). */
  useConversationSummary: boolean;
  /** Enable the experimental ask_external_ai web-scraping tool (B7, PLAN §16). */
  externalAiEnabled: boolean;
  /** Per-event notification toggles (PLAN §39). */
  notifications: {
    taskCompleted: boolean;
    taskFailed: boolean;
    needsInput: boolean;
    rateLimit: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  selectedProviderId: null,
  selectedModel: null,
  agentMode: 'bypass',
  reasoningEffort: 'medium',
  maxToolCallLoops: 100,
  compactionThreshold: 0.7,
  compactionEnabled: true,
  runJavascriptEnabled: false,
  systemPromptAdditions: '',
  toolTimeoutMultiplier: 1,
  density: 'comfortable',
  showReasoningTokens: true,
  locale: 'en',
  onboardingComplete: false,
  visionFallbackMode: 'disabled',
  visionFallbackProviderId: null,
  visionFallbackModel: null,
  autoBackupDays: 0,
  subagentModel: '',
  siteToolRules: [],
  useConversationSummary: true,
  externalAiEnabled: false,
  notifications: {
    taskCompleted: true,
    taskFailed: true,
    needsInput: true,
    rateLimit: false,
  },
};
