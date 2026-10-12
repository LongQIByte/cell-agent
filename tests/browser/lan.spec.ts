import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
const config = JSON.parse(readFileSync(resolve('.local/connection.json'), 'utf8'));
const workspace = resolve('.local/browser-workspace');
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
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) =>
    socket.on('framereceived', (frame) => {
      try {
        if (JSON.parse(String(frame.payload)).method === 'session/delta') deltas++;
      } catch {}
    }),
  );
  await page.goto('/');
  await expect(page.getByTestId('projects-screen')).toBeVisible();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page
    .getByLabel('服务地址', { exact: true })
    .fill(process.env.TEST_REMOTE_SERVER ?? config.server);
  await page.getByLabel('配对密钥', { exact: true }).fill('wrong-pairing-key-0000000');
  await page.getByRole('button', { name: '保存并连接' }).click();
  await expect(page.getByText('配对密钥不正确，请在 Settings 中重新填写')).toBeVisible();
  await page.getByLabel('配对密钥', { exact: true }).fill(config.token);
  await page.getByRole('button', { name: '保存并连接' }).click();
  await expect(page.getByText('已连接', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Projects', exact: true }).click();
  const nativeProject = page.getByRole('button', { name: nativeProjectLabel });
  await expect(nativeProject).toBeVisible();
  await nativeProject.click();
  await expect(nativeProject).toHaveAttribute('aria-expanded', 'false');
  await nativeProject.click();
  await expect(nativeProject).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({ path: 'artifacts/projects-phone.png' });
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByLabel('项目名称', { exact: true }).fill('LAN Browser Test');
  await page.getByLabel('项目目录', { exact: true }).fill(workspace);
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page.getByRole('button', { name: /项目 LAN Browser Test，/ })).toBeVisible();
  await page.getByRole('button', { name: '在 LAN Browser Test 新建会话' }).click();
  await expect(page.getByTestId('chat-screen')).toBeVisible();
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
  await page.reload();
  await expect(page.getByTestId('chat-screen')).toBeVisible();
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
  await page.getByLabel('搜索项目或会话').fill('LAN Browser Test');
  await expect(page.getByRole('button', { name: nativeProjectLabel })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/projects-test.png' });
  expect(errors).toEqual([]);
});
