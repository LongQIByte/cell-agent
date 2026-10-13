import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { SessionHistory } from '@codex-remote/protocol';
import { customPermissionsDescription } from '../../apps/mobile/src/turn-settings.js';
const config = JSON.parse(readFileSync(resolve('.local/connection.json'), 'utf8'));
const workspace = resolve('.local/browser-workspace');
const projectName = `LAN Issues ${Date.now().toString(36)}`;
const nativeProjectName = basename(process.cwd()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nativeProjectLabel = new RegExp(`项目 ${nativeProjectName}，`);
mkdirSync(workspace, { recursive: true });
mkdirSync(resolve('artifacts'), { recursive: true });
writeFileSync(resolve(workspace, 'remote-check.txt'), 'CODEX_REMOTE_LAN_OK\n');
writeFileSync(resolve(workspace, 'phone-note.txt'), 'PHONE_ATTACHMENT_OK\n');
test('real LAN: pair, import sessions, create project, execute, stream, resume, attach and resize', async ({
  page,
}) => {
  const errors: string[] = [];
  let deltas = 0;
  let threadId = '';
  let canonicalModel: string | null = null;
  let canonicalHistory: SessionHistory | null = null;
  const readCanonical = (): SessionHistory | null => canonicalHistory;
  let canonicalReads = 0;
  const requestMethods = new Map<string, string>();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) => {
    socket.on('framesent', (frame) => {
      try {
        const message = JSON.parse(String(frame.payload));
        if (message.type === 'request') requestMethods.set(message.id, message.method);
      } catch {}
    });
    socket.on('framereceived', (frame) => {
      try {
        const message = JSON.parse(String(frame.payload));
        if (message.method === 'session/delta') deltas++;
        if (message.type === 'response' && message.result?.session) {
          threadId = message.result.session.id;
          if (requestMethods.get(message.id) === 'sessions/read') {
            canonicalModel = message.result.model;
            canonicalHistory = message.result;
            canonicalReads++;
          }
        }
      } catch {}
    });
  });
  await page.goto('/');
  await expect(page.getByTestId('projects-screen')).toBeVisible();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page
    .getByLabel('服务地址', { exact: true })
    .fill(process.env.TEST_REMOTE_SERVER ?? config.server);
  await page.getByLabel('配对密钥', { exact: true }).fill('wrong-pairing-key-0000000');
  await page.getByRole('button', { name: '保存连接', exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('codex-remote:connection') ?? 'null');
    return saved?.token === 'wrong-pairing-key-0000000';
  })).toBe(true);
  await page.getByLabel('配对密钥', { exact: true }).fill(config.token);
  await page.getByRole('button', { name: '保存连接', exact: true }).click();
  await expect(page.getByRole('button', { name: /查看电脑 .+ 的连接，在线/ }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Projects', exact: true }).click();
  const nativeProject = page.getByRole('button', { name: nativeProjectLabel });
  // A CLI-only machine can have native projectless history without a desktop
  // project named after this checkout. Both catalogs are authoritative.
  await expect(page.getByRole('button', { name: /^打开会话/ }).first()).toBeVisible();
  if (await nativeProject.count()) {
    await nativeProject.click();
    await expect(nativeProject).toHaveAttribute('aria-expanded', 'false');
    await nativeProject.click();
    await expect(nativeProject).toHaveAttribute('aria-expanded', 'true');
  }
  await page.screenshot({ path: 'artifacts/projects-phone.png' });
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByLabel('项目名称', { exact: true }).fill(projectName);
  await page.getByLabel('项目目录', { exact: true }).fill(workspace);
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(`项目 ${projectName}，`) })).toBeVisible();
  await page.getByRole('button', { name: `在 ${projectName} 新建会话` }).click();
  await expect(page.getByTestId('chat-screen')).toBeVisible();
  writeFileSync(resolve('.local/issue-validation-session.json'), JSON.stringify({ projectName, threadId, server: config.server }));
  await expect(page.getByTestId('bottom-tabs')).toHaveCount(0);
  await expect(page.getByRole('heading')).toHaveCount(0);
  const input = page.getByRole('textbox', { name: '消息输入框' });
  await input.fill(
    '请执行 pwd 和 cat remote-check.txt。只需报告文件里的校验字符串，不要修改任何文件。',
  );
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(
    page.getByTestId('assistant-message').filter({ hasText: 'CODEX_REMOTE_LAN_OK' }).first(),
  ).toBeVisible({ timeout: 180000 });
  await expect(page.getByRole('button', { name: '停止任务', exact: true })).toHaveCount(0, {
    timeout: 180000,
  });
  expect(deltas).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: /执行详情/ }).first()).toBeVisible();
  await page.getByTestId('model-picker').click();
  const fastModel = page.getByRole('radio', { name: /GPT-6-Luna/i });
  await expect(fastModel).toBeVisible();
  await fastModel.click();
  await page.getByTestId('effort-picker').click();
  await page.getByRole('radio', { name: '推理强度：low', exact: true }).click();
  await page.getByTestId('permission-picker').click();
  await page.getByRole('radio', { name: '权限：需要审批', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('chat-screen')).toBeVisible();
  await expect(page.getByTestId('effort-picker')).toContainText('低');
  await expect(page.getByTestId('permission-picker')).toContainText('需要审批');
  await expect(
    page.getByTestId('assistant-message').filter({ hasText: 'CODEX_REMOTE_LAN_OK' }).first(),
  ).toBeVisible();
  await input.fill('刚才文件中的校验字符串是什么？不要再执行命令，只回答这个字符串。');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(
    page.getByTestId('assistant-message').filter({ hasText: 'CODEX_REMOTE_LAN_OK' }),
  ).toHaveCount(2, { timeout: 180000 });
  await expect(page.getByRole('button', { name: '停止任务', exact: true })).toHaveCount(0, {
    timeout: 180000,
  });
  await expect(page.getByTestId('model-picker')).toContainText(/GPT-6-Luna/i);
  const readsBeforeReload = canonicalReads;
  await page.reload();
  await expect.poll(() => canonicalReads).toBeGreaterThan(readsBeforeReload);
  await expect.poll(() => canonicalModel).toBe('gpt-6-luna');
  await expect.poll(() => readCanonical()?.reasoningEffort).toBe('low');
  await expect.poll(() => readCanonical()?.permissions?.mode).toBe('approval');
  expect(readCanonical()?.permissions?.approvalPolicy).toBe('on-request');
  expect(readCanonical()?.permissions?.sandboxPolicy.type).toBe('workspaceWrite');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '添加附件', exact: true }).click();
  await (await chooser).setFiles(resolve(workspace, 'phone-note.txt'));
  await expect(page.getByRole('button', { name: '移除附件 phone-note.txt' })).toBeVisible();
  await input.fill('请只读附加的 phone-note.txt，用一句话回答文件里的校验字符串。');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(
    page.getByTestId('assistant-message').filter({ hasText: 'PHONE_ATTACHMENT_OK' }).first(),
  ).toBeVisible({ timeout: 180000 });
  await expect(page.getByRole('button', { name: '停止任务', exact: true })).toHaveCount(0, {
    timeout: 180000,
  });
  await expect(page.getByText('电脑上的文件路径：', { exact: false })).toHaveCount(0);
  await input.fill('不要调用任何工具。请输出一小段 Markdown：标题必须是一级标题 Phone Markdown Check；下面包含加粗、两条无序列表、引用、一个 TypeScript 代码块，以及两列两行表格。表格包含 Table Phone A。不要在最外层套代码块。');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Phone Markdown Check', exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.getByTestId('markdown-table').filter({ hasText: 'Table Phone A' })).toBeVisible();
  await expect(page.getByRole('button', { name: '停止任务', exact: true })).toHaveCount(0, { timeout: 120000 });
  writeFileSync(resolve('.local/issue-validation-session.json'), JSON.stringify({ projectName, threadId, model: canonicalModel,
    reasoningEffort: readCanonical()?.reasoningEffort, permissions: readCanonical()?.permissions?.mode, server: config.server }));
  await page.screenshot({ path: 'artifacts/chat-phone.png' });
  await page.setViewportSize({ width: 900, height: 750 });
  await expect(page.getByTestId('bottom-tabs')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const box = await input.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(750);
  expect(box!.width).toBeGreaterThan(500);
  await page.screenshot({ path: 'artifacts/chat-fold.png' });
  await page.goBack();
  await expect(page.getByTestId('projects-screen')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('搜索项目或会话').fill(projectName);
  await expect(page.getByRole('button', { name: nativeProjectLabel })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/projects-test.png' });
  const sessionName = readCanonical()!.session.name;
  const openSession = page.getByRole('button', { name: `打开会话 ${sessionName}`, exact: true });
  const manageSession = page.getByRole('button', { name: `管理会话 ${sessionName}`, exact: true });
  await manageSession.click();
  await page.getByRole('button', { name: `置顶会话 ${sessionName}`, exact: true }).click();
  await page.reload();
  await page.getByLabel('搜索项目或会话').fill(projectName);
  await manageSession.click();
  await expect(page.getByRole('button', { name: `取消置顶会话 ${sessionName}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `归档会话 ${sessionName}`, exact: true }).click();
  await expect(openSession).toHaveCount(0);
  await page.getByRole('tab', { name: '已归档', exact: true }).click();
  await manageSession.click();
  await page.getByRole('button', { name: `恢复会话 ${sessionName}`, exact: true }).click();
  await expect(openSession).toHaveCount(0);
  await page.getByRole('tab', { name: '当前项目', exact: true }).click();
  const readsBeforeRestore = canonicalReads;
  await openSession.click();
  await expect.poll(() => canonicalReads).toBeGreaterThan(readsBeforeRestore);
  await expect(page.getByRole('heading', { name: 'Phone Markdown Check', exact: true })).toBeVisible();
  expect(readCanonical()?.model).toBe('gpt-6-luna');
  expect(readCanonical()?.reasoningEffort).toBe('low');
  // Native archive/resume restores on-request approvals with its current global
  // sandbox. Read and display that actual custom policy rather than a cached preset.
  expect(readCanonical()?.permissions?.mode).toBeNull();
  expect(readCanonical()?.permissions?.approvalPolicy).toBe('on-request');
  expect(['dangerFullAccess', 'readOnly', 'workspaceWrite', 'externalSandbox']).toContain(readCanonical()?.permissions?.sandboxPolicy.type);
  await expect(page.getByTestId('permission-picker')).toContainText('自定义');
  await page.getByTestId('permission-picker').click();
  await expect(page.getByText('此会话当前使用自定义权限', { exact: true })).toBeVisible();
  await expect(page.getByText(customPermissionsDescription(readCanonical()!.permissions!), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭权限模式选择', exact: true }).click();
  expect(errors).toEqual([]);
});
