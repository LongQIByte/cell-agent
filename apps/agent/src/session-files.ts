import { constants } from 'node:fs';
import { open, realpath, type FileHandle } from 'node:fs/promises';
import { basename, extname, win32, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { RemoteError } from '@codex-remote/protocol';
import { imageMime } from './message-images.js';

export const FILE_CHUNK_BYTES = 256 * 1024;
export const FILE_LEASE_MS = 15 * 60 * 1000;

export function markdownFileSources(text: string): string[] {
  const body = text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '');
  return [...body.matchAll(/\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g)]
    .map((match) => match[1] ?? match[2]).filter((source) => !/^(?:https?:|mailto:|tel:|data:|#)/i.test(source));
}

export function sessionFilePath(source: string, cwd: string, platform = process.platform): string {
  let path = source.replace(/:\d+(?::\d+)?$/, '');
  if (path.startsWith('file:')) {
    const url = new URL(path);
    if (platform === 'win32') path = url.host ? `//${url.host}${decodeURIComponent(url.pathname)}` : decodeURIComponent(url.pathname).replace(/^\/(?=[a-z]:)/i, '');
    else path = fileURLToPath(url);
  } else {
    path = path.replace(/^sandbox:/, '');
    try { path = decodeURIComponent(path); } catch { /* Literal percent in native paths. */ }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path))
    throw new RemoteError('INVALID_FILE', '文件链接格式不支持');
  if (platform === 'win32') {
    const distro = /^[/\\]{2}(?:wsl\.localhost|wsl\$)[/\\]([^/\\]+)/i.exec(cwd)?.[1];
    if (distro && path.startsWith('/') && !path.startsWith('//')) path = `//wsl.localhost/${distro}${path}`;
    return win32.resolve(cwd, path);
  }
  // WSL can resolve the Windows UNC links emitted by desktop sessions.
  const wsl = /^[/\\]{2}(?:wsl\.localhost|wsl\$)[/\\][^/\\]+([/\\].*)/i.exec(path);
  if (wsl && process.env.WSL_DISTRO_NAME) path = wsl[1].replace(/\\/g, '/');
  return posix.resolve(cwd, path);
}

const types: Record<string, string> = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.m4v': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/plain',
  '.csv': 'text/csv', '.json': 'application/json', '.zip': 'application/zip',
};

export class SessionFiles {
  private leases = new Map<string, { handle?: FileHandle; data?: Buffer; size: number; expiresAt: number }>();
  private timer = setInterval(() => {
    for (const [id, lease] of this.leases) if (lease.expiresAt < Date.now()) this.release(id);
  }, 30000).unref();

  async create(source: string, cwd: string) {
    if (this.leases.size >= 64) throw new RemoteError('OVERLOADED', '打开的文件过多，请关闭预览后重试');
    let handle: FileHandle | undefined;
    let data: Buffer | undefined;
    let size: number;
    let name: string;
    try {
      if (source.startsWith('data:')) {
        const match = /^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/]*={0,2})$/.exec(source);
        if (!match) throw new RemoteError('INVALID_FILE', '图片格式不支持');
        data = Buffer.from(match[1], 'base64'); size = data.length; name = 'image.png';
      } else {
        const path = await realpath(sessionFilePath(source, cwd));
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        const info = await handle.stat();
        if (!info.isFile()) throw new RemoteError('INVALID_FILE', '链接不是普通文件');
        size = info.size; name = basename(path.replace(/\\/g, '/'));
      }
      const header = data?.subarray(0, 32) ?? Buffer.alloc(32);
      if (handle) await handle.read(header, 0, header.length, 0);
      const mimeType = imageMime(header) ?? types[extname(name).toLowerCase()] ?? 'application/octet-stream';
      const id = randomUUID(); const expiresAt = Date.now() + FILE_LEASE_MS;
      this.leases.set(id, { handle, data, size, expiresAt });
      return { id, name, size, mimeType, expiresAt };
    } catch (error: any) {
      await handle?.close();
      if (error.code === 'ENOENT') throw new RemoteError('FILE_MISSING', '电脑上的文件不存在');
      if (error.code === 'EACCES' || error.code === 'EPERM') throw new RemoteError('FILE_FORBIDDEN', '当前电脑账号没有读取文件的权限');
      throw error;
    }
  }
  async read(id: string, offset: number, length: number) {
    const lease = this.leases.get(id);
    if (!lease || lease.expiresAt < Date.now()) {
      this.release(id); throw new RemoteError('FILE_EXPIRED', '文件预览已过期，请重新打开');
    }
    if (offset > lease.size) throw new RemoteError('INVALID_RANGE', '文件读取范围无效');
    const bytes = Math.min(length, FILE_CHUNK_BYTES, lease.size - offset);
    let data = lease.data?.subarray(offset, offset + bytes);
    if (!data) {
      data = Buffer.alloc(bytes);
      const { bytesRead } = await lease.handle!.read(data, 0, bytes, offset);
      data = data.subarray(0, bytesRead);
      if (bytesRead !== bytes) throw new RemoteError('FILE_CHANGED', '文件在传输期间发生变化，请重新打开');
    }
    return { data: data.toString('base64') };
  }
  release(id: string) {
    const lease = this.leases.get(id); this.leases.delete(id);
    void lease?.handle?.close().catch(() => {});
  }
  close() { clearInterval(this.timer); for (const id of this.leases.keys()) this.release(id); }
}
