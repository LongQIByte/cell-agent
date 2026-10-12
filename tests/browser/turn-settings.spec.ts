import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import {
  PROTOCOL_VERSION,
  type Device,
  type Model,
  type PermissionMode,
  type Session,
  type SessionHistory,
  type SessionPermissions,
} from '@codex-remote/protocol';

test.use({ actionTimeout: 10000 });
const connection = { server: 'ws://turn-settings-fixture.test/ws', token: 'turn-settings-pairing-key-0000' };
const device: Device = { id: 'config-machine', name: 'Config computer', platform: 'darwin', online: true, lastSeen: 1 };
const sessions: Session[] = [
  { id: 'config-a', projectId: null, cwd: '/workspace/a', name: 'Config chat A', updatedAt: 2, status: 'idle' },
  { id: 'config-b', projectId: null, cwd: '/workspace/b', name: 'Config chat B', updatedAt: 1, status: 'idle' },
];
const models: Model[] = [
  {
    id: 'model-a', model: 'model-a', displayName: 'Model A', description: 'A native model', isDefault: true,
    defaultReasoningEffort: 'medium', supportedReasoningEfforts: [
      { reasoningEffort: 'low', description: 'Quick response' },
      { reasoningEffort: 'medium', description: 'Balanced reasoning' },
      { reasoningEffort: 'high', description: 'Deeper reasoning' },
    ],
  },
  {
    id: 'model-b', model: 'model-b', displayName: 'Model B', description: 'B native model', isDefault: false,
    defaultReasoningEffort: 'medium', supportedReasoningEfforts: [
      { reasoningEffort: 'low', description: 'Quick response' },
      { reasoningEffort: 'medium', description: 'Balanced reasoning' },
    ],
  },
];
const fullAccess: SessionPermissions = {
  mode: 'full-access', approvalPolicy: 'never', sandboxPolicy: { type: 'dangerFullAccess' }, approvalsReviewer: 'user', profile: null,
};
const approval: SessionPermissions = {
  mode: 'approval', approvalPolicy: 'on-request', sandboxPolicy: {
    type: 'workspaceWrite', writableRoots: ['/workspace/a'], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false,
  }, approvalsReviewer: 'user', profile: null,
};
const custom: SessionPermissions = {
  mode: null, approvalPolicy: 'untrusted', sandboxPolicy: { type: 'readOnly', networkAccess: false }, approvalsReviewer: 'user', profile: null,
};
type Send = { threadId: string; text: string; model?: string; effort?: string; permissionMode?: PermissionMode };

