import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChatItem } from '@codex-remote/protocol';
import { chatItemKey, chatWindowStart, latestWindowStart } from '../apps/mobile/src/chat-window.js';

test('a long single turn opens in a bounded window and its anchor survives streaming, prepending and stale caches', () => {
  const items: ChatItem[] = Array.from({ length: 200 }, (_, i) => ({
    id: String(i), turnId: 'long-turn', kind: 'assistant', text: String(i), timestamp: i,
  }));
  const first = latestWindowStart(items);
  assert.equal(chatWindowStart(items, first), 160);
  const live = { ...items[199], id: 'live' };
  assert.equal(chatWindowStart([...items, live], first), 160);
  assert.equal(chatWindowStart([{ ...live, id: 'older' }, ...items], first), 161);
  assert.equal(chatWindowStart(items.slice(0, 10), first), 0);
  assert.equal(chatWindowStart(items, chatItemKey(items[0])), 0);
  assert.equal(latestWindowStart([]), null);
});
