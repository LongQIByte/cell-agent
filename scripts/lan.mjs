import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import QRCode from 'qrcode';
import { configuration, root } from './config.mjs';
import { listenForControl } from './service-control.mjs';
import { serviceLogger } from './service-log.mjs';
const pidFile = resolve(root, '.local/lan.pid');
if (existsSync(pidFile)) {
  const previousPid = Number(readFileSync(pidFile, 'utf8'));
  if (Number.isInteger(previousPid) && previousPid > 0) {
    try {
      process.kill(previousPid, 0);
      console.error(`Codex Remote is already running (PID ${previousPid}).`);
      process.exit(1);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  unlinkSync(pidFile);
}
const config = configuration();
const log = serviceLogger(root, config.token);
const dev = process.argv.includes('--dev');
const bundled = process.env.CODEX_REMOTE_BUNDLE === '1';
if (dev && bundled) throw new Error('服务包不包含手机开发环境；请在源码项目中运行 npm run dev。');
if (dev)
  await QRCode.toFile(resolve(root, '.local/dev-client.png'), config.devClient, {
    width: 480,
    margin: 3,
  });
if (!dev && !existsSync(resolve(root, 'apps/mobile/dist/index.html'))) {
  console.error('First run npm run web:build, or use npm run dev.');
  process.exit(1);
}
const env = {
  ...process.env,
  REMOTE_TOKEN: config.token,
  DEVICE_NAME: config.deviceName,
  RELAY_PORT: String(config.port),
  RELAY_URL:
    process.env.RELAY_URL ?? `${process.env.TLS_CERT ? 'wss' : 'ws'}://127.0.0.1:${config.port}/ws`,
  NODE_NO_WARNINGS: '1',
};
const children = [];
function start(args, extra = {}) {
  const component = args.some((arg) => arg.includes('apps/agent')) ? 'agent'
    : args.some((arg) => arg.includes('apps/relay')) ? 'relay' : 'metro';
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: component === 'metro' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: { ...env, ...extra },
  });
  children.push(child);
  for (const [stream, error] of [[child.stdout, false], [child.stderr, true]])
    if (stream) createInterface({ input: stream }).on('line', (line) => log(component, line, error));
  child.on('error', (error) => { log(component, error.message, true); void stop(1); });
  child.on('close', (code) => {
    if (!stopping) {
      log(component, `进程退出，代码 ${code ?? 1}`, true);
      void stop(code || 1);
    }
  });
  return child;
}
let stopping = false;
writeFileSync(pidFile, String(process.pid), { flag: 'wx', mode: 0o600 });
let control;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  log('service', '正在停止服务');
  control?.close();
  await Promise.all(children.map((child) => new Promise((ok) => {
    if (child.exitCode !== null || !child.pid) return ok();
    child.once('exit', ok);
    if (process.platform === 'win32') {
      const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
      killer.on('error', () => child.kill());
    } else child.kill('SIGTERM');
    const timer = setTimeout(() => { child.kill('SIGKILL'); ok(); }, 5000);
    timer.unref();
  })));
  try {
    unlinkSync(pidFile);
  } catch {}
  log('service', '服务已停止');
  process.exit(code);
}
process.on('SIGINT', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
const startedAt = new Date().toISOString();
try {
  control = await listenForControl(root, config.token, () => ({
    pid: process.pid, root, startedAt, mode: dev ? 'development' : 'service',
    deviceName: config.deviceName, port: config.port,
    command: `${process.execPath} scripts/lan.mjs${dev ? ' --dev' : ''}`,
    codex: process.env.CODEX_BIN ?? 'codex',
    childPids: children.map((child) => child.pid),
  }), stop);
} catch (error) {
  log('service', error.message, true);
  await stop(1);
}
start(bundled ? ['apps/relay/index.mjs'] : ['--import', 'tsx', 'apps/relay/src/index.ts']);
start(bundled ? ['apps/agent/index.mjs'] : ['--import', 'tsx', 'apps/agent/src/index.ts']);
if (dev)
  start([
    'node_modules/expo/bin/cli', 'start', 'apps/mobile', '--dev-client',
    '--host', 'lan', '--port', '8081', '--scheme', 'codex-remote-dev',
  ], {
    CI: undefined,
    NODE_ENV: 'development',
    APP_VARIANT: 'development',
    REACT_NATIVE_PACKAGER_HOSTNAME: config.host,
  });
log('service', `Codex Remote · PID ${process.pid} · ${root}`);
log('service', `网页：${config.web}`);
log('service', `手机服务地址：${config.server}`);
log('service', `日志：${resolve(root, '.local/service.log')}`);
log('service', '配对密钥保存在 .local/connection.json；运行 npm run connection 查看。');
if (dev)
  console.log(
    `Development APK: ${config.devApk}\nMetro: ${config.metro}\nOpen on phone: ${config.devClient}\nUSB phone: npm run android:dev:open\nSave JS/TS files to refresh the phone automatically.`,
  );
console.log('On WSL, run deploy/setup-windows-lan.ps1 once as Windows Administrator.');
