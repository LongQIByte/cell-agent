import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import {
  PROTOCOL_VERSION,
  type ChatItem,
  type Device,
  type Model,
  type Session,
  type SessionPermissions,
} from '@codex-remote/protocol';

const connection = {
  server: 'ws://draft-fixture.test/ws',
  token: 'fixture-draft-pairing-key-0000',
};
const device: Device = {
  id: 'draft-machine',
  name: 'Draft machine',
  platform: 'darwin',
  online: true,
  lastSeen: 1,
};
const session: Session = {
  id: 'draft-thread',
  projectId: null,
  cwd: '/workspace',
  name: 'Draft recovery chat',
  updatedAt: 1,
  status: 'idle',
};
const models: Model[] = [
  {
    id: 'model-a',
    model: 'model-a',
    displayName: 'Model A',
    description: '',
    isDefault: true,
    defaultReasoningEffort: 'medium',
    supportedReasoningEfforts: [],
  },
  {
    id: 'model-b',
    model: 'model-b',
    displayName: 'Model B',
    description: '',
    isDefault: false,
    defaultReasoningEffort: 'medium',
    supportedReasoningEfforts: [],
  },
];

async function openChat(page: Page) {
  const sockets: WebSocketRoute[] = [];
  const sends: { model?: string; text: string }[] = [];
  const items: ChatItem[] = [
    {
      id: 'first-answer',
      turnId: 'first-turn',
      kind: 'assistant',
      text: 'First turn completed.',
      timestamp: 1,
    },
  ];
  let canonicalModel = 'model-a';
  const permissions: SessionPermissions = {
    mode: 'full-access',
    approvalPolicy: 'never',
    sandboxPolicy: { type: 'dangerFullAccess' },
    approvalsReviewer: 'user',
    profile: null,
  };
  let sequence = 0;
  await page.routeWebSocket('**/ws', (socket) => {
    sockets.push(socket);
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'hello') {
        socket.send(
          JSON.stringify({ type: 'ready', version: PROTOCOL_VERSION, devices: [device] }),
        );
        return;
      }
      if (message.type !== 'request') return;
      let result: unknown;
      if (message.method === 'projects/list')
        result = { projects: [], recentSessions: [{ deviceId: device.id, session }] };
      else if (message.method === 'models/list') result = { models };
      else if (message.method === 'sessions/read')
        result = {
          session,
          model: canonicalModel,
          reasoningEffort: null,
          permissions,
          items,
          activeTurnId: null,
          requests: [],
          nextCursor: null,
          sequence,
        };
      else if (message.method === 'sessions/send') {
        sends.push(message.params);
        canonicalModel = message.params.model ?? canonicalModel;
        items.push({
          id: `user-${sends.length}`,
          turnId: `turn-${sends.length}`,
          kind: 'user',
          text: message.params.text,
          clientId: message.params.idempotencyKey,
          timestamp: 2,
        });
        socket.send(
          JSON.stringify({
            type: 'event',
            method: 'session/settings',
            deviceId: device.id,
            params: { threadId: session.id, model: canonicalModel, reasoningEffort: null, permissions, sequence: ++sequence },
          }),
        );
        result = { turnId: `turn-${sends.length}` };
      } else result = {};
      socket.send(JSON.stringify({ type: 'response', id: message.id, result }));
    });
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem('codex-remote:connection'))
      localStorage.setItem('codex-remote:connection', JSON.stringify(value));
  }, connection);
  await page.goto('/');
  await page.getByRole('button', { name: '打开会话 Draft recovery chat', exact: true }).click();
  await expect(page.getByTestId('model-picker')).toContainText('Model A');
  await expect(page.getByRole('textbox', { name: '消息输入框', exact: true })).toBeEditable();
  return {
    sends,
    oldModelEvent: () => {
      const socket = sockets.at(-1)!;
      socket.send(
        JSON.stringify({
          type: 'event',
          method: 'session/settings',
          deviceId: device.id,
          params: { threadId: session.id, model: 'model-a', reasoningEffort: null, permissions, sequence: ++sequence },
        }),
      );
      const marker: ChatItem = {
        id: 'late-marker',
        turnId: 'first-turn',
        kind: 'assistant',
        text: 'Late prior-turn event received.',
        timestamp: 2,
      };
      items.push(marker);
      socket.send(
        JSON.stringify({
          type: 'event',
          method: 'session/item',
          deviceId: device.id,
          params: { threadId: session.id, item: marker, sequence: ++sequence },
        }),
      );
    },
  };
}

test('a next-turn model survives immediate reload and late prior-turn model events, then becomes canonical', async ({
  page,
}) => {
  const fixture = await openChat(page);
  const input = page.getByRole('textbox', { name: '消息输入框', exact: true });
  await input.fill('Preserve this next-turn draft.');
  await page.getByTestId('model-picker').click();
  await page.getByRole('radio', { name: 'Model B', exact: true }).click();
  // No debounce wait: a real reload does not run React's unmount cleanup.
  await page.reload();
  await expect(page.getByTestId('model-picker')).toContainText('Model B');
  await expect(input).toHaveValue('Preserve this next-turn draft.');
  fixture.oldModelEvent();
  await expect(
    page.getByTestId('assistant-message').filter({ hasText: 'Late prior-turn event received.' }),
  ).toBeVisible();
  await expect(page.getByTestId('model-picker')).toContainText('Model B');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(() => fixture.sends[0]?.model).toBe('model-b');
  await expect(input).toHaveValue('');
  await page.reload();
  await expect(page.getByTestId('model-picker')).toContainText('Model B');
  expect(
    await page
      .evaluate(() =>
        JSON.parse(
          localStorage.getItem(
            'codex-remote:draft:ws://draft-fixture.test/ws:draft-machine:draft-thread',
          )!,
        ),
      )
      .then((draft: { settings: unknown; attempt: unknown }) => ({
        settings: draft.settings,
        attempt: draft.attempt,
      })),
  ).toEqual({ settings: null, attempt: null });
});

test('pagehide flushes freshly edited text without waiting for the draft debounce', async ({
  page,
}) => {
  await openChat(page);
  const input = page.getByRole('textbox', { name: '消息输入框', exact: true });
  await input.fill('A draft typed just before reload.');
  await page.reload();
  await expect(input).toHaveValue('A draft typed just before reload.');
});

test('failed draft storage preserves the selection and blocks an unprotected send until retry succeeds', async ({ page }) => {
  const fixture = await openChat(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as Window & { allowDraftWrites?: boolean }).allowDraftWrites = false;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('codex-remote:draft:') && !(window as Window & { allowDraftWrites?: boolean }).allowDraftWrites)
        throw new DOMException('Draft storage unavailable', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  const input = page.getByRole('textbox', { name: '消息输入框', exact: true });
  await input.fill('Keep this message until it can be protected against duplicate sends.');
  await page.getByTestId('model-picker').click();
  await page.getByRole('radio', { name: 'Model B', exact: true }).click();
  await expect(page.getByTestId('model-picker')).toContainText('Model B');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByText('草稿保存失败，请重试。', { exact: true })).toBeVisible();
  expect(fixture.sends).toHaveLength(0);
  await expect(input).toHaveValue('Keep this message until it can be protected against duplicate sends.');
  await page.evaluate(() => { (window as Window & { allowDraftWrites?: boolean }).allowDraftWrites = true; });
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(() => fixture.sends).toHaveLength(1);
  expect(fixture.sends[0].model).toBe('model-b');
  await expect(input).toHaveValue('');
  await page.reload();
  await expect(page.getByTestId('model-picker')).toContainText('Model B');
});
