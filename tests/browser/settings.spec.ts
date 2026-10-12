import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { PROTOCOL_VERSION, type Device } from '@codex-remote/protocol';

test.use({ actionTimeout: 10000 });

const firstConnection = {
  server: 'ws://settings-first.test/ws',
  token: 'fixture-first-pairing-key-0000',
};
const secondConnection = {
  server: 'ws://settings-second.test/ws',
  token: 'fixture-second-pairing-key-1111',
};
const incorrectKey = 'fixture-incorrect-pairing-key-2222';

async function settingsFixture(page: Page, deferFirstCatalog = false) {
  const firstDevices: Device[] = [
    { id: 'shared-id', name: 'First computer', platform: 'darwin', online: true, lastSeen: 1 },
    { id: 'second-id', name: 'Second computer', platform: 'linux', online: false, lastSeen: 1 },
  ];
  const secondDevices: Device[] = [
    {
      id: 'shared-id',
      name: 'Other service computer',
      platform: 'win32',
      online: true,
      lastSeen: 1,
    },
  ];
  const sockets: WebSocketRoute[] = [];
  let available = true;
  await page.routeWebSocket('**/ws', (socket) => {
    sockets.push(socket);
    const first = new URL(socket.url()).hostname === 'settings-first.test';
    const expectedKey = first ? firstConnection.token : secondConnection.token;
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'hello') {
        if (!available) {
          void socket.close({ code: 1000 });
          return;
        }
        if (message.token !== expectedKey) {
          void socket.close({ code: 4001 });
          return;
        }
        socket.send(
          JSON.stringify({
            type: 'ready',
            version: PROTOCOL_VERSION,
            devices: first ? firstDevices : secondDevices,
          }),
        );
      } else if (message.type === 'request') {
        // A confirmed machine must be saved even while its project catalog is
        // still loading; changing connections can cancel this request.
        if (first && deferFirstCatalog && message.method === 'projects/list') return;
        socket.send(
          JSON.stringify({
            type: 'response',
            id: message.id,
            result: { projects: [], recentSessions: [] },
          }),
        );
      }
    });
  });
  await page.addInitScript((initial) => {
    if (!localStorage.getItem('codex-remote:connection'))
      localStorage.setItem('codex-remote:connection', JSON.stringify(initial));
  }, firstConnection);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  const settings = page.getByTestId('settings-screen');
  await expect(
    settings.getByRole('button', { name: '查看电脑 First computer 的连接，在线', exact: true }),
  ).toBeVisible();
  return {
    settings,
    interrupt: async () => {
      available = false;
      await sockets.at(-1)!.close({ code: 1000 });
    },
    restore: () => {
      available = true;
    },
  };
}

