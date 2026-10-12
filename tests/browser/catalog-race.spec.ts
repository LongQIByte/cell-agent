import { expect, test, type WebSocketRoute } from '@playwright/test';
import { PROTOCOL_VERSION, type Project } from '@codex-remote/protocol';

test('a late active catalog cannot overwrite a newer active catalog after visiting archives', async ({ page }) => {
  let socket: WebSocketRoute | undefined;
  let heldId = '';
  let activeReads = 0;
  const project = (name: string): Project => ({ id: name, name, path: '/workspace', deviceId: 'race-machine',
    available: true, updatedAt: 1, sessions: [] });
  const response = (id: string, name: string) => JSON.stringify({ type: 'response', id,
    result: { projects: [project(name)], recentSessions: [] } });
  await page.routeWebSocket('**/ws', (ws) => {
    socket = ws;
    ws.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'hello') ws.send(JSON.stringify({ type: 'ready', version: PROTOCOL_VERSION,
        devices: [{ id: 'race-machine', name: 'Race computer', platform: 'darwin', online: true, lastSeen: 1 }] }));
      if (message.type !== 'request' || message.method !== 'projects/list') return;
      if (message.params.archived) ws.send(response(message.id, 'Archived catalog'));
      else if (activeReads++ === 1) heldId = message.id;
      else ws.send(response(message.id, activeReads === 1 ? 'Initial catalog' : 'Fresh catalog'));
    });
  });
  await page.addInitScript(() => localStorage.setItem('codex-remote:connection', JSON.stringify({
    server: 'ws://catalog-race.test/ws', token: 'catalog-race-pairing-key-0000',
  })));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '项目 Initial catalog，Race computer', exact: true })).toBeVisible();
  socket!.send(JSON.stringify({ type: 'event', method: 'catalog/changed', deviceId: 'race-machine', params: {} }));
  await expect.poll(() => heldId.length > 0).toBe(true);
  await page.getByRole('tab', { name: '已归档', exact: true }).click();
  await expect(page.getByRole('button', { name: '项目 Archived catalog，Race computer', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '当前项目', exact: true }).click();
  const fresh = page.getByRole('button', { name: '项目 Fresh catalog，Race computer', exact: true });
  await expect(fresh).toBeVisible();
  socket!.send(response(heldId, 'Stale catalog'));
  // The following roster message proves that the earlier response was delivered.
  socket!.send(JSON.stringify({ type: 'event', method: 'devices/changed', params: { devices: [
    { id: 'race-machine', name: 'Race computer after reply', platform: 'darwin', online: true, lastSeen: 2 },
  ] } }));
  await expect(page.getByRole('button', { name: /，Race computer after reply$/ }).first()).toBeVisible();
  expect(await page.getByRole('button', { name: '项目 Fresh catalog，Race computer after reply', exact: true }).count()).toBe(1);
  expect(await page.getByRole('button', { name: '项目 Stale catalog，Race computer after reply', exact: true }).count()).toBe(0);
});
