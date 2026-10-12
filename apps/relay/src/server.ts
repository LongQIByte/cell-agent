import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync, statSync, realpathSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  helloSchema,
  requestSchema,
  PROTOCOL_VERSION,
  MAX_WIRE_BYTES,
  type Device,
  type WireMessage,
  type RpcError,
} from '@codex-remote/protocol';

export interface RelayOptions {
  token: string;
  dbPath: string;
  host?: string;
  port?: number;
  webDir?: string;
  apkPath?: string;
  tls?: { cert: string; key: string };
  requestTimeoutMs?: number;
}
type Route = {
  client: WebSocket;
  originalId: string;
  agent: WebSocket;
  timer: ReturnType<typeof setTimeout>;
};
type Peer = {
  socket: WebSocket;
  role?: 'agent' | 'mobile';
  deviceId?: string;
  alive: boolean;
  authTimer: ReturnType<typeof setTimeout>;
  requests: Set<string>;
};
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

export function createRelay(options: RelayOptions) {
  if (options.token.length < 16)
    throw new Error('REMOTE_TOKEN must contain at least 16 characters');
  if (options.dbPath !== ':memory:')
    mkdirSync(dirname(options.dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(options.dbPath);
  db.exec(
    'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, platform TEXT NOT NULL, last_seen INTEGER NOT NULL)',
  );
  const agents = new Map<string, WebSocket>();
  const peers = new Map<WebSocket, Peer>();
  const routes = new Map<string, Route>();
  const digest = createHash('sha256').update(options.token).digest();
  const listDevices = (): Device[] =>
    (
      db.prepare('SELECT * FROM devices ORDER BY rowid').all() as unknown as {
        id: string;
        name: string;
        platform: string;
        last_seen: number;
      }[]
    ).map((d) => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      lastSeen: d.last_seen,
      online: agents.has(d.id),
    }));
  function send(socket: WebSocket, message: WireMessage) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 24 * 1024 * 1024) {
      socket.close(1013, 'Slow connection; reconnect');
      return;
    }
    socket.send(JSON.stringify(message));
  }
  function fail(socket: WebSocket, id: string, error: RpcError) {
    send(socket, { type: 'response', id, error });
  }
  function broadcast(message: WireMessage) {
    for (const peer of peers.values()) if (peer.role === 'mobile') send(peer.socket, message);
  }
  function deviceChanged() {
    broadcast({ type: 'event', method: 'devices/changed', params: { devices: listDevices() } });
  }
  function finishRoute(id: string) {
    const route = routes.get(id);
    if (!route) return;
    clearTimeout(route.timer);
    routes.delete(id);
    peers.get(route.client)?.requests.delete(route.originalId);
  }
  function serve(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://relay').pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (pathname === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({ ok: true, service: 'codex-remote-relay', protocol: PROTOCOL_VERSION }),
      );
      return;
    }
    let file: string | undefined;
    if (pathname === '/downloads/codex-remote.apk') {
      if (!options.apkPath || !existsSync(options.apkPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('APK 尚未准备好。');
        return;
      }
      file = options.apkPath;
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="codex-remote.apk"');
    } else if (options.webDir && existsSync(options.webDir)) {
      const root = realpathSync(options.webDir);
      const candidate = resolve(root, `.${pathname}`);
      if (candidate !== root && !candidate.startsWith(root + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      file =
        existsSync(candidate) && statSync(candidate).isFile()
          ? candidate
          : resolve(root, 'index.html');
      if (!existsSync(file) || !realpathSync(file).startsWith(root + sep)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
    }
    if (!file) {
      res.writeHead(404);
      res.end('Build the web app with npm run web:build');
      return;
    }
    res.setHeader('Cache-Control', extname(file) === '.html' ? 'no-store' : 'no-cache');
    res.setHeader('Content-Length', statSync(file).size);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    try {
      res.end(readFileSync(file));
    } catch {
      res.writeHead(500);
      res.end();
    }
  }
  const server = options.tls
    ? createHttpsServer(
        { cert: readFileSync(options.tls.cert), key: readFileSync(options.tls.key) },
        serve,
      )
    : createHttpServer(serve);
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_WIRE_BYTES,
    perMessageDeflate: false,
  });
  wss.on('connection', (socket) => {
    if (peers.size >= 128) {
      socket.close(1013, 'Too many connections');
      return;
    }
    const peer: Peer = {
      socket,
      alive: true,
      requests: new Set(),
      authTimer: setTimeout(() => socket.close(4001, 'Authentication required'), 8000),
    };
    peers.set(socket, peer);
    socket.on('pong', () => {
      peer.alive = true;
    });
    socket.on('error', () => {});
    socket.on('message', (raw) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        socket.close(1007, 'Invalid JSON');
        return;
      }
      if (!message || typeof message !== 'object') {
        socket.close(1007, 'Invalid message');
        return;
      }
      if (!peer.role) {
        const parsed = helloSchema.safeParse(message);
        if (
          !parsed.success ||
          !timingSafeEqual(digest, createHash('sha256').update(parsed.data.token).digest())
        ) {
          socket.close(4001, 'Invalid pairing key or protocol version');
          return;
        }
        const hello = parsed.data;
        if (hello.role === 'agent' && !hello.device) {
          socket.close(1008, 'Device required');
          return;
        }
        if (hello.role === 'agent' && agents.has(hello.device!.id)) {
          socket.close(4009, 'Device already connected');
          return;
        }
        clearTimeout(peer.authTimer);
        peer.role = hello.role;
        if (hello.role === 'agent') {
          peer.deviceId = hello.device!.id;
          agents.set(peer.deviceId, socket);
          db.prepare(
            'INSERT INTO devices VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, platform=excluded.platform, last_seen=excluded.last_seen',
          ).run(peer.deviceId, hello.device!.name, hello.device!.platform, Date.now());
        }
        send(socket, { type: 'ready', version: PROTOCOL_VERSION, devices: listDevices() });
        if (peer.role === 'agent') deviceChanged();
        return;
      }
      if (peer.role === 'mobile') {
        const parsed = requestSchema.safeParse(message);
        if (!parsed.success) {
          if (typeof message.id === 'string')
            fail(socket, message.id, { code: 'INVALID_REQUEST', message: '无效的请求' });
          else socket.close(1008, 'Invalid request');
          return;
        }
        const request = parsed.data;
        if (request.method === 'devices/list') {
          send(socket, { type: 'response', id: request.id, result: { devices: listDevices() } });
          return;
        }
        if (peer.requests.has(request.id)) {
          fail(socket, request.id, { code: 'DUPLICATE_REQUEST', message: '请求正在处理' });
          return;
        }
        if (peer.requests.size >= 64) {
          fail(socket, request.id, { code: 'OVERLOADED', message: '请求过多，请稍后再试' });
          return;
        }
        const agent = agents.get(request.deviceId ?? '');
        if (!agent || agent.readyState !== WebSocket.OPEN) {
          fail(socket, request.id, {
            code: 'DEVICE_OFFLINE',
            message: '电脑已离线，请检查本地 Agent',
          });
          return;
        }
        const routeId = randomUUID();
        peer.requests.add(request.id);
        const timer = setTimeout(() => {
          fail(socket, request.id, {
            code: 'TIMEOUT',
            message: '电脑响应超时，请检查连接。任务可能仍在运行，请重新打开会话查看。',
          });
          finishRoute(routeId);
        }, options.requestTimeoutMs ?? 90000);
        routes.set(routeId, { client: socket, originalId: request.id, agent, timer });
        send(agent, { ...request, id: routeId });
        return;
      }
      if (message.type === 'response' && typeof message.id === 'string') {
        const route = routes.get(message.id);
        if (!route || route.agent !== socket) return;
        send(route.client, {
          type: 'response',
          id: route.originalId,
          ...(message.error ? { error: message.error as RpcError } : { result: message.result }),
        });
        finishRoute(message.id);
      } else if (
        message.type === 'event' &&
        typeof message.method === 'string' &&
        message.params &&
        typeof message.params === 'object'
      ) {
        broadcast({
          type: 'event',
          deviceId: peer.deviceId,
          method: message.method,
          params: message.params as Record<string, unknown>,
        });
      }
    });
    socket.on('close', () => {
      clearTimeout(peer.authTimer);
      peers.delete(socket);
      if (peer.deviceId && agents.get(peer.deviceId) === socket) {
        agents.delete(peer.deviceId);
        db.prepare('UPDATE devices SET last_seen=? WHERE id=?').run(Date.now(), peer.deviceId);
        deviceChanged();
      }
      for (const [id, route] of routes) {
        if (route.agent === socket) {
          fail(route.client, route.originalId, {
            code: 'DEVICE_OFFLINE',
            message: '电脑连接中断。任务可能仍在运行，请在重连后查看会话。',
          });
          finishRoute(id);
        } else if (route.client === socket) finishRoute(id);
      }
    });
  });
  const heartbeat = setInterval(() => {
    for (const peer of peers.values()) {
      if (!peer.alive) {
        peer.socket.terminate();
        continue;
      }
      peer.alive = false;
      peer.socket.ping();
    }
  }, 25000);
  heartbeat.unref();
  return {
    server,
    listDevices,
    async listen() {
      await new Promise<void>((ok, fail) => {
        server.once('error', fail);
        server.listen(options.port ?? 8787, options.host ?? '0.0.0.0', () => {
          server.off('error', fail);
          ok();
        });
      });
      return server.address();
    },
    async close() {
      clearInterval(heartbeat);
      for (const peer of peers.values()) peer.socket.terminate();
      for (const id of routes.keys()) finishRoute(id);
      await new Promise<void>((ok) => wss.close(() => ok()));
      await new Promise<void>((ok) => server.close(() => ok()));
      db.close();
    },
  };
}
