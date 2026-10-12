import { resolve } from 'node:path';
import { createRelay } from './server.js';
const token = process.env.REMOTE_TOKEN;
if (!token) throw new Error('Set REMOTE_TOKEN or use npm start');
const relay = createRelay({
  token,
  dbPath: resolve(process.env.RELAY_DATA_DIR ?? '.local/relay', 'routing.sqlite'),
  host: process.env.RELAY_HOST ?? '0.0.0.0',
  port: Number(process.env.RELAY_PORT ?? 8787),
  webDir: resolve(process.env.WEB_DIR ?? 'apps/mobile/dist'),
  apkPath: resolve('artifacts/codex-remote.apk'),
  devApkPath: resolve('artifacts/codex-remote-dev.apk'),
  tls:
    process.env.TLS_CERT && process.env.TLS_KEY
      ? { cert: process.env.TLS_CERT, key: process.env.TLS_KEY }
      : undefined,
});
await relay.listen();
console.log(
  `[relay] Listening on ${process.env.TLS_CERT ? 'https' : 'http'}://${process.env.RELAY_HOST ?? '0.0.0.0'}:${process.env.RELAY_PORT ?? 8787}`,
);
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await relay.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
