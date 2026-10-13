import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RemoteError } from '@codex-remote/protocol';
import type { CodexRpc } from '../apps/agent/src/codex.js';
import { AgentService } from '../apps/agent/src/service.js';
import { AgentStore } from '../apps/agent/src/store.js';

class Native extends EventEmitter {
  ready = Promise.resolve();
  turns: any[] = [{ id: 'original', status: 'inProgress', items: [] }];
  calls: { method: string; params: any }[] = [];
  fail?: RemoteError;
  async call(method: string, params: any): Promise<any> {
    this.calls.push({ method, params });
    const thread = { id: params.threadId, projectId: null, cwd: '/workspace', name: 'Queue test', createdAt: 1, updatedAt: 1 };
    if (method === 'thread/read') return { thread };
    if (method === 'thread/resume') return { thread, model: 'test', reasoningEffort: null, approvalPolicy: 'never',
      sandbox: { type: 'dangerFullAccess' }, approvalsReviewer: 'user', activePermissionProfile: null, runtimeWorkspaceRoots: ['/workspace'] };
    if (method === 'thread/turns/list') return { data: [...this.turns].reverse(), nextCursor: null };
    if (method === 'collaborationMode/list') return { data: [] };
    if (method === 'thread/goal/get') return { goal: null };
    if (method === 'turn/start' || method === 'turn/steer') {
      if (this.fail) throw this.fail;
      if (method === 'turn/steer') {
        const turn = this.turns.find((turn) => turn.status === 'inProgress');
        if (!turn || turn.id !== params.expectedTurnId) throw new RemoteError('CODEX_-32600', 'expected active turn id');
        turn.items.push({ id: params.clientUserMessageId, clientId: params.clientUserMessageId, type: 'userMessage', content: params.input });
        return { turnId: turn.id };
      }
      const turn = { id: `turn-${this.turns.length}`, status: 'inProgress', items: [
        { id: params.clientUserMessageId, clientId: params.clientUserMessageId, type: 'userMessage', content: params.input },
      ] };
      this.turns.push(turn); this.emit('notification', { method: 'turn/started', params: { threadId: params.threadId, turn } });
      return { turn };
    }
    throw new Error(`Unexpected ${method}`);
  }
  complete(threadId = 'thread') {
    const turn = this.turns.find((turn) => turn.status === 'inProgress')!;
    turn.status = 'completed'; this.emit('notification', { method: 'turn/completed', params: { threadId, turn } });
  }
  close() {}
}
const message = (id: string) => ({ threadId: 'thread', text: id, idempotencyKey: id });
const settle = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(condition(), 'asynchronous outbox reached expected state');
};
const service = (native: Native, path = ':memory:') => new AgentService(native as unknown as CodexRpc, new AgentStore(path), 'machine', '/missing-home');

