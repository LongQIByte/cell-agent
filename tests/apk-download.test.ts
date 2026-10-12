import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRelay } from '../apps/relay/src/server.js';

test('release and development APK downloads stay distinct and missing APKs return 404', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codex-remote-download-'));
  const apkPath = join(directory, 'release.apk');
  const devApkPath = join(directory, 'development.apk');
  await writeFile(apkPath, 'release-apk');
  await writeFile(devApkPath, 'development-apk');
  // Missing APKs must not fall through to the browser's index.html.
  await writeFile(join(directory, 'index.html'), '<html>web</html>');
  const relay = createRelay({
    token: 'test-key-with-at-least-sixteen-characters',
    dbPath: ':memory:',
    host: '127.0.0.1',
    port: 0,
    webDir: directory,
    apkPath,
    devApkPath,
  });
  try {
    const { port } = await relay.listen() as { port: number };
    for (const [name, content] of [['codex-remote', 'release-apk'], ['codex-remote-dev', 'development-apk']]) {
      const url = `http://127.0.0.1:${port}/downloads/${name}.apk`;
      const response = await fetch(url);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/vnd.android.package-archive');
      assert.equal(response.headers.get('content-disposition'), `attachment; filename="${name}.apk"`);
      assert.equal(await response.text(), content);
      const head = await fetch(url, { method: 'HEAD' });
      assert.equal(head.headers.get('content-length'), String(content.length));
      assert.equal(await head.text(), '');
    }
    await rm(devApkPath);
    const missing = await fetch(`http://127.0.0.1:${port}/downloads/codex-remote-dev.apk`);
    assert.equal(missing.status, 404);
  } finally {
    await relay.close();
    await rm(directory, { recursive: true, force: true });
  }
});
