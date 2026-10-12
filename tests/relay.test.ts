import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createRelay } from '../apps/relay/src/server.js';
const token = 'test-key-with-at-least-sixteen-characters';
function inbox(socket: WebSocket) {
  const messages: any[] = [];
  const waiting: { filter: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    const index = waiting.findIndex((w) => w.filter(message));
    if (index >= 0) waiting.splice(index, 1)[0].resolve(message);
    else messages.push(message);
  });
  return (filter: (m: any) => boolean): Promise<any> => {
    const index = messages.findIndex(filter);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
    return new Promise((resolve) => waiting.push({ filter, resolve }));
  };
}
test(
  'authentication, two-device routing, response ownership, offline errors, and no routing of unauthenticated requests',
  { timeout: 12000 },
  async () => {
    const relay = createRelay({
      token,
      dbPath: ':memory:',
      host: '127.0.0.1',
      port: 0,
      requestTimeoutMs: 1000,
    });
    const address = (await relay.listen()) as { port: number };
    const url = `ws://127.0.0.1:${address.port}/ws`;
    const sockets: WebSocket[] = [];
    async function connect(role: 'agent' | 'mobile', id?: string) {
      const socket = new WebSocket(url);
      sockets.push(socket);
      const next = inbox(socket);
      await once(socket, 'open');
      socket.send(
        JSON.stringify({
          type: 'hello',
          role,
          token,
          version: 1,
          device: id ? { id, name: id, platform: 'linux' } : undefined,
        }),
      );
      await next((m) => m.type === 'ready');
      return { socket, next };
    }
    try {
      const bad = new WebSocket(url);
      sockets.push(bad);
      await once(bad, 'open');
      bad.send(
        JSON.stringify({ type: 'request', id: 'hack', method: 'projects/list', params: {} }),
      );
      const [code] = await once(bad, 'close');
      assert.equal(code, 4001);
      const a = await connect('agent', 'machine-a');
      const b = await connect('agent', 'machine-b');
      const mobile = await connect('mobile');
      mobile.socket.send(
        JSON.stringify({
          type: 'request',
          id: 'phone-1',
          deviceId: 'machine-a',
          method: 'projects/list',
          params: {},
        }),
      );
      const routed = await a.next((m) => m.type === 'request');
      assert.notEqual(routed.id, 'phone-1');
      b.socket.send(JSON.stringify({ type: 'response', id: routed.id, result: { forged: true } }));
      a.socket.send(
        JSON.stringify({ type: 'response', id: routed.id, result: { projects: ['a'] } }),
      );
      const response = await mobile.next((m) => m.type === 'response');
      assert.deepEqual(response.result, { projects: ['a'] });
      assert.equal(response.id, 'phone-1');
      b.socket.send(
        JSON.stringify({
          type: 'event',
          deviceId: 'machine-a',
          method: 'session/status',
          params: { threadId: 'sample' },
        }),
      );
      const event = await mobile.next((m) => m.method === 'session/status');
      assert.equal(event.deviceId, 'machine-b');
      const closed = once(a.socket, 'close');
      a.socket.close();
      await closed;
      await mobile.next(
        (m) =>
          m.method === 'devices/changed' &&
          !m.params.devices.find((d: any) => d.id === 'machine-a').online,
      );
      mobile.socket.send(
        JSON.stringify({
          type: 'request',
          id: 'phone-2',
          deviceId: 'machine-a',
          method: 'sessions/send',
          params: {},
        }),
      );
      assert.equal((await mobile.next((m) => m.id === 'phone-2')).error.code, 'DEVICE_OFFLINE');
      mobile.socket.send(
        JSON.stringify({
          type: 'request',
          id: 'phone-3',
          deviceId: 'machine-b',
          method: 'projects/list',
          params: {},
        }),
      );
      assert.equal((await mobile.next((m) => m.id === 'phone-3')).error.code, 'TIMEOUT');
      assert.equal(relay.listDevices().length, 2);
    } finally {
      for (const socket of sockets) socket.terminate();
      await relay.close();
    }
  },
);
