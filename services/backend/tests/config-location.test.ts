import { afterEach, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dataRoot, deviceLockPath, legacyDataRoot } from '@backend/infrastructure/config';
import { Store } from '@backend/infrastructure/storage/storage';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  stores: Store[] = [],
  databases: Database[] = [];
const originalData = process.env.MAAVERGE_DATA_DIR,
  originalApp = process.env.MAAVERGE_APP_DIR;
const temporary = () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maa verge config-'));
  roots.push(root);
  return root;
};
const open = (root: string, source?: string) => {
  const store = new Store(root, source);
  stores.push(store);
  return store;
};
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (originalData === undefined) delete process.env.MAAVERGE_DATA_DIR;
  else process.env.MAAVERGE_DATA_DIR = originalData;
  if (originalApp === undefined) delete process.env.MAAVERGE_APP_DIR;
  else process.env.MAAVERGE_APP_DIR = originalApp;
});

test('default config follows the program directory, while explicit roots disable legacy import', () => {
  delete process.env.MAAVERGE_DATA_DIR;
  const app = temporary(),
    other = temporary();
  process.env.MAAVERGE_APP_DIR = app;
  const sharedLock = deviceLockPath('synthetic-device');
  expect(dataRoot()).toBe(path.join(app, 'config'));
  expect(dataRoot(other)).toBe(path.join(other, 'config'));
  expect(legacyDataRoot(dataRoot())).toContain('MAAVerge-dev');
  process.env.MAAVERGE_DATA_DIR = path.join(other, 'config');
  expect(dataRoot(app)).toBe(path.join(other, 'config'));
  expect(legacyDataRoot(dataRoot(other), other)).toBeUndefined();
  expect(deviceLockPath('synthetic-device')).toBe(sharedLock);
});

test('import preserves committed WAL, sparse rowids, events, request deduplication, screenshots and immutable copilot versions', () => {
  const source = path.join(temporary(), 'native'),
    target = path.join(temporary(), 'config/native');
  const initial = open(source);
  initial.put('settings', 'main', { theme: 'dark', budgets: { medicine: 0 } });
  initial.put('plan', 'deleted', {});
  initial.put('plan', 'second', { id: 'second', unknownParameter: 7 });
  initial.delete('plan', 'deleted');
  initial.put('plan', 'third', { id: 'third' });
  initial.put('request', 'persistent-key', { runId: 'historical-run' });
  initial.event('synthetic.event', '保留事件', { value: 1 });
  initial.close();
  // A retained SQLite connection simulates committed pages still in the WAL
  // after the service lease has been released, without starting any service.
  const sourceDb = new Database(path.join(source, 'maaverge.sqlite3'));
  databases.push(sourceDb);
  sourceDb.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0');
  sourceDb.query('INSERT INTO objects VALUES(?,?,?)').run('plan', 'wal-plan', '{"id":"wal-plan"}');
  expect(existsSync(path.join(source, 'maaverge.sqlite3-wal'))).toBe(true);
  const before = sourceDb.query('SELECT rowid,* FROM objects ORDER BY rowid').all();
  const artifact = path.join('run-artifacts', 'run-123456789abc', 'synthetic.png');
  mkdirSync(path.dirname(path.join(source, artifact)), { recursive: true });
  writeFileSync(path.join(source, artifact), 'synthetic screenshot');
  const version = path.join('copilot', 'versions', 'a'.repeat(64) + '.json');
  mkdirSync(path.dirname(path.join(source, version)), { recursive: true });
  writeFileSync(path.join(source, version), '{"stage_name":"synthetic","actions":[]}');
  const destination = open(target, source);
  expect(destination.db.query('SELECT rowid,* FROM objects ORDER BY rowid').all()).toEqual(before);
  expect(destination.all('plan').map((item) => item.id)).toEqual(['second', 'third', 'wal-plan']);
  expect(destination.get('request', 'persistent-key')).toEqual({ runId: 'historical-run' });
  expect(destination.events()[0].message).toBe('保留事件');
  expect(readFileSync(path.join(target, artifact), 'utf8')).toBe('synthetic screenshot');
  expect(readFileSync(path.join(target, version), 'utf8')).toBe(
    readFileSync(path.join(source, version), 'utf8'),
  );
  expect(existsSync(path.join(target, 'pre-typescript.sqlite3'))).toBe(true);
  expect(existsSync(path.join(source, '.runtime-lock.sqlite3'))).toBe(true);
  expect(sourceDb.query('SELECT rowid,* FROM objects ORDER BY rowid').all()).toEqual(before);
});

test('existing destination data is retained even if the legacy service is running', () => {
  const source = temporary(),
    target = temporary();
  open(source).put('settings', 'main', { theme: 'dark' });
  const current = open(target);
  current.put('settings', 'main', { theme: 'light' });
  current.close();
  expect(open(target, source).get('settings', 'main')).toEqual({ theme: 'light' });
});

test('source and target leases block import without creating an empty destination database', () => {
  const source = temporary(),
    target = temporary(),
    active = open(source);
  active.put('settings', 'main', { theme: 'dark' });
  expect(() => new Store(target, source)).toThrow('其他本地服务');
  expect(existsSync(path.join(target, 'maaverge.sqlite3'))).toBe(false);
  active.close();
  const imported = open(target, source);
  expect(imported.get('settings', 'main')).toEqual({ theme: 'dark' });
  expect(() => new Store(target, source)).toThrow('其他本地服务');
});

test('failed imports release both leases and retries replace partial screenshot copies', () => {
  const source = temporary(),
    target = temporary(),
    original = open(source);
  original.put('settings', 'main', { theme: 'dark' });
  original.close();
  const artifact = path.join('run-artifacts', 'run-123456789abc', 'synthetic.png');
  mkdirSync(path.dirname(path.join(source, artifact)), { recursive: true });
  writeFileSync(path.join(source, artifact), 'complete synthetic screenshot');
  writeFileSync(path.join(target, 'run-artifacts'), 'blocks directory copy');
  expect(() => new Store(target, source)).toThrow();
  expect(existsSync(path.join(target, 'maaverge.sqlite3'))).toBe(false);
  rmSync(path.join(target, 'run-artifacts'));
  mkdirSync(path.dirname(path.join(target, artifact)), { recursive: true });
  writeFileSync(path.join(target, artifact), 'partial');
  expect(open(target, source).get('settings', 'main')).toEqual({ theme: 'dark' });
  expect(readFileSync(path.join(target, artifact), 'utf8')).toBe('complete synthetic screenshot');
});

test('an unusable config directory reports its path and never falls back to another root', () => {
  const file = path.join(temporary(), 'blocked');
  writeFileSync(file, 'preserved');
  expect(() => new Store(path.join(file, 'native'))).toThrow(file);
  expect(readFileSync(file, 'utf8')).toBe('preserved');
});
