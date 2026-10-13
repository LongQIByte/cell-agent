import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { JsonRecord, OutboxMessage } from '@codex-remote/protocol';
export interface OutboxRow { id: string; thread_id: string; payload: string; status: OutboxMessage['status']; error: string | null }
export interface AttachmentRow {
  id: string;
  thread_id: string;
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
      CREATE TABLE IF NOT EXISTS uploaded_files (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, path TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS turn_requests (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, result TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS message_outbox (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, error TEXT);
      CREATE TABLE IF NOT EXISTS runtime_metrics (thread_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);`);
  }
  outboxMessage(id: string): OutboxRow | undefined {
    return this.db.prepare('SELECT * FROM message_outbox WHERE id=?').get(id) as unknown as OutboxRow | undefined;
  }
  pendingOutboxThreads(): string[] {
    return this.db.prepare("SELECT DISTINCT thread_id FROM message_outbox WHERE status IN ('queued', 'submitting')")
      .all().map((row) => String(row.thread_id));
  }
  outbox(threadId: string): OutboxRow[] {
    return this.db.prepare('SELECT * FROM message_outbox WHERE thread_id=? ORDER BY rowid').all(threadId) as unknown as OutboxRow[];
  }
  enqueue(id: string, threadId: string, payload: JsonRecord) {
    this.db.prepare("INSERT INTO message_outbox VALUES (?, ?, ?, 'queued', NULL)").run(id, threadId, JSON.stringify(payload));
  }
  updateOutbox(id: string, status: OutboxRow['status'], error: string | null = null) {
    this.db.prepare('UPDATE message_outbox SET status=?, error=? WHERE id=?').run(status, error, id);
  }
  retryRejected(id: string) {
    const previous = this.request(id);
    if (previous?.result && JSON.parse(previous.result).error)
      this.db.prepare('DELETE FROM turn_requests WHERE id=?').run(id);
  }
  metrics<T>(threadId: string): T | null {
    const row = this.db.prepare('SELECT snapshot FROM runtime_metrics WHERE thread_id=?').get(threadId) as { snapshot: string } | undefined;
    return row ? JSON.parse(row.snapshot) : null;
  }
  saveMetrics(threadId: string, snapshot: unknown) {
    this.db.prepare('INSERT OR REPLACE INTO runtime_metrics VALUES (?, ?)').run(threadId, JSON.stringify(snapshot));
  }
  attachment(id: string) {
    return this.db.prepare('SELECT * FROM uploaded_files WHERE id=?').get(id) as unknown as
      AttachmentRow | undefined;
  }
  attachmentByPath(path: string) {
    return this.db.prepare('SELECT * FROM uploaded_files WHERE path=?').get(path) as unknown as
      AttachmentRow | undefined;
  }
  saveAttachment(row: AttachmentRow) {
    this.db
      .prepare('INSERT INTO uploaded_files VALUES (?, ?, ?, ?, ?, ?)')
      .run(row.id, row.thread_id, row.name, row.mime_type, row.size, row.path);
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
