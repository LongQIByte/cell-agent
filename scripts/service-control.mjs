import { createServer, createConnection } from 'node:net';
import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

export function controlPath(root) {
  const id = createHash('sha256').update(root).digest('hex').slice(0, 20);
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\codex-remote-${id}`
    : resolve(tmpdir(), `cr-${id}.sock`);
}

export async function listenForControl(root, token, status, stop) {
  const path = controlPath(root);
  if (process.platform !== 'win32' && existsSync(path)) unlinkSync(path);
  const server = createServer((socket) => {
    socket.setTimeout(2000, () => socket.destroy());
    socket.on('error', () => {});
    let input = '';
    socket.on('data', (chunk) => {
      input += chunk;
      if (input.length > 4096) return socket.destroy();
      if (!input.includes('\n')) return;
      socket.removeAllListeners('data');
      try {
        const request = JSON.parse(input.slice(0, input.indexOf('\n')));
        const provided = Buffer.from(String(request.token ?? ''));
        const expected = Buffer.from(token);
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
          socket.end(JSON.stringify({ error: '服务控制认证失败' }) + '\n');
          return;
        }
        if (request.action === 'status') socket.end(JSON.stringify(status()) + '\n');
        else if (request.action === 'stop')
          socket.end(JSON.stringify({ stopping: true }) + '\n', () => { void stop(); });
        else socket.end(JSON.stringify({ error: '不支持的操作' }) + '\n');
      } catch {
        socket.destroy();
      }
    });
  });
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(path, () => {
      server.off('error', fail);
      if (process.platform !== 'win32') chmodSync(path, 0o600);
      ok();
    });
  });
  return server;
}

export function requestControl(root, token, action) {
  return new Promise((ok, fail) => {
    const socket = createConnection(controlPath(root));
    socket.setTimeout(2000, () => socket.destroy(new Error('服务控制连接超时')));
    socket.once('error', fail);
    socket.once('connect', () => socket.write(JSON.stringify({ token, action }) + '\n'));
    let input = '';
    socket.on('data', (chunk) => {
      input += chunk;
      if (input.includes('\n')) {
        socket.destroy();
        try {
          const result = JSON.parse(input.slice(0, input.indexOf('\n')));
          if (result.error) fail(new Error(result.error));
          else ok(result);
        } catch (error) { fail(error); }
      }
    });
    socket.once('end', () => {
      if (!input.includes('\n')) fail(new Error('服务控制连接已关闭'));
    });
  });
}
