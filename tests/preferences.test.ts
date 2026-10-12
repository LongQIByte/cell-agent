import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFERENCES, FONT_SIZES, normalizePreferences, projectPaneWidth } from '../apps/mobile/src/preferences.js';

test('stored preferences validate every field without accepting malformed font-size objects', () => {
  for (const value of [null, undefined, [], 'dark', 7, { fontSize: { toString: 'large' } }])
    assert.deepEqual(normalizePreferences(value), DEFAULT_PREFERENCES);
  assert.deepEqual(normalizePreferences({ theme: 'dark', fontSize: 'extraLarge', projectRatio: 0.45, obsolete: true }), {
    theme: 'dark', fontSize: 'extraLarge', projectRatio: 0.45,
  });
  for (const fontSize of Object.keys(FONT_SIZES))
    assert.equal(normalizePreferences({ fontSize }).fontSize, fontSize);
  assert.equal(normalizePreferences({ fontSize: '__proto__', theme: 'unknown' }).fontSize, 'standard');
  assert.equal(normalizePreferences({ projectRatio: 0 }).projectRatio, 0.25);
  assert.equal(normalizePreferences({ projectRatio: 1 }).projectRatio, 0.6);
  for (const projectRatio of [NaN, Infinity, -Infinity, '0.4'])
    assert.equal(normalizePreferences({ projectRatio }).projectRatio, DEFAULT_PREFERENCES.projectRatio);
});

test('foldable pane sizing honors preferred ratio while keeping project and chat controls usable', () => {
  for (const available of [576, 739, 1000, 2000]) {
    for (const ratio of [0.25, 0.35, 0.6]) {
      const project = projectPaneWidth(available, ratio);
      assert.ok(project >= 220, `project controls fit at ${available}:${ratio}`);
      assert.ok(available - project >= 320, `chat controls fit at ${available}:${ratio}`);
    }
  }
  assert.equal(projectPaneWidth(1000, 0.4), 400);
  assert.equal(projectPaneWidth(739, 0.25), 220);
  assert.equal(projectPaneWidth(739, 0.6), 419);
  assert.equal(projectPaneWidth(576, 0.6), 256);
  assert.equal(projectPaneWidth(1000, NaN), 350);
  for (const available of [0, -1, NaN, Infinity]) assert.equal(projectPaneWidth(available, 0.35), 0);
  for (const available of [1, 100, 320]) {
    const project = projectPaneWidth(available, 0.6);
    assert.ok(project >= 0 && project <= available);
  }
});