async function settingsFixture(page: Page, permissionsUnknown = false) {
  const states = new Map<string, SessionHistory>(sessions.map((session, index) => [session.id, {
    session, model: index ? 'model-b' : 'model-a', reasoningEffort: index ? 'low' : 'high',
    permissions: index ? custom : permissionsUnknown ? null : fullAccess,
    ...(!index && permissionsUnknown ? { permissionsUnavailableReason: '桌面端或其他客户端正在占用此会话，暂时无法读取执行权限' } : {}),
    items: [], requests: [], activeTurnId: null, nextCursor: null, sequence: 0,
  }]));
  const sockets: WebSocketRoute[] = [];
  const calls: { method: string; params: Record<string, unknown>; deviceId?: string }[] = [];
  const sends: Send[] = [];
  const publish = (socket: WebSocketRoute, method: string, state: SessionHistory, params: Record<string, unknown>) => {
    socket.send(JSON.stringify({ type: 'event', deviceId: device.id, method,
      params: { threadId: state.session.id, ...params, sequence: ++state.sequence } }));
  };
  await page.routeWebSocket('**/ws', (socket) => {
    sockets.push(socket);
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'hello') {
        socket.send(JSON.stringify({ type: 'ready', version: PROTOCOL_VERSION, devices: [device] }));
        return;
      }
      if (message.type !== 'request') return;
      calls.push(message);
      let result: unknown = {};
      if (message.method === 'projects/list') result = { projects: [], recentSessions: sessions.map((session) => ({ deviceId: device.id, session })) };
      else if (message.method === 'models/list') result = { models };
      else if (message.method === 'sessions/read') result = states.get(message.params.threadId);
      else if (message.method === 'sessions/send') {
        const state = states.get(message.params.threadId)!;
        sends.push(message.params);
        state.model = message.params.model ?? state.model;
        state.reasoningEffort = message.params.effort ?? state.reasoningEffort;
        if (message.params.permissionMode) state.permissions = message.params.permissionMode === 'approval' ? approval : fullAccess;
        state.permissionsUnavailableReason = undefined;
        const turnId = `turn-${sends.length}`;
        state.items.push({ id: `user-${sends.length}`, turnId, kind: 'user', text: message.params.text,
          clientId: message.params.idempotencyKey, timestamp: Date.now() });
        if (message.params.permissionMode === 'approval') {
          state.activeTurnId = turnId;
          state.requests.push({ id: 'approval-request', method: 'item/commandExecution/requestApproval', createdAt: Date.now(),
            params: { threadId: state.session.id, turnId, command: 'write outside workspace', reason: 'Allow this external write?' } });
        }
        // Deliberately omit a settings notification: ACK is not canonical config.
        result = { turnId };
      } else if (message.method === 'requests/respond') {
        const state = states.get(sessions[0].id)!;
        state.requests = [];
        publish(socket, 'session/requestResolved', state, { requestId: message.params.requestId });
        publish(socket, 'session/status', state, { turnId: state.activeTurnId, status: 'completed' });
        state.activeTurnId = null;
      }
      socket.send(JSON.stringify({ type: 'response', id: message.id, result }));
    });
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem('codex-remote:connection')) localStorage.setItem('codex-remote:connection', JSON.stringify(value));
  }, connection);
  await page.goto('/');
  await page.getByRole('button', { name: '打开会话 Config chat A', exact: true }).click();
  await expect(page.getByTestId('model-picker')).toContainText('Model A');
  await expect(page.getByRole('textbox', { name: '消息输入框', exact: true })).toBeEditable();
  return {
    sends,
    calls,
    restrictOnComputer: () => {
      const state = states.get(sessions[0].id)!;
      state.permissions = custom;
      const socket = sockets.at(-1)!;
      publish(socket, 'session/settings', state, { model: state.model, reasoningEffort: state.reasoningEffort, permissions: custom });
    },
  };
}

async function choose(page: Page, field: 'model' | 'effort' | 'permission', label: string) {
  await page.getByTestId(`${field}-picker`).click();
  await page.getByRole('radio', { name: label, exact: true }).click();
}

