import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createRelay } from '../apps/relay/src/server.js';
import { PROTOCOL_VERSION } from '@codex-remote/protocol';
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
          version: PROTOCOL_VERSION,
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
      const outdated = new WebSocket(url);
      sockets.push(outdated);
      const rejected = once(outdated, 'close');
      await once(outdated, 'open');
      // Version mismatch is distinct from credentials and never enters device routing.
      outdated.send(JSON.stringify({ type: 'hello', role: 'mobile', token, version: PROTOCOL_VERSION - 1 }));
      const [mismatchCode, reason] = await rejected;
      assert.equal(mismatchCode, 4002);
      assert.match(reason.toString(), /update phone app and restart computer service/);
      assert.equal(relay.listDevices().length, 0);
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

test('file capabilities stream ranges from the owning machine, reject guesses, and revoke on client disconnect', { timeout: 15000 }, async () => {
  const relay = createRelay({ token, dbPath: ':memory:', host: '127.0.0.1', port: 0 });
  const address = await relay.listen() as { port: number };
  const url = `ws://127.0.0.1:${address.port}/ws`; const http = `http://127.0.0.1:${address.port}`;
  const agent = new WebSocket(url); const nextAgent = inbox(agent);
  const mobile = new WebSocket(url); const nextMobile = inbox(mobile);
  const data = Buffer.alloc(1024 * 1024 + 17, 'video-data');
  const chunks: number[] = [];
  try {
    await Promise.all([once(agent, 'open'), once(mobile, 'open')]);
    agent.send(JSON.stringify({ type: 'hello', role: 'agent', token, version: PROTOCOL_VERSION, device: { id: 'files-machine', name: 'files', platform: 'linux' } }));
    mobile.send(JSON.stringify({ type: 'hello', role: 'mobile', token, version: PROTOCOL_VERSION }));
    await Promise.all([nextAgent((m) => m.type === 'ready'), nextMobile((m) => m.type === 'ready')]);
    agent.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.method === 'files/read') {
        chunks.push(message.params.length);
        agent.send(JSON.stringify({ type: 'response', id: message.id, result: { data: data.subarray(message.params.offset, message.params.offset + message.params.length).toString('base64') } }));
      }
    });
    mobile.send(JSON.stringify({ type: 'request', id: 'file', deviceId: 'files-machine', method: 'files/open', params: { threadId: 'session', source: 'video.webm' } }));
    const request = await nextAgent((m) => m.method === 'files/open');
    agent.send(JSON.stringify({ type: 'response', id: request.id, result: { id: 'agent-handle', name: '视频.webm', size: data.length, mimeType: 'video/webm', expiresAt: Date.now() + 900000 } }));
    const result = (await nextMobile((m) => m.id === 'file')).result;
    assert.equal(result.id, undefined); assert.ok(result.ticket);
    assert.equal((await fetch(`${http}/files/guess`)).status, 410);
    const response = await fetch(`${http}/files/${result.ticket}`, { headers: { Range: 'bytes=13-300000' } });
    assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), `bytes 13-300000/${data.length}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), data.subarray(13, 300001));
    assert.ok(chunks.every((length) => length <= 256 * 1024));
    const suffix = await fetch(`${http}/files/${result.ticket}`, { headers: { Range: 'bytes=-17' } });
    assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), data.subarray(-17));
    const invalid = await fetch(`${http}/files/${result.ticket}`, { headers: { Range: 'bytes=9000000-' } });
    assert.equal(invalid.status, 416);
    const head = await fetch(`${http}/files/${result.ticket}`, { method: 'HEAD' }); assert.equal(head.headers.get('content-length'), String(data.length));
    const closed = once(mobile, 'close'); mobile.close(); await closed;
    assert.equal((await fetch(`${http}/files/${result.ticket}`)).status, 410);
  } finally { mobile.terminate(); agent.terminate(); await relay.close(); }
});
