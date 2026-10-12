import test from 'node:test';
import assert from 'node:assert/strict';
import type { Project, RecentSession } from '@codex-remote/protocol';
import { mergeProjects, mergeRecentSessions } from '../apps/mobile/src/catalog-state.js';

test('background sync reconciles membership without replacing unchanged project rows', () => {
  const first: Project = { id: 'native', deviceId: 'mac', name: 'Native', path: '/shared', available: true, updatedAt: 1, sessions: [] };
  const offline: Project = { ...first, deviceId: 'offline' };
  const previous = [first, offline];
  for (let index = 0; index < 3; index++) {
    assert.equal(mergeProjects(previous, [{ ...first }], new Set(['mac'])), previous);
  }
  assert.deepEqual(mergeProjects(previous, [], new Set(['mac'])), [offline]);
});

test('recent chats reconcile independently by machine and thread ID, retaining offline data', () => {
  const chat: RecentSession = {
    deviceId: 'mac',
    session: { id: 'same-id', projectId: null, cwd: '/shared', name: 'Recent', updatedAt: 1, status: 'idle' },
  };
  const other: RecentSession = { deviceId: 'offline', session: { ...chat.session } };
  const previous = [chat, other];
  assert.equal(mergeRecentSessions(previous, [{ ...chat, session: { ...chat.session } }], new Set(['mac'])), previous);
  const update = { ...chat, session: { ...chat.session, name: 'Updated', updatedAt: 2 } };
  const next = mergeRecentSessions(previous, [update], new Set(['mac']));
  assert.deepEqual(next, [update, other]);
  assert.equal(next[1], other);
  // A chat assigned to a native project disappears from the recent section.
  assert.deepEqual(mergeRecentSessions(next, [], new Set(['mac'])), [other]);
});