test('saved wrong keys retain known computers and hidden editable details through reload and repair', async ({
  page,
}) => {
  const fixture = await settingsFixture(page);
  const settings = fixture.settings;
  const details = page.getByTestId('device-connection-details');
  await expect(
    settings.getByRole('button', { name: '查看电脑 Second computer 的连接，未知', exact: true }),
  ).toBeVisible();
  await expect(settings.getByText('离线', { exact: true })).toHaveCount(0);
  await settings
    .getByRole('button', { name: '查看电脑 Second computer 的连接，未知', exact: true })
    .click();
  await expect(
    details.getByRole('heading', { name: 'Second computer 的连接', exact: true }),
  ).toBeVisible();
  await expect(details.getByLabel('服务地址', { exact: true })).toHaveValue(firstConnection.server);
  await expect(details.getByLabel('配对密钥', { exact: true })).toHaveAttribute('type', 'password');
  await details.getByRole('button', { name: '显示密钥', exact: true }).click();
  await expect
    .poll(() =>
      details
        .getByLabel('配对密钥', { exact: true })
        .evaluate((input: HTMLInputElement) => input.type),
    )
    .toBe('text');
  await expect(details.getByLabel('配对密钥', { exact: true })).toHaveValue(firstConnection.token);
  await details.getByRole('button', { name: '隐藏密钥', exact: true }).click();
  await expect(details.getByLabel('配对密钥', { exact: true })).toHaveAttribute('type', 'password');
  await details.getByRole('button', { name: '显示密钥', exact: true }).click();
  await details.getByRole('button', { name: '关闭连接详情', exact: true }).click();
  await settings
    .getByRole('button', { name: '查看电脑 Second computer 的连接，未知', exact: true })
    .click();
  await expect(details.getByLabel('配对密钥', { exact: true })).toHaveAttribute('type', 'password');
  await details.getByRole('button', { name: '关闭连接详情', exact: true }).click();

  await settings.getByLabel('配对密钥', { exact: true }).fill(incorrectKey);
  await settings.getByRole('button', { name: '保存连接', exact: true }).click();
  await expect(settings.getByTestId('connection-saved')).toHaveText('已保存连接');
  await expect(
    settings.getByRole('button', { name: '查看电脑 First computer 的连接，未知', exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByText('配对密钥不正确，请在 Settings 中重新填写', { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('codex-remote:connection')!)),
  ).toEqual({ ...firstConnection, token: incorrectKey });
  expect(await settings.innerText()).not.toContain(incorrectKey);
  await page.reload();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(settings.getByLabel('配对密钥', { exact: true })).toHaveValue(incorrectKey);
  await expect(settings.getByLabel('配对密钥', { exact: true })).toHaveAttribute(
    'type',
    'password',
  );
  await settings
    .getByRole('button', { name: '查看电脑 First computer 的连接，未知', exact: true })
    .click();
  await expect(
    details.getByRole('heading', { name: 'First computer 的连接', exact: true }),
  ).toBeVisible();
  await expect(details.getByLabel('配对密钥', { exact: true })).toHaveAttribute('type', 'password');
  await expect(
    details.getByText('配对密钥不正确，请在 Settings 中重新填写', { exact: true }),
  ).toBeVisible();
  await details.getByRole('button', { name: '显示密钥', exact: true }).click();
  await expect(details.getByLabel('配对密钥', { exact: true })).toHaveValue(incorrectKey);
  await details.getByLabel('配对密钥', { exact: true }).fill(firstConnection.token);
  await details.getByRole('button', { name: '保存连接', exact: true }).click();
  await expect(details.getByTestId('connection-saved')).toHaveText('已保存连接');
  await expect(details.getByText('在线', { exact: true })).toBeVisible();
  await expect(details.getByLabel('配对密钥', { exact: true })).toHaveAttribute('type', 'password');
  await details.getByRole('button', { name: '关闭连接详情', exact: true }).click();
  await expect(settings.getByLabel('配对密钥', { exact: true })).toHaveValue(firstConnection.token);
  await expect(
    settings.getByRole('button', { name: '查看电脑 First computer 的连接，在线', exact: true }),
  ).toBeVisible();

  await fixture.interrupt();
  await expect(
    settings.getByRole('button', { name: '查看电脑 First computer 的连接，未知', exact: true }),
  ).toBeVisible();
  await settings
    .getByRole('button', { name: '查看电脑 First computer 的连接，未知', exact: true })
    .click();
  await expect(details.getByLabel('服务地址', { exact: true })).toHaveValue(firstConnection.server);
  await expect(details.getByLabel('配对密钥', { exact: true })).toHaveAttribute('type', 'password');
  await expect(details.getByText('离线', { exact: true })).toHaveCount(0);
  fixture.restore();
  await details.getByRole('button', { name: '重新连接服务', exact: true }).click();
  await expect(details.getByText('在线', { exact: true })).toBeVisible();
});

test('changing services binds repeated device ids to the matching saved address and key', async ({
  page,
}) => {
  const { settings } = await settingsFixture(page, true);
  await settings.getByLabel('服务地址', { exact: true }).fill(secondConnection.server);
  await settings.getByLabel('配对密钥', { exact: true }).fill(secondConnection.token);
  await settings.getByRole('button', { name: '保存连接', exact: true }).click();
  await settings
    .getByRole('button', { name: '查看电脑 Other service computer 的连接，在线', exact: true })
    .click();
  const details = page.getByTestId('device-connection-details');
  await expect(
    details.getByRole('heading', { name: 'Other service computer 的连接', exact: true }),
  ).toBeVisible();
  await expect(details.getByLabel('服务地址', { exact: true })).toHaveValue(
    secondConnection.server,
  );
  await expect(details.getByLabel('配对密钥', { exact: true })).toHaveValue(secondConnection.token);
  await expect(details.getByLabel('配对密钥', { exact: true })).toHaveAttribute('type', 'password');
  await details.getByRole('button', { name: '关闭连接详情', exact: true }).click();
  await expect(settings.getByRole('button', { name: /查看电脑 First computer/ })).toHaveCount(0);
  await settings.getByLabel('服务地址', { exact: true }).fill(firstConnection.server);
  await settings.getByLabel('配对密钥', { exact: true }).fill(incorrectKey);
  await settings.getByRole('button', { name: '保存连接', exact: true }).click();
  await settings
    .getByRole('button', { name: '查看电脑 First computer 的连接，未知', exact: true })
    .click();
  await expect(
    details.getByRole('heading', { name: 'First computer 的连接', exact: true }),
  ).toBeVisible();
  await expect(details.getByLabel('服务地址', { exact: true })).toHaveValue(firstConnection.server);
  await expect(details.getByLabel('配对密钥', { exact: true })).toHaveValue(incorrectKey);
  await expect(details.getByLabel('配对密钥', { exact: true })).toHaveAttribute('type', 'password');
});
