import type { Connection } from './client';

export function connectionProfiles(value: unknown): Connection[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<Connection[]>((profiles, entry) => {
    if (entry && typeof entry.server === 'string' && typeof entry.token === 'string')
      return upsertConnection(profiles, entry);
    return profiles;
  }, []);
}

// Preserve order: the first saved service owns the legacy catalog/pin keys.
export function upsertConnection(profiles: Connection[], connection: Connection) {
  const index = profiles.findIndex((profile) => profile.server === connection.server);
  return index < 0 ? [...profiles, connection]
    : profiles.map((profile, i) => i === index ? connection : profile);
}
