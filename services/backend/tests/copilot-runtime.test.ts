import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { Store } from '@backend/infrastructure/storage/storage';
import type { CopilotKind } from '@contracts/rpc-types';
import { mockPreviewImage } from '../../../tests/fixtures/preview-image';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const reverseObjectKeys = (value: any): any =>
  Array.isArray(value)
    ? value.map(reverseObjectKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([key, child]) => [key, reverseObjectKeys(child)]),
        )
      : value;
class Worker {
  connected = true;
  safeIdle = true;
  events: any[] = [];
  tasks: any[] = [];
  stops = 0;
  async connect() {
    this.connected = true;
    return { asyncId: 1 };
  }
  async waitConnected() {
    return true;
  }
  async task(task: any) {
    // MaaCore v6.20.0 MultiCopilotConfig accepts an absent override, but not null.
    if (task.type === 'Copilot')
      for (const entry of task.params.copilot_list ?? []) {
        if (
          Object.hasOwn(entry, 'nav_name_override') &&
          typeof entry.nav_name_override !== 'string'
        )
          throw new Error('Type error: cannot convert to string, expected=string, type=null');
      }
    this.tasks.push(structuredClone(task));
    this.safeIdle = false;
    return { taskId: this.tasks.length };
  }
  async stop() {
    this.stops++;
    return { stopping: true };
  }
  async close() {
    this.connected = false;
    this.safeIdle = true;
  }
  async frame() {
    return { ...mockPreviewImage, canControl: true };
  }
  async click(_x: number, _y: number): Promise<{ accepted: true }> {
    return { accepted: true };
  }
  callback(message: number, details: any = {}) {
    this.events.push({
      type: 'callback',
      message,
      details: { taskid: this.tasks.length, ...details },
    });
  }
  load(index: number) {
    const params = this.tasks.at(-1).params,
      list = params.copilot_list ?? params.list;
    this.callback(20003, {
      what: 'CopilotListLoadTaskFileSuccess',
      details: { id: list[index].id, file_name: list[index].filename, stage_name: 'main_01-07' },
    });
  }
  battle(task: string) {
    this.callback(20001, { subtask: 'BattleProcessTask' });
    const details = { taskchain: 'Copilot', subtask: 'ProcessTask', details: { task } };
    this.callback(20001, details);
    this.callback(20002, details);
  }
  complete(pending: number[] = []) {
    this.callback(10002);
    this.callback(3);
    this.idle(pending);
  }
  idle(pending: number[] = []) {
    this.safeIdle = !pending.length;
    this.events.push({ type: 'status', running: false, pendingAsync: pending });
  }
}
function open(root: string, worker = new Worker()) {
  const r = new Runtime(root, {
    workerFactory: async (config) => (config.address === '127.0.0.1:5555' ? worker : new Worker()),
    validator: async () => {},
    adbExecutable: () => 'synthetic-adb',
    calendar: { fetcher: null },
  });
  runtimes.push(r);
  return r;
}
async function fixture() {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-copilot-runtime-'));
  roots.push(root);
  const resource = path.join(root, 'generation', 'resource', 'Arknights-Tile-Pos');
  mkdirSync(resource, { recursive: true });
  writeFileSync(
    path.join(resource, 'overview.json'),
    JSON.stringify({
      main: {
        stageId: 'main_01-07',
        levelId: 'main_01-07',
        code: '1-7',
        name: '合成关卡',
        filename: 'main.json',
      },
      paradox: {
        stageId: 'mem_test',
        levelId: 'mem_test',
        code: 'mem_test',
        name: '合成悖论',
        filename: 'paradox.json',
      },
      sss: {
        stageId: 'sss_stage',
        levelId: 'sss_stage',
        code: 'sss_stage',
        name: '合成保全',
        filename: 'sss.json',
      },
      annihilation: {
        stageId: 'camp_r_34',
        levelId: 'obt/campaign/level_camp_r_34',
        code: '合成剿灭',
        name: '合成剿灭关卡',
        filename: 'annihilation.json',
      },
    }),
  );
  for (const file of ['main.json', 'paradox.json', 'sss.json', 'annihilation.json'])
    writeFileSync(path.join(resource, file), '{}');
  writeFileSync(path.join(resource, '..', 'tasks.json'), JSON.stringify({ Episode1: {} }));
  const worker = new Worker(),
    r = open(root, worker);
  r.store.put('active', 'combo', {
    core: { path: 'fixture-core', version: 'v6.20.0' },
    resource: { path: path.join(root, 'generation'), version: 'fixture-resource' },
  });
  const connect = async (port = 5555) => {
    const device = await r.connectDevice({ address: `127.0.0.1:${port}`, name: '合成设备' });
    device.state = 'idle';
    r.store.put('device', device.id, device);
    return device;
  };
  const device = await connect();
  const imported = async (
    content: any = {
      stage_name: 'main_01-07',
      opers: [],
      actions: [{ type: 'SpeedUp' }],
      minimum_required: 'v6.20.0',
      doc: { title: '合成作业' },
    },
  ) => {
    const preview = await r.handle('copilot.preview', {
      content: JSON.stringify(content),
      name: 'fixture.json',
    });
    const result = await r.handle('copilot.import', { previewId: preview.id });
    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
    return result.items[0];
  };
  const queue = async (versions: string[], kind: CopilotKind = 'Copilot', patch: any = {}) => {
    const workspace = await r.handle('copilot.workspace.get', { kind });
    workspace.queue = versions.map((versionId, index) => ({
      id: `entry-${index + 1}`,
      versionId,
      enabled: true,
      isRaid: false,
      navName: '',
    }));
    Object.assign(workspace.options, patch);
    return r.handle('copilot.workspace.save', { workspace });
  };
  const start = (
    requestId: string = crypto.randomUUID(),
    kind: CopilotKind = 'Copilot',
    deviceId = device.id,
  ) => r.handle('copilot.start', { kind, requestId, deviceId });
  const detail = (id: string) => r.handle('run.detail', { id });
  return { r, root, worker, device, connect, imported, queue, start, detail };
}
afterEach(async () => {
  for (const r of runtimes.splice(0)) await r.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}, 30_000);

