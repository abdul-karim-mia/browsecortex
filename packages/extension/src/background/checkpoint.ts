/**
 * Agent state checkpointing (PLAN §22, Layer 3).
 *
 * After each tool round the loop's in-progress messages are saved to
 * chrome.storage.session. If the service worker is killed mid-task, the next
 * startup recovers the partial turns into IndexedDB so the work isn't lost,
 * then clears the checkpoint. (Seamless auto-resume of a live stream isn't
 * possible once the worker dies; this guarantees no data loss instead.)
 */
import type { ApiMessage } from '@/providers/chat-types';

const KEY = 'agent_checkpoint';

export interface Checkpoint {
  conversationId: string;
  /** Number of pre-existing API turns before this run (to compute new turns). */
  priorTurnCount: number;
  messages: ApiMessage[];
  updatedAt: number;
}

function hasSession(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.session;
}

export async function saveCheckpoint(cp: Checkpoint): Promise<void> {
  if (!hasSession()) return;
  await chrome.storage.session.set({ [KEY]: cp });
}

export async function getCheckpoint(): Promise<Checkpoint | null> {
  if (!hasSession()) return null;
  const res = await chrome.storage.session.get(KEY);
  return (res[KEY] as Checkpoint) ?? null;
}

export async function clearCheckpoint(): Promise<void> {
  if (!hasSession()) return;
  await chrome.storage.session.remove(KEY);
}
