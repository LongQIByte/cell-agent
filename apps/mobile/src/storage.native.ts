import { openDatabaseAsync } from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import type { Connection } from './client';
import { connectionProfiles, upsertConnection } from './connection-profiles';
const database = openDatabaseAsync('codex-remote.sqlite').then(async (db) => {
  await db.execAsync(
    'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
  );
  return db;
});
export async function readCache<T>(key: string): Promise<T | null> {
  const db = await database;
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM cache WHERE key=?', key);
  try {
    return row ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}
export async function saveCache(key: string, data: unknown) {
  const db = await database;
  await db.runAsync(
    'INSERT INTO cache VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    key,
    JSON.stringify(data),
  );
}
export async function loadConnection(): Promise<Connection | null> {
  const server = await readCache<string>('connection-server');
  const token = await SecureStore.getItemAsync('codex-remote-token');
  return server && token ? { server, token } : null;
}
export async function loadConnections(): Promise<Connection[]> {
  const saved = await SecureStore.getItemAsync('codex-remote-connections');
  const profiles = connectionProfiles(saved ? JSON.parse(saved) : null);
  if (profiles.length) return profiles;
  const legacy = await loadConnection();
  return legacy ? [legacy] : [];
}
let connectionWrite = Promise.resolve();
export async function saveConnection(connection: Connection) {
  const write = connectionWrite.catch(() => {}).then(async () => {
    const profiles = upsertConnection(await loadConnections(), connection);
    await SecureStore.setItemAsync('codex-remote-connections', JSON.stringify(profiles));
    await SecureStore.setItemAsync('codex-remote-token', connection.token);
    await saveCache('connection-server', connection.server);
    return profiles;
  });
  connectionWrite = write.then(() => {});
  return write;
}
export async function clearConnection() {
  await SecureStore.deleteItemAsync('codex-remote-connections');
  await SecureStore.deleteItemAsync('codex-remote-token');
  const db = await database;
  await db.runAsync('DELETE FROM cache WHERE key=?', 'connection-server');
}
