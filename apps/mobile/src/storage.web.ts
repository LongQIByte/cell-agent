import type { Connection } from './client';
import { connectionProfiles, upsertConnection } from './connection-profiles';
export async function loadConnections(): Promise<Connection[]> {
  const profiles = connectionProfiles(JSON.parse(localStorage.getItem('codex-remote:connections') ?? 'null'));
  if (profiles.length) return profiles;
  const legacy = await loadConnection();
  return legacy ? [legacy] : [];
}
export async function loadConnection(): Promise<Connection | null> {
  try {
    return JSON.parse(localStorage.getItem('codex-remote:connection') ?? 'null');
  } catch {
    return null;
  }
}
export async function saveConnection(connection: Connection) {
  const profiles = await loadConnections();
  const next = upsertConnection(profiles, connection);
  localStorage.setItem('codex-remote:connections', JSON.stringify(next));
  localStorage.setItem('codex-remote:connection', JSON.stringify(connection));
  return next;
}
export async function clearConnection() {
  localStorage.removeItem('codex-remote:connections');
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