test('independent single run creates no task table and keeps missing victory evidence unknown', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item = await imported();
  await queue([item.versionId], 'Copilot', {
    formation: true,
    formationIndex: 2,
    addTrust: true,
    supportUnitName: '合成干员',
    additionalOperators: [{ name: '合成干员', skill: 1 }],
  });
  const run = await start();
  expect(r.store.all('plan')).toHaveLength(0);
  expect(r.store.all('run_plan')).toHaveLength(0);
  expect(r.store.get('run_snapshot', run.id).source).toBe('copilot');
  expect(run).toMatchObject({ source: 'copilot', planId: null, copilotKind: 'Copilot' });
  expect(worker.tasks).toHaveLength(1);
  expect(worker.tasks[0]).toMatchObject({
    type: 'Copilot',
    params: {
      formation: true,
      formation_index: 2,
      add_trust: true,
      use_sanity_potion: false,
      support_unit_name: '合成干员',
      support_unit_usage: 2,
      user_additional: [{ name: '合成干员', skill: 1 }],
    },
  });
  expect(worker.tasks[0].params.filename).toMatch(/\.json$/);
  expect(worker.tasks[0].params.loop_times).toBe(1);
  expect(worker.tasks[0].params.copilot_list).toBeUndefined();
  expect(worker.tasks[0].params).not.toHaveProperty('nav_name_override');
  expect(worker.tasks[0].params).not.toHaveProperty('is_raid');
  expect((await detail(run.id)).status).toBe('running');
  // Single-file MaaCore has no list-loaded callback; submission owns the entry immediately.
  expect((await detail(run.id)).copilotEntries[0]).toMatchObject({
    nativeId: 1,
    status: 'running',
  });
  worker.complete([19]);
  await r.tick(true);
  expect((await detail(run.id)).status).toBe('running');
  worker.idle();
  await r.tick(true);
  const finished = await detail(run.id);
  expect(finished.status).toBe('completed');
  expect(finished.copilotEntries[0]).toMatchObject({ status: 'completed', verdict: 'unknown' });
  expect(finished.message).toContain('未确认');
  expect((await r.handle('copilot.workspace.get', { kind: 'Copilot' })).queue[0].enabled).toBe(
    true,
  );
  expect(r.snapshot().runs[0].copilotEntries).toBeUndefined();
  expect(r.snapshot().events.every((event) => !(event.data.run as any)?.copilotEntries)).toBe(true);
});

for (const loopTimes of [1, 2])
  test(`one annihilation uses the native single-file flow with ${loopTimes} iteration(s)`, async () => {
    const { r, worker, device, imported, queue, start, detail } = await fixture();
    const item = await imported({ stage_name: 'camp_r_34', opers: [], actions: [] });
    await queue([item.versionId], 'Copilot', { loopTimes });
    const run = await start();
    expect(worker.tasks[0]).toMatchObject({
      type: 'Copilot',
      params: { loop_times: loopTimes },
    });
    expect(worker.tasks[0].params.filename).toMatch(/\.json$/);
    expect(worker.tasks[0].params).not.toHaveProperty('copilot_list');
    expect((await detail(run.id)).copilotEntries[0]).toMatchObject({
      nativeId: 1,
      status: 'running',
      verdict: 'unknown',
    });
    worker.battle('StageDrops-Stars-3');
    worker.complete([19]);
    await r.tick(true);
    expect((await detail(run.id)).status).toBe('running');
    expect(r.availability(device.id).available).toBe(false);
    worker.idle();
    await r.tick(true);
    expect((await detail(run.id)).copilotEntries[0]).toMatchObject({
      status: 'completed',
      verdict: loopTimes === 1 ? 'success' : 'unknown',
    });
    expect(r.availability(device.id).available).toBe(true);
  });

test('an annihilation in a multi-file queue is rejected before native submission', async () => {
  const { worker, imported, queue, start } = await fixture();
  const normal = await imported(),
    annihilation = await imported({
      stage_name: 'obt/campaign/level_camp_r_34',
      opers: [],
      actions: [],
    });
  await queue([normal.versionId, annihilation.versionId]);
  await expect(start()).rejects.toThrow('剿灭作业不支持多作业自动选关');
  expect(worker.tasks).toHaveLength(0);
});

test('single-file startup failure is attributed without a list-loaded callback and waits for idle', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item = await imported();
  await queue([item.versionId]);
  const run = await start();
  worker.callback(20000, { subtask: 'ProcessTask', first: ['BattleStartAll'] });
  worker.complete([19]);
  await r.tick(true);
  expect(worker.stops).toBe(1);
  expect((await detail(run.id)).status).toBe('running');
  worker.idle();
  await r.tick(true);
  expect(await detail(run.id)).toMatchObject({
    status: 'failed',
    copilotEntries: [{ nativeId: 1, status: 'failed', verdict: 'unknown' }],
  });
});

