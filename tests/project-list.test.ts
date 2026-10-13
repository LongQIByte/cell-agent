import test from 'node:test';
import assert from 'node:assert/strict';
import type { Project, RecentSession, Session } from '@codex-remote/protocol';
import { projectSections } from '../apps/mobile/src/project-list.js';
import { normalizeSessionPins } from '../apps/mobile/src/session-pins.js';

const session = (id: string, projectId: string | null, updatedAt = 1): Session => ({
  id, projectId, name: `Session ${id}`, cwd: '/workspace/shared', updatedAt, status: 'idle',
});
const project = (id: string, count: number, deviceId = 'mac'): Project => ({
  id, deviceId, name: `Project ${id}`, path: '/workspace/shared', available: true,
  updatedAt: 1, sessions: Array.from({ length: count }, (_, index) => session(`${id}-${index}`, id, count - index)),
});

test('each project starts with at most five sessions while preserving catalog order', () => {
  const projects = Array.from({ length: 7 }, (_, count) => project(String(count), count));
  const sections = projectSections(projects, [], '', new Set(), new Set(), 'active', new Set());
  assert.deepEqual(sections.map((section) => section.data.length), [0, 1, 2, 3, 4, 5, 5]);
  assert.deepEqual(sections[6].data.map((entry) => entry.session), projects[6].sessions.slice(0, 5));
  assert.equal(sections[6].total, 6);
  assert.equal(sections[5].total, sections[5].data.length);
});

test('show-more belongs to one machine, project, and catalog view across updates and collapse', () => {
  const mac = project('same', 8);
  const windows = project('same', 7, 'windows');
  const shown = new Set(['active:mac:same']);
  const sections = projectSections([mac, windows], [], '', new Set(), shown, 'active', new Set());
  assert.deepEqual(sections.map((section) => section.data.length), [8, 5]);
  assert.deepEqual(sections[0].data.map(({ session: entry }) => entry), mac.sessions);
  assert.equal(projectSections([mac], [], '', new Set(), shown, 'archived', new Set())[0].data.length, 5);
  assert.equal(projectSections([mac], [], '', new Set(['active:mac:same']), shown, 'active', new Set())[0].data.length, 0);
  const refreshed = { ...mac, updatedAt: 2, sessions: [...mac.sessions, session('new', mac.id)] };
  assert.equal(projectSections([refreshed], [], '', new Set(), shown, 'active', new Set())[0].data.length, 9);
});

test('projectless recent conversations remain separate even when working directory and IDs overlap', () => {
  const projects = [project('true-project', 1)];
  const recent: RecentSession[] = [
    { deviceId: 'mac', session: session('same', null, 3) },
    { deviceId: 'windows', session: session('same', null, 4) },
  ];
  const sections = projectSections(projects, recent, '', new Set(), new Set(), 'active', new Set());
  assert.equal(sections.length, 2);
  assert.equal(sections[1].project, null);
  assert.deepEqual(sections[1].data.map((entry) => entry.deviceId), ['windows', 'mac']);
  assert.equal(sections[0].project, projects[0]);
  assert.equal(sections[0].data[0].session.projectId, projects[0].id);
  assert.deepEqual(recent.map((entry) => entry.deviceId), ['mac', 'windows']);
});

test('search finds both recent and project conversations and leaves saved collapse state intact', () => {
  const one = project('one', 2);
  one.sessions[1] = { ...one.sessions[1], name: 'Fix BROWSER rendering' };
  const recent = [{ deviceId: 'mac', session: { ...session('recent', null), name: 'Browser research' } }];
  const collapsed = new Set(['active:mac:one']);
  const filtered = projectSections([one], recent, ' browser ', collapsed, new Set(), 'active', new Set());
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].expanded, true);
  assert.deepEqual(filtered[0].data.map((entry) => entry.session.id), ['one-1']);
  assert.deepEqual([...collapsed], ['active:mac:one']);
  assert.equal(projectSections([one], recent, '', collapsed, new Set(), 'active', new Set())[0].expanded, false);
  assert.equal(projectSections([one], [], '/workspace', new Set(), new Set(), 'active', new Set())[0].data.length, 2);
  assert.equal(projectSections([one], recent, 'no match', collapsed, new Set(), 'active', new Set()).length, 0);
});

test('pins from every project and recent list share one top section, even when projects are collapsed', () => {
  const mac = project('same', 8);
  const other = project('same', 8, 'other');
  const recent = [
    { deviceId: 'mac', session: session('recent-new', null, 3) },
    { deviceId: 'mac', session: session('recent-old', null, 1) },
  ];
  const pins = normalizeSessionPins(['mac:same-6', 'mac:same-7', 'mac:recent-old', null, 5, '']);
  const sections = projectSections([mac, other], recent, '', new Set(), new Set(), 'active', pins);
  assert.equal(sections[0].pinned, true);
  assert.deepEqual(sections[0].data.map((entry) => entry.session.id), ['same-6', 'recent-old', 'same-7']);
  assert.deepEqual(sections[1].data.map((entry) => entry.session.id), mac.sessions.slice(0, 5).map((entry) => entry.id));
  assert.deepEqual(sections[2].data.map((entry) => entry.session.id), other.sessions.slice(0, 5).map((entry) => entry.id));
  assert.deepEqual(sections[3].data.map((entry) => entry.session.id), ['recent-new']);
  const collapsedPins = projectSections([mac, other], recent, '', new Set(['active:mac:same']), new Set(), 'active', pins);
  assert.deepEqual(collapsedPins[0].data, sections[0].data);
  assert.equal(collapsedPins[1].data.length, 0);
  assert.deepEqual(mac.sessions.map((entry) => entry.id), Array.from({ length: 8 }, (_, index) => `same-${index}`));
  assert.deepEqual([...pins], ['mac:same-6', 'mac:same-7', 'mac:recent-old']);
  const unpinned = projectSections([mac], [], '', new Set(), new Set(), 'active', new Set());
  assert.deepEqual(unpinned[0].data.map((entry) => entry.session.id), mac.sessions.slice(0, 5).map((entry) => entry.id));
});