test('supported effort and permissions persist per chat, reach the wire, then use canonical settings and approval requests', async ({ page }) => {
  const fixture = await settingsFixture(page);
  await expect(page.getByTestId('effort-picker')).toContainText('高');
  await expect(page.getByTestId('permission-picker')).toContainText('完全访问');
  await choose(page, 'model', 'Model B');
  await expect(page.getByTestId('effort-picker')).toContainText('中');
  await page.getByTestId('effort-picker').click();
  await expect(page.getByRole('radio', { name: '推理强度：high', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: '推理强度：medium', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: '推理强度：low', exact: true }).click();
  await choose(page, 'permission', '权限：需要审批');
  await page.reload();
  await expect(page.getByTestId('model-picker')).toContainText('Model B');
  await expect(page.getByTestId('effort-picker')).toContainText('低');
  await expect(page.getByTestId('permission-picker')).toContainText('需要审批');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '打开会话 Config chat B', exact: true }).click();
  await expect(page.getByTestId('model-picker')).toContainText('Model B');
  await expect(page.getByTestId('permission-picker')).toContainText('自定义');
  await choose(page, 'effort', '推理强度：medium');
  await choose(page, 'permission', '权限：完全访问');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '打开会话 Config chat A', exact: true }).click();
  await expect(page.getByTestId('effort-picker')).toContainText('低');
  await expect(page.getByTestId('permission-picker')).toContainText('需要审批');
  await page.getByRole('textbox', { name: '消息输入框', exact: true }).fill('Use these actual settings.');
  const readCount = fixture.calls.filter((call) => call.method === 'sessions/read').length;
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(() => fixture.sends[0]).toMatchObject({ threadId: 'config-a', model: 'model-b', effort: 'low', permissionMode: 'approval' });
  await expect(page.getByText('Allow this external write?', { exact: true })).toBeVisible();
  expect(fixture.calls.filter((call) => call.method === 'sessions/read')).toHaveLength(readCount + 1);
  await page.getByRole('button', { name: '允许本次', exact: true }).click();
  await expect.poll(() => fixture.calls.find((call) => call.method === 'requests/respond')?.params).toMatchObject({ requestId: 'approval-request', action: 'accept' });
  await expect(page.getByText('Allow this external write?', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('effort-picker')).toContainText('低');
  await expect(page.getByTestId('permission-picker')).toContainText('需要审批');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('codex-remote:draft:ws://turn-settings-fixture.test/ws:config-machine:config-a')!).settings)).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '打开会话 Config chat B', exact: true }).click();
  await expect(page.getByTestId('effort-picker')).toContainText('中');
  await expect(page.getByTestId('permission-picker')).toContainText('完全访问');
});

test('unknown current permissions remain selectable without inventing a default, including immediate reload', async ({ page }) => {
  const fixture = await settingsFixture(page, true);
  await expect(page.getByTestId('permission-picker')).toContainText('暂不可读取');
  await page.getByTestId('permission-picker').click();
  await expect(page.getByText('此会话当前权限暂不可读取', { exact: true })).toBeVisible();
  await expect(page.getByText('桌面端或其他客户端正在占用此会话，暂时无法读取执行权限', { exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: '权限：完全访问', exact: true })).not.toBeChecked();
  await expect(page.getByRole('radio', { name: '权限：需要审批', exact: true })).not.toBeChecked();
  await page.getByRole('radio', { name: '权限：完全访问', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('permission-picker')).toContainText('完全访问');
  await page.getByRole('textbox', { name: '消息输入框', exact: true }).fill('Apply my explicitly chosen access.');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(() => fixture.sends[0]?.permissionMode).toBe('full-access');
  await expect(page.getByRole('textbox', { name: '消息输入框', exact: true })).toHaveValue('');
  await page.reload();
  await expect(page.getByTestId('permission-picker')).toContainText('完全访问');
});

test('computer-side permission restrictions remain current while pending model and effort selections stay intact', async ({ page }) => {
  const fixture = await settingsFixture(page);
  await choose(page, 'model', 'Model B');
  await choose(page, 'effort', '推理强度：low');
  fixture.restrictOnComputer();
  await expect(page.getByTestId('permission-picker')).toContainText('自定义');
  await expect(page.getByTestId('model-picker')).toContainText('Model B');
  await expect(page.getByTestId('effort-picker')).toContainText('低');
  await page.getByTestId('permission-picker').click();
  await expect(page.getByText('此会话当前使用自定义权限', { exact: true })).toBeVisible();
  await expect(page.getByText(/文件只读；网络受限制；不受信任的操作需要审批/)).toBeVisible();
  await page.getByRole('button', { name: '关闭权限模式选择', exact: true }).click();
  await page.getByRole('textbox', { name: '消息输入框', exact: true }).fill('Keep the restricted computer policy.');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(() => fixture.sends[0]?.model).toBe('model-b');
  expect(fixture.sends[0]).not.toHaveProperty('permissionMode');
  await expect(page.getByRole('textbox', { name: '消息输入框', exact: true })).toHaveValue('');
  await page.reload();
  await expect(page.getByTestId('permission-picker')).toContainText('自定义');
  await expect(page.getByTestId('effort-picker')).toContainText('低');
});
