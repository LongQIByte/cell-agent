import { hostname, platform } from 'node:os';
import { resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  MAX_WIRE_BYTES,
  requestSchema,
  errorPayload,
  type WireMessage,
} from '@codex-remote/protocol';
import { AgentStore } from './store.js';
import { CodexRpc } from './codex.js';
import { AgentService } from './service.js';
const token = process.env.REMOTE_TOKEN;
if (!token) throw new Error('Set REMOTE_TOKEN or use npm start');
const directory = resolve(process.env.AGENT_DATA_DIR ?? '.local/agent');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const idPath = resolve(directory, 'device-id');
if (!existsSync(idPath)) writeFileSync(idPath, randomUUID(), { mode: 0o600 });
const device = {
  id: process.env.DEVICE_ID ?? readFileSync(idPath, 'utf8').trim(),
  name: process.env.DEVICE_NAME ?? hostname(),
  platform: platform(),
};
const url = new URL(process.env.RELAY_URL ?? 'ws://127.0.0.1:8787/ws');
if (url.pathname === '/') url.pathname = '/ws';
let socket: WebSocket | undefined;
let service: AgentService | undefined;
let stopping = false;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
function send(message: WireMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
async function connect() {
  if (stopping) return;
  try {
    if (!service) {
      const codex = new CodexRpc();
      codex.on('offline', (error) => {
        if (!stopping) console.error(`[agent] ${error.message}`);
        socket?.close(1011, 'Codex exited');
        service?.close();
        service = undefined;
      });
      await codex.ready;
      service = new AgentService(
        codex,
        new AgentStore(resolve(directory, 'agent.sqlite')),
        device.id,
      );
      service.on('event', send);
    }
    const ws = new WebSocket(url, { maxPayload: MAX_WIRE_BYTES });
    socket = ws;
    const authenticate = setTimeout(() => ws.close(4001, 'Handshake timeout'), 10000);
    ws.on('open', () =>
      send({ type: 'hello', role: 'agent', token: token!, version: PROTOCOL_VERSION, device }),
    );
    ws.on('error', () => {});
    ws.on('message', async (raw) => {
      let message: any;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type === 'ready') {
        clearTimeout(authenticate);
        retry = 0;
        console.log(`[agent] ${device.name} connected; native Codex sessions available`);
        return;
      }
      const request = requestSchema.safeParse(message);
      if (!request.success) return;
      try {
        const result = await service!.handle(request.data.method, request.data.params);
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: 'response', id: request.data.id, result }));
      } catch (error) {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(
            JSON.stringify({ type: 'response', id: request.data.id, error: errorPayload(error) }),
          );
      }
    });
    ws.on('close', (code) => {
      clearTimeout(authenticate);
      if (stopping) return;
      if (code === 4001 || code === 4009)
        console.error(
          `[agent] Relay rejected connection (${code}); check key / duplicate device ID`,
        );
      schedule();
    });
  } catch (error) {
    console.error(`[agent] ${error instanceof Error ? error.message : 'Startup failed'}`);
    schedule();
  }
}
function schedule() {
  if (stopping || retryTimer) return;
  retryTimer = setTimeout(
    () => {
      retryTimer = undefined;
      void connect();
    },
    Math.min(10000, 500 * 2 ** Math.min(retry++, 5)),
  );
}
function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(retryTimer);
  socket?.close();
  service?.close();
  setTimeout(() => process.exit(0), 4000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
await connect();
