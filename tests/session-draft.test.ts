import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionDraftStore, type SessionDraft } from '../apps/mobile/src/session-draft.js';

const draft = (text: string): SessionDraft => ({ text, files: [], settings: null, attempt: null });

test('native saves stay ordered per session and navigation reads wait for the latest draft', async () => {
  const saved = new Map<string, SessionDraft>();
  const started: string[] = [];
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const store = createSessionDraftStore({
    read: async (key) => saved.get(key) ?? null,
    write: async (key, value) => {
      started.push(`${key}:${value.text}`);
      if (value.text === 'older') await blocked;
      saved.set(key, value);
    },
  }, true);
  const older = store.write('chat-a', draft('older'));
  const newer = store.write('chat-a', draft('newer'));
  const other = store.write('chat-b', draft('independent'));
  const recovered = store.read('chat-a');
  await other;
  assert.deepEqual(started, ['chat-a:older', 'chat-b:independent']);
  assert.equal(saved.has('chat-a'), false);
  release();
  await Promise.all([older, newer]);
  assert.equal((await recovered)?.text, 'newer');
  assert.equal((await store.read('chat-b'))?.text, 'independent');
});

test('browser saves begin synchronously before reload and write failures remain observable', async () => {
  let current: SessionDraft | null = null;
  let fail = false;
  const store = createSessionDraftStore({
    read: async () => current,
    write: async (_key, value) => {
      if (fail) throw new Error('Storage unavailable');
      current = value;
    },
  }, false);
  const saved = store.write('chat', draft('new selection'));
  assert.equal(current!.text, 'new selection');
  await saved;
  fail = true;
  await assert.rejects(store.write('chat', draft('not saved')), /Storage unavailable/);
  assert.equal((await store.read('chat'))?.text, 'new selection');
});

test('a failed native write does not prevent a later explicit retry', async () => {
  let current: SessionDraft | null = null;
  const store = createSessionDraftStore({
    read: async () => current,
    write: async (_key, value) => {
      if (value.text === 'fail') throw new Error('Disk full');
      current = value;
    },
  }, true);
  const failure = store.write('chat', draft('fail'));
  const retry = store.write('chat', draft('retry'));
  await assert.rejects(failure, /Disk full/);
  await retry;
  assert.equal((await store.read('chat'))?.text, 'retry');
});
