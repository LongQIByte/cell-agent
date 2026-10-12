import type { Device } from '@codex-remote/protocol';
import { websocketUrl, type ClientState, type Connection } from './client';

export function savedConnection(server: string, token: string): Connection {
  const value = { server: websocketUrl(server), token: token.trim() };
  if (value.token.length < 16 || value.token.length > 256)
    throw new Error('请输入电脑服务生成的完整配对密钥');
  return value;
}

export function computerStatus(state: Pick<ClientState, 'status'>, device: Pick<Device, 'online'>) {
  return state.status === 'connected' && device.online ? '在线' : '未知';
}

export function connectionError(error: unknown, tokens: (string | undefined)[]) {
  let message = error instanceof Error ? error.message : '保存连接失败，请重试';
  for (const token of tokens) {
    if (token?.trim()) message = message.split(token.trim()).join('••••••');
  }
  return message;
}