test('queue is durable FIFO, deduplicates submissions, and sends only after each native turn finishes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cell-outbox-')); const path = join(root, 'agent.sqlite');
  let native = new Native(); let agent = service(native, path);
  try {
    await agent.handle('sessions/enqueue', message('first'));
    await agent.handle('sessions/enqueue', message('second'));
    await agent.handle('sessions/enqueue', message('first'));
    await settle(() => agent.store.outbox('thread').length === 2);
    assert.equal(native.calls.filter((call) => call.method === 'turn/start').length, 0);
    await new Promise((resolve) => setTimeout(resolve, 25)); agent.close();
    const restarted = new Native(); restarted.turns = native.turns; restarted.calls = native.calls; native = restarted;
    agent = service(native, path);
    await agent.readSession('thread');
    native.complete();
    await settle(() => agent.store.outbox('thread')[0].status === 'accepted');
    assert.deepEqual(native.calls.filter((call) => call.method === 'turn/start').map((call) => call.params.input[0].text), ['first']);
    native.complete();
    await settle(() => agent.store.outbox('thread')[1].status === 'accepted');
    assert.deepEqual(native.calls.filter((call) => call.method === 'turn/start').map((call) => call.params.input[0].text), ['first', 'second']);
    assert.equal((await agent.readSession('thread')).outbox!.length, 2);
    await assert.rejects(agent.handle('sessions/enqueue', { ...message('first'), text: 'changed' }), /标识/);
    await assert.rejects(agent.handle('sessions/enqueue', { ...message('first'), threadId: 'other' }), /标识/);
  } finally { agent.close(); await rm(root, { recursive: true, force: true }); }
});
test('native steering keeps the same turn, forwards attachments, deduplicates and never interrupts or starts a replacement', async () => {
  const native = new Native(); const agent = service(native);
  try {
    agent.store.saveAttachment({ id: 'photo', thread_id: 'thread', path: '/photo.png', name: 'photo.png', mime_type: 'image/png', size: 4 });
    const p = { ...message('steer'), expectedTurnId: 'original', attachmentIds: ['photo'] };
    assert.deepEqual(await agent.handle('sessions/steer', p), { turnId: 'original' });
    assert.deepEqual(await agent.handle('sessions/steer', p), { turnId: 'original' });
    const calls = native.calls.filter((call) => call.method.startsWith('turn/'));
    assert.equal(calls.length, 1); assert.equal(calls[0].method, 'turn/steer');
    assert.deepEqual(calls[0].params.input[1], { type: 'localImage', path: '/photo.png' });
    await assert.rejects(agent.handle('sessions/steer', { ...message('bad-policy'), expectedTurnId: 'original', permissionMode: 'full-access' }), /不能修改/);
    native.complete();
    await assert.rejects(agent.handle('sessions/steer', { ...message('late'), expectedTurnId: 'original' }), /expected active/);
    assert.equal(native.calls.filter((call) => call.method === 'turn/start' || call.method === 'turn/interrupt').length, 0);
  } finally { agent.close(); }
});
test('known failures retain queue order and explicitly retry; uncertain sends never replay', async () => {
  for (const code of ['CODEX_-32600', 'CODEX_TIMEOUT']) {
    const native = new Native(); native.turns = []; native.fail = new RemoteError(code, 'Rejected or timed out');
    const agent = service(native);
    try {
      await agent.handle('sessions/enqueue', message(code));
      await settle(() => ['failed', 'uncertain'].includes(agent.store.outbox('thread')[0].status));
      const expected = code === 'CODEX_TIMEOUT' ? 'uncertain' : 'failed';
      assert.equal(agent.store.outbox('thread')[0].status, expected);
      native.fail = undefined;
      if (expected === 'failed') {
        await agent.handle('sessions/queue/retry', { threadId: 'thread', id: code });
        await settle(() => agent.store.outbox('thread')[0].status === 'accepted');
      } else {
        await assert.rejects(agent.handle('sessions/queue/retry', { threadId: 'thread', id: code }), /不能重复/);
        await agent.readSession('thread');
        assert.equal(native.calls.filter((call) => call.method === 'turn/start').length, 1);
      }
    } finally { agent.close(); }
  }
});

test('native acknowledgements reconcile an uncertain queue without replaying it', async () => {
  const native = new Native(); native.turns = []; native.fail = new RemoteError('CODEX_TIMEOUT', 'response lost');
  const agent = service(native);
  try {
    await agent.handle('sessions/enqueue', message('lost-ack'));
    await settle(() => agent.store.outbox('thread')[0].status === 'uncertain');
    native.turns.push({ id: 'accepted-turn', status: 'completed', items: [{
      id: 'native-user', type: 'userMessage', clientId: 'lost-ack', content: [{ type: 'text', text: 'lost-ack' }],
    }] });
    assert.equal((await agent.readSession('thread')).outbox![0].status, 'accepted');
    assert.deepEqual(await agent.handle('sessions/send', message('lost-ack')), { turnId: 'accepted-turn' });
    assert.equal(native.calls.filter((call) => call.method === 'turn/start').length, 1);
  } finally { agent.close(); }
});
