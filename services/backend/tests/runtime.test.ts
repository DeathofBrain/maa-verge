import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Runtime } from '@backend/app/runtime';
import { Store } from '@backend/infrastructure/storage/storage';
import { parsePlan, parseSettings } from '@backend/modules/settings/models';
import { validatePlan } from '@backend/modules/plans/task-policy';
import { processRequest } from '@backend/transport/json-rpc';
import { syncDue, userDataSteps } from '@backend/modules/recognition/user-data-sync';
import { FakeFramework, frameworkFixtureOptions, seedFrameworkResource } from './framework-fixture';
import { taskConsumableLimits, validatePlan as validateSharedPlan } from '@contracts/task-policy';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const temp = () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-ts-test-'));
  roots.push(root);
  return root;
};
function fresh(root = temp(), worker = new FakeFramework()) {
  const runtime = new Runtime(
    root,
    frameworkFixtureOptions({
      frameworkWorkerFactory: async () => worker,
      validator: async () => {},
    }),
  );
  runtimes.push(runtime);
  return runtime;
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// CRUD、业务校验及持久化不依赖执行引擎；旧回调队列覆盖移至 Framework 隔离行为测试。
describe('business parity', () => {
  test('legacy close settings ask by default and remembered tray/exit choices survive restart', async () => {
    const root = temp();
    let runtime = fresh(root);
    const legacy = parseSettings({
      autoConnect: false,
      autoUpdateCore: false,
      autoUpdateResource: false,
      theme: 'dark',
    });
    delete legacy.rememberCloseAction;
    runtime.store.put('settings', 'main', legacy);
    expect(runtime.snapshot().settings.rememberCloseAction).toBe(false);
    for (const minimizeToTray of [true, false]) {
      await runtime.handle('settings.save', {
        settings: { ...runtime.snapshot().settings, rememberCloseAction: true, minimizeToTray },
      });
      await runtime.close();
      runtimes.splice(runtimes.indexOf(runtime), 1);
      runtime = fresh(root);
      expect(runtime.snapshot().settings).toMatchObject({
        rememberCloseAction: true,
        minimizeToTray,
        theme: 'dark',
        autoConnect: false,
      });
    }
    await runtime.handle('settings.save', {
      settings: { ...runtime.snapshot().settings, rememberCloseAction: false },
    });
    await runtime.close();
    runtimes.splice(runtimes.indexOf(runtime), 1);
    expect(fresh(root).snapshot().settings.rememberCloseAction).toBe(false);
    expect(() => parseSettings({ rememberCloseAction: 'unknown' })).toThrow();
  });
  test('crash recovery fails uncertain execution instead of replaying', () => {
    const root = temp(),
      store = new Store(root);
    store.put('meta', 'initialized', true);
    store.put('settings', 'main', parseSettings());
    store.put('run', 'unknown', {
      id: 'unknown',
      planId: 'daily',
      deviceId: 'd',
      status: 'running',
      progress: 10,
      message: '',
      startedAt: 'old',
    });
    store.close();
    const r = fresh(root);
    expect(r.store.get('run', 'unknown').status).toBe('failed');
    expect(r.store.events()[0].type).toBe('run.interrupted');
  });
  test('JSON-RPC errors and notification handling', async () => {
    const r = fresh();
    expect((await processRequest(r, [])).error.code).toBe(-32600);
    expect(
      (await processRequest(r, { jsonrpc: '2.0', id: true, method: 'app.snapshot' })).error.code,
    ).toBe(-32600);
    expect(await processRequest(r, { jsonrpc: '2.0', method: 'unknown' })).toBeUndefined();
    expect((await processRequest(r, { jsonrpc: '2.0', id: 4, method: 'unknown' })).error.code).toBe(
      -32601,
    );
    expect(
      (await processRequest(r, { jsonrpc: '2.0', id: 4, method: 'plan.save', params: {} })).error
        .code,
    ).toBe(-32602);
  });
});

test('shared and backend policies validate the new conventional settings consistently', () => {
  const valid = [
    ['UserDataUpdate', { operators: true, depot: false, interval: 'weekly' }],
    ['Mall', { visit_friends_once_a_day: true }],
    ['Recruit', { set_time: true, recruitment_time: { '3': 60, '4': 540 }, extra_tags_mode: 2 }],
    [
      'Infrast',
      {
        facility: [
          'Mfg',
          'Trade',
          'Power',
          'Control',
          'Reception',
          'Office',
          'Recycle',
          'Dorm',
          'Processing',
          'Training',
          'AssistantChange',
        ],
        drones: 'Money',
      },
    ],
  ] as const;
  const invalid = [
    ['UserDataUpdate', { operators: 'true' }],
    ['UserDataUpdate', { depot: null }],
    ['UserDataUpdate', { interval: 'monthly' }],
    ['UserDataUpdate', { interval: null }],
    ['Mall', { visit_friends_once_a_day: 1 }],
    ['Recruit', { recruitment_time: [] }],
    ['Recruit', { recruitment_time: { '2': 540 } }],
    ['Recruit', { recruitment_time: { '3': 59 } }],
    ['Recruit', { recruitment_time: { '4': 541 } }],
    ['Recruit', { recruitment_time: { '5': true } }],
    ['Infrast', { facility: ['Factory'] }],
    ['Infrast', { drones: 'invalid' }],
  ] as const;
  for (const validate of [validatePlan, validateSharedPlan]) {
    for (const [type, params] of valid)
      expect(() =>
        validate(parsePlan({ name: '配置', tasks: [{ type, params }] }), parseSettings()),
      ).not.toThrow();
    for (const [type, params] of invalid)
      expect(() =>
        validate(parsePlan({ name: '配置', tasks: [{ type, params }] }), parseSettings()),
      ).toThrow();
  }
});

test('task policy denies commands, unbounded consumables and malformed values', () => {
  for (const params of [
    { shell: 'bad' },
    { extension: { ſhell: 'bad' } },
    { medicine: -1 },
    { expiring_medicine: 1 },
    { expedite: true },
    { use_sanity_potion: true },
    { times: true },
    { server: 'bad' },
    { future: '\uD800' },
  ]) {
    expect(() =>
      validatePlan(
        parsePlan({ name: '校验', tasks: [{ type: 'Fight', params }] }),
        parseSettings(),
      ),
    ).toThrow();
  }
});

test('shared and backend consumption policy ignores legacy limits and rejects unaudited spending', () => {
  for (const validate of [validatePlan, validateSharedPlan]) {
    for (const oldLimit of [0, 100]) {
      const settings = parseSettings({
        budgets: { medicine: oldLimit, originium: oldLimit, expedited: oldLimit },
      });
      const plan = parsePlan({
        name: '旧版兼容',
        budgets: { medicine: 100 - oldLimit, originium: 100 - oldLimit },
        tasks: [{ type: 'Fight', params: { medicine: 2, stone: 3 } }],
      });
      expect(() => validate(plan, settings)).not.toThrow();
      expect(taskConsumableLimits(plan)).toEqual({ medicine: 2, originium: 3, expedited: 0 });
    }
    for (const [type, params] of [
      ['Fight', { medicine: -1 }],
      ['Fight', { stone: 1.5 }],
      ['Fight', { medicine: null }],
      ['Fight', { stone: false }],
      ['Fight', { expiring_medicine: 1 }],
      ['Fight', { medicine_expire_days: 1 }],
      ['Copilot', { filename: 'synthetic.json', use_sanity_potion: true }],
      ['Recruit', { expedite: true, expedite_times: 1 }],
      ['Award', { medicine: 1 }],
      ['Award', { stone: 1 }],
    ] as const)
      expect(() =>
        validate(
          parsePlan({ name: '受限消耗', tasks: [{ type, params }] }),
          parseSettings({ budgets: { medicine: 100, originium: 100, expedited: 100 } }),
        ),
      ).toThrow();
  }
});

test('SQLite preserves rowid order, event sequence, exclusive data lease and backup image', () => {
  const root = temp(),
    s = new Store(root);
  s.put('plan', 'z', { id: 'z' });
  s.put('plan', 'a', { id: 'a' });
  s.put('plan', 'z', { id: 'z', changed: true });
  const event = s.event('first', '事件');
  expect(() => new Store(root)).toThrow('其他本地服务');
  s.close();
  const reopened = new Store(root);
  expect(reopened.all('plan').map((p) => p.id)).toEqual(['z', 'a']);
  expect(reopened.event('second', '事件').id).toBe(event.id + 1);
  reopened.close();
  const backup = new Database(path.join(root, 'pre-typescript.sqlite3'), { readonly: true });
  expect(backup.query('SELECT id FROM objects WHERE kind=? ORDER BY rowid').all('plan')).toEqual([
    { id: 'z' },
    { id: 'a' },
  ]);
  expect(backup.query('SELECT count(*) n FROM events').get()).toEqual({ n: 1 });
  backup.close();
});

test('active-run lookup tracks device changes, completion, deletion and transaction rollback', () => {
  const store = new Store(temp());
  try {
    expect(store.hasRunningRun()).toBe(false);
    store.put('run', 'history', { deviceId: 'a', status: 'completed' });
    store.put('run', 'active', { deviceId: 'b', status: 'running' });
    expect(store.hasRunningRun()).toBe(true);
    expect(store.hasRunningRun('a')).toBe(false);
    expect(store.hasRunningRun('b')).toBe(true);
    expect(() =>
      store.transaction(() => {
        store.put('run', 'active', { deviceId: 'b', status: 'stopped' });
        expect(store.hasRunningRun()).toBe(false);
        throw new Error('rollback');
      }),
    ).toThrow('rollback');
    expect(store.hasRunningRun('b')).toBe(true);
    store.put('run', 'active', { deviceId: 'a', status: 'running' });
    expect(store.hasRunningRun('b')).toBe(false);
    expect(store.hasRunningRun('a')).toBe(true);
    store.put('run', 'active', { deviceId: 'a', status: 'completed' });
    expect(store.hasRunningRun()).toBe(false);
    store.put('run', 'active', { deviceId: 'a', status: 'running' });
    store.delete('run', 'active');
    expect(store.hasRunningRun()).toBe(false);
  } finally {
    store.close();
  }
});

test('WAL takeover backup is standalone, read-only accessible and preserves sparse rowids', () => {
  const root = temp(),
    source = new Database(path.join(root, 'maaverge.sqlite3'));
  let store: Store | undefined;
  try {
    source.exec(
      'PRAGMA journal_mode=WAL; CREATE TABLE objects(kind TEXT,id TEXT,value TEXT,PRIMARY KEY(kind,id))',
    );
    source
      .query('INSERT INTO objects(rowid,kind,id,value) VALUES(?,?,?,?)')
      .run(7, 'plan', 'z', '{"id":"z"}');
    source
      .query('INSERT INTO objects(rowid,kind,id,value) VALUES(?,?,?,?)')
      .run(2, 'plan', 'a', '{"id":"a"}');
    expect(existsSync(path.join(root, 'maaverge.sqlite3-wal'))).toBe(true);
    const original = source.query('SELECT rowid,* FROM objects ORDER BY rowid').all();
    store = new Store(root);
    const file = path.join(root, 'pre-typescript.sqlite3'),
      backup = new Database(file, { readonly: true });
    try {
      expect(backup.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' });
      expect(backup.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
      expect(backup.query('SELECT rowid,* FROM objects ORDER BY rowid').all()).toEqual(original);
      expect(existsSync(`${file}-wal`)).toBe(false);
      expect(existsSync(`${file}-shm`)).toBe(false);
    } finally {
      backup.close();
    }
  } finally {
    store?.close();
    source.close();
  }
});

const repo = fileURLToPath(new URL('../../..', import.meta.url));
test('Bun stdio service preserves plan/settings CRUD and unknown parameters across restart', async () => {
  const root = temp(),
    offline = {
      autoConnect: false,
      autoUpdateCore: false,
      autoUpdateResource: false,
      autoUpdateFramework: false,
    };
  const initial = new Store(path.join(root, 'native'));
  initial.put('settings', 'main', parseSettings(offline));
  initial.put('meta', 'initialized', true);
  initial.close();
  const trace = [
    [
      'plan.save',
      {
        plan: {
          id: 'fixture',
          name: '保留未知参数',
          tasks: [{ type: 'Award', params: { future: { 中文: [1, true] } } }],
        },
      },
    ],
    ['settings.save', { settings: { ...offline, theme: 'dark', budgets: { medicine: 2 } } }],
    ['app.snapshot', {}],
  ].map(([method, params], i) => ({ jsonrpc: '2.0', id: i + 1, method, params }));
  async function run(requests: typeof trace) {
    const child = spawn(process.execPath, [path.join(repo, 'services/backend/src/entry.ts')], {
      cwd: repo,
      env: {
        ...process.env,
        MAAVERGE_MODE: 'native',
        MAAVERGE_DATA_DIR: root,
      },
      windowsHide: true,
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (b) => {
      stdout += b;
    });
    child.stderr.on('data', (b) => {
      stderr += b;
    });
    child.stdin.end(requests.map((value) => JSON.stringify(value)).join('\n') + '\n');
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    expect(code, stderr).toBe(0);
    return stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line))
      .filter((item) => 'id' in item)
      .sort((a, b) => a.id - b.id);
  }
  const responses = await run(trace);
  const saved = responses[0].result;
  expect(saved).toMatchObject({
    id: 'fixture',
    name: '保留未知参数',
    tasks: [{ type: 'Award', params: { future: { 中文: [1, true] } }, enabled: true }],
  });
  expect(responses[1].result).toMatchObject({ theme: 'dark', budgets: { medicine: 2 } });
  expect(responses[2].result.plans).toEqual([saved]);
  const restarted = await run([{ jsonrpc: '2.0', id: 4, method: 'app.snapshot', params: {} }]);
  expect(restarted[0].result.plans).toEqual([saved]);
  expect(restarted[0].result.settings).toMatchObject({ theme: 'dark', budgets: { medicine: 2 } });
  const removed = await run([
    { jsonrpc: '2.0', id: 5, method: 'plan.delete', params: { id: 'fixture' } },
    { jsonrpc: '2.0', id: 6, method: 'app.snapshot', params: {} },
  ]);
  expect(removed[0].error).toBeUndefined();
  expect(removed[1].result.plans).toEqual([]);
});
