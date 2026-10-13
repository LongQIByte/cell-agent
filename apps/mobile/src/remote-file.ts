import type { RemoteClient } from './client';
export interface RemoteFile {
  ticket: string; name: string; size: number; mimeType: string; expiresAt: number; uri: string;
}
export async function openRemoteFile(client: RemoteClient, deviceId: string, threadId: string, source: string): Promise<RemoteFile> {
  const file = await client.request<Omit<RemoteFile, 'uri'>>('files/open', { threadId, source }, deviceId);
  const url = new URL(client.connection.server);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = `${url.pathname.replace(/\/ws\/?$/, '').replace(/\/$/, '')}/files/${file.ticket}`; url.search = ''; url.hash = '';
  return { ...file, uri: url.toString() };
}
export function closeRemoteFile(client: RemoteClient, file: RemoteFile) {
  void client.request('files/close', { ticket: file.ticket }).catch(() => {});
}
export function isRemoteFileLink(source: string) {
  return !!source && !/^(?:https?:|mailto:|tel:|data:|#)/i.test(source);
}
