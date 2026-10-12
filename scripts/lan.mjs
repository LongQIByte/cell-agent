import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { configuration, root } from './config.mjs';
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
const dev = process.argv.includes('--dev');
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
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...env, ...extra },
  });
  children.push(child);
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
  return child;
}
let stopping = false;
writeFileSync(pidFile, String(process.pid), { flag: 'wx', mode: 0o600 });
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  try {
    unlinkSync(pidFile);
  } catch {}
  setTimeout(() => process.exit(code), 4500).unref();
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
start(['--import', 'tsx', 'apps/relay/src/index.ts']);
start(['--import', 'tsx', 'apps/agent/src/index.ts']);
if (dev)
  start(['node_modules/expo/bin/cli', 'start', 'apps/mobile', '--web', '--host', 'lan'], {
    CI: '1',
  });
console.log(
  `\nCodex Remote\nWeb: ${config.web}\nWebSocket: ${config.server}\nAPK: ${config.apk}\nPairing key: saved in .local/connection.json (npm run connection)\n`,
);
console.log('On WSL, run deploy/setup-windows-lan.ps1 once as Windows Administrator.');