test('native multi-file navigation preserves duplicate occurrences and rejects stale IDs and files', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item = await imported();
  const workspace = await queue([item.versionId, item.versionId]);
  workspace.queue[1].isRaid = true;
  workspace.queue[1].navName = '1-7';
  await r.handle('copilot.workspace.save', { workspace });
  const run = await start();
  const task = worker.tasks[0];
  expect(worker.tasks).toHaveLength(1);
  expect(task.params.filename).toBeUndefined();
  expect(task.params.loop_times).toBeUndefined();
  expect(task.params.copilot_list).toHaveLength(2);
  expect(task.params.copilot_list.map((entry: any) => entry.id)).toEqual([1, 2]);
  expect((await detail(run.id)).copilotEntries.map((entry: any) => entry.nativeId)).toEqual([1, 2]);
  expect((await detail(run.id)).status).toBe('running');
  expect(task.params.copilot_list[0]).not.toHaveProperty('nav_name_override');
  expect(task.params.copilot_list[1]).toMatchObject({ is_raid: true, nav_name_override: '1-7' });
  worker.load(0);
  await r.tick(true);
  expect((await detail(run.id)).copilotEntries[0]).toMatchObject({
    status: 'running',
    verdict: 'unknown',
  });
  worker.callback(20003, {
    taskid: 999,
    what: 'CopilotListLoadTaskFileSuccess',
    details: {
      id: task.params.copilot_list[1].id,
      file_name: task.params.copilot_list[1].filename,
    },
  });
  worker.callback(20003, {
    what: 'CopilotListLoadTaskFileSuccess',
    details: { id: task.params.copilot_list[1].id, file_name: 'different.json' },
  });
  await r.tick(true);
  expect((await detail(run.id)).copilotEntries[1].status).toBe('waiting');
  worker.battle('StageDrops-Stars-3');
  worker.load(1);
  await r.tick(true);
  let entries = (await detail(run.id)).copilotEntries;
  expect(entries[0]).toMatchObject({ status: 'completed', verdict: 'success' });
  expect(entries[1]).toMatchObject({ status: 'running', verdict: 'unknown' });
  worker.load(0);
  await r.tick(true);
  entries = (await detail(run.id)).copilotEntries;
  expect(entries[0].status).toBe('completed');
  expect(entries[1].status).toBe('running');
  worker.complete();
  await r.tick(true);
  expect((await detail(run.id)).copilotEntries[1].verdict).toBe('unknown');
});

test('a delayed previous-entry settlement cannot confirm the next entry before its battle starts', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item = await imported();
  await queue([item.versionId, item.versionId]);
  const run = await start();
  worker.load(0);
  worker.callback(20001, { subtask: 'BattleProcessTask' });
  worker.load(1);
  worker.callback(20002, {
    taskchain: 'Copilot',
    subtask: 'ProcessTask',
    details: { task: 'StageDrops-Stars-3' },
  });
  await r.tick(true);
  const entries = (await detail(run.id)).copilotEntries;
  expect(entries[0]).toMatchObject({ status: 'completed', verdict: 'unknown' });
  expect(entries[1]).toMatchObject({ status: 'running', verdict: 'unknown' });
  worker.battle('StageDrops-Stars-Adverse');
  worker.complete();
  await r.tick(true);
  expect((await detail(run.id)).copilotEntries[1]).toMatchObject({
    status: 'completed',
    verdict: 'success',
  });
});

test.each([
  ['StageDrops-Stars-3', 20001],
  ['StageDrops-Stars-Adverse', 20001],
  ['Copilot@StageDrops-Stars-3', 20002],
] as const)(
  'native settlement %s at message %i confirms once and captures once',
  async (task, message) => {
    const { r, worker, imported, queue, start, detail } = await fixture();
    const item = await imported();
    await queue([item.versionId], 'Copilot', { autoLikeOnSuccess: true });
    let captures = 0,
      automaticFeedback = 0;
    (r as any).captureRunArtifact = () => captures++;
    r.copilot.autoLikeConfirmed = () => {
      automaticFeedback++;
    };
    const run = await start();
    const resultEvents = () =>
      r
        .snapshot()
        .events.filter(
          (event) => event.type === 'run.copilot_result' && event.data.runId === run.id,
        );
    const settlement = { subtask: 'ProcessTask', details: { task } };
    worker.callback(message, settlement);
    await r.tick(true);
    expect((await detail(run.id)).copilotEntries[0].verdict).toBe('unknown');
    expect(resultEvents()).toHaveLength(0);
    expect(captures).toBe(0);
    expect((await r.handle('copilot.workspace.get', { kind: 'Copilot' })).queue[0].enabled).toBe(
      true,
    );
    worker.callback(20001, { subtask: 'BattleProcessTask' });
    worker.callback(message, { ...settlement, taskid: 999 });
    worker.callback(message, settlement);
    await r.tick(true);
    expect((await detail(run.id)).copilotEntries[0].verdict).toBe('success');
    expect((await detail(run.id)).status).toBe('running');
    expect(resultEvents()).toHaveLength(1);
    expect(resultEvents()[0].data.workspaceSelection).toEqual({
      kind: 'Copilot',
      entry: {
        id: 'entry-1',
        versionId: item.versionId,
        enabled: false,
        isRaid: false,
        navName: '',
      },
    });
    expect((await r.handle('copilot.workspace.get', { kind: 'Copilot' })).queue[0].enabled).toBe(
      false,
    );
    expect(r.store.get('run_snapshot', run.id).workspace.queue[0].enabled).toBe(true);
    expect(captures).toBe(1);
    expect(automaticFeedback).toBe(0);
    worker.callback(20002, settlement);
    worker.callback(20001, settlement);
    worker.complete();
    await r.tick(true);
    expect((await detail(run.id)).status).toBe('completed');
    expect(resultEvents()).toHaveLength(1);
    expect(captures).toBe(1);
    expect(automaticFeedback).toBe(1);
  },
);

