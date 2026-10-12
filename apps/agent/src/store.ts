import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
export interface ProjectRow {
  id: string;
  name: string;
  path: string;
  updated_at: number;
}
export interface AttachmentRow {
  id: string;
  project_id: string;
  name: string;
  mime_type: string;
  size: number;
  path: string;
}
export class AgentStore {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT UNIQUE NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, path TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS turn_requests (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, result TEXT, created_at INTEGER NOT NULL);`);
  }
  projects() {
    return this.db.prepare('SELECT * FROM projects').all() as unknown as ProjectRow[];
  }
  project(id: string) {
    return this.db.prepare('SELECT * FROM projects WHERE id=?').get(id) as unknown as
      ProjectRow | undefined;
  }
  saveProject(row: ProjectRow) {
    this.db
      .prepare(
        'INSERT INTO projects VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at',
      )
      .run(row.id, row.name, row.path, row.updated_at);
  }
  attachment(id: string) {
    return this.db.prepare('SELECT * FROM attachments WHERE id=?').get(id) as unknown as
      AttachmentRow | undefined;
  }
  attachmentByPath(path: string) {
    return this.db.prepare('SELECT * FROM attachments WHERE path=?').get(path) as unknown as
      AttachmentRow | undefined;
  }
  saveAttachment(row: AttachmentRow) {
    this.db
      .prepare('INSERT INTO attachments VALUES (?, ?, ?, ?, ?, ?)')
      .run(row.id, row.project_id, row.name, row.mime_type, row.size, row.path);
  }
  request(id: string) {
    return this.db.prepare('SELECT * FROM turn_requests WHERE id=?').get(id) as unknown as
      { id: string; thread_id: string; result: string | null } | undefined;
  }
  beginRequest(id: string, threadId: string) {
    this.db
      .prepare('INSERT INTO turn_requests VALUES (?, ?, NULL, ?)')
      .run(id, threadId, Date.now());
  }
  finishRequest(id: string, result: unknown) {
    this.db.prepare('UPDATE turn_requests SET result=? WHERE id=?').run(JSON.stringify(result), id);
  }
  close() {
    this.db.close();
  }
}
