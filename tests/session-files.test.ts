import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, symlink, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionFiles, FILE_CHUNK_BYTES, markdownFileSources, sessionFilePath } from '../apps/agent/src/session-files.js';

test('remote file paths retain Windows, WSL, Linux and macOS session directories and strip line references', () => {
  assert.equal(sessionFilePath('图%20片.png', '/project'), '/project/图 片.png');
  assert.equal(sessionFilePath('sandbox:/tmp/test.png', '/project'), '/tmp/test.png');
  assert.equal(sessionFilePath('/home/u/result.webm', '\\\\wsl.localhost\\Ubuntu\\home\\u\\project', 'win32'), '\\\\wsl.localhost\\Ubuntu\\home\\u\\result.webm');
  assert.equal(sessionFilePath('//wsl.localhost/Ubuntu/home/u/图 片.webm', 'C:\\project', 'win32'), '\\\\wsl.localhost\\Ubuntu\\home\\u\\图 片.webm');
  assert.equal(sessionFilePath('file:///C:/project/test%20one.txt', 'C:\\project', 'win32'), 'C:\\project\\test one.txt');
  assert.equal(sessionFilePath('C:/project/test.txt:12', 'C:\\other', 'win32'), 'C:\\project\\test.txt');
  assert.deepEqual(markdownFileSources('[报告](<out/报告 one.pdf>)\n[link](https://example.com)\n```\n[example](secret.txt)\n```'), ['out/报告 one.pdf']);
  assert.throws(() => sessionFilePath('javascript:alert(1)', '/project'), /文件链接格式不支持/);
});

test('large files transfer in bounded chunks with exact binary content, cancellation and changed-file errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cell-agent-files-'));
  const files = new SessionFiles();
  try {
    const data = Buffer.alloc(9 * 1024 * 1024 + 17); for (let i = 0; i < data.length; i++) data[i] = i % 251;
    await writeFile(join(root, '视频.webm'), data);
    const file = await files.create('视频.webm', root);
    assert.equal(file.size, data.length); assert.equal(file.mimeType, 'video/webm');
    const received: Buffer[] = [];
    for (let offset = 0; offset < file.size; offset += FILE_CHUNK_BYTES) {
      const chunk = Buffer.from((await files.read(file.id, offset, FILE_CHUNK_BYTES)).data, 'base64');
      assert.ok(chunk.length <= FILE_CHUNK_BYTES); received.push(chunk);
    }
    assert.deepEqual(Buffer.concat(received), data);
    await truncate(join(root, '视频.webm'), 1);
    await assert.rejects(files.read(file.id, 1024, FILE_CHUNK_BYTES), /文件在传输期间发生变化/);
    files.release(file.id); await assert.rejects(files.read(file.id, 0, 1), /已过期/);
    await assert.rejects(files.create('missing.webm', root), /文件不存在/);
    await assert.rejects(files.create('.', root), /普通文件/);
  } finally { files.close(); await rm(root, { recursive: true, force: true }); }
});
