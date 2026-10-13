import type { ChatItem } from '@codex-remote/protocol';

// A turn may contain hundreds of tool records. Bound the initial render by
// items as well as limiting the number of turns fetched from the computer.
export const CHAT_WINDOW_SIZE = 40;
export const HISTORY_TURN_LIMIT = 6;
export const chatItemKey = (item: ChatItem) => `${item.turnId}:${item.id}`;
export function latestWindowStart(items: ChatItem[]) {
  const item = items[Math.max(0, items.length - CHAT_WINDOW_SIZE)];
  return item ? chatItemKey(item) : null;
}
export function chatWindowStart(items: ChatItem[], firstKey: string | null) {
  if (!firstKey) return Math.max(0, items.length - CHAT_WINDOW_SIZE);
  const index = items.findIndex((item) => chatItemKey(item) === firstKey);
  return index < 0 ? Math.max(0, items.length - CHAT_WINDOW_SIZE) : index;
}
