import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItem } from '../apps/agent/src/normalize.js';
import { executionDiagnostics } from '../apps/agent/src/execution-diagnostics.js';
const output = 'Failed to create unified exec process:\nhelper_unknown_error: setup refresh had errors';
test('Windows helper initialization errors retain evidence and explain process-creation diagnostics', () => {
  for (const timestamp of [1, Date.now()]) {
    const item = normalizeItem({ type: 'commandExecution', id: 'cmd', command: '"C:\\Users\\tester\\runtime\\pwsh.exe" -Command "Get-Location"', aggregatedOutput: output, exitCode: -1 }, 'turn', timestamp)!;
    assert.ok(item.details!.startsWith(output));
    assert.match(item.details!, /命令进程尚未创建/);
    assert.match(item.details!, /Windows 运行账号/);
    assert.match(item.details!, /windows-runtime-diagnostics.ps1/);
    assert.match(item.details!, /退出码：-1/);
  }
});
test('other failures and successful commands are not diagnosed as Windows setup errors', () => {
  assert.equal(executionDiagnostics('pwsh.exe', output, 0), '');
  assert.equal(executionDiagnostics('pwsh.exe', 'rg: command not found', 127), '');
  assert.equal(executionDiagnostics('pwsh.exe', 'helper_unknown_error: another error', -1), '');
  assert.ok(!executionDiagnostics('/bin/bash', output, -1).includes('Windows'));
});
