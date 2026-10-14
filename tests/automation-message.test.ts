import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItem } from '../apps/agent/src/normalize.js';
const text = '<heartbeat>\n<automation_id>windows</automation_id>\n<current_time_iso>2026-10-11T10:11:45.865Z</current_time_iso>\n<instructions>\n检查迁移状态。\n</instructions>\n</heartbeat>';
test('native heartbeat history and live items show their source as a collapsed activity, not personal input', () => {
  for (const timestamp of [1, Date.now()]) {
    const item = normalizeItem({ type: 'userMessage', id: 'automation', content: [{ type: 'text', text }] }, 'turn', timestamp)!;
    assert.equal(item.kind, 'activity'); assert.equal(item.text, '自动化心跳 · windows');
    assert.match(item.details!, /来源：Codex 自动化 windows/); assert.match(item.details!, /检查迁移状态/);
    assert.ok(!item.text.includes('instructions')); assert.equal(item.timestamp, timestamp);
  }
});
test('ordinary text, examples, malformed envelopes and known client messages remain personal input', () => {
  for (const value of ['请解释 '+text, '```xml\n'+text+'\n```', text.replace('2026-10-11T10:11:45.865Z', 'unknown')]) {
    const item = normalizeItem({ type: 'userMessage', id: 'manual', content: [{ type: 'text', text: value }] }, 'turn')!;
    assert.equal(item.kind, 'user'); assert.equal(item.text, value);
  }
  assert.equal(normalizeItem({ type: 'userMessage', id: 'manual', clientId: 'known-client', content: [{ type: 'text', text }] }, 'turn')!.kind, 'user');
});
