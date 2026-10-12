import type { Connection } from './client';
export async function loadConnection(): Promise<Connection | null> {
  try {
    return JSON.parse(localStorage.getItem('codex-remote:connection') ?? 'null');
  } catch {
    return null;
  }
}
export async function saveConnection(connection: Connection) {
  localStorage.setItem('codex-remote:connection', JSON.stringify(connection));
}
export async function clearConnection() {
  localStorage.removeItem('codex-remote:connection');
}
export async function readCache<T>(key: string): Promise<T | null> {
  try {
    return JSON.parse(localStorage.getItem(`codex-remote:${key}`) ?? 'null');
  } catch {
    return null;
  }
}
export async function saveCache(key: string, data: unknown) {
  localStorage.setItem(`codex-remote:${key}`, JSON.stringify(data));
}