test('confirmed list victories deselect their exact occurrences even when versions repeat', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item = await imported();
  const workspace = await queue([item.versionId, item.versionId]);
  const run = await start();
  worker.load(0);
  worker.battle('StageDrops-Stars-3');
  await r.tick(true);
  expect(
    (await r.handle('copilot.workspace.get', { kind: 'Copilot' })).queue.map(
      (entry: any) => entry.enabled,
    ),
  ).toEqual([false, true]);
  worker.load(1);
  worker.battle('StageDrops-Stars-3');
  worker.complete();
  await r.tick(true);
  expect((await detail(run.id)).status).toBe('completed');
  expect(
    (await r.handle('copilot.workspace.get', { kind: 'Copilot' })).queue.map(
      (entry: any) => entry.enabled,
    ),
  ).toEqual([false, false]);
  expect(
    r
      .snapshot()
      .events.filter((event) => event.type === 'run.copilot_result' && event.data.runId === run.id)
      .map((event) => event.data.workspaceSelection),
  ).toEqual(
    workspace.queue.map((entry: any) => ({ kind: 'Copilot', entry: { ...entry, enabled: false } })),
  );
  expect(r.store.get('run_snapshot', run.id).workspace).toEqual(workspace);
});

test.each(['version', 'raid', 'navigation'] as const)(
  'confirmed victory preserves a current occurrence whose %s changed during the run',
  async (change) => {
    const { r, worker, imported, queue, start, detail } = await fixture();
    const item = await imported();
    await queue([item.versionId, item.versionId]);
    const run = await start();
    const current = await r.handle('copilot.workspace.get', { kind: 'Copilot' });
    if (change === 'version') {
      const replacement = await imported({
        stage_name: 'main_01-07',
        actions: [{ type: 'Output', doc: '下一轮的版本' }],
      });
      current.queue[0].versionId = replacement.versionId;
    } else if (change === 'raid') current.queue[0].isRaid = true;
    else current.queue[0].navName = '1-7';
    await r.handle('copilot.workspace.save', { workspace: current });
    worker.load(0);
    worker.battle('StageDrops-Stars-3');
    await r.tick(true);
    expect((await detail(run.id)).copilotEntries[0].verdict).toBe('success');
    expect(await r.handle('copilot.workspace.get', { kind: 'Copilot' })).toEqual(current);
    const result = r
      .snapshot()
      .events.find((event) => event.type === 'run.copilot_result' && event.data.runId === run.id);
    expect(result?.data).not.toHaveProperty('workspaceSelection');
  },
);

test('individual settlement callbacks cannot prove every iteration of a native loop succeeded', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item = await imported();
  await queue([item.versionId], 'Copilot', { loopTimes: 2 });
  const run = await start();
  expect(worker.tasks[0].params.loop_times).toBe(2);
  worker.battle('StageDrops-Stars-3');
  await r.tick(true);
  expect((await detail(run.id)).copilotEntries[0].verdict).toBe('unknown');
  worker.battle('StageDrops-Stars-3');
  worker.complete();
  await r.tick(true);
  expect((await detail(run.id)).copilotEntries[0]).toMatchObject({
    status: 'completed',
    verdict: 'unknown',
  });
  expect((await r.handle('copilot.workspace.get', { kind: 'Copilot' })).queue[0].enabled).toBe(
    true,
  );
  expect(
    r
      .snapshot()
      .events.filter((event) => event.type === 'run.copilot_result' && event.data.runId === run.id)
      .every((event) => !event.data.workspaceSelection),
  ).toBe(true);
});

test('workspace edits, reimport and deleting a library record cannot change an active native snapshot', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item = await imported();
  await queue([item.versionId]);
  const run = await start('fixed-snapshot'),
    snapshot = r.store.get('run_snapshot', run.id),
    file = worker.tasks[0].params.filename,
    bytes = readFileSync(file, 'utf8');
  const changed = await imported({
    stage_name: 'main_01-07',
    opers: [],
    actions: [{ type: 'SpeedUp' }, { type: 'Output', doc: '另一版本' }],
    doc: { title: '另一作业' },
  });
  await queue([changed.versionId]);
  await r.handle('settings.save', {
    settings: {
      ...r.snapshot().settings,
      copilotStorage: { directory: '', deleteJsonFiles: true },
    },
  });
  await r.handle('copilot.delete', { id: item.id });
  expect(r.store.get('run_snapshot', run.id)).toEqual(snapshot);
  expect(readFileSync(file, 'utf8')).toBe(bytes);
  expect((await detail(run.id)).copilotEntries[0].versionId).toBe(item.versionId);
  await expect(start('fixed-snapshot')).rejects.toThrow('同一请求标识');
});

test('persistent request deduplication spans restarts and cannot collide with task-table requests', async () => {
  const { r, root, worker, device, imported, queue, start } = await fixture();
  const item = await imported();
  await queue([item.versionId]);
  const run = await start('persistent');
  expect((await start('persistent')).id).toBe(run.id);
  expect(worker.tasks).toHaveLength(1);
  await r.handle('plan.save', {
    plan: { id: 'legacy', name: '旧任务表', tasks: [{ type: 'Award' }] },
  });
  await expect(
    r.startRun({ planId: 'legacy', deviceId: device.id, requestId: 'persistent' }),
  ).rejects.toThrow('同一请求标识');
  worker.complete();
  await r.tick(true);
  await r.close();
  runtimes.splice(runtimes.indexOf(r), 1);
  const nextWorker = new Worker(),
    next = open(root, nextWorker);
  const existing = await next.handle('copilot.start', {
    kind: 'Copilot',
    requestId: 'persistent',
    deviceId: device.id,
  });
  expect(existing.id).toBe(run.id);
  expect(nextWorker.tasks).toHaveLength(0);
});

