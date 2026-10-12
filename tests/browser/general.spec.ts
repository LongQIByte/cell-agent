import { expect, test, type Locator, type Page } from '@playwright/test';
import { PROTOCOL_VERSION, type Device, type Project } from '@codex-remote/protocol';
import { DEFAULT_PREFERENCES, FONT_SIZES, PREFERENCES_KEY, type Preferences } from '../../apps/mobile/src/preferences.js';

test.use({ actionTimeout: 10000 });
const storageKey = `codex-remote:${PREFERENCES_KEY}`;
const fixtureServer = 'ws://general-fixture.test/ws';

async function generalFixture(page: Page, preferences: Preferences = DEFAULT_PREFERENCES) {
  const device: Device = { id: 'general-machine', name: 'Theme computer', platform: 'darwin', online: true, lastSeen: 1 };
  const project: Project = { id: 'general-project', name: 'Theme project', path: '/workspace', deviceId: device.id,
    available: true, updatedAt: 1, sessions: [{ id: 'general-session', projectId: 'general-project', cwd: '/workspace',
      name: 'Theme session', status: 'idle', updatedAt: 1 }] };
  await page.routeWebSocket('**/ws', (socket) => {
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'hello') {
        socket.send(JSON.stringify({ type: 'ready', version: PROTOCOL_VERSION, devices: [device] }));
        return;
      }
      if (message.type !== 'request') return;
      const result = message.method === 'projects/list' ? { projects: [project], recentSessions: [] }
        : message.method === 'models/list' ? { models: [{ id: 'general-model', model: 'general-model', displayName: 'Theme model',
          description: 'Readable model option', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: 'Medium' }] }] }
        : message.method === 'sessions/read' ? { session: project.sessions[0], model: 'general-model', reasoningEffort: 'medium',
          permissions: { mode: 'full-access', approvalPolicy: 'never', sandboxPolicy: { type: 'dangerFullAccess' }, approvalsReviewer: 'user', profile: null }, sequence: 0,
          activeTurnId: null, nextCursor: null, requests: [], items: [{ id: 'general-markdown', turnId: 'general-turn',
            kind: 'assistant', timestamp: 1,
            text: '# Theme heading\n\nReadable message with **strong words** and `themeCode`.\n\n```ts\nconst readable = true;\n```\n\n| Theme table | Value |\n| --- | --- |\n| Readable cell | 1 |' }] }
        : {};
      socket.send(JSON.stringify({ type: 'response', id: message.id, result }));
    });
  });
  await page.addInitScript(({ preferences, storageKey, fixtureServer }) => {
    localStorage.setItem('codex-remote:connection', JSON.stringify({ server: fixtureServer, token: 'general-fixture-pairing-key-0000' }));
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(preferences));
  }, { preferences, storageKey, fixtureServer });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '项目 Theme project，Theme computer', exact: true })).toBeVisible();
}

