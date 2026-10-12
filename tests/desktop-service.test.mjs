import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { unzipSync } from 'fflate';
import { buildService, archiveService } from '../scripts/build-service.mjs';
import { requestControl } from '../scripts/service-control.mjs';

const run = promisify(execFile);
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
async function unusedPort() {
  const server = createServer();
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  await new Promise((ok) => server.close(ok));
  return port;
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

test('portable package: real relay, Codex shim with spaces, lifecycle, console access, logs and restart identity', { timeout: 120000 }, async () => {
  const directory = realpathSync(mkdtempSync(resolve(tmpdir(), 'Codex Remote service test-')));
  const packaged = resolve(directory, 'portable service');
  const web = resolve(directory, 'web');
  mkdirSync(web);
  writeFileSync(resolve(web, 'index.html'), '<!doctype html><title>Portable web fixture</title>');
  await buildService(packaged, web);
  const zip = resolve(directory, 'service.zip');
  archiveService(packaged, zip);
  const entries = Object.keys(unzipSync(readFileSync(zip)));
  assert(entries.includes('codex-remote-service/apps/agent/index.mjs'));
  assert(!entries.some((name) => /node_modules|\.local|\.env|\.sqlite/.test(name)));
  assert(!readFileSync(resolve(packaged, 'service/Start-Windows.cmd'), 'utf8').includes('--import tsx'));
  assert(!existsSync(resolve(packaged, 'node_modules')));
  const fixture = resolve(directory, 'mock codex.mjs');
  writeFileSync(fixture, `
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
if (process.argv.includes('--version')) { console.log('codex-cli service-fixture'); process.exit(0); }
writeFileSync(process.env.FIXTURE_PID_FILE, String(process.pid));
createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  if (message.id !== undefined) process.stdout.write(JSON.stringify({id:message.id,result:{}})+'\\n');
});
`);
  const binary = resolve(directory, process.platform === 'win32' ? 'codex with spaces.cmd' : 'codex with spaces');
  writeFileSync(binary, process.platform === 'win32'
    ? `@echo off\r\n"${process.execPath}" "${fixture}" %*\r\n`
    : `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixture)} "$@"\n`);
  chmodSync(binary, 0o755);
  const pidFile = resolve(directory, 'mock-codex.pid');
  const env = {
    ...process.env, CODEX_BIN: binary, PUBLIC_HOST: '127.0.0.1',
    RELAY_PORT: String(await unusedPort()), DEVICE_NAME: 'Portable test computer',
    FIXTURE_PID_FILE: pidFile, NODE_NO_WARNINGS: '1',
  };
  delete env.REMOTE_TOKEN;
  delete env.RELAY_URL;
  delete env.AGENT_DATA_DIR;
  delete env.RELAY_DATA_DIR;
  delete env.TLS_CERT;
  delete env.TLS_KEY;
  delete env.CODEX_REMOTE_BUNDLE;
  const command = (action, ...args) => run(process.execPath, ['scripts/service.mjs', action, ...args], {
    cwd: packaged, env, timeout: 25000,
  });
  const status = async () => JSON.parse((await command('status', '--json')).stdout);
  let consoleProcess;
  try {
    assert.equal((await status()).running, false);
    await command('start');
    const first = await status();
    assert(first.running && first.agentOnline && first.relayConnected);
    assert.equal(first.root, packaged);
    assert.equal(first.port, Number(env.RELAY_PORT));
    assert.equal(first.devices.length, 1);
    assert.equal(await (await fetch(first.web + '/health')).json().then((value) => value.ok), true);
    assert((await (await fetch(first.web)).text()).includes('Portable web fixture'));
    await command('start');
    assert.equal((await status()).pid, first.pid, 'repeated start keeps the same supervisor');
    const pairing = JSON.parse(readFileSync(resolve(packaged, '.local/connection.json'), 'utf8'));
    const device = readFileSync(resolve(packaged, '.local/agent/device-id'), 'utf8');
    await assert.rejects(requestControl(packaged, 'incorrect-token', 'stop'), /认证失败/);
    assert((await status()).agentOnline, 'unauthenticated stop does not stop the service');
    assert(!(await command('logs')).stdout.includes(pairing.token));
    assert(!(await status()).token);
    consoleProcess = spawn(process.execPath, ['scripts/service-console.mjs'], { cwd: packaged, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const consoleURL = await new Promise((ok, fail) => {
      const timeout = setTimeout(() => fail(new Error('console startup timeout')), 7000);
      consoleProcess.on('error', fail);
      consoleProcess.stdout.on('data', (chunk) => {
        output += chunk;
        const found = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (found) { clearTimeout(timeout); ok(found[0]); }
      });
    });
    const html = await (await fetch(consoleURL)).text();
    assert(html.includes('这台电脑，连接手机'));
    assert(!html.includes(pairing.token));
    const api = await (await fetch(consoleURL + '/api/status')).json();
    assert(api.status.agentOnline);
    assert(api.logs.normal.includes('connected; native Codex sessions available'));
    assert.equal((await fetch(consoleURL + '/api/stop', { method: 'POST' })).status, 403);
    assert.equal((await fetch(consoleURL + '/api/status', { headers: { Origin: 'https://untrusted.invalid' } })).status, 403);
    const forgedHostStatus = await new Promise((ok, fail) => {
      const request = httpRequest(consoleURL + '/api/status', { headers: { Host: 'untrusted.invalid' } }, (response) => {
        response.resume(); ok(response.statusCode);
      });
      request.on('error', fail); request.end();
    });
    assert.equal(forgedHostStatus, 403);
    const consoleToken = html.match(/const token = '([0-9a-f]+)'/)[1];
    const codexPid = Number(readFileSync(pidFile, 'utf8'));
    const response = await fetch(consoleURL + '/api/stop', { method: 'POST', headers: { 'X-Console-Token': consoleToken } });
    assert.equal(response.status, 200);
    assert.equal((await status()).running, false);
    for (let count = 0; count < 40 && alive(codexPid); count++) await delay(100);
    assert.equal(alive(codexPid), false, 'stop also stops the native Codex process');
    assert(!existsSync(resolve(packaged, '.local/lan.pid')));
    assert((await command('logs')).stdout.includes('服务已停止'));
    await command('start');
    const second = await status();
    assert(second.agentOnline);
    assert.notEqual(second.pid, first.pid);
    assert.equal(JSON.parse(readFileSync(resolve(packaged, '.local/connection.json'), 'utf8')).token, pairing.token);
    assert.equal(readFileSync(resolve(packaged, '.local/agent/device-id'), 'utf8'), device);
    archiveService(packaged, zip);
    assert(!Object.keys(unzipSync(readFileSync(zip))).some((name) => name.includes('.local')));
    await command('stop');
    const occupied = createServer((socket) => socket.resume());
    await new Promise((ok) => occupied.listen(Number(env.RELAY_PORT), '0.0.0.0', ok));
    try {
      await assert.rejects(command('start'), /启动失败|未能连接/);
      assert.equal((await status()).running, false);
      assert(!existsSync(resolve(packaged, '.local/lan.pid')));
      assert((await command('logs')).stdout.includes('EADDRINUSE'));
    } finally { await new Promise((ok) => occupied.close(ok)); }
    env.CODEX_BIN = resolve(directory, 'missing-codex');
    await assert.rejects(command('start'), /无法运行 Codex/);
    assert.equal((await status()).running, false);
  } finally {
    await command('stop').catch(() => {});
    if (consoleProcess) {
      const closed = new Promise((ok) => consoleProcess.once('exit', ok));
      consoleProcess.kill();
      await closed;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
