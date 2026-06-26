/** Hook for tracking token usage and context window */

import { useEffect, useState } from 'preact/hooks';
import type { ChatLine } from '../types/chat';
import { Storage } from '@/storage';

export function useTokenTracking(lines: ChatLine[], conversationId: string) {
  const [contextWindow, setContextWindow] = useState<number | null>(null);
  const [convTokens, setConvTokens] = useState(0);

  // Load context window and conversation token count
  useEffect(() => {
    const loadContextWindow = async () => {
      const s = await Storage.settings.get();
      if (!s.selectedProviderId || !s.selectedModel) {
        setContextWindow(null);
        return;
      }
      const m = (await Storage.models.listByProvider(s.selectedProviderId)).find(
        (x) => x.id === s.selectedModel,
      );
      setContextWindow(m?.contextWindow ?? null);
    };
    loadContextWindow();
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.settings) loadContextWindow();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Load conversation token count
  useEffect(() => {
    Storage.conversations.get(conversationId).then((c) => setConvTokens(c?.tokensUsed ?? 0));
  }, [conversationId]);

  // Estimate tokens: ~4 chars per token
  const usedTokens = Math.ceil(lines.reduce((n, l) => n + l.content.length, 0) / 4);
  const ctxPercent = contextWindow ? (usedTokens / contextWindow) * 100 : 0;

  return { usedTokens, contextWindow, ctxPercent, convTokens };
}
