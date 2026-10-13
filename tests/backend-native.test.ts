import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RemoteError, type ApprovalPolicy, type Model, type Project, type RecentSession, type SandboxPolicy } from '@codex-remote/protocol';
import { AgentService } from '../apps/agent/src/service.js';
import { AgentStore } from '../apps/agent/src/store.js';
import type { CodexRpc } from '../apps/agent/src/codex.js';
import { sessionFrom } from '../apps/agent/src/normalize.js';

interface ThreadFixture {
  id: string;
  projectId: string | null;
  cwd: string;
  name: string | null;
  updatedAt: number;
  createdAt: number;
  model: string | null;
  reasoningEffort: string | null;
  parentThreadId?: string;
}

test('rename and fork use native metadata; Plan and Goal lifecycle recover canonical state after restart', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cell-agent-modes-')));
  const native = new NativeCodex();
  native.threads = [thread('source', root, 'native-project')];
  const database = join(root, 'agent.sqlite');
  let service = new AgentService(native as unknown as CodexRpc, new AgentStore(database), 'machine', root);
  try {
    await service.handle('sessions/rename', { threadId: 'source', name: '新名称' });
    const fork = await service.handle('sessions/fork', { threadId: 'source' }) as { session: any };
    assert.equal(fork.session.forkedFromId, 'source');
    assert.equal(fork.session.projectId, 'native-project');
    assert.equal(native.threads[0].name, '新名称');
    await service.handle('sessions/send', { threadId: fork.session.id, text: '请制定计划', mode: 'plan', idempotencyKey: 'plan-native' });
    assert.equal(native.starts[0].collaborationMode.mode, 'plan');
    assert.equal(native.starts[0].collaborationMode.settings.developer_instructions, null);
    await service.handle('sessions/send', { threadId: fork.session.id, text: '执行计划', mode: 'default', idempotencyKey: 'execute-native' });
    assert.equal(native.starts[1].collaborationMode.mode, 'default');
    await service.handle('sessions/goal/set', { threadId: fork.session.id, objective: '完成测试目标', tokenBudget: 1000 });
    await service.handle('sessions/goal/set', { threadId: fork.session.id, status: 'paused' });
    assert.equal((await service.readSession(fork.session.id)).goal?.status, 'paused');
    service.close();
    const restarted = new NativeCodex();
    restarted.threads = native.threads; restarted.goals = native.goals; restarted.modes = native.modes;
    service = new AgentService(restarted as unknown as CodexRpc, new AgentStore(database), 'machine', root);
    assert.equal((await service.readSession(fork.session.id)).goal?.objective, '完成测试目标');
    await service.handle('sessions/goal/set', { threadId: fork.session.id, status: 'active' });
    await service.handle('sessions/goal/set', { threadId: fork.session.id, status: 'complete' });
    assert.equal((await service.readSession(fork.session.id)).goal?.status, 'complete');
    await service.handle('sessions/goal/clear', { threadId: fork.session.id });
    assert.equal((await service.readSession(fork.session.id)).goal, null);
  } finally { service.close(); await rm(root, { recursive: true, force: true }); }
});
const thread = (id: string, cwd: string, projectId: string | null, updatedAt = 1): ThreadFixture => ({
  id, cwd, projectId, name: id, updatedAt, createdAt: 1, model: 'model-a', reasoningEffort: 'low',
});
class NativeCodex extends EventEmitter {
  ready = Promise.resolve();
  projects: { id: string; name: string; roots: { path: string }[]; updatedAt: number }[] = [];
  threads: ThreadFixture[] = [];
  archived = new Set<string>();
  starts: any[] = [];
  archives: string[] = [];
  responses: { id: number | string; result: unknown }[] = [];
  calls: { method: string; params: any }[] = [];
  goals = new Map<string, any>();
  modes = new Map<string, any>();
  foreignWriters = new Set<string>();
  settings = new Map<string, {
    model: string; reasoningEffort: string | null; approvalPolicy: ApprovalPolicy;
    sandbox: SandboxPolicy; approvalsReviewer: 'user' | 'auto_review' | 'guardian_subagent';
    activePermissionProfile: { id: string; extends: string | null } | null;
    runtimeWorkspaceRoots: string[];
  }>();
  models = [
    { id: 'catalog-a', model: 'model-a', displayName: 'Model A', description: 'First', hidden: false, isDefault: true, defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low', description: 'Fast' }] },
    { id: 'catalog-hidden', model: 'model-hidden', displayName: 'Hidden', description: '', hidden: true, isDefault: false, defaultReasoningEffort: 'low', supportedReasoningEfforts: [] },
    { id: 'catalog-b', model: 'model-b', displayName: 'Model B', description: 'Second', hidden: false, isDefault: false, defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'Thorough' }, { reasoningEffort: 'max', description: 'Maximum' }] },
  ];
  configuration(current: ThreadFixture) {
    let settings = this.settings.get(current.id);
    if (!settings) {
      settings = {
        model: current.model ?? 'model-a', reasoningEffort: 'low', approvalPolicy: 'never',
        sandbox: { type: 'dangerFullAccess' }, approvalsReviewer: 'user', activePermissionProfile: null,
        runtimeWorkspaceRoots: [current.cwd],
      };
      this.settings.set(current.id, settings);
    }
    return settings;
  }
  private page(data: any[], cursor: string | null) {
    const offset = Number(cursor ?? 0);
    return { data: data.slice(offset, offset + 1), nextCursor: offset + 1 < data.length ? String(offset + 1) : null };
  }
  async call(method: string, params: any): Promise<any> {
    this.calls.push({ method, params });
    if (method === 'collaborationMode/list') return { data: [{ mode: 'default' }, { mode: 'plan' }] };
    if (method === 'project/list') return this.page(this.projects, params.cursor);
    if (method === 'project/read') {
      const project = this.projects.find((project) => project.id === params.projectId);
      if (!project) throw new Error('Project not found');
      return { project };
    }
    if (method === 'project/create') {
      assert.ok(params.idempotencyKey);
      const project = { id: `native-${this.projects.length}`, name: params.name, roots: params.roots, updatedAt: 5 };
      this.projects.push(project);
      return { project };
    }
    if (method === 'thread/list') {
      assert.equal(params.cwd, undefined);
      const data = this.threads.filter((thread) =>
        this.archived.has(thread.id) === params.archived &&
        (params.projectId === undefined || thread.projectId === params.projectId),
      );
      return this.page(data, params.cursor);
    }
    if (method === 'thread/start') {
      const created = thread(`created-${this.threads.length}`, params.cwd, params.projectId);
      this.threads.push(created);
      return { thread: created, ...this.configuration(created) };
    }
    if (method === 'thread/turns/list') return { data: [], nextCursor: null };
    if (method === 'model/list') {
      assert.equal(params.includeHidden, false);
      return this.page(this.models, params.cursor);
    }
    const current = this.threads.find((thread) => thread.id === params.threadId);
    if (!current) throw new Error('Thread not found');
    if (method === 'thread/read') return { thread: current };
    if (method === 'thread/resume') {
      if (this.foreignWriters.has(current.id))
        throw new RemoteError('CODEX_-32600', `thread ${current.id} already has an active writer`);
      return { thread: current, ...this.configuration(current), collaborationMode: this.modes.get(current.id) ?? null };
    }
    if (method === 'thread/fork') {
      const fork = { ...current, id: `fork-${this.threads.length}`, forkedFromId: current.id };
      this.threads.push(fork);
      return { thread: fork, ...this.configuration(fork) };
    }
    if (method === 'thread/goal/get') return { goal: this.goals.get(current.id) ?? null };
    if (method === 'thread/goal/set') {
      assert.equal(params.origin, 'user');
      const goal = { threadId: current.id, objective: 'Original objective', status: 'active', tokenBudget: null,
        tokensUsed: 0, timeUsedSeconds: 0, createdAt: 1, updatedAt: 1, ...this.goals.get(current.id), ...params };
      this.goals.set(current.id, goal);
      return { goal };
    }
    if (method === 'thread/goal/clear') { assert.equal(params.origin, 'user'); this.goals.delete(current.id); return { cleared: true }; }
    if (method === 'thread/name/set') {
      current.name = params.name;
      return {};
    }
    if (method === 'thread/archive') {
      this.archives.push(current.id);
      this.archived.add(current.id);
      return {};
    }
    if (method === 'turn/start') {
      this.starts.push(params);
      if (params.collaborationMode) this.modes.set(current.id, params.collaborationMode);
      const settings = this.configuration(current);
      if (params.model) current.model = params.model;
      if (params.model) settings.model = params.model;
      if (params.effort) settings.reasoningEffort = params.effort;
      if (params.effort) current.reasoningEffort = params.effort;
      if (params.approvalPolicy) settings.approvalPolicy = params.approvalPolicy;
      if (params.sandboxPolicy) {
        settings.sandbox = params.sandboxPolicy;
        settings.activePermissionProfile = null;
      }
      if (params.approvalsReviewer) settings.approvalsReviewer = params.approvalsReviewer;
      this.emit('notification', { method: 'thread/settings/updated', params: {
        threadId: current.id,
        threadSettings: {
          model: settings.model, effort: settings.reasoningEffort, approvalPolicy: settings.approvalPolicy,
          sandboxPolicy: settings.sandbox, approvalsReviewer: settings.approvalsReviewer,
          activePermissionProfile: settings.activePermissionProfile,
        },
      } });
      return { turn: { id: `turn-${this.starts.length}` } };
    }
    throw new Error(`Unexpected method: ${method}`);
  }
  respond(id: number | string, result: unknown) { this.responses.push({ id, result }); }
  close() {}
}

