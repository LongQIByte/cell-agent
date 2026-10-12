import { spawn as spawnNative, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'cross-spawn';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { RemoteError, type JsonRecord } from '@codex-remote/protocol';

export function codexRpcError(method: string, error: { code: number; message: string }): RemoteError {
  // Method-enum decoding can report -32600 instead of method-not-found. Match
  // this RPC's exact method so malformed parameter enums keep their real error.
  const unknownMethod = /^(?:Invalid request:\s*)?unknown (?:variant|method)(?:\s*:\s*|\s+)(?:`([^`]+)`|'([^']+)'|"([^"]+)"|([^\s,]+))/i.exec(error.message);
  const unavailable = error.code === -32601 || (
    error.code === -32600 &&
    unknownMethod !== null &&
    (unknownMethod[1] ?? unknownMethod[2] ?? unknownMethod[3] ?? unknownMethod[4]) === method
  );
  return new RemoteError(
    unavailable ? 'CODEX_UNSUPPORTED_API' : `CODEX_${error.code}`,
    unavailable
      ? `当前 Codex 不支持 ${method}，请更新电脑上的 Codex CLI 并配置新版 CODEX_BIN`
      : error.message,
  );
}

// App Server uses newline-delimited JSON-RPC over stdio. Codex owns all history,
// authentication, tools and execution policies; this class is only a transport.
export class CodexRpc extends EventEmitter {
  private child: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<
    number,
    {
      method: string;
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private stopped = false;
  readonly ready: Promise<void>;
  constructor(binary = process.env.CODEX_BIN ?? 'codex') {
    super();
    this.child = spawn(binary, ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      let message: any;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.id !== undefined && !message.method) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) pending.reject(codexRpcError(pending.method, message.error));
        else pending.resolve(message.result);
      } else if (message.method) {
        this.emit(message.id === undefined ? 'notification' : 'request', message);
      }
    });
    // Keep stderr drained. It can contain local paths and provider diagnostics,
    // which should not become a transcript or relay log.
    this.child.stderr.on('data', () => {});
    this.child.stdin.on('error', () => {});
    const ended = (error: Error) => {
      if (this.stopped) return;
      this.stopped = true;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
      this.emit('offline', error);
    };
    this.child.on('error', (error) =>
      ended(new RemoteError('CODEX_UNAVAILABLE', `无法启动 Codex：${error.message}`)),
    );
    this.child.on('exit', (code, signal) =>
      ended(new RemoteError('CODEX_EXITED', `Codex App Server 已退出（${signal ?? code}）`)),
    );
    this.ready = this.call('initialize', {
      clientInfo: { name: 'codex_remote', title: 'Codex Remote', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    }).then(() => this.write({ method: 'initialized', params: {} }));
  }
  private write(message: unknown) {
    if (this.stopped || !this.child.stdin.writable)
      throw new RemoteError('CODEX_OFFLINE', 'Codex 已离线');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  call<T = any>(method: string, params: JsonRecord = {}, timeoutMs = 60000): Promise<T> {
    if (this.stopped) return Promise.reject(new RemoteError('CODEX_OFFLINE', 'Codex 已离线'));
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RemoteError('CODEX_TIMEOUT', `${method} 响应超时`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  respond(id: number | string, result: unknown) {
    this.write({ id, result });
  }
  rejectRequest(id: number | string, message: string) {
    this.write({ id, error: { code: -32601, message } });
  }
  close() {
    if (this.stopped) return;
    if (process.platform === 'win32' && this.child.pid) {
      const killer = spawnNative('taskkill.exe', ['/pid', String(this.child.pid), '/t', '/f'], {
        windowsHide: true,
      });
      killer.on('error', () => this.child.kill());
      return;
    }
    this.child.kill('SIGTERM');
    const force = setTimeout(() => this.child.kill('SIGKILL'), 3000);
    force.unref();
  }
}
