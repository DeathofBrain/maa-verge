import { Database } from 'bun:sqlite';
import {
  closeSync,
  cpSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseWireJson, stringifyWireJson } from './wire-json';

export const now = () => new Date().toISOString();

function acquireLease(root: string): Database {
  const lease = new Database(path.join(root, '.runtime-lock.sqlite3'), { create: true });
  try {
    lease.exec('PRAGMA busy_timeout=0');
    const mode = lease.query('PRAGMA journal_mode=DELETE').get() as { journal_mode: string };
    if (mode.journal_mode !== 'delete') throw new Error('无法建立数据目录独占锁');
    lease.exec('BEGIN EXCLUSIVE');
    return lease;
  } catch (error) {
    lease.close();
    throw new Error(`其他本地服务正在使用此数据目录：${root}`, { cause: error });
  }
}

/** Preserve rowids and committed WAL data; publish only a validated, durable image. */
function snapshotDatabase(db: Database, destination: string) {
  const root = path.dirname(destination),
    temporary = path.join(root, `.backup-${randomUUID()}.sqlite3`);
  try {
    writeFileSync(temporary, db.serialize(), { flag: 'wx', mode: 0o600 });
    const fd = openSync(temporary, 'r+');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    const check = new Database(temporary);
    try {
      const mode = check.query('PRAGMA journal_mode=DELETE').get() as { journal_mode: string };
      if (mode.journal_mode !== 'delete') throw new Error('旧数据库备份无法转换为独立文件');
      const result = check.query('PRAGMA integrity_check').get() as { integrity_check: string };
      if (result.integrity_check !== 'ok') throw new Error('旧数据库备份完整性检查失败');
    } finally {
      check.close();
    }
    const finalized = openSync(temporary, 'r+');
    try {
      fsyncSync(finalized);
    } finally {
      closeSync(finalized);
    }
    renameSync(temporary, destination);
    if (process.platform !== 'win32') {
      const directory = openSync(root, 'r');
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    }
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

/** Schema v1 preserves the Python reference's database layout and row order. */
export class Store {
  readonly db!: Database;
  private readonly lease: Database;
  private closed = false;
  constructor(
    readonly root: string,
    importFrom?: string,
  ) {
    try {
      mkdirSync(root, { recursive: true });
      this.lease = acquireLease(root);
    } catch (error) {
      throw new Error(`配置目录无法打开或正在使用：${root}；请确认目录可写并完全退出其他本地服务`, {
        cause: error,
      });
    }
    const file = path.join(root, 'maaverge.sqlite3');
    try {
      if (
        !existsSync(file) &&
        importFrom &&
        existsSync(path.join(importFrom, 'maaverge.sqlite3'))
      ) {
        const sourceLease = acquireLease(importFrom);
        try {
          const source = new Database(path.join(importFrom, 'maaverge.sqlite3'), {
            readonly: true,
          });
          try {
            // IDs in the database refer to these relative screenshot paths.
            // No destination database exists yet; retry overwrites partial files.
            const artifacts = path.join(importFrom, 'run-artifacts');
            if (existsSync(artifacts))
              cpSync(artifacts, path.join(root, 'run-artifacts'), { recursive: true });
            const copilot = path.join(importFrom, 'copilot');
            if (existsSync(copilot))
              cpSync(copilot, path.join(root, 'copilot'), { recursive: true });
            snapshotDatabase(source, file);
          } finally {
            source.close();
          }
        } finally {
          sourceLease.close();
        }
      }
      const existing = existsSync(file);
      this.db = new Database(file, { create: true });
      if (existing && !existsSync(path.join(root, 'pre-typescript.sqlite3')))
        this.backupBeforeTakeover();
      this.db.exec(`PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
        INSERT OR IGNORE INTO migrations VALUES(1);
        CREATE TABLE IF NOT EXISTS objects(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id));
        CREATE INDEX IF NOT EXISTS active_run_device ON objects(json_extract(value,'$.deviceId'))
          WHERE kind='run' AND json_extract(value,'$.status')='running';
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL);`);
    } catch (error) {
      this.db?.close();
      this.lease.close();
      throw error;
    }
  }
  private backupBeforeTakeover() {
    // VACUUM INTO can renumber implicit rowids used by objects' display order.
    snapshotDatabase(this.db, path.join(this.root, 'pre-typescript.sqlite3'));
  }
  private check() {
    if (this.closed || !this.lease.inTransaction) throw new Error('数据目录锁已失效，停止业务读写');
    this.lease.query('SELECT 1').get();
  }
  transaction<T>(fn: () => T): T {
    this.check();
    return this.db.transaction(fn)();
  }
  put(kind: string, id: string, value: unknown): void {
    this.check();
    this.db
      .query(
        'INSERT INTO objects VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value',
      )
      .run(kind, id, stringifyWireJson(value));
  }
  get<T = any>(kind: string, id: string, fallback?: any): T {
    this.check();
    const row = this.db.query('SELECT value FROM objects WHERE kind=? AND id=?').get(kind, id) as {
      value: string;
    } | null;
    return row ? parseWireJson(row.value) : (fallback as T);
  }
  all<T = any>(kind: string): T[] {
    this.check();
    return (
      this.db.query('SELECT value FROM objects WHERE kind=? ORDER BY rowid').all(kind) as {
        value: string;
      }[]
    ).map((r) => parseWireJson(r.value));
  }
  recent<T = any>(kind: string, limit: number): T[] {
    this.check();
    return (
      this.db
        .query('SELECT value FROM objects WHERE kind=? ORDER BY rowid DESC LIMIT ?')
        .all(kind, Math.max(1, Math.min(1000, Math.trunc(limit)))) as { value: string }[]
    ).map((r) => parseWireJson(r.value));
  }
  hasRunningRun(deviceId?: string): boolean {
    this.check();
    const active =
      "SELECT 1 FROM objects WHERE kind='run' AND json_extract(value,'$.status')='running'";
    return !!(deviceId === undefined
      ? this.db.query(active + ' LIMIT 1').get()
      : this.db.query(active + " AND json_extract(value,'$.deviceId')=? LIMIT 1").get(deviceId));
  }
  delete(kind: string, id: string): void {
    this.check();
    this.db.query('DELETE FROM objects WHERE kind=? AND id=?').run(kind, id);
  }
  event(type: string, message: string, data: any = {}): any {
    this.check();
    const createdAt = now();
    const row = this.db
      .query('INSERT INTO events(type,message,created_at,data) VALUES(?,?,?,?)')
      .run(type, message, createdAt, stringifyWireJson(data));
    return { id: Number(row.lastInsertRowid), type, message, createdAt, data };
  }
  events(limit = 100): any[] {
    this.check();
    return (
      this.db
        .query('SELECT id,type,message,created_at,data FROM events ORDER BY id DESC LIMIT ?')
        .all(Math.max(1, Math.min(1000, Math.trunc(limit)))) as any[]
    )
      .reverse()
      .map((r) => ({
        id: r.id,
        type: r.type,
        message: r.message,
        createdAt: r.created_at,
        data: parseWireJson(r.data),
      }));
  }
  deleteEvents(ids: number[]): number {
    this.check();
    if (!ids.length) return 0;
    const result = this.db
      .query(`DELETE FROM events WHERE id IN (${ids.map(() => '?').join(',')})`)
      .run(...ids);
    return Number(result.changes);
  }
  close(): void {
    if (!this.closed) {
      this.closed = true;
      try {
        this.db.close();
      } finally {
        this.lease.close();
      }
    }
  }
}
