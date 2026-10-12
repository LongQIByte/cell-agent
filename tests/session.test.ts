import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SessionHistory, WireMessage } from '@codex-remote/protocol';
import { AgentStore } from '../apps/agent/src/store.js';
import { AgentService } from '../apps/agent/src/service.js';
import { CodexRpc } from '../apps/agent/src/codex.js';
import { normalizeItem } from '../apps/agent/src/normalize.js';
import { applySessionEvent } from '../apps/mobile/src/session-state.js';

test('snapshot and streaming updates converge without duplicate tokens after reconnect', () => {
  const state: SessionHistory = {
    session: { id: 'thread', projectId: 'p', name: 'Test', updatedAt: 0, status: 'idle' },
    items: [{ id: 'item', turnId: 'turn', kind: 'assistant', text: 'Hello', timestamp: 0 }],
    requests: [],
    activeTurnId: 'turn',
    nextCursor: null,
    sequence: 8,
  };
  const old: WireMessage = {
    type: 'event',
    method: 'session/delta',
    params: {
      sequence: 7,
      threadId: 'thread',
      itemId: 'item',
      turnId: 'turn',
      field: 'text',
      delta: 'lo',
      value: 'Hello',
      kind: 'assistant',
    },
  };
  assert.equal(applySessionEvent(state, old), state);
  const current = applySessionEvent(state, {
    ...old,
    params: { ...old.params, sequence: 9, delta: ' world', value: 'Hello world' },
  });
  assert.equal(current.items[0].text, 'Hello world');
  assert.equal(
    applySessionEvent(current, {
      ...old,
      params: { ...old.params, sequence: 9, delta: ' world', value: 'Hello world' },
    }).items[0].text,
    'Hello world',
  );
});
test('attachments stay in the selected project, and replaying a message never creates a second Codex turn', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-remote-'));
  const workspace = join(root, 'workspace');
  await mkdir(workspace);
  class FakeCodex extends EventEmitter {
    ready = Promise.resolve();
    starts = 0;
    input: any[] = [];
    async call(method: string, params: any): Promise<any> {
      if (method === 'thread/list') return { data: [], nextCursor: null };
      if (method === 'thread/read' || method === 'thread/resume')
        return {
          thread: {
            id: 'thread',
            cwd: workspace,
            name: 'Test',
            createdAt: 1,
            updatedAt: 1,
            status: { type: 'idle' },
          },
        };
      if (method === 'turn/start') {
        this.starts++;
        this.input = params.input;
        assert.equal(params.input[0].text, 'hello');
        return { turn: { id: 'turn' } };
      }
      return {};
    }
    close() {}
  }
  const fake = new FakeCodex();
  const store = new AgentStore(':memory:');
  const service = new AgentService(fake as unknown as CodexRpc, store, 'machine');
  try {
    const { project } = (await service.handle('projects/create', {
      name: 'Test',
      path: workspace,
    })) as any;
    const { file } = (await service.handle('attachments/upload', {
      projectId: project.id,
      name: '../../note.txt',
      mimeType: 'text/plain',
      data: Buffer.from('attachment').toString('base64'),
    })) as any;
    const row = store.attachment(file.id)!;
    assert.equal(row.name, 'note.txt');
    assert.ok(row.path.startsWith(workspace + '/'));
    assert.equal(await readFile(row.path, 'utf8'), 'attachment');
    const message = {
      threadId: 'thread',
      text: 'hello',
      attachmentIds: [file.id],
      idempotencyKey: 'same-message',
    };
    const first = await service.handle('sessions/send', message);
    const second = await service.handle('sessions/send', message);
    assert.deepEqual(first, second);
    assert.equal(fake.starts, 1);
    const display = normalizeItem(
      { type: 'userMessage', id: 'user', content: fake.input },
      'turn',
      0,
      (path) => store.attachmentByPath(path)?.name,
    )!;
    assert.equal(display.text, 'hello');
    assert.deepEqual(display.attachments, ['note.txt']);
    const other = join(root, 'other');
    const outside = join(root, 'outside');
    await mkdir(other);
    await mkdir(outside);
    await symlink(outside, join(other, '.codex-remote'));
    const otherProject = (await service.handle('projects/create', {
      name: 'Other',
      path: other,
    })) as any;
    await assert.rejects(
      service.handle('attachments/upload', {
        projectId: otherProject.project.id,
        name: 'no.txt',
        mimeType: 'text/plain',
        data: 'eA==',
      }),
      /附件目录不能指向项目之外/,
    );
    await assert.rejects(readFile(join(outside, 'attachments')), { code: 'ENOENT' });
    await assert.rejects(
      service.handle('sessions/send', {
        ...message,
        attachmentIds: ['not-an-attachment'],
        idempotencyKey: 'invalid',
      }),
      /附件不存在/,
    );
  } finally {
    service.close();
    await rm(root, { recursive: true, force: true });
  }
});