test('equivalent workspace field ordering retries the same run while queue order remains significant', async () => {
  const { r, root, worker, device, imported, queue, start } = await fixture();
  const item = await imported();
  const workspace = await queue([item.versionId, item.versionId], 'Copilot', {
    formation: true,
    additionalOperators: [{ name: '合成干员', skill: 1 }],
  });
  const run = await start('canonical'),
    reordered = reverseObjectKeys(workspace);
  expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(workspace));
  await r.handle('copilot.workspace.save', { workspace: reordered });
  expect(r.copilot.prepare('Copilot').identity).toBe(r.store.get('request', 'canonical').identity);
  expect((await start('canonical')).id).toBe(run.id);
  expect(worker.tasks).toHaveLength(1);
  worker.complete();
  await r.tick(true);
  await r.close();
  runtimes.splice(runtimes.indexOf(r), 1);
  const nextWorker = new Worker(),
    next = open(root, nextWorker),
    params = { kind: 'Copilot', requestId: 'canonical', deviceId: device.id };
  expect((await next.handle('copilot.start', params)).id).toBe(run.id);
  reordered.queue.reverse();
  await next.handle('copilot.workspace.save', { workspace: reordered });
  await expect(next.handle('copilot.start', params)).rejects.toThrow('同一请求标识');
  expect(nextWorker.tasks).toHaveLength(0);
});

test('legacy field-order hashes still deduplicate reordered workspaces after restart without accepting changed options', async () => {
  const { r, root, worker, device, imported, queue, start } = await fixture();
  const item = await imported();
  const workspace = await queue([item.versionId]);
  const run = await start('legacy-workspace'),
    request = r.store.get('request', 'legacy-workspace'),
    snapshot = r.store.get('run_snapshot', run.id);
  const legacy = createHash('sha256').update(JSON.stringify(snapshot.workspace)).digest('hex');
  expect(legacy).not.toBe(request.identity);
  r.store.put('request', 'legacy-workspace', { ...request, identity: legacy });
  const reordered = reverseObjectKeys(workspace);
  await r.handle('copilot.workspace.save', { workspace: reordered });
  worker.complete();
  await r.tick(true);
  await r.close();
  runtimes.splice(runtimes.indexOf(r), 1);
  const nextWorker = new Worker(),
    next = open(root, nextWorker),
    params = { kind: 'Copilot', requestId: 'legacy-workspace', deviceId: device.id };
  expect((await next.handle('copilot.start', params)).id).toBe(run.id);
  reordered.options.loopTimes = 2;
  await next.handle('copilot.workspace.save', { workspace: reordered });
  await expect(next.handle('copilot.start', params)).rejects.toThrow('同一请求标识');
  expect(nextWorker.tasks).toHaveLength(0);
});

test('task-table, tool, update, manual-click and worker idle gates share copilot occupancy', async () => {
  const { r, worker, device, imported, queue, start } = await fixture();
  const item = await imported();
  await queue([item.versionId]);
  await r.handle('plan.save', {
    plan: { id: 'legacy', name: '旧任务表', tasks: [{ type: 'Award' }] },
  });
  const attempts = await Promise.allSettled([
    start('competing-copilot'),
    r.startRun({ planId: 'legacy', deviceId: device.id, requestId: 'competing-plan' }),
    r.handle('tool.start', { kind: 'depot', deviceId: device.id, requestId: 'competing-tool' }),
  ]);
  expect(attempts.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
  expect(worker.tasks).toHaveLength(1);
  const winner = (attempts[0] as PromiseFulfilledResult<any>).value;
  expect(winner.source).toBe('copilot');
  expect(r.availability(device.id)).toMatchObject({
    owner: 'run',
    ownerId: winner.id,
    available: false,
  });
  await r.stopRun(winner.id);
  worker.idle();
  await r.tick(true);
  worker.safeIdle = false;
  await expect(start('unsafe')).rejects.toThrow('核心或异步操作');
  worker.safeIdle = true;
  r.appUpdating = true;
  await expect(
    r.startCopilot({ kind: 'Copilot', deviceId: device.id, requestId: 'updating' }),
  ).rejects.toThrow('更新');
  r.appUpdating = false;
  const frame = await r.preview.frame({ deviceId: device.id });
  let acknowledge!: () => void;
  worker.click = async () => {
    await new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    return { accepted: true };
  };
  const click = r.preview.click({
    deviceId: device.id,
    frameId: frame.frameId,
    requestId: 'manual',
    x: 10,
    y: 10,
  });
  await Promise.resolve();
  await expect(start('manual-race')).rejects.toThrow('人工控制');
  acknowledge();
  await click;
  const resource = r.updates.channel('resource');
  r.store.put('update', 'resource', { ...resource, status: 'waiting_idle' });
  await expect(start('resource-switch')).rejects.toThrow('切换');
  r.store.put('update', 'resource', resource);
  r.running = false;
  await expect(start('shutdown')).rejects.toThrow('退出');
  r.running = true;
  await r.beforeSwitch();
  await expect(start('core-switch')).rejects.toThrow('切换');
  await r.finishSwitch();
  expect(worker.tasks).toHaveLength(1);
});

test('stop keeps workspace and unexecuted entries; stale callbacks cannot turn it into success', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item = await imported(),
    workspace = await queue([item.versionId, item.versionId]);
  const run = await start();
  worker.load(0);
  await r.tick(true);
  await r.stopRun(run.id);
  worker.battle('StageDrops-Stars-3');
  worker.complete();
  await r.tick(true);
  const ended = await detail(run.id);
  expect(ended.status).toBe('stopped');
  expect(ended.copilotEntries[0].verdict).toBe('unknown');
  expect(ended.copilotEntries[1].status).toBe('skipped');
  expect(await r.handle('copilot.workspace.get', { kind: 'Copilot' })).toEqual(workspace);
  expect(worker.tasks).toHaveLength(1);
});

