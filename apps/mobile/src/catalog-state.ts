import type { Device, Project, RecentSession } from '@codex-remote/protocol';

export function rememberDevices(previous: Device[], incoming: Device[], confirmed: boolean): Device[] {
  const known = new Map(previous.map((device) => [device.id, { ...device, online: false }]));
  for (const device of incoming) known.set(device.id, { ...device, online: confirmed && device.online });
  return [...known.values()];
}

// Keep unchanged rows and the current order stable during background sync.
export function mergeProjects(previous: Project[], incoming: Project[], succeeded: Set<string>) {
  const remaining = new Map(incoming.map((project) => [`${project.deviceId}:${project.id}`, project]));
  const next: Project[] = [];
  for (const project of previous) {
    if (!succeeded.has(project.deviceId)) {
      next.push(project);
      continue;
    }
    const key = `${project.deviceId}:${project.id}`;
    const update = remaining.get(key);
    if (update) {
      next.push(JSON.stringify(project) === JSON.stringify(update) ? project : update);
      remaining.delete(key);
    }
  }
  next.push(...remaining.values());
  return next.length === previous.length && next.every((project, index) => project === previous[index])
    ? previous
    : next;
}

export function mergeRecentSessions(previous: RecentSession[], incoming: RecentSession[], succeeded: Set<string>) {
  const remaining = new Map(incoming.map((entry) => [`${entry.deviceId}:${entry.session.id}`, entry]));
  const next: RecentSession[] = [];
  for (const entry of previous) {
    if (!succeeded.has(entry.deviceId)) {
      next.push(entry);
      continue;
    }
    const key = `${entry.deviceId}:${entry.session.id}`;
    const update = remaining.get(key);
    if (update) {
      next.push(JSON.stringify(entry) === JSON.stringify(update) ? entry : update);
      remaining.delete(key);
    }
  }
  next.push(...remaining.values());
  return next.length === previous.length && next.every((entry, index) => entry === previous[index])
    ? previous
    : next;
}