async function settings(page: Page) {
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: '通用', exact: true })).toBeVisible();
  return page.getByTestId('general-settings');
}
async function openChat(page: Page) {
  await page.getByRole('tab', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: '打开会话 Theme session', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Theme heading', exact: true })).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), storageKey);
}
async function fontSize(element: Locator, expected: number) {
  await expect.poll(() => element.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeCloseTo(expected, 2);
}

test('system/light/dark theme persists and all four font sizes reach pages, messages, inputs and popups', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await generalFixture(page);
  const general = await settings(page);
  await expect(general.getByRole('radio', { name: '主题：跟随系统', exact: true })).toBeChecked();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark');
  await general.getByRole('radio', { name: '主题：白色', exact: true }).click();
  await expect(page.getByTestId('settings-screen')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.emulateMedia({ colorScheme: 'light' });
  await general.getByRole('radio', { name: '主题：黑色', exact: true }).click();
  await expect(page.getByTestId('settings-screen')).toHaveCSS('background-color', 'rgb(18, 18, 18)');
  await expect(general.getByRole('radio', { name: '主题：黑色', exact: true })).toBeChecked();
  const sizes = [ ['small', '小'], ['standard', '标准'], ['large', '大'], ['extraLarge', '特大'] ] as const;
  for (const [size, label] of sizes) {
    const scale = FONT_SIZES[size];
    await general.getByRole('radio', { name: `字体大小：${label}`, exact: true }).click();
    await fontSize(general.getByTestId('font-preview'), 16 * scale);
    await page.getByRole('tab', { name: 'Projects', exact: true }).click();
    await fontSize(page.getByRole('heading', { name: 'Projects', exact: true }), 34 * scale);
    await expect(page.getByTestId('projects-screen')).toHaveCSS('background-color', 'rgb(18, 18, 18)');
    await openChat(page);
    await fontSize(page.getByRole('heading', { name: 'Theme heading', exact: true }), 26 * scale);
    await fontSize(page.getByText('themeCode', { exact: true }), 14 * scale);
    await fontSize(page.getByRole('textbox', { name: '消息输入框', exact: true }), 15 * scale);
    await expect(page.getByRole('textbox', { name: '消息输入框', exact: true })).toHaveCSS('color', 'rgb(240, 240, 240)');
    await page.getByRole('button', { name: /选择模型/ }).click();
    await fontSize(page.getByRole('radio', { name: 'Theme model', exact: true }).getByText('Theme model', { exact: true }), 14 * scale);
    await expect(page.getByText('选择模型', { exact: true })).toHaveCSS('color', 'rgb(240, 240, 240)');
    await page.getByRole('button', { name: '关闭模型选择', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await fontSize(page.getByRole('textbox', { name: '项目名称', exact: true }), 16 * scale);
    await page.getByRole('button', { name: '所属电脑，Theme computer', exact: true }).click();
    await expect(page.getByTestId('computer-picker')).toHaveCSS('background-color', 'rgb(18, 18, 18)');
    await fontSize(page.getByRole('heading', { name: '选择电脑', exact: true }), 20 * scale);
    await page.getByRole('button', { name: '关闭电脑选择', exact: true }).click();
    await page.getByRole('button', { name: '关闭新建项目', exact: true }).click();
    await settings(page);
  }
  await expect.poll(() => stored(page)).toEqual({ theme: 'dark', fontSize: 'extraLarge', projectRatio: 0.35 });
  await page.reload();
  await settings(page);
  await expect(general.getByRole('radio', { name: '主题：黑色', exact: true })).toBeChecked();
  await expect(general.getByRole('radio', { name: '字体大小：特大', exact: true })).toBeChecked();
  await general.getByRole('button', { name: '恢复默认设置', exact: true }).click();
  await expect(general.getByRole('radio', { name: '主题：跟随系统', exact: true })).toBeChecked();
  await expect(general.getByRole('radio', { name: '字体大小：标准', exact: true })).toBeChecked();
  await expect.poll(() => stored(page)).toEqual(DEFAULT_PREFERENCES);
  await expect(page.getByTestId('settings-screen')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.screenshot({ path: 'artifacts/general-settings.png' });
});

test('setting and draggable splitter honor bounds, preserve conversation/draft on fold and retain ratio after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await generalFixture(page);
  const general = await settings(page);
  await general.getByRole('button', { name: '增加项目栏宽度', exact: true }).click();
  await expect(general.getByTestId('project-ratio')).toHaveText('Project 40% · Session 60%');
  await openChat(page);
  const input = page.getByRole('textbox', { name: '消息输入框', exact: true });
  await input.fill('调整比例时保留的草稿');
  const conversation = await page.getByTestId('chat-screen').elementHandle();
  await page.getByRole('button', { name: '显示项目栏', exact: true }).click();
  const divider = page.getByTestId('pane-divider');
  await expect(divider).toHaveAttribute('aria-valuenow', '40');
  async function dragTo(x: number) {
    const bounds = await divider.boundingBox();
    await page.mouse.move(bounds!.x + bounds!.width / 2, 150);
    await page.mouse.down();
    await page.mouse.move(x, 150, { steps: 12 });
    await page.mouse.up();
  }
  await dragTo(980);
  const rightBound = await page.getByTestId('project-panel').boundingBox();
  expect(rightBound!.width).toBeCloseTo(976 * 0.6, 0);
  await expect(divider).toHaveAttribute('aria-valuenow', '60');
  await dragTo(5);
  const leftBound = await page.getByTestId('project-panel').boundingBox();
  expect(leftBound!.width).toBeCloseTo(976 * 0.25, 0);
  await expect(divider).toHaveAttribute('aria-valuenow', '25');
  await divider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '30');
  await expect.poll(async () => (await stored(page)).projectRatio).toBe(0.3);
  const ratio = (await stored(page)).projectRatio;
  const originalWidth = (await page.getByTestId('project-panel').boundingBox())!.width;
  await page.getByRole('button', { name: '收起项目栏', exact: true }).click();
  await expect(divider).toHaveCount(0);
  await page.getByRole('button', { name: '显示项目栏', exact: true }).click();
  expect((await page.getByTestId('project-panel').boundingBox())!.width).toBeCloseTo(originalWidth, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(divider).toHaveCount(0);
  await expect(page.getByTestId('projects-screen')).toBeHidden();
  await expect(input).toHaveValue('调整比例时保留的草稿');
  await page.setViewportSize({ width: 763, height: 677 });
  await expect(divider).toBeVisible();
  const project = await page.getByTestId('project-panel').boundingBox();
  const chat = await page.getByTestId('session-panel').boundingBox();
  expect(project!.width).toBeGreaterThanOrEqual(220);
  expect(chat!.width).toBeGreaterThanOrEqual(320);
  await expect(input).toHaveValue('调整比例时保留的草稿');
  expect(await conversation!.evaluate((element) => element === document.querySelector('[data-testid="chat-screen"]'))).toBe(true);
  expect((await stored(page)).projectRatio).toBe(ratio);
  await page.reload();
  await expect(input).toHaveValue('调整比例时保留的草稿');
  await page.getByRole('button', { name: '显示项目栏', exact: true }).click();
  await expect(divider).toHaveAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  await page.screenshot({ path: 'artifacts/general-split.png' });
});

test('failed writes report a save error without blocking immediate preference changes and can be retried', async ({ page }) => {
  await generalFixture(page);
  const general = await settings(page);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    (window as Window & { allowPreferenceWrites?: boolean }).allowPreferenceWrites = false;
    Storage.prototype.setItem = function (name, value) {
      if (name === key && !(window as Window & { allowPreferenceWrites?: boolean }).allowPreferenceWrites)
        throw new DOMException('Test preference storage failure', 'QuotaExceededError');
      original.call(this, name, value);
    };
  }, storageKey);
  await general.getByRole('radio', { name: '主题：黑色', exact: true }).click();
  await expect(page.getByTestId('settings-screen')).toHaveCSS('background-color', 'rgb(18, 18, 18)');
  await expect(general.getByText('通用设置保存失败，请重试。', { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as Window & { allowPreferenceWrites?: boolean }).allowPreferenceWrites = true; });
  await general.getByRole('radio', { name: '字体大小：大', exact: true }).click();
  await expect.poll(() => stored(page)).toEqual({ theme: 'dark', fontSize: 'large', projectRatio: 0.35 });
  await expect(general.getByText('通用设置保存失败，请重试。', { exact: true })).toHaveCount(0);
  await page.reload();
  await settings(page);
  await expect(general.getByRole('radio', { name: '主题：黑色', exact: true })).toBeChecked();
  await expect(general.getByRole('radio', { name: '字体大小：大', exact: true })).toBeChecked();
});
