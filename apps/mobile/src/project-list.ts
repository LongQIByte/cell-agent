import type { Project, RecentSession } from '@codex-remote/protocol';
import { sessionPinKey } from './session-pins';

export const INITIAL_SESSION_COUNT = 5;

export interface ProjectSection {
  key: string;
  project: Project | null;
  expanded: boolean;
  total: number;
  data: RecentSession[];
}

export function projectKey(project: Project) {
  return `${project.deviceId}:${project.id}`;
}

function pinnedFirst<T>(items: T[], isPinned: (item: T) => boolean) {
  const first: T[] = [];
  const rest: T[] = [];
  for (const item of items) (isPinned(item) ? first : rest).push(item);
  return first.concat(rest);
}

export function projectSections(
  projects: Project[],
  recentSessions: RecentSession[],
  query: string,
  collapsed: ReadonlySet<string>,
  shownMore: ReadonlySet<string>,
  prefix: string,
  pins: ReadonlySet<string>,
): ProjectSection[] {
  const needle = query.trim().toLocaleLowerCase();
  const sections: ProjectSection[] = [];
  const recent = pinnedFirst(recentSessions
    .filter(({ session }) => !needle || `${session.name} ${session.cwd}`.toLocaleLowerCase().includes(needle))
    .sort((a, b) => b.session.updatedAt - a.session.updatedAt),
  ({ deviceId, session }) => pins.has(sessionPinKey(deviceId, session.id)));
  for (const project of [...projects].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const matchesProject = !needle || `${project.name} ${project.path}`.toLocaleLowerCase().includes(needle);
    const sessions = pinnedFirst(matchesProject
      ? project.sessions
      : project.sessions.filter((session) => `${session.name} ${session.cwd}`.toLocaleLowerCase().includes(needle)),
    (session) => pins.has(sessionPinKey(project.deviceId, session.id)));
    if (!matchesProject && !sessions.length) continue;
    const key = `${prefix}:${projectKey(project)}`;
    const expanded = !!needle || !collapsed.has(key);
    const visible = !expanded ? [] : shownMore.has(key) ? sessions : sessions.slice(0, INITIAL_SESSION_COUNT);
    sections.push({
      key,
      project,
      expanded,
      total: sessions.length,
      data: visible.map((session) => ({ deviceId: project.deviceId, session })),
    });
  }
  if (recent.length) {
    sections.push({ key: `${prefix}:recent`, project: null, expanded: true, total: recent.length, data: recent });
  }
  return sections;
}
