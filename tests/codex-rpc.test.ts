import test from 'node:test';
import assert from 'node:assert/strict';
import { RemoteError } from '@codex-remote/protocol';
import { codexRpcError } from '../apps/agent/src/codex.js';

test('observed missing project API method-enum errors become concise actionable upgrade errors', () => {
  // Codex 0.146 reports its unsupported top-level RPC as -32600 and lists
  // the entire supported method enum, rather than returning -32601.
  const message = 'Invalid request: unknown variant `project/list`, expected one of `initialize`, `thread/start`, `thread/resume`, `thread/list`, `turn/start`, `turn/interrupt`, `model/list`, `config/read`';
  const error = codexRpcError('project/list', { code: -32600, message });
  assert.ok(error instanceof RemoteError);
  assert.equal(error.code, 'CODEX_UNSUPPORTED_API');
  assert.match(error.message, /不支持 project\/list/);
  assert.match(error.message, /更新电脑上的 Codex CLI/);
  assert.match(error.message, /CODEX_BIN/);
  assert.equal(error.message.includes('expected one of'), false);
});

test('explicit unknown-method and standard method-not-found errors use the same upgrade contract', () => {
  for (const message of ['Unknown method: project/list', 'unknown method `project/list`']) {
    const error = codexRpcError('project/list', { code: -32600, message });
    assert.equal(error.code, 'CODEX_UNSUPPORTED_API');
  }
  const error = codexRpcError('project/read', { code: -32601, message: 'Method not found' });
  assert.equal(error.code, 'CODEX_UNSUPPORTED_API');
  assert.match(error.message, /不支持 project\/read/);
});

test('invalid request and parameter errors retain their original codes and diagnostics', () => {
  const cases = [
    { method: 'thread/read', code: -32600, message: 'Invalid request: missing field `threadId`' },
    { method: 'turn/start', code: -32600, message: 'Invalid request: unknown variant `ultra`, expected one of `low`, `medium`, `high`' },
    { method: 'model/list', code: -32600, message: 'Invalid request: unknown variant `project/list`, expected one of `initialize`, `thread/start`' },
    { method: 'project/list', code: -32600, message: 'Invalid request: input.metadata: unknown method `project/list`' },
    { method: 'project/list', code: -32602, message: 'Unknown method: project/list' },
  ];
  for (const { method, code, message } of cases) {
    const error = codexRpcError(method, { code, message });
    assert.equal(error.code, `CODEX_${code}`);
    assert.equal(error.message, message);
  }
});