test.each([
  ['Copilot', 'FightMissionFailed'],
  ['Copilot', 'FightMissionFailed-Bypass'],
  ['Copilot', 'Copilot@FightMissionFailed'],
  ['ParadoxCopilot', 'FightMissionFailed'],
] as const)('%s failure %s stops later duplicate entries', async (kind, failure) => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item =
    kind === 'ParadoxCopilot'
      ? await imported({ stage_name: 'mem_test', opers: [], actions: [] })
      : await imported();
  await queue([item.versionId, item.versionId], kind);
  const run = await start(crypto.randomUUID(), kind);
  worker.load(0);
  worker.battle(failure);
  worker.load(1);
  await r.tick(true);
  expect(worker.stops).toBe(1);
  expect((await detail(run.id)).status).toBe('running');
  expect(
    r
      .snapshot()
      .events.filter((event) => event.type === 'run.copilot_result' && event.data.runId === run.id),
  ).toHaveLength(1);
  worker.idle();
  await r.tick(true);
  const failed = await detail(run.id);
  expect(failed.status).toBe('failed');
  expect(failed.copilotEntries[0]).toMatchObject({ status: 'failed', verdict: 'failure' });
  expect(failed.copilotEntries[1].status).toBe('skipped');
  expect(
    (await r.handle('copilot.workspace.get', { kind })).queue.every((entry: any) => entry.enabled),
  ).toBe(true);
  expect(
    r
      .snapshot()
      .events.filter((event) => event.type === 'run.copilot_result' && event.data.runId === run.id)
      .every((event) => !event.data.workspaceSelection),
  ).toBe(true);
});

test('a delayed previous-entry defeat cannot fail the next entry before its battle starts', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item = await imported();
  await queue([item.versionId, item.versionId]);
  const run = await start();
  worker.load(0);
  worker.callback(20001, { subtask: 'BattleProcessTask' });
  worker.load(1);
  worker.callback(20001, {
    subtask: 'ProcessTask',
    details: { task: 'FightMissionFailed' },
  });
  await r.tick(true);
  expect(worker.stops).toBe(0);
  expect((await detail(run.id)).copilotEntries[1]).toMatchObject({
    status: 'running',
    verdict: 'unknown',
  });
});

test.each([0, 1])(
  'paradox bypass failure at entry %i continues its queue and only aggregates after completion and idle',
  async (failedIndex) => {
    const { r, worker, device, imported, queue, start, detail } = await fixture();
    const item = await imported({ stage_name: 'mem_test', opers: [], actions: [] });
    await queue([item.versionId, item.versionId], 'ParadoxCopilot', { autoLikeOnSuccess: true });
    let automaticFeedback = 0;
    r.copilot.autoLikeConfirmed = () => {
      automaticFeedback++;
    };
    const run = await start(crypto.randomUUID(), 'ParadoxCopilot');
    worker.load(0);
    if (failedIndex === 1) {
      worker.battle('StageDrops-Stars-3');
      worker.load(1);
    }
    worker.battle('FightMissionFailed-Bypass');
    worker.load(failedIndex);
    // A duplicated load and a late settlement cannot erase a known defeat.
    worker.battle('StageDrops-Stars-3');
    await r.tick(true);
    expect(worker.stops).toBe(0);
    expect((await detail(run.id)).status).toBe('running');
    expect((await detail(run.id)).copilotEntries[failedIndex]).toMatchObject({
      status: 'failed',
      verdict: 'failure',
    });
    expect(r.store.get('execution', run.id).failed).toBe(false);
    if (failedIndex === 0) {
      worker.load(1);
      await r.tick(true);
      expect((await detail(run.id)).copilotEntries[1]).toMatchObject({
        status: 'running',
        verdict: 'unknown',
      });
    }
    // Neither task completion plus idle nor queue completion with pending async calls is enough.
    worker.callback(10002);
    worker.idle();
    await r.tick(true);
    expect((await detail(run.id)).status).toBe('running');
    worker.callback(3);
    worker.idle([19]);
    await r.tick(true);
    expect((await detail(run.id)).status).toBe('running');
    expect(r.availability(device.id).available).toBe(false);
    worker.idle();
    await r.tick(true);
    const finished = await detail(run.id);
    expect(finished).toMatchObject({ status: 'failed', progress: 100 });
    expect(finished.message).toContain('存在战斗失败');
    expect(finished.copilotEntries[failedIndex]).toMatchObject({
      status: 'failed',
      verdict: 'failure',
    });
    expect(finished.copilotEntries[1 - failedIndex]).toMatchObject({
      status: 'completed',
      verdict: failedIndex === 0 ? 'unknown' : 'success',
    });
    if (failedIndex === 0) expect(finished.message).toContain('通关结果未确认');
    expect(worker.stops).toBe(0);
    expect(r.availability(device.id).available).toBe(true);
    expect(automaticFeedback).toBe(0);
  },
);

