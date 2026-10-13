import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantOutput, beginMetrics, updateTokenUsage } from '../apps/agent/src/run-metrics.js';
import { recentImages, recentImageTime, RECENT_IMAGE_WINDOW_MS } from '../apps/mobile/src/recent-image-state.js';

const tokens = (input: number, output: number, cached = 0) => ({ inputTokens: input, outputTokens: output, cachedInputTokens: cached, totalTokens: input + output, reasoningOutputTokens: 0 });
test('turn usage is a baseline difference while context uses the latest request, including after compaction', () => {
  const previous = beginMetrics('old', null, 100);
  updateTokenUsage(previous, { total: tokens(9000, 1000), last: tokens(5000, 50), modelContextWindow: 10000 });
  const current = beginMetrics('new', previous, 200);
  updateTokenUsage(current, { total: tokens(9400, 1020, 100), last: tokens(400, 20, 100), modelContextWindow: 10000 });
  assert.equal(current.metrics.contextUsed, 420);
  assert.deepEqual(current.metrics.usage, tokens(400, 20, 100));
  updateTokenUsage(current, { total: tokens(9800, 1040, 200), last: tokens(200, 20, 100), modelContextWindow: 10000 });
  assert.equal(current.metrics.contextUsed, 220);
  assert.deepEqual(current.metrics.usage, tokens(800, 40, 200));
  const noBaseline = beginMetrics('resumed');
  updateTokenUsage(noBaseline, { total: tokens(9800, 1040), last: tokens(200, 20), modelContextWindow: null });
  assert.equal(noBaseline.metrics.usage, null);
  assert.equal(noBaseline.metrics.contextWindow, null);
});
test('assistant snapshots replace streamed text without double counting Unicode output or mixing turns', () => {
  const snapshot = beginMetrics('one', null, 100);
  assistantOutput(snapshot, 'a', '你好😀', 200);
  assistantOutput(snapshot, 'a', '你好😀世界', 1200);
  assistantOutput(snapshot, 'a', '你好😀世界', 1300);
  assistantOutput(snapshot, 'b', '完成', 2200);
  assert.equal(snapshot.metrics.assistantCharacters, 7);
  assert.equal(snapshot.metrics.firstOutputAt, 200);
  assert.equal(snapshot.metrics.lastOutputAt, 2200);
  const next = beginMetrics('two', snapshot, 3000);
  assert.equal(next.metrics.assistantCharacters, 0);
  assert.equal(next.metrics.firstOutputAt, null);
});
test('recent photo discovery excludes old, future, handled images and caps prompts to six', () => {
  const now = 1000000;
  const photo = (id: string, creationTime = now - 1) => ({ id, creationTime, uri: id, filename: `${id}.png` });
  const images = [photo('old', now - RECENT_IMAGE_WINDOW_MS - 1), photo('future', now + 1), photo('ignored'), ...Array.from({ length: 8 }, (_, i) => photo(String(i)))];
  assert.deepEqual(recentImages(images, ['ignored', '2'], now).map((image) => image.id), ['0', '1', '3', '4', '5', '6']);
  assert.deepEqual(recentImages([], [], now), []);
});
test('imported photos without capture metadata and recently edited photos use valid modification time', () => {
  const now = 1000000;
  assert.equal(recentImageTime({ creationTime: 0, modificationTime: now - 1 }, now), now - 1);
  assert.equal(recentImageTime({ creationTime: now - 500000, modificationTime: now - 1 }, now), now - 1);
  assert.equal(recentImageTime({ creationTime: now + 10000, modificationTime: now - 1 }, now), now - 1);
  assert.equal(recentImageTime({ creationTime: NaN }, now), 0);
});
