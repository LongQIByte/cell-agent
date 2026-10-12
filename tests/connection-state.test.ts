import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computerStatus,
  connectionError,
  savedConnection,
} from '../apps/mobile/src/connection-state.js';

test('computer availability is confirmed only by an authenticated connection and a live device', () => {
  assert.equal(computerStatus({ status: 'connected' }, { online: true }), '在线');
  assert.equal(computerStatus({ status: 'connected' }, { online: false }), '未知');
  for (const status of ['connecting', 'reconnecting', 'disconnected', 'error'] as const)
    assert.equal(computerStatus({ status }, { online: true }), '未知');
});

test('connection configuration is validated and normalized without requiring authentication', () => {
  assert.deepEqual(savedConnection('http://relay.test:8787', '  valid-format-incorrect-key  '), {
    server: 'ws://relay.test:8787/ws',
    token: 'valid-format-incorrect-key',
  });
  assert.throws(() => savedConnection('file:///tmp/relay', 'valid-format-incorrect-key'), /有效/);
  assert.throws(() => savedConnection('ws://relay.test', 'short'), /完整配对密钥/);
  assert.throws(() => savedConnection('ws://relay.test', 'x'.repeat(257)), /完整配对密钥/);
});

test('save and connection errors redact both edited and saved pairing keys', () => {
  const saved = 'saved-fixture-key-0000';
  const edited = 'edited-fixture-key-1111';
  const message = connectionError(new Error(`Failed with ${saved} and ${edited}`), [saved, edited]);
  assert.equal(message, 'Failed with •••••• and ••••••');
  assert.equal(connectionError(undefined, []), '保存连接失败，请重试');
});