for (const first of ['Copilot@WaitUntilEndOfAction', 'BattleStartAll'])
  test(`${first} errors stop later entries and cannot be overwritten by completion callbacks`, async () => {
    const { r, worker, imported, queue, start, detail } = await fixture();
    const item = await imported();
    await queue([item.versionId, item.versionId]);
    const run = await start();
    worker.load(0);
    worker.callback(20000, { taskid: 999, subtask: 'ProcessTask', first: [first] });
    await r.tick(true);
    expect(worker.stops).toBe(0);
    worker.callback(20000, { subtask: 'ProcessTask', first: [first] });
    worker.battle('StageDrops-Stars-3');
    worker.load(1);
    worker.complete();
    await r.tick(true);
    const failed = await detail(run.id);
    expect(worker.stops).toBe(1);
    expect(failed.status).toBe('failed');
    expect(failed.copilotEntries[0]).toMatchObject({ status: 'failed', verdict: 'unknown' });
    expect(failed.copilotEntries[1].status).toBe('skipped');
    expect(failed.message).toContain(first === 'BattleStartAll' ? '理智' : '三星');
    if (first === 'Copilot@WaitUntilEndOfAction')
      expect(failed.message).toContain('未通过三星结算检查（未三星或识别失败）');
  });

test('a missing settlement task fails the queue without claiming a game defeat', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item = await imported();
  await queue([item.versionId, item.versionId]);
  const run = await start();
  worker.load(0);
  worker.callback(20001, { subtask: 'BattleProcessTask' });
  worker.callback(20000, {
    subtask: 'ProcessTask',
    first: ['Copilot@WaitUntilEndOfAction'],
    what: 'UnknownTask',
    details: { tasks: ['Copilot@StageDrops-Stars-3'] },
  });
  worker.complete();
  await r.tick(true);
  const failed = await detail(run.id);
  expect(worker.stops).toBe(1);
  expect(failed.status).toBe('failed');
  expect(failed.copilotEntries[0]).toMatchObject({ status: 'failed', verdict: 'unknown' });
  expect(failed.copilotEntries[0].message).not.toContain('已识别战斗失败');
  expect(failed.copilotEntries[1].status).toBe('skipped');
});

test('a failed failure-stop closes the worker and keeps later work unexecuted', async () => {
  const { r, worker, device, imported, queue, start, detail } = await fixture();
  const item = await imported();
  await queue([item.versionId, item.versionId]);
  const run = await start();
  worker.stop = async () => {
    throw new Error('合成停止失败');
  };
  worker.load(0);
  worker.battle('FightMissionFailed');
  await r.tick(true);
  expect(r.workers.has(device.id)).toBe(false);
  expect((await detail(run.id)).status).toBe('failed');
  expect((await detail(run.id)).copilotEntries[1].status).toBe('skipped');
});

test('copilot navigation uses the selected device client and preserves it in the execution snapshot', async () => {
  const { r, root, worker, device, imported, queue, start } = await fixture();
  const item = await imported();
  const workspace = await queue([item.versionId, item.versionId]);
  workspace.queue[1].navName = 'Fixture-JP';
  await r.handle('copilot.workspace.save', { workspace });
  const jp = path.join(root, 'generation', 'resource', 'global', 'YoStarJP', 'resource');
  mkdirSync(jp, { recursive: true });
  writeFileSync(path.join(jp, 'tasks.json'), JSON.stringify({ 'Fixture-JP': {} }));
  r.store.put('device_client', device.id, 'YoStarJP');
  const run = await start();
  expect(worker.tasks).toHaveLength(1);
  expect(r.store.get('run_snapshot', run.id).clientType).toBe('YoStarJP');
  r.store.put('device_client', device.id, 'Official');
  expect(r.store.get('execution', run.id).clientType).toBe('YoStarJP');
});

test('disconnect and restart interrupt uncertain copilot work without replaying native effects', async () => {
  const { r, root, worker, imported, queue, start, detail } = await fixture();
  const item = await imported();
  await queue([item.versionId]);
  const run = await start('disconnect');
  worker.callback(2, { what: 'Disconnect' });
  await r.tick(true);
  expect(await detail(run.id)).toMatchObject({
    status: 'failed',
    copilotEntries: [{ verdict: 'unknown' }],
  });
  expect((await start('disconnect')).id).toBe(run.id);
  expect(worker.tasks).toHaveLength(1);
  const stored = r.store.get('run', run.id);
  await r.close();
  runtimes.splice(runtimes.indexOf(r), 1);
  // Simulate crash residue after graceful shutdown so stopRun cannot rewrite it.
  // The next constructor must mark both the run and its active entry uncertain.
  stored.status = 'running';
  stored.copilotEntries[0].status = 'running';
  const crashed = new Store(root);
  try {
    crashed.put('run', run.id, stored);
  } finally {
    crashed.close();
  }
  const next = open(root);
  expect((await next.handle('run.detail', { id: run.id })).status).toBe('failed');
});

