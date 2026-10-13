import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.METRO_PORT ?? 8081);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('METRO_PORT 必须是 1–65535 的端口号');
const child = spawn(process.execPath, [resolve(root, 'node_modules/expo/bin/cli'), 'start',
  resolve(root, 'apps/mobile'), '--dev-client', '--host', 'lan', '--port', String(port), '--scheme', 'codex-remote-dev'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, APP_VARIANT: 'development', NODE_ENV: 'development', CI: undefined },
});
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