test('current explicit desktop assignments override incomplete native projections without cwd inference', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cell-agent-desktop-')));
  const workspace = join(root, 'workspace');
  const home = join(root, 'codex-home');
  await mkdir(workspace);
  await mkdir(home);
  const native = new NativeCodex();
  native.projects = [
    { id: 'canonical-one', name: 'Real desktop project', roots: [{ path: workspace }], updatedAt: 1 },
    { id: 'canonical-two', name: 'Other desktop project', roots: [{ path: workspace }], updatedAt: 1 },
  ];
  native.threads = [
    thread('assigned', workspace, null, 4),
    thread('ordinary', workspace, null, 5),
    thread('phone-created', workspace, 'canonical-one', 3),
    thread('remote-copy', workspace, null, 6),
    thread('removed-project', workspace, null, 1),
  ];
  const state = {
    'local-projects': { desktop: { id: 'desktop' }, other: { id: 'other' } },
    'thread-project-assignments': {
      assigned: { projectKind: 'local', projectId: 'desktop' },
      ordinary: { projectKind: 'local', projectId: 'desktop' },
      'remote-copy': { projectKind: 'remote', projectId: 'remote' },
      'removed-project': { projectKind: 'local', projectId: 'deleted' },
    },
    'thread-project-membership-host-ids': { assigned: 'local', 'remote-copy': 'remote-host' },
    'projectless-thread-ids': ['ordinary'],
    'app-server-project-id-by-legacy-project-id-by-host': {
      [`local:${home}`]: { desktop: 'canonical-one', other: 'canonical-two' },
    },
  };
  const statePath = join(home, '.codex-global-state.json');
  await writeFile(statePath, JSON.stringify(state));
  const database = join(root, 'agent.sqlite');
  let service = new AgentService(native as unknown as CodexRpc, new AgentStore(database), 'machine', home);
  try {
    const catalogue = await service.catalogue();
    assert.deepEqual(catalogue.projects[0].sessions.map((session) => session.id), ['assigned', 'phone-created']);
    assert.deepEqual(catalogue.recentSessions.map((entry) => entry.session.id), ['ordinary', 'removed-project']);
    assert.equal((await service.readSession('assigned')).session.projectId, 'canonical-one');
    assert.equal((await service.readSession('ordinary')).session.projectId, null);
    await assert.rejects(service.readSession('remote-copy'), /此会话已属于其他电脑/);
    await assert.rejects(service.handle('sessions/send', {
      threadId: 'remote-copy', text: 'Wrong host', idempotencyKey: 'wrong-host',
    }), /此会话已属于其他电脑/);
    await assert.rejects(service.handle('attachments/upload', {
      threadId: 'remote-copy', name: 'note.txt', mimeType: 'text/plain', data: 'eA==',
    }), /此会话已属于其他电脑/);
    // Refresh follows an explicit desktop move even though cwd and native null are unchanged.
    state['thread-project-assignments'].assigned.projectId = 'other';
    const contents = JSON.stringify(state);
    await writeFile(statePath, contents);
    const moved = await service.catalogue();
    assert.deepEqual(moved.projects[1].sessions.map((session) => session.id), ['assigned']);
    assert.equal(await readFile(statePath, 'utf8'), contents, 'agent only reads desktop state');
    await assert.rejects(service.handle('projects/archive', { projectId: 'canonical-one', threadIds: ['assigned'] }), /项目会话已变化/);
    service.close();
    const restarted = new NativeCodex();
    restarted.projects = native.projects;
    restarted.threads = native.threads;
    service = new AgentService(restarted as unknown as CodexRpc, new AgentStore(database), 'machine', home);
    assert.deepEqual(await service.catalogue(), moved);
    await service.handle('projects/archive', { projectId: 'canonical-two', threadIds: ['assigned'] });
    assert.deepEqual(restarted.archives, ['assigned']);
    // An extant project without a verified mapping is an explicit error, never a guessed row.
    delete (state['app-server-project-id-by-legacy-project-id-by-host'][`local:${home}`] as Record<string, string>).other;
    await writeFile(statePath, JSON.stringify(state));
    await assert.rejects(service.catalogue(true), /缺少明确的原生标识映射/);
  } finally {
    service.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('canonical membership keeps same-cwd project and projectless chats separate, including after restart', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cell-agent-membership-')));
  const workspace = join(root, 'workspace');
  await mkdir(workspace);
  const native = new NativeCodex();
  native.projects = [
    { id: 'real-one', name: 'Desktop name', roots: [{ path: workspace }], updatedAt: 1 },
    { id: 'real-two', name: 'Desktop name', roots: [{ path: workspace }], updatedAt: 1 },
  ];
  native.threads = [
    thread('ordinary', workspace, null, 4),
    thread('member-one', workspace, 'real-one', 3),
    thread('member-two', workspace, 'real-two', 2),
    { ...thread('child', workspace, null, 5), parentThreadId: 'ordinary' },
  ];
  const database = join(root, 'agent.sqlite');
  let service = new AgentService(native as unknown as CodexRpc, new AgentStore(database), 'machine', join(root, 'codex-home'));
  try {
    // Previously inferred rows are neither used nor rewritten as canonical projects.
    service.store.db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, path TEXT, updated_at INTEGER); INSERT INTO projects VALUES ('obsolete-cwd-id', 'Wrong', '/auto/output', 1);");
    const initial = await service.handle('projects/list', {}) as { projects: Project[]; recentSessions: RecentSession[] };
    assert.deepEqual(initial.projects.map((project) => [project.id, project.name, project.sessions.map((session) => session.id)]), [
      ['real-one', 'Desktop name', ['member-one']],
      ['real-two', 'Desktop name', ['member-two']],
    ]);
    assert.deepEqual(initial.recentSessions.map((entry) => [entry.deviceId, entry.session.id, entry.session.projectId, entry.session.cwd]), [
      ['machine', 'ordinary', null, workspace],
    ]);
    assert.equal((await service.readSession('ordinary')).session.projectId, null);
    await assert.rejects(service.handle('projects/archive', { projectId: 'real-one', threadIds: ['ordinary'] }), /项目会话已变化/);
    assert.deepEqual(native.archives, []);
    const secondMachine = new AgentService(native as unknown as CodexRpc, new AgentStore(':memory:'), 'other-machine', join(root, 'codex-home'));
    const other = await secondMachine.catalogue();
    assert.equal(other.projects[0].name, initial.projects[0].name);
    assert.notEqual(other.projects[0].deviceId, initial.projects[0].deviceId);
    secondMachine.close();
    service.close();
    const restarted = new NativeCodex();
    restarted.projects = native.projects;
    restarted.threads = native.threads;
    service = new AgentService(restarted as unknown as CodexRpc, new AgentStore(database), 'machine', join(root, 'codex-home'));
    assert.deepEqual(await service.handle('projects/list', {}), initial);
    assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM projects').get()!.count, 1);
  } finally {
    service.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('creating a native project and a session persists only their explicit membership', async () => {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'cell-agent-create-')));
  const native = new NativeCodex();
  native.threads = [thread('ordinary', workspace, null)];
  const service = new AgentService(native as unknown as CodexRpc, new AgentStore(':memory:'), 'machine', join(workspace, 'codex-home'));
  try {
    const { project } = await service.handle('projects/create', { name: 'Exact desktop name', path: workspace }) as { project: Project };
    const result = await service.handle('sessions/create', { projectId: project.id, name: 'Member' }) as any;
    assert.equal(result.session.projectId, project.id);
    const catalogue = await service.catalogue();
    assert.equal(catalogue.projects[0].name, 'Exact desktop name');
    assert.deepEqual(catalogue.projects[0].sessions.map((session) => session.id), [result.session.id]);
    assert.deepEqual(catalogue.recentSessions.map((entry) => entry.session.id), ['ordinary']);
    const start = native.calls.find((call) => call.method === 'thread/start')!;
    assert.equal(start.params.projectId, project.id);
    assert.equal(start.params.cwd, workspace);
  } finally {
    service.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('live models paginate and the selected model reaches the actual turn RPC and canonical read', async () => {
  const native = new NativeCodex();
  native.threads = [thread('ordinary', '/workspace', null)];
  const service = new AgentService(native as unknown as CodexRpc, new AgentStore(':memory:'), 'machine', join(tmpdir(), 'cell-agent-native-model-test-no-desktop'));
  const events: any[] = [];
  service.on('event', (event) => events.push(event));
  try {
    const { models } = await service.handle('models/list', {}) as { models: Model[] };
    assert.deepEqual(models.map((model) => [model.id, model.model, model.isDefault]), [
      ['catalog-a', 'model-a', true], ['catalog-b', 'model-b', false],
    ]);
    assert.equal((await service.readSession('ordinary')).model, 'model-a');
    const message = { threadId: 'ordinary', text: 'Use chosen model', model: 'model-b', idempotencyKey: 'selected-model' };
    await service.handle('sessions/send', message);
    assert.equal(native.starts[0].model, 'model-b');
    const resumed = native.calls.find((call) => call.method === 'thread/resume');
    assert.ok(resumed, 'existing sessions are resumed before starting a turn');
    assert.equal((await service.readSession('ordinary')).model, 'model-b');
    assert.equal(events.find((event) => event.method === 'session/settings').params.model, 'model-b');
    await service.handle('sessions/send', message);
    assert.equal(native.starts.length, 1);
    await service.handle('sessions/send', { threadId: 'ordinary', text: 'Continue', idempotencyKey: 'inherit-model' });
    assert.equal(Object.hasOwn(native.starts[1], 'model'), false);
    assert.equal((await service.readSession('ordinary')).model, 'model-b');
    native.threads[0].model = null;
    assert.equal((await service.readSession('ordinary')).model, 'model-b', 'effective resume settings remain authoritative when persisted model is unavailable');
  } finally {
    service.close();
  }
});

test('effort and permission choices reach native turns, preserve custom policies, and remain isolated after restart', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cell-agent-settings-')));
  const native = new NativeCodex();
  native.threads = [thread('first', root, null), thread('second', root, null)];
  const firstConfig = native.configuration(native.threads[0]);
  firstConfig.runtimeWorkspaceRoots = [root, '/another-explicit-runtime-root'];
  const secondConfig = native.configuration(native.threads[1]);
  secondConfig.approvalPolicy = 'untrusted';
  secondConfig.sandbox = { type: 'readOnly', networkAccess: false };
  secondConfig.approvalsReviewer = 'auto_review';
  secondConfig.activePermissionProfile = { id: 'team-policy', extends: ':read-only' };
  const untouchedCustom = structuredClone(secondConfig);
  const database = join(root, 'agent.sqlite');
  let service = new AgentService(native as unknown as CodexRpc, new AgentStore(database), 'machine', join(root, 'codex-home'));
  const events: any[] = [];
  service.on('event', (event) => events.push(event));
  try {
    const initial = await service.readSession('first');
    assert.equal(initial.reasoningEffort, 'low');
    assert.equal(initial.permissions!.mode, 'full-access');
    const other = await service.readSession('second');
    assert.equal(other.permissions!.mode, null);
    assert.deepEqual(other.permissions!.profile, secondConfig.activePermissionProfile);
    await service.handle('sessions/send', {
      threadId: 'first', text: 'Work with approval', model: 'model-b', effort: 'max',
      permissionMode: 'approval', idempotencyKey: 'approval-turn',
    });
    const sent = native.starts[0];
    assert.equal(sent.model, 'model-b');
    assert.equal(sent.effort, 'max');
    assert.equal(sent.approvalPolicy, 'on-request');
    assert.equal(sent.approvalsReviewer, 'user');
    assert.deepEqual(sent.sandboxPolicy, {
      type: 'workspaceWrite', writableRoots: firstConfig.runtimeWorkspaceRoots,
      networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false,
    });
    const confirmed = await service.readSession('first');
    assert.equal(confirmed.reasoningEffort, 'max');
    assert.equal(confirmed.permissions!.mode, 'approval');
    const update = events.find((event) => event.method === 'session/settings');
    assert.equal(update.params.reasoningEffort, 'max');
    assert.equal(update.params.permissions.mode, 'approval');
    // Requests generated under the selected policy stay bound to their session.
    native.emit('request', {
      id: 91, method: 'item/commandExecution/requestApproval',
      params: { threadId: 'first', turnId: 'turn-1', command: 'network-operation' },
    });
    const awaiting = await service.readSession('first');
    assert.equal(awaiting.requests.length, 1);
    assert.equal((await service.readSession('second')).requests.length, 0);
    await service.handle('requests/respond', { requestId: awaiting.requests[0].id, action: 'accept' });
    assert.deepEqual(native.responses, [{ id: 91, result: { decision: 'accept' } }]);
    await service.handle('sessions/send', { threadId: 'second', text: 'Keep custom settings', idempotencyKey: 'custom-turn' });
    for (const field of ['effort', 'approvalPolicy', 'sandboxPolicy', 'approvalsReviewer'])
      assert.equal(Object.hasOwn(native.starts[1], field), false);
    assert.deepEqual(secondConfig, untouchedCustom);
    const starts = native.starts.length;
    await assert.rejects(service.handle('sessions/send', {
      threadId: 'first', text: 'Invalid effort', model: 'model-a', effort: 'max', idempotencyKey: 'unsupported-effort',
    }), /推理强度不受当前模型支持/);
    assert.equal(native.starts.length, starts);
    assert.equal(service.store.request('unsupported-effort'), undefined);
    // A model change without an explicit effort uses its actual catalog default
    // when the previous effort is unsupported by the newly selected model.
    await service.handle('sessions/send', { threadId: 'first', text: 'Switch model', model: 'model-a', idempotencyKey: 'switch-model' });
    assert.equal(native.starts[2].effort, 'low');
    assert.equal((await service.readSession('first')).permissions!.mode, 'approval');
    await service.handle('sessions/send', { threadId: 'second', text: 'Explicitly choose full access', permissionMode: 'full-access', idempotencyKey: 'full-turn' });
    assert.deepEqual(native.starts[3].sandboxPolicy, { type: 'dangerFullAccess' });
    assert.equal(native.starts[3].approvalPolicy, 'never');
    assert.equal(native.starts[3].approvalsReviewer, 'user');
    service.close();
    const restarted = new NativeCodex();
    restarted.threads = native.threads;
    restarted.settings = native.settings;
    service = new AgentService(restarted as unknown as CodexRpc, new AgentStore(database), 'machine', join(root, 'codex-home'));
    const restoredFirst = await service.readSession('first');
    const restoredSecond = await service.readSession('second');
    assert.equal(restoredFirst.model, 'model-a');
    assert.equal(restoredFirst.reasoningEffort, 'low');
    assert.equal(restoredFirst.permissions!.mode, 'approval');
    assert.equal(restoredSecond.permissions!.mode, 'full-access');
    // Even an apparently unrestricted legacy projection is custom if a named
    // profile supplies additional native permission restrictions.
    restarted.configuration(restarted.threads[1]).activePermissionProfile = { id: 'named-policy', extends: null };
    assert.equal((await service.readSession('second')).permissions!.mode, null);
  } finally {
    service.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a foreign active writer does not prevent readonly history, model, and effort browsing', async () => {
  const native = new NativeCodex();
  native.threads = [{ ...thread('foreign', '/workspace', null), model: 'model-b', reasoningEffort: 'high' }];
  native.foreignWriters.add('foreign');
  const originalCall = native.call.bind(native);
  native.call = async (method, params) => method === 'thread/turns/list'
    ? { data: [{ id: 'saved-turn', status: 'completed', startedAt: 1, items: [{ type: 'agentMessage', id: 'saved-answer', text: 'Existing desktop answer' }] }], nextCursor: null }
    : originalCall(method, params);
  const service = new AgentService(native as unknown as CodexRpc, new AgentStore(':memory:'), 'machine', join(tmpdir(), 'cell-agent-foreign-writer-no-desktop'));
  try {
    const history = await service.readSession('foreign');
    assert.equal(history.model, 'model-b');
    assert.equal(history.reasoningEffort, 'high');
    assert.equal(history.permissions, null);
    assert.match(history.permissionsUnavailableReason!, /正在占用此会话/);
    assert.equal(history.items[0].text, 'Existing desktop answer');
    await assert.rejects(service.handle('sessions/send', {
      threadId: 'foreign', text: 'Cannot take writer ownership', permissionMode: 'full-access', idempotencyKey: 'foreign-send',
    }), /already has an active writer/);
    assert.equal(native.starts.length, 0);
    assert.equal(service.store.request('foreign-send'), undefined);
    // Other protocol errors are never disguised as unavailable permissions.
    native.call = async (method, params) => {
      if (method === 'thread/resume') throw new RemoteError('CODEX_-32600', 'Invalid request: missing field `threadId`');
      return originalCall(method, params);
    };
    await assert.rejects(service.readSession('foreign'), /missing field/);
  } finally {
    service.close();
  }
});

test('settings snapshots acknowledge the latest native update arriving while history is loading', async () => {
  const native = new NativeCodex();
  native.threads = [thread('changing', '/workspace', null)];
  const originalCall = native.call.bind(native);
  native.call = async (method, params) => {
    if (method === 'thread/turns/list') native.emit('notification', {
      method: 'thread/settings/updated', params: {
        threadId: 'changing', threadSettings: {
          model: 'model-b', effort: 'max', approvalPolicy: 'on-request',
          sandboxPolicy: { type: 'workspaceWrite', writableRoots: ['/workspace'], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false },
          approvalsReviewer: 'user', activePermissionProfile: null,
        },
      },
    });
    return originalCall(method, params);
  };
  const service = new AgentService(native as unknown as CodexRpc, new AgentStore(':memory:'), 'machine', join(tmpdir(), 'cell-agent-settings-race-no-desktop'));
  try {
    const history = await service.readSession('changing');
    assert.equal(history.sequence, 1);
    assert.equal(history.model, 'model-b');
    assert.equal(history.reasoningEffort, 'max');
    assert.equal(history.permissions!.mode, 'approval');
  } finally {
    service.close();
  }
});

test('missing native membership is an unsupported API error instead of a directory assignment', () => {
  assert.throws(() => sessionFrom({ id: 'old-thread', cwd: '/shared', updatedAt: 1 }), /未提供真实项目归属/);
  assert.equal(sessionFrom(thread('ordinary', '/shared', null)).projectId, null);
  assert.equal(sessionFrom(thread('member', '/shared', 'canonical')).projectId, 'canonical');
});

test('thread-bound uploads persist across restart without authorizing another same-cwd chat', async () => {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'cell-agent-upload-')));
  const database = join(workspace, 'agent.sqlite');
  const native = new NativeCodex();
  native.threads = [thread('first', workspace, null), thread('second', workspace, null)];
  let service = new AgentService(native as unknown as CodexRpc, new AgentStore(database), 'machine', join(workspace, 'codex-home'));
  try {
    const { file } = await service.handle('attachments/upload', { threadId: 'first', name: 'note.txt', mimeType: 'text/plain', data: Buffer.from('Material').toString('base64') }) as any;
    const row = service.store.attachment(file.id)!;
    assert.equal(await readFile(row.path, 'utf8'), 'Material');
    service.close();
    const restarted = new NativeCodex();
    restarted.threads = native.threads;
    service = new AgentService(restarted as unknown as CodexRpc, new AgentStore(database), 'machine', join(workspace, 'codex-home'));
    await assert.rejects(service.handle('sessions/send', { threadId: 'second', text: 'Read', attachmentIds: [file.id], idempotencyKey: 'wrong-thread' }), /不属于此会话/);
    await service.handle('sessions/send', { threadId: 'first', text: 'Read', attachmentIds: [file.id], idempotencyKey: 'own-thread' });
    assert.equal(restarted.starts.length, 1);
    assert.ok(restarted.starts[0].input.some((item: any) => item.text?.includes(row.path)));
  } finally {
    service.close();
    await rm(workspace, { recursive: true, force: true });
  }
});