test('SSS and paradox retain their native filename and list modes with independent occurrence IDs', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const sss = await imported({
    type: 'SSS',
    stage_name: '合成保全地图',
    tool_men: {},
    stages: [{ stage_name: 'sss_stage', strategies: [], draw_as_possible: true, actions: [] }],
  });
  await queue([sss.versionId], 'SSSCopilot', { loopTimes: 2 });
  const sssRun = await start('sss', 'SSSCopilot');
  expect(worker.tasks[0]).toMatchObject({ type: 'SSSCopilot', params: { loop_times: 2 } });
  expect(Object.keys(worker.tasks[0].params).sort()).toEqual(['filename', 'loop_times']);
  worker.battle('StageDrops-Stars-3');
  worker.complete();
  await r.tick(true);
  expect((await detail(sssRun.id)).copilotEntries[0].verdict).toBe('unknown');
  const paradox = await imported({
    stage_name: 'mem_test',
    opers: [],
    actions: [],
    doc: { title: '合成悖论' },
  });
  await queue([paradox.versionId], 'ParadoxCopilot');
  const singleParadoxRun = await start('single-paradox', 'ParadoxCopilot');
  expect(worker.tasks[1].type).toBe('ParadoxCopilot');
  expect(Object.keys(worker.tasks[1].params)).toEqual(['filename']);
  expect(worker.tasks[1].params.filename).toMatch(/\.json$/);
  expect((await detail(singleParadoxRun.id)).copilotEntries[0]).toMatchObject({
    nativeId: 1,
    status: 'running',
  });
  worker.complete();
  await r.tick(true);
  expect((await detail(singleParadoxRun.id)).copilotEntries[0]).toMatchObject({
    status: 'completed',
    verdict: 'unknown',
  });
  await queue([paradox.versionId, paradox.versionId], 'ParadoxCopilot');
  const paradoxRun = await start('paradox', 'ParadoxCopilot');
  expect(worker.tasks[2].type).toBe('ParadoxCopilot');
  expect(worker.tasks[2].params.filename).toBeUndefined();
  expect(worker.tasks[2].params.copilot_list).toBeUndefined();
  expect(worker.tasks[2].params.list).toHaveLength(2);
  expect(worker.tasks[2].params.list[0].id).toBe(1);
  expect(worker.tasks[2].params.list[1].id).toBe(2);
  worker.load(0);
  await r.tick(true);
  expect((await detail(paradoxRun.id)).copilotEntries[0].status).toBe('running');
});

test('idle devices can run separately and stopping one never stops another source', async () => {
  const { r, worker, device, connect, imported, queue, start, detail } = await fixture();
  const item = await imported();
  await queue([item.versionId]);
  const other = await connect(5557),
    otherWorker = r.workers.get(other.id) as unknown as Worker;
  const first = await start('first-device');
  await r.handle('plan.save', {
    plan: { id: 'parallel', name: '并行任务表', tasks: [{ type: 'Award' }] },
  });
  const second = await r.startRun({
    planId: 'parallel',
    deviceId: other.id,
    requestId: 'other-device',
  });
  expect(r.snapshot().runs.filter((run) => run.status === 'running')).toHaveLength(2);
  expect(otherWorker.tasks).toHaveLength(1);
  await r.stopRun(first.id);
  worker.idle();
  await r.tick(true);
  expect((await detail(first.id)).status).toBe('stopped');
  expect((await detail(second.id)).status).toBe('running');
  expect(otherWorker.stops).toBe(0);
  expect(r.availability(device.id).available).toBe(true);
  expect(r.availability(other.id).available).toBe(false);
});

test('a delayed callback from an older task cannot update the next run on the same device', async () => {
  const { r, worker, imported, queue, start, detail } = await fixture();
  const item = await imported();
  await queue([item.versionId]);
  const old = await start('old');
  worker.complete();
  await r.tick(true);
  const next = await start('next');
  worker.callback(20002, {
    taskid: 1,
    taskchain: 'Copilot',
    subtask: 'ProcessTask',
    details: { task: 'StageDrops-Stars-3' },
  });
  worker.callback(10002, { taskid: 1 });
  worker.callback(3, { taskid: 1 });
  worker.idle();
  await r.tick(true);
  expect((await detail(old.id)).status).toBe('completed');
  expect((await detail(next.id)).status).toBe('running');
  expect((await detail(next.id)).copilotEntries[0].verdict).toBe('unknown');
  worker.battle('StageDrops-Stars-3');
  worker.complete();
  await r.tick(true);
  expect((await detail(next.id)).copilotEntries[0].verdict).toBe('success');
});

test('legacy null navigation reaches the native worker without changing the saved plan or run snapshot', async () => {
  const { r, root, worker, device, imported, detail } = await fixture(),
    item = await imported();
  await r.handle('plan.save', {
    plan: {
      id: 'legacy',
      name: '旧作业任务表',
      tasks: [
        {
          type: 'Copilot',
          params: {
            copilot_list: [
              {
                filename: path.join(root, 'copilot', 'versions', item.versionId + '.json'),
                id: 1,
                nav_name_override: null,
              },
            ],
          },
        },
      ],
    },
  });
  const run = await r.startRun({
    planId: 'legacy',
    deviceId: device.id,
    requestId: 'legacy-null-navigation',
  });
  expect((await detail(run.id)).status).toBe('running');
  expect(worker.tasks).toHaveLength(1);
  expect(worker.tasks[0].params.copilot_list[0]).not.toHaveProperty('nav_name_override');
  expect(
    r.store.get('plan', 'legacy').tasks[0].params.copilot_list[0].nav_name_override,
  ).toBeNull();
  expect(
    r.store.get('run_plan', run.id).tasks[0].params.copilot_list[0].nav_name_override,
  ).toBeNull();
});

test('legacy request records and run_plan snapshots remain readable after the shared execution refactor', async () => {
  const { r, worker, device } = await fixture();
  await r.handle('plan.save', {
    plan: { id: 'legacy', name: '旧任务表', tasks: [{ type: 'Award' }, { type: 'Mall' }] },
  });
  const run = await r.startRun({
    planId: 'legacy',
    deviceId: device.id,
    requestId: 'legacy-request',
  });
  const persisted = r.store.get('request', 'legacy-request');
  delete persisted.source;
  delete persisted.identity;
  r.store.put('request', 'legacy-request', persisted);
  expect(
    (await r.startRun({ planId: 'legacy', deviceId: device.id, requestId: 'legacy-request' })).id,
  ).toBe(run.id);
  expect(r.store.get('run_plan', run.id).tasks).toHaveLength(2);
  expect(r.store.get('run_snapshot', run.id)).toBeUndefined();
  worker.complete();
  await r.tick(true);
  expect(worker.tasks).toHaveLength(2);
  worker.complete();
  await r.tick(true);
  expect(r.store.get('run', run.id).status).toBe('completed');
});
