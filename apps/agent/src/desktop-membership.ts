import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { RemoteError, type Session } from '@codex-remote/protocol';

// The current desktop app owns explicit assignments independently of the
// app-server thread projection. Read the exact identifiers, never workspace paths.
const desktopSchema = z.object({
  'local-projects': z.record(z.object({ id: z.string().min(1) })),
  'thread-project-assignments': z.record(z.object({
    projectKind: z.enum(['local', 'remote']),
    projectId: z.string().min(1),
  })),
  'thread-project-membership-host-ids': z.record(z.string().min(1)),
  'projectless-thread-ids': z.array(z.string().min(1)),
  'app-server-project-id-by-legacy-project-id-by-host': z.record(z.record(z.string().min(1))),
});

export interface DesktopMembership {
  localProjectIds: Set<string>;
  assignments: z.infer<typeof desktopSchema>['thread-project-assignments'];
  hostIds: Record<string, string>;
  projectlessIds: Set<string>;
  nativeIds: Record<string, string>;
}

export async function readDesktopMembership(codexHome: string): Promise<DesktopMembership | null> {
  const directory = resolve(codexHome);
  let contents: string;
  try {
    contents = await readFile(join(directory, '.codex-global-state.json'), 'utf8');
  } catch (error) {
    // A CLI-only host has no desktop assignments; its native thread metadata owns membership.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new RemoteError('DESKTOP_METADATA_UNAVAILABLE', '无法读取桌面端项目归属数据');
  }
  let state: z.infer<typeof desktopSchema>;
  try {
    state = desktopSchema.parse(JSON.parse(contents));
  } catch {
    throw new RemoteError('DESKTOP_METADATA_INVALID', '桌面端项目归属数据格式不受支持，请检查 Codex 桌面端版本');
  }
  return {
    localProjectIds: new Set(Object.keys(state['local-projects'])),
    assignments: state['thread-project-assignments'],
    hostIds: state['thread-project-membership-host-ids'],
    projectlessIds: new Set(state['projectless-thread-ids']),
    nativeIds: state['app-server-project-id-by-legacy-project-id-by-host'][`local:${directory}`] ?? {},
  };
}

export function desktopSession(session: Session, source: DesktopMembership | null): Session | null {
  if (!source) return session;
  const hostId = source.hostIds[session.id];
  const assignment = source.assignments[session.id];
  if ((hostId && hostId !== 'local') || assignment?.projectKind === 'remote') return null;
  // Explicit projectless selection overrides an older assignment entry.
  if (source.projectlessIds.has(session.id)) return { ...session, projectId: null };
  if (!assignment || !source.localProjectIds.has(assignment.projectId)) return session;
  const projectId = source.nativeIds[assignment.projectId];
  if (!projectId)
    throw new RemoteError('DESKTOP_PROJECT_UNMAPPED', '桌面端项目缺少明确的原生标识映射，无法确认会话归属');
  return { ...session, projectId };
}
