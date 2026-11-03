import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import type { CopilotKind } from '@contracts/rpc-types';
import { FakeFramework, frameworkFixtureOptions } from './framework-fixture';
import { copilotWorkspaceIdentity } from '@backend/modules/copilot/copilot';
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
function open(root: string, worker = new FakeFramework()) {
  const r = new Runtime(
    root,
    frameworkFixtureOptions({
      frameworkWorkerFactory: async (config) =>
        config.address === '127.0.0.1:5555' ? worker : new FakeFramework(),
    }),
  );
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
    }),
  );
  for (const file of ['main.json', 'paradox.json', 'sss.json'])
    writeFileSync(path.join(resource, file), '{}');
  writeFileSync(path.join(resource, '..', 'tasks.json'), JSON.stringify({ Episode1: {} }));
  const worker = new FakeFramework(),
    r = open(root, worker);
  r.store.put('active', 'combo', {
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

/** Persisted executions are migration fixtures, never new native submissions. */
function historical(r: Runtime, deviceId: string, requestId: string, workspace: any) {
  const id = 'historical-' + requestId,
    at = '2026-10-01T00:00:00.000Z';
  const entries = workspace.queue
    .filter((entry: any) => entry.enabled)
    .map((entry: any, index: number) => ({
      id: entry.id,
      versionId: entry.versionId,
      title: '历史作业',
      nativeId: index + 1,
      status: 'completed',
      verdict: 'unknown',
      message: '历史记录，通关未确认',
    }));
  const run = {
    id,
    source: 'copilot',
    sourceName: '历史作业',
    planId: null,
    planName: '历史作业',
    deviceId,
    status: 'completed',
    progress: 100,
    message: '历史执行已结束',
    startedAt: at,
    finishedAt: at,
    copilotKind: workspace.kind,
    copilotEntries: entries,
    tasks: [
      {
        index: 0,
        type: workspace.kind,
        status: 'completed',
        message: '历史记录',
        startedAt: at,
        finishedAt: at,
        drops: [],
        infrastructure: [],
        artifacts: [],
      },
    ],
  };
  const snapshot = {
    source: 'copilot',
    name: run.planName,
    kind: workspace.kind,
    identity: copilotWorkspaceIdentity(workspace),
    workspace: structuredClone(workspace),
    entries,
    tasks: [{ type: workspace.kind, enabled: true, params: {} }],
  };
  r.store.put('run', id, run);
  r.store.put('run_snapshot', id, snapshot);
  r.store.put('request', requestId, {
    runId: id,
    source: 'copilot',
    kind: workspace.kind,
    identity: snapshot.identity,
    deviceId,
    planId: null,
  });
  return { run, snapshot };
}

test('new ordinary, SSS and paradox execution is explicitly blocked and retains configuration and files', async () => {
  const { r, worker, imported, queue, start } = await fixture();
  const item = await imported();
  const workspace = await queue([item.versionId, item.versionId]);
  const version = r.store.get('copilot_version', item.versionId);
  for (const kind of ['Copilot', 'SSSCopilot', 'ParadoxCopilot'] as const) {
    const before = await r.handle('copilot.workspace.get', { kind });
    const preflight = await r.handle('execution.preflight', {
      source: 'copilot',
      kind: kind === 'SSSCopilot' ? 'sss' : kind === 'ParadoxCopilot' ? 'paradox' : 'copilot',
    });
    expect(preflight.supported).toBe(false);
    await expect(start('blocked-' + kind, kind)).rejects.toThrow('尚未迁移');
    expect(await r.handle('copilot.workspace.get', { kind })).toEqual(before);
  }
  expect(await r.handle('copilot.workspace.get', { kind: 'Copilot' })).toEqual(workspace);
  expect(r.store.get('copilot_version', item.versionId)).toEqual(version);
  expect(worker.submitted).toEqual([]);
  expect(worker.clicks).toEqual([]);
  expect(r.store.all('run')).toEqual([]);
  expect(r.store.all('request')).toEqual([]);
});

test('imported immutable JSON, duplicate queue entries and option editing survive restart', async () => {
  const { r, root, imported, queue } = await fixture();
  const item = await imported();
  const workspace = await queue([item.versionId, item.versionId], 'Copilot', {
    formation: true,
    formationIndex: 2,
    additionalOperators: [{ name: '合成干员', skill: 1 }],
  });
  const stored = r.store.get('copilot_version', item.versionId);
  expect(workspace.queue.map((entry: any) => entry.id)).toEqual(['entry-1', 'entry-2']);
  await r.close();
  runtimes.splice(runtimes.indexOf(r), 1);
  const next = open(root);
  expect(await next.handle('copilot.workspace.get', { kind: 'Copilot' })).toEqual(workspace);
  expect(next.store.get('copilot_version', item.versionId)).toEqual(stored);
  expect((await next.handle('copilot.get', { id: item.id })).versionId).toBe(item.versionId);
});

test('library deletion preserves immutable historical execution snapshots and entry identities', async () => {
  const { r, device, imported, queue, detail } = await fixture();
  const item = await imported();
  const workspace = await queue([item.versionId]);
  const { run, snapshot } = historical(r, device.id, 'frozen', workspace);
  await r.handle('copilot.delete', { id: item.id });
  expect(r.store.get('run_snapshot', run.id)).toEqual(snapshot);
  expect((await detail(run.id)).copilotEntries[0]).toMatchObject({
    versionId: item.versionId,
    verdict: 'unknown',
  });
  expect(r.store.get('copilot_version', item.versionId)).toBeDefined();
  expect(r.snapshot().runs[0].copilotEntries).toBeUndefined();
});

test('persistent historical request deduplication spans restarts and cannot collide with task tables', async () => {
  const { r, root, device, imported, queue, start } = await fixture();
  const item = await imported();
  const workspace = await queue([item.versionId]);
  const { run } = historical(r, device.id, 'persistent', workspace);
  expect((await start('persistent')).id).toBe(run.id);
  await r.handle('plan.save', {
    plan: { id: 'legacy', name: '旧任务表', tasks: [{ type: 'Award' }] },
  });
  await expect(
    r.startRun({ planId: 'legacy', deviceId: device.id, requestId: 'persistent' }),
  ).rejects.toThrow('同一请求标识');
  await r.close();
  runtimes.splice(runtimes.indexOf(r), 1);
  const nextWorker = new FakeFramework(),
    next = open(root, nextWorker);
  expect(
    (
      await next.handle('copilot.start', {
        kind: 'Copilot',
        requestId: 'persistent',
        deviceId: device.id,
      })
    ).id,
  ).toBe(run.id);
  expect(nextWorker.submitted).toEqual([]);
});

test('canonical workspace ordering deduplicates history while queue order remains significant', async () => {
  const { r, device, imported, queue, start } = await fixture();
  const item = await imported();
  const workspace = await queue([item.versionId, item.versionId], 'Copilot', { formation: true });
  const { run } = historical(r, device.id, 'canonical', workspace);
  const reordered = reverseObjectKeys(workspace);
  await r.handle('copilot.workspace.save', { workspace: reordered });
  expect((await start('canonical')).id).toBe(run.id);
  reordered.queue.reverse();
  await r.handle('copilot.workspace.save', { workspace: reordered });
  await expect(start('canonical')).rejects.toThrow('同一请求标识');
});

test('legacy field-order hashes deduplicate historical workspaces without accepting changed options', async () => {
  const { r, device, imported, queue, start } = await fixture();
  const item = await imported();
  const workspace = await queue([item.versionId]);
  const { run, snapshot } = historical(r, device.id, 'legacy-workspace', workspace);
  const request = r.store.get('request', 'legacy-workspace');
  r.store.put('request', 'legacy-workspace', {
    ...request,
    identity: createHash('sha256').update(JSON.stringify(snapshot.workspace)).digest('hex'),
  });
  const reordered = reverseObjectKeys(workspace);
  await r.handle('copilot.workspace.save', { workspace: reordered });
  expect((await start('legacy-workspace')).id).toBe(run.id);
  reordered.options.loopTimes = 2;
  await r.handle('copilot.workspace.save', { workspace: reordered });
  await expect(start('legacy-workspace')).rejects.toThrow('同一请求标识');
});

test('legacy plan requests and run_plan snapshots remain readable without replaying native effects', async () => {
  const { r, device, worker } = await fixture();
  const plan = await r.handle('plan.save', {
    plan: { id: 'legacy', name: '旧任务表', tasks: [{ type: 'Award' }, { type: 'Mall' }] },
  });
  const { run } = historical(r, device.id, 'legacy-request', {
    kind: 'Copilot',
    queue: [],
    options: {},
  });
  r.store.put('run', run.id, {
    ...run,
    source: 'plan',
    planId: plan.id,
    copilotKind: undefined,
    copilotEntries: undefined,
  });
  r.store.put('run_plan', run.id, plan);
  r.store.delete('run_snapshot', run.id);
  r.store.put('request', 'legacy-request', { runId: run.id, planId: plan.id, deviceId: device.id });
  expect(
    (await r.startRun({ planId: plan.id, deviceId: device.id, requestId: 'legacy-request' })).id,
  ).toBe(run.id);
  expect(r.store.get('run_plan', run.id).tasks).toHaveLength(2);
  expect(worker.submitted).toEqual([]);
});
