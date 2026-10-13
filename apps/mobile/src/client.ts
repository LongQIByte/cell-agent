import {
  PROTOCOL_VERSION,
  RemoteError,
  type Device,
  type JsonRecord,
  type WireMessage,
} from '@codex-remote/protocol';
export interface Connection {
  server: string;
  token: string;
  disabled?: boolean;
}
export type ConnectionStatus =
  'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export interface ClientState {
  status: ConnectionStatus;
  devices: Device[];
  error?: string;
}
type Listener = (state: ClientState) => void;
type EventListener = (event: Extract<WireMessage, { type: 'event' }>) => void;
export function websocketUrl(input: string) {
  const value = input.trim();
  const url = new URL(value.includes('://') ? value : `ws://${value}`);
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (!['ws:', 'wss:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new Error('请输入有效的 ws:// 或 wss:// 服务地址');
  if (url.pathname === '/' || !url.pathname) url.pathname = '/ws';
  url.hash = '';
  url.search = '';
  return url.toString();
}
export class RemoteClient {
  private socket?: WebSocket;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private authTimer?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private retry = 0;
  private counter = 0;
  private listeners = new Set<Listener>();
  private events = new Set<EventListener>();
  private pending = new Map<
    string,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  state: ClientState = { status: 'disconnected', devices: [] };
  constructor(readonly connection: Connection) {}
  onState(listener: Listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
  onEvent(listener: EventListener) {
    this.events.add(listener);
    return () => {
      this.events.delete(listener);
    };
  }
  private update(patch: Partial<ClientState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
  connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    )
      return;
    clearTimeout(this.retryTimer);
    this.stopped = false;
    let url: string;
    try {
      url = websocketUrl(this.connection.server);
    } catch (error) {
      this.update({ status: 'error', error: (error as Error).message });
      return;
    }
    this.update({ status: this.retry ? 'reconnecting' : 'connecting', error: undefined });
    const socket = new WebSocket(url);
    this.socket = socket;
    this.authTimer = setTimeout(() => socket.close(), 10000);
    socket.onopen = () => {
      if (socket !== this.socket) return;
      socket.send(
        JSON.stringify({
          type: 'hello',
          role: 'mobile',
          token: this.connection.token,
          version: PROTOCOL_VERSION,
        }),
      );
    };
    socket.onmessage = (event) => {
      if (socket !== this.socket) return;
      let message: WireMessage;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type === 'ready') {
        if (message.version !== PROTOCOL_VERSION) {
          socket.close(4002, 'Protocol version mismatch');
          return;
        }
        clearTimeout(this.authTimer);
        this.retry = 0;
        this.update({ status: 'connected', devices: message.devices, error: undefined });
      } else if (message.type === 'response') {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error)
          pending.reject(new RemoteError(message.error.code, message.error.message));
        else pending.resolve(message.result);
      } else if (message.type === 'event') {
        if (message.method === 'devices/changed')
          this.update({ devices: message.params.devices as Device[] });
        for (const listener of this.events) listener(message);
      }
    };
    socket.onerror = () => {};
    socket.onclose = (event) => {
      if (socket !== this.socket) return;
      this.socket = undefined;
      clearTimeout(this.authTimer);
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(
          new RemoteError(
            'CONNECTION_LOST',
            '连接中断。任务可能仍在电脑上运行，请重连后查看会话。',
          ),
        );
      }
      this.pending.clear();
      if (this.stopped) return;
      if (event.code === 4001 || event.code === 4002) {
        this.stopped = true;
        this.update({
          status: 'error',
          error: event.code === 4002
            ? '手机与电脑服务版本不一致，请更新手机应用并重启电脑服务'
            : '配对密钥不正确，请在 Settings 中重新填写',
          devices: this.state.devices.map((d) => ({ ...d, online: false })),
        });
        return;
      }
      this.update({
        status: 'reconnecting',
        devices: this.state.devices.map((d) => ({ ...d, online: false })),
      });
      this.retryTimer = setTimeout(
        () => this.connect(),
        Math.min(10000, 500 * 2 ** Math.min(this.retry++, 5)) + Math.random() * 250,
      );
    };
  }
  request<T>(method: string, params: JsonRecord = {}, deviceId?: string): Promise<T> {
    if (this.state.status !== 'connected' || this.socket?.readyState !== WebSocket.OPEN)
      return Promise.reject(
        new RemoteError('NOT_CONNECTED', '尚未连接电脑，请检查 Settings 中的服务地址'),
      );
    const id = `m-${Date.now().toString(36)}-${++this.counter}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RemoteError('TIMEOUT', '请求超时。任务可能仍在运行，请重新打开会话检查。'));
      }, 95000);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      try {
        this.socket!.send(JSON.stringify({ type: 'request', id, method, params, deviceId }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  disconnect() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.authTimer);
    this.socket?.close();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new RemoteError('DISCONNECTED', '连接已关闭'));
    }
    this.pending.clear();
    this.update({
      status: 'disconnected',
      devices: this.state.devices.map((d) => ({ ...d, online: false })),
    });
  }
}
