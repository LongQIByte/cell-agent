import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentService } from '../apps/agent/src/service.js';
import { AgentStore } from '../apps/agent/src/store.js';
import type { CodexRpc } from '../apps/agent/src/codex.js';
import { mergeProjects } from '../apps/mobile/src/catalog-state.js';
import type { Project } from '@codex-remote/protocol';

test('native archives drive the active and archived catalogs, including desktop changes and restore', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cell-agent-archive-')));
  const workspace = join(root, 'workspace');
  const other = join(root, 'other');
  await mkdir(workspace);
  await mkdir(other);
  class FakeCodex extends EventEmitter {
    ready = Promise.resolve();
    projects = [
      { id: 'workspace-project', name: 'Workspace', roots: [{ path: workspace }], updatedAt: 1 },
      { id: 'other-project', name: 'Other', roots: [{ path: other }], updatedAt: 1 },
    ];
    threads = [
      { id: 'a', projectId: 'workspace-project', cwd: workspace, name: 'First', updatedAt: 1 },
      { id: 'b', projectId: 'workspace-project', cwd: workspace, name: 'Second', updatedAt: 2 },
      { id: 'c', projectId: 'other-project', cwd: other, name: 'Other', updatedAt: 3 },
      { id: 'child', projectId: 'workspace-project', cwd: workspace, name: 'Child', updatedAt: 3, parentThreadId: 'a' },
    ];
    archived = new Set<string>();
    calls: string[] = [];
    failId = '';
    async call(method: string, params: any): Promise<any> {
      if (method === 'project/list')
        return { data: this.projects, nextCursor: null };
      if (method === 'project/read')
        return { project: this.projects.find((project) => project.id === params.projectId) };
      if (method === 'project/create') {
        const project = { id: `project-${this.projects.length}`, name: params.name, roots: params.roots, updatedAt: 5 };
        this.projects.push(project);
        return { project };
      }
      if (method === 'thread/list') {
        const data = this.threads.filter((thread) =>
          this.archived.has(thread.id) === !!params.archived && (!params.projectId || params.projectId === thread.projectId),
        );
        // Exercise pagination for both catalog views and project validation.
        const offset = Number(params.cursor ?? 0);
        return { data: data.slice(offset, offset + 1), nextCursor: offset + 1 < data.length ? String(offset + 1) : null };
      }
      this.calls.push(`${method}:${params.threadId}`);
      if (params.threadId === this.failId) throw new Error('Archive refused');
      if (method === 'thread/archive') {
        this.archived.add(params.threadId);
        for (const thread of this.threads)
          if (thread.parentThreadId === params.threadId) this.archived.add(thread.id);
      } else if (method === 'thread/unarchive') this.archived.delete(params.threadId);
      else throw new Error(`Unexpected method: ${method}`);
      return {};
    }
    close() {}
  }
  const fake = new FakeCodex();
  const store = new AgentStore(':memory:');
  const service = new AgentService(fake as unknown as CodexRpc, store, 'machine', join(root, 'codex-home'));
  try {
    const { projects: initial } = await service.catalogue();
    const project = initial.find((item) => item.path === workspace)!;
    assert.deepEqual(project.sessions.map((session) => session.id), ['b', 'a']);
    await service.handle('sessions/archive', { threadId: 'a' });
    assert.deepEqual((await service.catalogue()).projects.find((item) => item.id === project.id)!.sessions.map((session) => session.id), ['b']);
    assert.deepEqual((await service.catalogue(true)).projects[0].sessions.map((session) => session.id), ['a']);
    // A desktop archive is authoritative for the canonical project.
    fake.archived.add('b');
    assert.equal((await service.catalogue()).projects.some((item) => item.id === project.id), false);
    await service.handle('sessions/unarchive', { threadId: 'a' });
    assert.equal((await service.catalogue()).projects.find((item) => item.id === project.id)!.sessions[0].id, 'a');
    await service.handle('sessions/unarchive', { threadId: 'b' });
    // Reject IDs from another project before making any archive calls.
    const calls = fake.calls.length;
    await assert.rejects(service.handle('projects/archive', { projectId: project.id, threadIds: ['a', 'c'] }), /项目会话已变化/);
    assert.equal(fake.calls.length, calls);
    fake.failId = 'b';
    await assert.rejects(service.handle('projects/archive', { projectId: project.id, threadIds: ['a', 'b'] }), /已归档 1 个会话，1 个未成功/);
    assert.deepEqual((await service.catalogue()).projects.find((item) => item.id === project.id)!.sessions.map((session) => session.id), ['b']);
    fake.failId = '';
    // A new session created after confirmation is not part of the confirmed set.
    fake.threads.push({ id: 'late', projectId: project.id, cwd: workspace, name: 'Late', updatedAt: 4 });
    assert.deepEqual(await service.handle('projects/archive', { projectId: project.id, threadIds: ['b'] }), { archived: 1 });
    assert.deepEqual((await service.catalogue()).projects.find((item) => item.id === project.id)!.sessions.map((session) => session.id), ['late']);
    await service.handle('projects/archive', { projectId: project.id, threadIds: ['late'] });
    assert.equal((await service.catalogue()).projects.some((item) => item.id === project.id), false);
    assert.equal(fake.archived.has('c'), false);
    assert.equal(fake.calls.filter((call) => call === 'thread/archive:child').length, 0);
    // Empty newly added projects remain usable and do not appear in archives.
    const fresh = join(root, 'fresh');
    await mkdir(fresh);
    const created = await service.handle('projects/create', { name: 'Fresh', path: fresh }) as { project: Project };
    assert.equal(created.project.sessions.length, 0);
    assert.equal((await service.catalogue(true)).projects.some((item) => item.path === fresh), false);
  } finally {
    service.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('silent sync keeps unchanged rows stable while reconciling removals and preserving offline devices', () => {
  const project = (id: string, deviceId = 'online'): Project => ({ id, deviceId, name: id, path: `/${id}`, available: true, updatedAt: 1, sessions: [] });
  const first = project('first');
  const second = project('second');
  const offline = project('offline', 'offline');
  const previous = [first, second, offline];
  assert.equal(mergeProjects(previous, [{ ...second }, { ...first }], new Set(['online'])), previous);
  const changed = { ...first, updatedAt: 2 };
  const result = mergeProjects(previous, [changed], new Set(['online']));
  assert.deepEqual(result, [changed, offline]);
  assert.equal(result[1], offline);
  assert.deepEqual(mergeProjects(previous, [], new Set(['online'])), [offline]);
});
