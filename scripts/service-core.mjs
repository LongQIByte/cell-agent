import { spawn } from 'node:child_process';
import crossSpawn from 'cross-spawn';
import { existsSync, readFileSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '@codex-remote/protocol';
import { CodexRpc } from '../apps/agent/src/codex.ts';
import { configuration, root } from './config.mjs';
import { requestControl } from './service-control.mjs';

export function savedConfiguration() {
  const file = resolve(root, '.local/connection.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

export function relayStatus(config) {
  if (!config) return Promise.resolve({ connected: false, devices: [] });
  return new Promise((ok) => {
    const socket = new WebSocket(config.server);
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); socket.terminate(); ok(value);
    };
    const timer = setTimeout(() => finish({ connected: false, devices: [], error: '中转连接超时' }), 2500);
    socket.on('error', (error) => finish({ connected: false, devices: [], error: error.message }));
    socket.on('open', () => socket.send(JSON.stringify({
      type: 'hello', role: 'mobile', version: PROTOCOL_VERSION, token: config.token,
    })));
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'ready') finish({ connected: true, devices: message.devices });
      } catch { finish({ connected: false, devices: [], error: '中转返回了无效数据' }); }
    });
    socket.on('close', (code) => {
      if (code === 4001) finish({ connected: false, devices: [], error: '配对认证失败' });
    });
  });
}

export async function serviceStatus() {
  const config = savedConfiguration();
  let control = null;
  let error;
  if (config) {
    try { control = await requestControl(root, config.token, 'status'); }
    catch (failure) {
      if (!['ENOENT', 'ECONNREFUSED'].includes(failure.code)) error = failure.message;
    }
  }
  const relay = control ? await relayStatus(config) : { connected: false, devices: [] };
  const idFile = resolve(process.env.AGENT_DATA_DIR ?? resolve(root, '.local/agent'), 'device-id');
  const localId = existsSync(idFile) ? readFileSync(idFile, 'utf8').trim() : null;
  const localAgent = relay.devices.find((device) => device.id === localId);
  return {
    running: !!control, root, platform: process.platform, ...control,
    web: config?.web ?? null, server: config?.server ?? null,
    port: config?.port ?? 8787, deviceName: config?.deviceName ?? null,
    relayConnected: relay.connected, agentOnline: !!localAgent?.online,
    devices: relay.devices, error: error ?? relay.error ?? null,
    logs: { normal: resolve(root, '.local/service.log'), error: resolve(root, '.local/service-error.log') },
  };
}

export async function checkEnvironment() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13))
    throw new Error('请先安装 Node.js 22.13 或更新版本（建议 Node.js 24）。');
  if (!existsSync(resolve(root, 'apps/mobile/dist/index.html')))
    throw new Error('网页尚未构建。源码项目请先运行 npm run web:build；服务 ZIP 包请重新完整解压。');
  const binary = process.env.CODEX_BIN ?? 'codex';
  const result = crossSpawn.sync(binary, ['--version'], {
    cwd: root, encoding: 'utf8', timeout: 5000, windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(`无法运行 Codex（${binary}）。请先安装、配置 Codex；自定义路径可写入 .local/service.env 的 CODEX_BIN。`);
  const codex = new CodexRpc(binary);
  const timeout = setTimeout(() => codex.close(), 7000);
  try {
    await codex.ready;
    await codex.call('project/list', {}, 5000);
  } catch {
    throw new Error(`${result.stdout.trim()} 尚不能提供当前需要的项目接口。请安装已验证的 @openai/codex@0.162.0-alpha.17.2，或在 .local/service.env 的 CODEX_BIN 指定支持该接口的 Codex。`);
  } finally {
    clearTimeout(timeout);
    codex.close();
  }
  return { node: process.version, codex: result.stdout.trim(), binary, root };
}

export async function startService() {
  const current = await serviceStatus();
  if (current.running) return current;
  await checkEnvironment();
  configuration();
  const child = spawn(process.execPath, [resolve(root, 'scripts/lan.mjs')], {
    cwd: root, env: process.env, detached: true, stdio: 'ignore', windowsHide: true,
  });
  let failure;
  child.on('error', (error) => { failure = error; });
  child.unref();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const status = await serviceStatus();
    if (status.running && status.relayConnected && status.agentOnline) return status;
    if (failure) throw failure;
    if (child.exitCode !== null)
      throw new Error('服务启动失败。运行 npm run service:logs 查看原因；检查端口占用及是否有其他启动入口。');
    await delay(250);
  }
  const status = await serviceStatus();
  if (status.pid === child.pid) await stopService();
  throw new Error('Agent 未能连接。运行 npm run service:logs 检查 Codex 配置、配对密钥和服务端口。');
}

export async function stopService() {
  const config = savedConfiguration();
  const current = await serviceStatus();
  if (!current.running) return current;
  await requestControl(root, config.token, 'stop');
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const state = await serviceStatus();
    if (!state.running && !existsSync(resolve(root, '.local/lan.pid'))) return state;
    await delay(100);
  }
  throw new Error('停止服务超时，请查看 service-error.log。');
}

export function serviceLogs(lines = 65) {
  const config = savedConfiguration();
  const tail = (name) => {
    const file = resolve(root, '.local', name);
    if (!existsSync(file)) return '尚无日志。';
    const fd = openSync(file, 'r');
    try {
      const size = statSync(file).size;
      const buffer = Buffer.alloc(Math.min(size, 32 * 1024));
      readSync(fd, buffer, 0, buffer.length, Math.max(0, size - buffer.length));
      let text = buffer.toString('utf8').trimEnd().split('\n').slice(-lines).join('\n');
      if (config?.token) text = text.split(config.token).join('[配对密钥已隐藏]');
      return text;
    } finally { closeSync(fd); }
  };
  return { normal: tail('service.log'), error: tail('service-error.log') };
}
