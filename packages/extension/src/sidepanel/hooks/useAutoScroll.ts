/** Hook for managing auto-scroll behavior */

import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';

const SCROLL_BOTTOM_THRESHOLD = 80;

export function useAutoScroll(scrollRef: RefObject<HTMLDivElement>) {
  const [atBottom, setAtBottom] = useState(true);

  // Auto-scroll to newest content when near bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [atBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distance <= SCROLL_BOTTOM_THRESHOLD);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAtBottom(true);
  };

  return { atBottom, onScroll, scrollToBottom };
}
