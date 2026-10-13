import test from 'node:test';
import assert from 'node:assert/strict';
import type { Device, JsonRecord, WireMessage } from '@codex-remote/protocol';
import { RemoteClient, type ClientState, type Connection } from '../apps/mobile/src/client.js';
import { ConnectionHub } from '../apps/mobile/src/connection-hub.js';
import { connectionProfiles, upsertConnection } from '../apps/mobile/src/connection-profiles.js';

type Event = Extract<WireMessage, { type: 'event' }>;
const first = { server: 'ws://first.test/ws', token: 'first-key-000000000' };
const second = { server: 'ws://second.test/ws', token: 'second-key-00000000' };
class FakeClient extends RemoteClient {
  closed = 0;
  calls: { method: string; params: JsonRecord; deviceId?: string }[] = [];
  states = new Set<(state: ClientState) => void>();
  notifications = new Set<(event: Event) => void>();
  override onState(callback: (state: ClientState) => void) { this.states.add(callback); callback(this.state); return () => { this.states.delete(callback); }; }
  override onEvent(callback: (event: Event) => void) { this.notifications.add(callback); return () => { this.notifications.delete(callback); }; }
  emitState(state: ClientState) { this.state = state; for (const callback of this.states) callback(state); }
  override connect() { this.emitState({ status: 'connected', devices: [{ id: 'copied-id', name: this.connection.server, online: true, platform: 'linux', lastSeen: 1 }] }); }
  override disconnect() { this.closed++; this.emitState({ status: 'disconnected', devices: this.state.devices.map((device) => ({ ...device, online: false })) }); }
  override async request<T>(method: string, params: JsonRecord = {}, deviceId?: string): Promise<T> {
    assert.equal(this.state.status, 'connected');
    this.calls.push({ method, params, deviceId });
    return { projects: [{ id: 'same-project', deviceId }], recentSessions: [{ deviceId, session: { id: 'same-thread' } }] } as T;
  }
}

test('multiple services retain independent sockets, IDs, requests and reconnects when another service is edited or disconnected', async () => {
  const clients: FakeClient[] = [];
  const hub = new ConnectionHub((connection) => { const client = new FakeClient(connection); clients.push(client); return client; });
  const events: Event[] = [];
  hub.onEvent((event) => events.push(event));
  hub.configure([first]); hub.connect();
  const original = clients[0];
  hub.configure([first, second]);
  assert.equal(clients.length, 2);
  assert.equal(original.closed, 0);
  assert.equal(hub.state.devices.filter((device) => device.online).length, 2);
  const firstId = hub.deviceKey(first.server, 'copied-id');
  const secondId = hub.deviceKey(second.server, 'copied-id');
  assert.notEqual(firstId, secondId);
  const result = await hub.request<any>('projects/list', {}, secondId);
  assert.equal(result.projects[0].deviceId, secondId);
  assert.equal(clients[1].calls[0].deviceId, 'copied-id');
  assert.equal(original.calls.length, 0);
  for (const callback of clients[1].notifications) callback({ type: 'event', method: 'session/name', deviceId: 'copied-id', params: { threadId: 'same-thread', name: 'second' } });
  assert.equal(events.at(-1)!.deviceId, secondId);
  hub.configure([{ ...first, token: 'changed-key-0000000' }, second]);
  assert.equal(clients[1].closed, 0);
  hub.configure([{ ...first, token: 'changed-key-0000000', disabled: true }, second]);
  assert.equal(hub.state.status, 'connected');
  assert.equal(hub.state.devices.find((device) => device.id === firstId)!.online, false);
  assert.equal(hub.state.devices.find((device) => device.id === secondId)!.online, true);
  await hub.request('sessions/read', { threadId: 'same-thread' }, secondId);
  assert.equal(clients[1].calls.at(-1)!.method, 'sessions/read');
  assert.equal(clients[1].closed, 0);
  await assert.rejects(hub.request('sessions/read', {}, JSON.stringify(['ws://unknown.test/ws', 'copied-id'])), /请选择已连接的电脑/);
  hub.disconnect();
});

test('saved profiles update credentials in place and preserve independently disabled services', () => {
  const profiles = upsertConnection([first], second);
  assert.deepEqual(upsertConnection(profiles, { ...first, disabled: true }), [{ ...first, disabled: true }, second]);
  assert.deepEqual(connectionProfiles([null, first, { server: 'invalid' }, second]), [first, second]);
});
