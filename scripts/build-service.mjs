import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, cpSync, chmodSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { root } from './config.mjs';

export async function buildService(destination, webDirectory) {
  mkdirSync(destination, { recursive: true });
  if (readdirSync(destination).length) throw new Error('服务包必须构建到一个新的空目录。');
  const entries = [
    ['apps/agent/src/index.ts', 'apps/agent/index.mjs'],
    ['apps/relay/src/index.ts', 'apps/relay/index.mjs'],
    ...['lan', 'service', 'service-console', 'connection', 'pairing'].map((name) => [`scripts/${name}.mjs`, `scripts/${name}.mjs`]),
  ];
  for (const [source, output] of entries) {
    await build({
      entryPoints: [resolve(root, source)], outfile: resolve(destination, output),
      bundle: true, platform: 'node', format: 'esm', target: 'node22',
      define: { 'process.env.CODEX_REMOTE_BUNDLE': '"1"' },
      external: ['bufferutil', 'utf-8-validate'],
      banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
      logLevel: 'silent',
    });
  }
  cpSync(webDirectory, resolve(destination, 'apps/mobile/dist'), { recursive: true });
  cpSync(resolve(root, 'service'), resolve(destination, 'service'), { recursive: true });
  for (const name of ['Start-Mac.command', 'Start-Linux.sh', 'Start-Windows.cmd']) {
    const file = resolve(destination, 'service', name);
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('node --import tsx ', 'node '));
  }
  for (const name of ['Start-Mac.command', 'Start-Linux.sh'])
    chmodSync(resolve(destination, 'service', name), 0o755);
  const windowsLauncher = resolve(destination, 'service/Start-Windows.cmd');
  writeFileSync(windowsLauncher, readFileSync(windowsLauncher, 'utf8').replace(/\r?\n/g, '\r\n'));
  cpSync(resolve(root, 'service/使用说明.md'), resolve(destination, 'README.md'));
  writeFileSync(resolve(destination, 'package.json'), JSON.stringify({
    name: 'codex-remote-service', version: '0.1.0', private: true, type: 'module',
    engines: { node: '>=22.13.0' },
    scripts: {
      start: 'node scripts/service.mjs start',
      'service:start': 'node scripts/service.mjs start',
      'service:stop': 'node scripts/service.mjs stop',
      'service:status': 'node scripts/service.mjs status',
      'service:logs': 'node scripts/service.mjs logs',
      'service:console': 'node scripts/service-console.mjs',
      'service:doctor': 'node scripts/service.mjs doctor',
      connection: 'node scripts/connection.mjs', pairing: 'node scripts/pairing.mjs',
      agent: 'node apps/agent/index.mjs', relay: 'node apps/relay/index.mjs',
    },
  }, null, 2) + '\n');
}

export function archiveService(directory, file) {
  const files = {};
  function collect(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name === '.local') continue;
      const full = join(path, entry.name);
      if (entry.isDirectory()) collect(full);
      else {
        const name = 'codex-remote-service/' + relative(directory, full).split('\\').join('/');
        files[name] = [new Uint8Array(readFileSync(full)), { os: 3, attrs: statSync(full).mode << 16 }];
      }
    }
  }
  collect(directory);
  const bytes = zipSync(files, { level: 6 });
  writeFileSync(file, bytes);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(file + '.sha256', `${checksum}  ${file.split(/[\\/]/).pop()}\n`);
  return { file, bytes: bytes.length, sha256: checksum };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(resolve(root, '.local'), { recursive: true });
  const destination = mkdtempSync(resolve(root, '.local/service-build-'));
  try {
    await buildService(destination, resolve(root, 'apps/mobile/dist'));
    console.log(JSON.stringify(archiveService(destination, resolve(root, 'artifacts/codex-remote-service.zip')), null, 2));
  } finally { rmSync(destination, { recursive: true, force: true }); }
}
