import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { hostname, networkInterfaces } from 'node:os';
import { execFileSync } from 'node:child_process';
export const root = resolve(import.meta.dirname, '..');
export function lanHost() {
  if (process.env.PUBLIC_HOST) return process.env.PUBLIC_HOST;
  const windowsPowerShell = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
  if (existsSync(windowsPowerShell)) {
    try {
      const address = execFileSync(
        windowsPowerShell,
        [
          '-NoProfile',
          '-Command',
          '(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias WLAN -ErrorAction SilentlyContinue | Where-Object {$_.IPAddress -notlike "169.254.*"} | Select-Object -First 1).IPAddress',
        ],
        { encoding: 'utf8', timeout: 5000 },
      ).trim();
      if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) return address;
    } catch {}
  }
  return (
    Object.values(networkInterfaces())
      .flat()
      .find((a) => a?.family === 'IPv4' && !a.internal)?.address ?? '127.0.0.1'
  );
}
export function configuration() {
  const directory = resolve(root, '.local');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = resolve(directory, 'connection.json');
  const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const token = process.env.REMOTE_TOKEN ?? old.token ?? randomBytes(24).toString('base64url');
  const port = Number(process.env.RELAY_PORT ?? old.port ?? 8787);
  const host = lanHost();
  const tls = !!process.env.TLS_CERT;
  const config = {
    token,
    host,
    port,
    deviceName: process.env.DEVICE_NAME ?? old.deviceName ?? hostname(),
    server: `${tls ? 'wss' : 'ws'}://${host}:${port}/ws`,
    web: `${tls ? 'https' : 'http'}://${host}:${port}`,
    apk: `${tls ? 'https' : 'http'}://${host}:${port}/downloads/codex-remote.apk`,
    devApk: `${tls ? 'https' : 'http'}://${host}:${port}/downloads/codex-remote-dev.apk`,
    metro: `http://${host}:8081`,
    devClient: `codex-remote-dev://expo-development-client/?url=${encodeURIComponent(`http://${host}:8081`)}`,
  };
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  chmodSync(file, 0o600);
  return config;
}
