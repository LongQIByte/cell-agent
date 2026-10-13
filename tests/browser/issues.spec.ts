import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { PROTOCOL_VERSION } from '@codex-remote/protocol';
import type { ChatItem, Device, Model, Project, Session, RecentSession, SessionPermissions, RunMetrics } from '@codex-remote/protocol';

test.use({ actionTimeout: 10000 });
test('new session header, rename, fork, photo previews and Plan/Goal controls preserve drafts at narrow widths', async ({ page }) => {
  const fixture = await connectFixture(page);
  await expect(page.getByRole('button', { name: '在 Native Group 新建会话', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: '管理会话 Native session 1', exact: true }).click();
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  await page.getByRole('textbox', { name: '会话名称', exact: true }).fill('手机重命名');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开会话 手机重命名', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '管理会话 手机重命名', exact: true }).click();
  await page.getByRole('button', { name: '创建分支', exact: true }).click();
  await expect(page.getByTestId('chat-screen')).toBeVisible();
  await expect(page.getByText('分支会话 · 来源 native-0', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '打开来源会话', exact: true }).click();
  await expect(page.getByText('分支会话 · 来源 native-0', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '打开会话 手机重命名 · 分支', exact: true }).click();
  await expect(page.getByText('分支会话 · 来源 native-0', { exact: true })).toBeVisible();
  const input = page.getByRole('textbox', { name: '消息输入框', exact: true });
  await input.fill('保留草稿');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '添加附件', exact: true }).click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  await (await chooser).setFiles([{ name: 'one.png', mimeType: 'image/png', buffer: png }, { name: 'two.png', mimeType: 'image/png', buffer: png }]);
  await expect(page.getByRole('img', { name: '照片 one.png', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: '照片 two.png', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '预览附件 two.png', exact: true }).click();
  await page.getByRole('button', { name: '关闭照片预览', exact: true }).click();
  await page.getByRole('button', { name: '移除附件 one.png', exact: true }).click();
  await expect(page.getByRole('img', { name: '照片 one.png', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '功能与模式', exact: true }).click();
  await page.getByRole('button', { name: '计划模式 Plan', exact: true }).click();
  await expect(input).toHaveValue('保留草稿');
  await expect(page.getByRole('img', { name: '照片 two.png', exact: true })).toBeVisible();
  expect(fixture.calls.filter((call) => call.method === 'sessions/send')).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '功能与模式', exact: true })).toContainText('计划 Plan');
  await expect(input).toHaveValue('保留草稿');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(() => fixture.calls.find((call) => call.method === 'sessions/send')?.params.mode).toBe('plan');
  await page.getByRole('button', { name: '进入执行', exact: true }).click();
  await page.getByRole('button', { name: '功能与模式', exact: true }).click();
  await page.getByRole('textbox', { name: '目标内容', exact: true }).fill('完成手机目标');
  await page.getByRole('textbox', { name: '目标 token 预算', exact: true }).fill('1200');
  await page.getByRole('button', { name: '创建目标', exact: true }).click();
  await expect(page.getByText('目标模式 Goal · 进行中', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '暂停目标', exact: true }).click();
  await expect(page.getByText('目标模式 Goal · 已暂停', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续目标', exact: true }).click();
  await expect(page.getByText('目标模式 Goal · 进行中', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '结束目标', exact: true }).click();
  await expect(page.getByText('目标模式 Goal · 已完成', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭功能面板', exact: true }).click();
  for (const width of [320, 390, 820]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await Promise.all(['model', 'effort', 'permission'].map((name) => page.getByTestId(`${name}-picker`).boundingBox()));
    expect(Math.max(...boxes.map((box) => box!.y)) - Math.min(...boxes.map((box) => box!.y))).toBeLessThan(1);
    expect(boxes[2]!.x + boxes[2]!.width).toBeLessThanOrEqual(width);
    const inputBox = (await input.boundingBox())!;
    for (const box of boxes) expect(box!.y + box!.height).toBeLessThanOrEqual(inputBox.y);
    const modeBox = (await page.getByRole('button', { name: '功能与模式', exact: true }).boundingBox())!;
    expect(modeBox.y + modeBox.height).toBeLessThanOrEqual(inputBox.y);
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeVisible();
    await page.screenshot({ path: `artifacts/mobile-issues-${width}.png`, animations: 'disabled' });
  }
  await page.screenshot({ path: 'artifacts/mobile-issues-chat.png', animations: 'disabled' });
});

test('image previews fit their actual ratio and user bubbles shrink around tall and wide images', async ({ page }) => {
  const fixture = await connectFixture(page);
  await page.getByRole('button', { name: '打开会话 Native session 1', exact: true }).click();
  const shapes = [[1200, 600], [600, 1200], [800, 800], [400, 4000]];
  const sources = await page.evaluate((sizes) => sizes.map(([width, height]) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d')!; context.fillStyle = '#2f6ba6'; context.fillRect(0, 0, width, height);
    return canvas.toDataURL('image/png');
  }), shapes);
  fixture.imageItem({ id: 'ratios', turnId: 'image-turn', kind: 'user', text: '', timestamp: 2000,
    images: sources.map((source, index) => ({ source, name: `ratio-${index}` })) });
  for (const width of [320, 390, 820]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [index, shape] of shapes.entries()) {
      const preview = page.getByRole('button', { name: `预览图片 ratio-${index}`, exact: true });
      await expect.poll(async () => {
        const box = await preview.boundingBox(); return box ? box.width / box.height : 0;
      }).toBeCloseTo(shape[0] / shape[1], 2);
      const box = (await preview.boundingBox())!;
      expect(box.width).toBeLessThanOrEqual(260);
      expect(box.height).toBeLessThanOrEqual(220);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
  }
  await page.getByRole('button', { name: '预览图片 ratio-3', exact: true }).click();
  await expect(page.getByRole('img', { name: '大图 ratio-3', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭图片预览', exact: true }).click();
});

test('cache hit rate follows live turn usage and distinguishes zero hits from unavailable input', async ({ page }) => {
  const fixture = await connectFixture(page);
  await page.getByRole('button', { name: '打开会话 Native session 1', exact: true }).click();
  const status = page.getByTestId('run-status');
  await expect(status).toContainText('缓存命中率 暂无数据');
  const metrics: RunMetrics = {
    turnId: 'cache-turn', status: 'generating', startedAt: Date.now(), endedAt: null,
    firstOutputAt: null, lastOutputAt: null, assistantCharacters: 0, contextUsed: 420, contextWindow: 10000,
    usage: { inputTokens: 400, cachedInputTokens: 300, outputTokens: 20, reasoningOutputTokens: 0, totalTokens: 420 },
  };
  fixture.metrics('native-0', metrics);
  await expect(status).toContainText('缓存命中率 75%');
  fixture.metrics('native-1', { ...metrics, usage: null });
  await expect(status).toContainText('缓存命中率 75%');
  await status.click();
  await expect(page.getByText('缓存命中率：75%', { exact: true })).toBeVisible();
  await expect(page.getByText('缓存命中：300 token', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭指标详情', exact: true }).click();
  await page.screenshot({ path: 'artifacts/composer-cache-rate-390.png', animations: 'disabled' });
  for (const [inputTokens, cachedInputTokens, rate] of [[400, 0, '0%'], [3, 1, '33.3%'], [400, 400, '100%'], [0, 0, '暂无数据'], [400, 401, '暂无数据']] as const) {
    fixture.metrics('native-0', { ...metrics, usage: { ...metrics.usage!, inputTokens, cachedInputTokens } });
    await expect(status).toContainText(`缓存命中率 ${rate}`);
  }
  fixture.metrics('native-0', { ...metrics, turnId: 'next-turn', usage: null });
  await expect(status).toContainText('缓存命中率 暂无数据');
});
const fullPermissions: SessionPermissions = {
  mode: 'full-access', approvalPolicy: 'never', sandboxPolicy: { type: 'dangerFullAccess' }, approvalsReviewer: 'user', profile: null,
};

test('local Markdown, tool and sent photos render inside chat, preview, retry and survive reload', async ({ page }) => {
  const fixture = await connectFixture(page);
  await page.getByRole('button', { name: '打开会话 Native session 1', exact: true }).click();
  fixture.imageItem({ id: 'image-reply', turnId: 'image-turn', kind: 'assistant', timestamp: 1000,
    text: '![回复图片](reply.png)' });
  const reply = page.getByRole('img', { name: '聊天图片 回复图片', exact: true });
  await expect(reply).toBeVisible();
  await expect.poll(() => reply.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1);
  expect(fixture.calls.find((call) => call.method === 'images/read')?.params).toEqual({ threadId: 'native-0', source: 'reply.png' });
  await page.getByRole('button', { name: '预览图片 回复图片', exact: true }).click();
  await expect(page.getByRole('img', { name: '大图 回复图片', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭图片预览', exact: true }).click();
  fixture.imageItem({ id: 'tool-image', turnId: 'image-turn', kind: 'activity', text: 'view_image', timestamp: 1000,
    images: [{ source: 'codex-image:tool', name: '工具图片' }] });
  await expect(page.getByRole('img', { name: '聊天图片 工具图片', exact: true })).toBeVisible();
  fixture.imageItem({ id: 'sent-image', turnId: 'image-turn', kind: 'user', text: '', timestamp: 1000,
    attachments: ['photo.png'], images: [{ source: '/workspace/photo.png', name: 'photo.png' }] });
  await expect(page.getByRole('img', { name: '聊天图片 photo.png', exact: true })).toBeVisible();
  await page.reload();
  await expect(reply).toBeVisible();
  await expect(page.getByRole('img', { name: '聊天图片 photo.png', exact: true })).toBeVisible();
  fixture.imageItem({ id: 'missing-image', turnId: 'image-turn', kind: 'assistant', text: '![缺失图片](missing.png)', timestamp: 1000 });
  await page.getByRole('button', { name: '重试图片 缺失图片', exact: true }).click();
  await expect.poll(() => fixture.calls.filter((call) => call.method === 'images/read' && call.params.source === 'missing.png').length).toBe(2);
  for (const width of [320, 390, 820]) {
    await page.setViewportSize({ width, height: 844 });
    const box = (await reply.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect((await page.getByRole('img', { name: '聊天图片 photo.png', exact: true }).boundingBox())!.width).toBeGreaterThan(160);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/chat-images-390.png', animations: 'disabled' });
});
const approvalPermissions: SessionPermissions = {
  mode: 'approval', approvalPolicy: 'on-request',
  sandboxPolicy: { type: 'workspaceWrite', writableRoots: [], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false },
  approvalsReviewer: 'user', profile: null,
};

const markdown = [
  '# Markdown Check',
  '',
  'Paragraph with **bold words**, `inlineCode` and [OpenAI](https://openai.com).',
  '',
  '- First bullet',
  '- Second bullet',
  '',
  '1. Ordered item',
  '2. Next item',
  '',
  '> Quoted text',
  '',
  '```typescript',
  `const longCode = "${'wide-code-'.repeat(30)}";`,
  '```',
  '',
  '| Column Alpha | Column Beta | Column Gamma |',
  '| --- | --- | --- |',
  '| Table cell A | Table cell B | Table cell C |',
].join('\n');

async function connectFixture(page: Page, large = false) {
  const devices: Device[] = Array.from({ length: 45 }, (_, index) => ({
    id: `machine-${index}`, name: `Mac ${String(index).padStart(2, '0')}`, platform: 'darwin',
    online: index !== 44, lastSeen: Date.now(),
  }));
  devices[40].platform = 'linux';
  const session = (id: string, projectId: string | null, name: string): Session => ({
    id, projectId, cwd: '/shared', name, updatedAt: 1000, status: 'idle',
  });
  const native: Project = {
    id: 'native-project', deviceId: devices[0].id, name: 'Native Group', path: '/shared',
    available: true, updatedAt: 10000,
    sessions: Array.from({ length: 7 }, (_, index) => session(`native-${index}`, 'native-project', `Native session ${index + 1}`)),
  };
  const small: Project = {
    ...native, id: 'small-project', name: 'Small Group', updatedAt: 9000,
    sessions: [session('small-0', 'small-project', 'Small session')],
  };
  const other: Project = { ...small, id: 'other-project', name: 'Native Group', deviceId: devices[1].id, updatedAt: 8000,
    sessions: Array.from({ length: 7 }, (_, index) => session(`other-${index}`, 'other-project', `Other machine session ${index + 1}`)) };
  const projects = [native, small, other];
  if (large) {
    projects.push(...Array.from({ length: 180 }, (_, index) => ({
      ...native, id: `bulk-${index}`, name: `Bulk ${index}`, updatedAt: 1000 - index,
      sessions: Array.from({ length: 12 }, (_, n) => session(`bulk-${index}-${n}`, `bulk-${index}`, `Bulk conversation ${index}-${n}`)),
    })));
  }
  const recentSessions: RecentSession[] = [{ deviceId: devices[0].id, session: session('recent-0', null, 'Projectless same directory') }];
  const models: Model[] = [
    { id: 'model-a', model: 'model-a', displayName: 'Model A', description: 'First model', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: 'Medium' }, { reasoningEffort: 'high', description: 'High' }] },
    { id: 'model-b', model: 'model-b', displayName: 'Model B', description: 'Second model', isDefault: false, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: 'Medium' }, { reasoningEffort: 'high', description: 'High' }] },
  ];
  const calls: { method: string; params: any; deviceId: string }[] = [];
  const sockets: WebSocketRoute[] = [];
  let deferDirectories = false;
  let pendingDirectory: (() => void) | undefined;
  let sequence = 0;
  const archives = new Set<string>();
  const settingsByThread = new Map<string, { model: string; reasoningEffort: string; permissions: SessionPermissions }>();
  const modes = new Map<string, string>();
  const goals = new Map<string, any>();
  const imageItems: ChatItem[] = [];
  const outbox: any[] = [];
  const activeTurns = new Map<string, string>();
  let loseSteerAck = false;
  let historyPages: { items: ChatItem[]; nextCursor: string | null }[] | undefined;
  await page.routeWebSocket('**/ws', (socket) => {
    sockets.push(socket);
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'hello') {
        socket.send(JSON.stringify({ type: 'ready', version: PROTOCOL_VERSION, devices }));
        return;
      }
      if (message.type !== 'request') return;
      calls.push(message);
      if (message.method === 'directories/list' && deferDirectories) {
        pendingDirectory = () => socket.send(JSON.stringify({
          type: 'response', id: message.id,
          result: { path: '/old-machine-delayed', directories: [] },
        }));
        return;
      }
      let result: unknown;
      switch (message.method) {
        case 'projects/list':
          result = { projects: projects.filter((p) => p.deviceId === message.deviceId)
            .map((p) => ({ ...p, sessions: p.sessions.filter((session) => archives.has(`${p.deviceId}:${session.id}`) === !!message.params.archived) }))
            .filter((p) => !message.params.archived || p.sessions.length),
          recentSessions: recentSessions.filter((entry) => entry.deviceId === message.deviceId && archives.has(`${entry.deviceId}:${entry.session.id}`) === !!message.params.archived) };
          break;
        case 'models/list': result = { models }; break;
        case 'sessions/read': {
          const selected = [...projects.flatMap((p) => p.sessions), ...recentSessions.map((entry) => entry.session)].find((item) => item.id === message.params.threadId)!;
          const settings = settingsByThread.get(message.params.threadId) ?? { model: 'model-a', reasoningEffort: 'medium', permissions: fullPermissions };
          result = { session: selected, ...settings, mode: modes.get(selected.id) ?? 'default', goal: goals.get(selected.id) ?? null,
            capabilities: { plan: true, goal: true, goalBudget: true }, items: [{ id: 'markdown', turnId: 'fixture-turn', kind: 'assistant', text: markdown, timestamp: 1000 }, ...imageItems], nextCursor: null, activeTurnId: activeTurns.get(selected.id) ?? null, outbox, requests: [], sequence,
            ...(historyPages?.[Number(message.params.cursor ?? 0)]) };
          break;
        }
        case 'sessions/enqueue':
          if (!outbox.some((item) => item.id === message.params.idempotencyKey)) outbox.push({
            id: message.params.idempotencyKey, text: message.params.text, attachmentNames: [], status: 'queued',
          });
          socket.send(JSON.stringify({ type: 'event', method: 'session/outbox', deviceId: message.deviceId,
            params: { threadId: message.params.threadId, outbox, sequence: ++sequence } }));
          result = { queued: true }; break;
        case 'sessions/steer':
          if (loseSteerAck) {
            loseSteerAck = false; activeTurns.delete(message.params.threadId); socket.close(); return;
          }
          result = { turnId: activeTurns.get(message.params.threadId) }; break;
        case 'sessions/send':
          if (message.params.mode) modes.set(message.params.threadId, message.params.mode);
          settingsByThread.set(message.params.threadId, {
            model: message.params.model ?? 'model-a', reasoningEffort: message.params.effort ?? 'medium',
            permissions: message.params.permissionMode === 'approval' ? approvalPermissions : fullPermissions,
          });
          result = { turnId: 'sent-turn', model: message.params.model };
          setTimeout(() => {
            socket.send(JSON.stringify({ type: 'event', method: 'session/settings', deviceId: message.deviceId, params: { threadId: message.params.threadId, ...settingsByThread.get(message.params.threadId), sequence: ++sequence } }));
            socket.send(JSON.stringify({ type: 'event', method: 'session/status', deviceId: message.deviceId, params: { threadId: message.params.threadId, turnId: 'sent-turn', status: 'completed', sequence: ++sequence } }));
          }, 30);
          break;
        case 'sessions/create': {
          const project = projects.find((p) => p.id === message.params.projectId && p.deviceId === message.deviceId)!;
          const created = session(`created-${calls.length}`, project.id, '新会话');
          project.sessions.unshift(created); result = { session: created }; break;
        }
        case 'sessions/rename': {
          const selected = [...projects.flatMap((p) => p.sessions), ...recentSessions.map((entry) => entry.session)].find((item) => item.id === message.params.threadId)!;
          selected.name = message.params.name; result = {}; break;
        }
        case 'sessions/fork': {
          const source = [...projects.flatMap((p) => p.sessions), ...recentSessions.map((entry) => entry.session)].find((item) => item.id === message.params.threadId)!;
          const fork = { ...source, id: `fork-${calls.length}`, name: `${source.name} · 分支`, forkedFromId: source.id };
          projects.find((p) => p.id === source.projectId)?.sessions.unshift(fork); result = { session: fork }; break;
        }
        case 'sessions/goal/set': {
          const goal = { threadId: message.params.threadId, tokensUsed: 0, timeUsedSeconds: 0, tokenBudget: null, status: 'active',
            ...goals.get(message.params.threadId), ...message.params };
          goals.set(message.params.threadId, goal); result = { goal }; break;
        }
        case 'sessions/goal/clear': goals.delete(message.params.threadId); result = { goal: null }; break;
        case 'attachments/upload': result = { file: { id: `file-${calls.length}`, name: message.params.name, mimeType: message.params.mimeType, size: 64 } }; break;
        case 'images/read':
          if (message.params.source === 'missing.png') {
            socket.send(JSON.stringify({ type: 'response', id: message.id, error: { code: 'IMAGE_MISSING', message: '电脑上的图片不存在' } }));
            return;
          }
          result = { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==' };
          break;
        case 'sessions/archive': archives.add(`${message.deviceId}:${message.params.threadId}`); result = {}; break;
        case 'sessions/unarchive': archives.delete(`${message.deviceId}:${message.params.threadId}`); result = {}; break;
        case 'directories/list': result = { path: message.params.path || '/', parent: null, directories: [{ name: 'workspace', path: '/workspace' }] }; break;
        case 'projects/create': result = { project: { ...small, deviceId: message.deviceId, name: message.params.name, path: message.params.path } }; break;
        default: result = {};
      }
      socket.send(JSON.stringify({ type: 'response', id: message.id, result }));
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem('codex-remote:connection', JSON.stringify({ server: 'ws://fixture.test/ws', token: 'fixture-pairing-key-0000' }));
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '项目 Native Group，Mac 00', exact: true })).toBeVisible();
  return { calls, projects, recentSessions, sockets,
    loseSteerAck: () => { loseSteerAck = true; },
    running: (threadId: string, turnId: string) => {
      activeTurns.set(threadId, turnId);
      sockets.at(-1)!.send(JSON.stringify({ type: 'event', method: 'session/status', deviceId: devices[0].id,
        params: { threadId, turnId, status: 'inProgress', sequence: ++sequence } }));
    },
    historyPages: (pages: NonNullable<typeof historyPages>) => { historyPages = pages; },
    imageItem: (item: ChatItem) => {
      imageItems.push(item);
      sockets.at(-1)!.send(JSON.stringify({ type: 'event', method: 'session/item', deviceId: devices[0].id,
        params: { threadId: 'native-0', item, sequence: ++sequence } }));
    },
    metrics: (threadId: string, metrics: RunMetrics) => sockets.at(-1)!.send(JSON.stringify({
      type: 'event', method: 'session/metrics', deviceId: devices[0].id, params: { threadId, metrics, sequence: ++sequence },
    })),
    delayDirectories: () => { deferDirectories = true; },
    deliverDirectory: () => { deferDirectories = false; pendingDirectory?.(); },
    changed: () => sockets.at(-1)!.send(JSON.stringify({ type: 'event', method: 'catalog/changed', params: {} })) };
}

test('long sessions open at the latest messages and reveal history on upward scrolling without moving the reading anchor', async ({ page }) => {
  const fixture = await connectFixture(page);
  const items = (start: number, end: number): ChatItem[] => Array.from({ length: end - start }, (_, i) => ({
    id: `history-${start + i}`, turnId: `turn-${Math.floor((start + i) / 20)}`, kind: 'assistant',
    text: `History message ${start + i}\n\n${'A paragraph for the scrolling check. '.repeat(5)}`, timestamp: start + i,
  }));
  fixture.historyPages([
    { items: items(120, 240), nextCursor: '1' },
    { items: items(0, 120), nextCursor: null },
  ]);
  await page.getByRole('button', { name: '打开会话 Native session 1', exact: true }).click();
  const list = page.getByTestId('chat-history');
  const messages = page.getByTestId('assistant-message');
  const reads = () => fixture.calls.filter((call) => call.method === 'sessions/read');
  await expect(messages).toHaveCount(40);
  await expect.poll(() => list.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(5);
  expect(reads()).toHaveLength(1);
  expect(reads()[0].params.limit).toBe(6);
  await expect(messages.first()).toContainText('History message 200');
  // The composer/keyboard can change the viewport after content measurement.
  // Entry should still show the latest message without another size event.
  await page.setViewportSize({ width: 390, height: 700 });
  await expect.poll(() => list.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(5);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => list.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(5);

  async function scrollUp(expectedCount: number, anchorNumber: number) {
    const anchor = messages.filter({ hasText: `History message ${anchorNumber}\n` });
    // Stop just outside the preload threshold, then enter it. Measure an
    // actual message's screen position across insertion, not just scrollTop.
    await list.evaluate((element) => { element.scrollTop = 180; });
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(180);
    // Let React Native Web deliver its throttled scroll notification.
    await page.waitForTimeout(180);
    const before = (await anchor.boundingBox())!.y + 60;
    await list.evaluate((element) => { element.scrollTop = 120; });
    await expect(messages).toHaveCount(expectedCount);
    await expect.poll(async () => Math.abs((await anchor.boundingBox())!.y - before)).toBeLessThan(3);
  }
  await scrollUp(80, 200);
  expect(reads()).toHaveLength(1);
  await scrollUp(120, 160);
  expect(reads()).toHaveLength(1);
  await scrollUp(160, 120);
  expect(reads()).toHaveLength(2);
  expect(reads()[1].params.cursor).toBe('1');
  await scrollUp(200, 80);
  await scrollUp(240, 40);
  await expect(page.getByRole('button', { name: '查看更早消息', exact: true })).toHaveCount(0);
  expect(reads()).toHaveLength(2);

  const position = await list.evaluate((element) => element.scrollTop);
  fixture.imageItem({ id: 'new-live', turnId: 'new-turn', kind: 'assistant', text: 'New streamed message', timestamp: 241 });
  await expect(messages).toHaveCount(241);
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(position);
  await page.reload();
  await expect(messages).toHaveCount(40);
  await expect.poll(() => list.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(5);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '打开会话 Native session 1', exact: true }).click();
  await expect(messages).toHaveCount(40);
  await expect.poll(() => list.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(5);
});

test('quiet updates preserve collapse; sessions are limited and the large list survives returning from chat', async ({ page }) => {
  const fixture = await connectFixture(page, true);
  expect(fixture.projects.length).toBe(183);
  const native = page.getByRole('button', { name: '项目 Native Group，Mac 00', exact: true });
  const list = page.getByTestId('project-list');
  await expect(page.getByRole('heading', { name: '最近对话', exact: true })).toHaveCount(0);
  await expect.poll(() => list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(page.getByRole('button', { name: '打开会话 Native session 6', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '打开会话 Other machine session 6', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '显示更多 Small Group 的会话', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '显示更多 Native Group 的会话', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '打开会话 Native session 6', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '打开会话 Other machine session 6', exact: true })).toHaveCount(0);
  expect(await page.getByRole('button', { name: /^打开会话 Native session/ }).evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label'))))
    .toEqual(Array.from({ length: 7 }, (_, index) => `打开会话 Native session ${index + 1}`));
  const renderedRows = await page.getByRole('button', { name: /^打开会话/ }).count();
  expect(renderedRows).toBeLessThan(300);
  await native.click();
  await expect(native).toHaveAttribute('aria-expanded', 'false');
  for (let index = 0; index < 3; index++) {
    const count = fixture.calls.filter((call) => call.method === 'projects/list').length;
    fixture.projects[1].sessions[0].name = `Updated small ${index}`;
    fixture.recentSessions[0].session.name = `Updated recent ${index}`;
    fixture.changed();
    await expect.poll(() => fixture.calls.filter((call) => call.method === 'projects/list').length).toBeGreaterThan(count);
    await expect(page.getByRole('button', { name: `打开会话 Updated small ${index}`, exact: true })).toBeVisible();
    await expect(native).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  }
  await native.click();
  await list.evaluate((element) => { element.scrollTop = 120; });
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const originalList = await list.elementHandle();
  const originalScroll = await list.evaluate((element) => element.scrollTop);
  await page.getByRole('button', { name: '打开会话 Native session 1', exact: true }).click();
  await expect(page.getByTestId('chat-screen')).toBeVisible();
  const start = Date.now();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('projects-screen')).toBeVisible({ timeout: 1500 });
  const returnMs = Date.now() - start;
  expect(returnMs).toBeLessThan(1500);
  console.info('catalog acceptance metrics', JSON.stringify({
    projects: fixture.projects.length,
    sessions: fixture.projects.reduce((total, project) => total + project.sessions.length, 0),
    renderedRows,
    returnMs,
  }));
  expect(await originalList!.evaluate((element) => element === document.querySelector('[data-testid="project-list"]'))).toBe(true);
  expect(await list.evaluate((element) => element.scrollTop)).toBeCloseTo(originalScroll, 0);
  await expect(page.getByRole('button', { name: '打开会话 Native session 6', exact: true })).toBeVisible();
  await native.click();
  const search = page.getByRole('textbox', { name: '搜索项目或会话', exact: true });
  await search.fill('Updated recent 2');
  await expect(page.getByRole('heading', { name: '最近对话', exact: true })).toBeVisible();
  await expect(native).toHaveCount(0);
  await page.getByRole('button', { name: '打开会话 Updated recent 2', exact: true }).click();
  await expect(page.getByTestId('chat-screen')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('Updated recent 2');
  await search.fill('');
  await expect(native).toHaveAttribute('aria-expanded', 'false');
  await page.reload();
  await expect(native).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: '打开会话 Native session 1', exact: true })).toHaveCount(0);
});

test('Markdown, selected model and inner/outer layouts preserve the active conversation and draft', async ({ page }) => {
  const fixture = await connectFixture(page);
  await page.getByRole('button', { name: '打开会话 Projectless same directory', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Markdown Check', exact: true })).toBeVisible();
  await expect(page.getByText('Table cell A', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'OpenAI', exact: true })).toHaveAttribute('href', 'https://openai.com');
  await expect(page.getByText('First bullet', { exact: true })).toBeVisible();
  await expect(page.getByText('Ordered item', { exact: true })).toBeVisible();
  await expect(page.getByText('Quoted text', { exact: true })).toBeVisible();
  expect(Number(await page.getByText('bold words', { exact: true }).evaluate((element) => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(600);
  expect(await page.getByText('inlineCode', { exact: true }).evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(/mono/i);
  await page.getByRole('button', { name: /选择模型/ }).click();
  await expect(page.getByRole('radio', { name: 'Model A', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Model B', exact: true }).click();
  await page.getByTestId('effort-picker').click();
  await page.getByRole('radio', { name: '推理强度：high', exact: true }).click();
  await page.getByTestId('permission-picker').click();
  await page.getByRole('radio', { name: '权限：需要审批', exact: true }).click();
  const input = page.getByRole('textbox', { name: '消息输入框', exact: true });
  const conversation = await page.getByTestId('chat-screen').elementHandle();
  await input.fill('保留这一份草稿');
  await page.setViewportSize({ width: 763, height: 677 });
  await page.getByRole('button', { name: '显示项目栏', exact: true }).click();
  await expect(page.getByTestId('projects-screen')).toBeVisible();
  const split = await page.getByTestId('session-panel').boundingBox();
  await page.getByRole('button', { name: '收起项目栏', exact: true }).click();
  const full = await page.getByTestId('session-panel').boundingBox();
  expect(full!.width).toBeGreaterThan(split!.width);
  await expect(input).toHaveValue('保留这一份草稿');
  await expect(page.getByTestId('model-picker')).toHaveAttribute('aria-label', '选择模型，当前 Model B');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '显示项目栏', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('projects-screen')).toBeHidden();
  await expect(input).toHaveValue('保留这一份草稿');
  expect(await conversation!.evaluate((element) => element === document.querySelector('[data-testid="chat-screen"]'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const code = page.getByTestId('markdown-code-scroll');
  await expect.poll(() => code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await code.evaluate((element) => { element.scrollLeft = 160; });
  await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await page.getByRole('button', { name: /选择模型/ }).click();
  await expect(page.getByRole('radio', { name: 'Model B', exact: true })).toBeChecked();
  await page.getByRole('button', { name: '关闭模型选择', exact: true }).click();
  expect(fixture.calls.filter((call) => call.method === 'sessions/read')).toHaveLength(1);
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(() => fixture.calls.find((call) => call.method === 'sessions/send')?.params.model).toBe('model-b');
  expect(fixture.calls.find((call) => call.method === 'sessions/send')!.deviceId).toBe('machine-0');
  expect(fixture.calls.find((call) => call.method === 'sessions/send')!.params.effort).toBe('high');
  expect(fixture.calls.find((call) => call.method === 'sessions/send')!.params.permissionMode).toBe('approval');
  await expect(page.getByTestId('model-picker')).toHaveAttribute('aria-label', '选择模型，当前 Model B');
  await expect.poll(() => fixture.calls.filter((call) => call.method === 'sessions/read').length).toBe(2);
  await page.screenshot({ path: 'artifacts/issues-chat-phone.png' });
});

test('computer dropdown searches many machines, blocks unconfirmed computers and discards stale directory replies', async ({ page }) => {
  const fixture = await connectFixture(page);
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByRole('button', { name: '所属电脑，Mac 00', exact: true }).click();
  const search = page.getByRole('textbox', { name: '搜索电脑', exact: true });
  await expect(page.getByRole('radio', { name: '选择电脑 Mac 00，darwin，在线', exact: true })).toBeChecked();
  const options = page.getByTestId('computer-options');
  await expect.poll(() => options.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  expect((await options.boundingBox())!.height).toBeLessThanOrEqual(320);
  await options.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const offline = page.getByRole('radio', { name: '选择电脑 Mac 44，darwin，未知', exact: true });
  await expect(offline).toBeVisible();
  await expect(offline).toBeDisabled();
  const offlineBounds = await offline.boundingBox();
  await page.mouse.click(offlineBounds!.x + 20, offlineBounds!.y + offlineBounds!.height / 2);
  await expect(page.getByTestId('computer-picker')).toBeVisible();
  await expect(offline).not.toBeChecked();
  await search.fill('not-a-computer');
  await expect(page.getByText('没有找到匹配的电脑', { exact: true })).toBeVisible();
  await search.fill('linux');
  await expect(page.getByRole('radio', { name: '选择电脑 Mac 40，linux，在线', exact: true })).toBeVisible();
  await search.fill('Mac 44');
  await expect(page.getByRole('radio', { name: '选择电脑 Mac 44，darwin，未知', exact: true })).toBeDisabled();
  await search.fill('Mac 42');
  await page.getByRole('radio', { name: '选择电脑 Mac 42，darwin，在线', exact: true }).click();
  await expect(page.getByRole('button', { name: '所属电脑，Mac 42', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('Chosen computer project');
  await page.getByRole('textbox', { name: '项目目录', exact: true }).fill('/machine-42');
  fixture.delayDirectories();
  await page.getByRole('button', { name: '浏览电脑目录', exact: true }).click();
  await expect.poll(() => fixture.calls.find((call) => call.method === 'directories/list')?.deviceId).toBe('machine-42');
  expect(fixture.calls.find((call) => call.method === 'directories/list')!.params.path).toBe('/machine-42');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '所属电脑，Mac 42', exact: true }).click();
  await search.fill('Mac 43');
  await page.getByRole('radio', { name: '选择电脑 Mac 43，darwin，在线', exact: true }).click();
  fixture.deliverDirectory();
  await expect(page.getByRole('textbox', { name: '项目目录', exact: true })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: '项目名称', exact: true })).toHaveValue('Chosen computer project');
  await page.getByRole('button', { name: '浏览电脑目录', exact: true }).click();
  await expect(page.getByRole('button', { name: '目录 workspace', exact: true })).toBeVisible();
  await expect(page.getByText('/old-machine-delayed', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '目录 workspace', exact: true }).click();
  await expect(page.getByText('/workspace', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '使用此目录', exact: true }).click();
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect.poll(() => fixture.calls.find((call) => call.method === 'projects/create')?.deviceId).toBe('machine-43');
  expect(fixture.calls.filter((call) => call.method === 'directories/list').at(-1)!.deviceId).toBe('machine-43');
  expect(fixture.calls.find((call) => call.method === 'projects/create')!.params).toEqual({ name: 'Chosen computer project', path: '/workspace' });
  await page.screenshot({ path: 'artifacts/issues-projects-phone.png' });
});

test('horizontal gestures return in both directions while small and vertical drags preserve the conversation', async ({ page }) => {
  await connectFixture(page);
  const open = page.getByRole('button', { name: '打开会话 Native session 1', exact: true });
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  async function drag(from: { x: number; y: number }, to: { x: number; y: number }) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
    for (let step = 1; step <= 12; step++) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
        x: from.x + (to.x - from.x) * step / 12,
        y: from.y + (to.y - from.y) * step / 12,
        id: 1,
      }] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await open.click();
  await expect(page.getByTestId('chat-screen')).toBeVisible();
  const input = page.getByRole('textbox', { name: '消息输入框', exact: true });
  await input.fill('手势测试草稿');
  await drag({ x: 190, y: 170 }, { x: 190, y: 370 });
  await expect(page.getByTestId('chat-screen')).toBeVisible();
  await drag({ x: 100, y: 210 }, { x: 180, y: 210 });
  await expect(page.getByTestId('chat-screen')).toBeVisible();
  await expect(input).toHaveValue('手势测试草稿');
  const composer = await input.boundingBox();
  await drag({ x: composer!.x + 30, y: composer!.y + 15 }, { x: composer!.x + 185, y: composer!.y + 15 });
  await expect(page.getByTestId('chat-screen')).toBeVisible();
  await expect(input).toHaveValue('手势测试草稿');
  await drag({ x: 90, y: 210 }, { x: 280, y: 210 });
  await expect(page.getByTestId('projects-screen')).toBeVisible({ timeout: 1500 });
  await open.click();
  await expect(page.getByTestId('chat-screen')).toBeVisible();
  await expect(input).toHaveValue('手势测试草稿');
  await drag({ x: 300, y: 210 }, { x: 110, y: 210 });
  await expect(page.getByTestId('projects-screen')).toBeVisible({ timeout: 1500 });
});

test('long-press manages project and recent conversations; pins lead their own list and survive archive, restore and reload', async ({ page }) => {
  const fixture = await connectFixture(page);
  const openRow = (name: string) => page.getByRole('button', { name: `打开会话 ${name}`, exact: true });
  const manageRow = (name: string) => page.getByRole('button', { name: `管理会话 ${name}`, exact: true });
  await page.getByRole('button', { name: '显示更多 Native Group 的会话', exact: true }).first().click();
  const target = openRow('Native session 7');
  const position = await target.boundingBox();
  await page.mouse.move(position!.x + 15, position!.y + position!.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId('session-actions')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('chat-screen')).toHaveCount(0);
  await page.getByRole('button', { name: '置顶会话 Native session 7', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('codex-remote:session-pins:ws://fixture.test/ws') ?? '[]')))
    .toContain('machine-0:native-6');
  expect((await page.getByRole('button', { name: /^打开会话 Native session/ }).evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label'))))[0])
    .toBe('打开会话 Native session 7');
  await page.reload();
  await expect(target).toBeVisible();
  await expect(openRow('Native session 6')).toHaveCount(0);
  await manageRow('Native session 7').click();
  await expect(page.getByRole('button', { name: '取消置顶会话 Native session 7', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '归档会话 Native session 7', exact: true }).click();
  await expect(target).toHaveCount(0);
  await page.getByRole('tab', { name: '已归档', exact: true }).click();
  await expect(target).toBeVisible();
  await manageRow('Native session 7').click();
  await page.getByRole('button', { name: '恢复会话 Native session 7', exact: true }).click();
  await expect(target).toHaveCount(0);
  await page.getByRole('tab', { name: '当前项目', exact: true }).click();
  await expect(target).toBeVisible();
  await target.click();
  await expect(page.getByRole('heading', { name: 'Markdown Check', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await manageRow('Native session 7').click();
  await page.getByRole('button', { name: '取消置顶会话 Native session 7', exact: true }).click();
  await expect(target).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('codex-remote:session-pins:ws://fixture.test/ws') ?? '[]')))
    .not.toContain('machine-0:native-6');
  const recent = 'Projectless same directory';
  const list = page.getByTestId('project-list');
  async function scrollToRecent() {
    await list.hover();
    await page.mouse.wheel(0, 2000);
    await expect(manageRow(recent)).toBeVisible();
  }
  await scrollToRecent();
  await manageRow(recent).click();
  await page.getByRole('button', { name: `置顶会话 ${recent}`, exact: true }).click();
  await manageRow(recent).click();
  await page.getByRole('button', { name: `归档会话 ${recent}`, exact: true }).click();
  await expect(openRow(recent)).toHaveCount(0);
  await page.getByRole('tab', { name: '已归档', exact: true }).click();
  await manageRow(recent).click();
  await page.getByRole('button', { name: `恢复会话 ${recent}`, exact: true }).click();
  await page.getByRole('tab', { name: '当前项目', exact: true }).click();
  await scrollToRecent();
  await expect(openRow(recent)).toBeVisible();
  await manageRow(recent).click();
  await expect(page.getByRole('button', { name: `取消置顶会话 ${recent}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭会话管理', exact: true }).click();
  expect(fixture.calls.filter((call) => call.method === 'sessions/archive').map((call) => call.params.threadId))
    .toEqual(['native-6', 'recent-0']);
  expect(fixture.calls.filter((call) => call.method === 'sessions/unarchive').map((call) => call.params.threadId))
    .toEqual(['native-6', 'recent-0']);
});

test('running composer queues multiple messages, restores queue after reload and submits native steering without stop', async ({ page }) => {
  const fixture = await connectFixture(page);
  await page.getByRole('button', { name: '打开会话 Native session 1', exact: true }).click();
  fixture.running('native-0', 'running-turn');
  const input = page.getByRole('textbox', { name: '消息输入框', exact: true });
  for (const text of ['补充一', '补充二']) {
    await input.fill(text);
    await page.getByRole('button', { name: '提交排队消息', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(page.getByText(`排队中 · ${text}`, { exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByText('排队中 · 补充一', { exact: true })).toBeVisible();
  await expect(page.getByText('排队中 · 补充二', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '立即补充', exact: true }).click();
  await input.fill('立即调整');
  await page.getByRole('button', { name: '立即发送补充', exact: true }).click();
  await expect(input).toHaveValue('');
  const steer = fixture.calls.find((call) => call.method === 'sessions/steer')!;
  expect(steer.params.expectedTurnId).toBe('running-turn');
  expect(steer.params.text).toBe('立即调整');
  for (const setting of ['model', 'effort', 'mode', 'permissionMode']) expect(steer.params[setting]).toBeUndefined();
  expect(fixture.calls.filter((call) => call.method === 'sessions/enqueue')).toHaveLength(2);
  expect(fixture.calls.filter((call) => call.method === 'sessions/send' || call.method === 'sessions/stop')).toHaveLength(0);
  await expect(page.getByRole('button', { name: '停止任务', exact: true })).toBeVisible();
});

test('an uncertain steering submission retains its original target and key after the turn ends during disconnect', async ({ page }) => {
  const fixture = await connectFixture(page);
  await page.getByRole('button', { name: '打开会话 Native session 1', exact: true }).click();
  fixture.running('native-0', 'running-turn');
  await page.getByRole('button', { name: '立即补充', exact: true }).click();
  const input = page.getByRole('textbox', { name: '消息输入框', exact: true });
  await input.fill('保留不确定提交');
  fixture.loseSteerAck();
  await page.getByRole('button', { name: '立即发送补充', exact: true }).click();
  await expect(input).toHaveValue('保留不确定提交');
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(input).toHaveValue('');
  const steers = fixture.calls.filter((call) => call.method === 'sessions/steer');
  expect(steers).toHaveLength(2);
  expect(steers[1].params).toEqual(steers[0].params);
  expect(fixture.calls.filter((call) => call.method === 'sessions/send' || call.method === 'sessions/stop')).toHaveLength(0);
});
