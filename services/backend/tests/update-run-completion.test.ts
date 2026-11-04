import { afterEach, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { snapshotIntegrity } from '@backend/infrastructure/filesystem/snapshot-integrity';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  runtimes: Runtime[] = [];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class Worker {
  connected = true;
  safeIdle = true;
  closed = false;
  events: any[] = [];
  tasks: any[] = [];
  async connect() {
    return { asyncId: 1 };
  }
  async waitConnected() {
    return true;
  }
  async task(task: any) {
    this.tasks.push(task);
    this.safeIdle = false;
    return { taskId: this.tasks.length };
  }
  async stop() {
    return { stopping: true };
  }
  async close() {
    this.closed = true;
    this.connected = false;
  }
  complete(pending: number[] = []) {
    const taskid = this.tasks.length;
    this.events.push(
      { type: 'callback', message: 10002, details: { taskid } },
      { type: 'callback', message: 3, details: { taskid } },
    );
    this.idle(pending);
  }
  idle(pending: number[] = []) {
    this.safeIdle = !pending.length;
    this.events.push({ type: 'status', running: false, pendingAsync: pending });
  }
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(channel: 'core' | 'resource') {
  const root = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-update-run-completion-'));
  roots.push(root);
  const workers: Worker[] = [],
    events: any[] = [],
    validations: any[] = [],
    validationStarted = deferred(),
    allowValidation = deferred();
  const runtime = new Runtime(root, {
    calendar: { fetcher: null },
    adbExecutable: () => 'synthetic-adb',
    workerFactory: async () => {
      const worker = new Worker();
      workers.push(worker);
      return worker;
    },
    validator: async (core: string, resource: string, version: string) => {
      validations.push({ core, resource, version });
      validationStarted.resolve();
      await allowValidation.promise;
    },
    notify: (event) => {
      if (event.params.type === 'update.changed') events.push(event.params.data.update);
    },
  });
  runtimes.push(runtime);
  async function generation(name: string, version: string) {
    const directory = path.join(root, 'components', 'generations', name),
      resources = path.join(directory, 'resource'),
      stages = path.join(resources, 'Arknights-Tile-Pos');
    await mkdir(stages, { recursive: true });
    const library =
      process.platform === 'win32'
        ? 'MaaCore.dll'
        : process.platform === 'darwin'
          ? 'libMaaCore.dylib'
          : 'libMaaCore.so';
    await writeFile(path.join(directory, library), 'synthetic library, never loaded');
    await writeFile(path.join(resources, 'version.json'), '{}');
    await writeFile(
      path.join(stages, 'overview.json'),
      JSON.stringify({
        main: {
          stageId: 'main_01-07',
          levelId: 'main_01-07',
          code: '1-7',
          name: '合成关卡',
          filename: 'main.json',
        },
      }),
    );
    await writeFile(path.join(stages, 'main.json'), '{}');
    return {
      path: directory,
      version,
      releaseChannel: 'stable',
      ...(await snapshotIntegrity(directory)),
    };
  }
  const original = await generation('core-original', 'v6.20.0'),
    candidate = {
      ...(await generation(
        `${channel}-candidate`,
        channel === 'core' ? 'v6.20.1' : 'a'.repeat(40),
      )),
      ...(channel === 'resource' ? { coreVersion: original.version } : {}),
    };
  runtime.store.put('active', 'combo', { core: original, resource: original });
  const devices = [];
  for (const port of [5555, 5557, 5559]) {
    const device = await runtime.connectDevice({ address: `127.0.0.1:${port}` });
    runtime.store.put('device', device.id, { ...device, state: 'idle' });
    devices.push(device);
  }
  return {
    runtime,
    workers,
    events,
    validations,
    devices,
    original,
    candidate,
    validationStarted,
    allowValidation,
  };
}

test.each(['core', 'resource'] as const)(
  '%s update validates and switches once after whole task tables, copilot and tools finish',
  async (channel) => {
    const {
      runtime: r,
      workers,
      events,
      validations,
      devices,
      original,
      candidate,
      validationStarted,
      allowValidation,
    } = await fixture(channel);
    await r.handle('plan.save', {
      plan: {
        id: 'table',
        name: '合成任务表',
        tasks: [{ type: 'Award' }, { type: 'Mall' }, { type: 'Award' }],
      },
    });
    const preview = await r.handle('copilot.preview', {
      content: JSON.stringify({
        stage_name: 'main_01-07',
        opers: [],
        actions: [{ type: 'SpeedUp' }],
        minimum_required: 'v6.20.0',
        doc: { title: '合成作业' },
      }),
      name: 'fixture.json',
    });
    const imported = await r.handle('copilot.import', { previewId: preview.id }),
      workspace = await r.handle('copilot.workspace.get', { kind: 'Copilot' });
    workspace.queue = [
      {
        id: 'entry',
        versionId: imported.items[0].versionId,
        enabled: true,
        isRaid: false,
        navName: '',
      },
    ];
    await r.handle('copilot.workspace.save', { workspace });
    const table = await r.startRun({
        planId: 'table',
        deviceId: devices[0].id,
        requestId: 'table-run',
      }),
      copilot = await r.handle('copilot.start', {
        kind: 'Copilot',
        deviceId: devices[1].id,
        requestId: 'copilot-run',
      }),
      tool = await r.handle('tool.start', {
        kind: 'depot',
        deviceId: devices[2].id,
        clientType: 'Official',
        config: {},
        requestId: 'tool-run',
      });
    r.store.put('staged', channel, candidate);
    expect((await r.updates.activate(channel)).status).toBe('waiting_idle');
    events.length = 0;
    const assertWaiting = async () => {
      await r.updates.activatePending();
      expect(r.updates.channel(channel).status).toBe('waiting_idle');
      expect(r.store.get('active', 'combo')).toEqual({ core: original, resource: original });
      expect(validations).toEqual([]);
      expect(events.filter((event) => event.status === 'downloading')).toEqual([]);
      expect(workers).toHaveLength(3);
      expect(workers.every((worker) => !worker.closed)).toBe(true);
    };
    await assertWaiting();
    for (const completed of [1, 2]) {
      workers[0].complete();
      await r.tick(true);
      expect(workers[0].tasks).toHaveLength(completed + 1);
      expect(r.store.get('run', table.id).status).toBe('running');
      await assertWaiting();
    }
    workers[0].complete();
    await r.tick(true);
    expect(r.store.get('run', table.id).status).toBe('completed');
    await assertWaiting();
    await expect(
      r.startRun({ planId: 'table', deviceId: devices[0].id, requestId: 'blocked-new-run' }),
    ).rejects.toThrow('切换');
    workers[1].complete([7]);
    await r.tick(true);
    expect(r.store.get('run', copilot.id).status).toBe('running');
    await assertWaiting();
    workers[1].idle();
    await r.tick(true);
    expect(r.store.get('run', copilot.id).status).toBe('completed');
    await assertWaiting();
    workers[2].events.push({
      type: 'callback',
      message: 20003,
      details: {
        taskid: 1,
        taskchain: 'Depot',
        what: 'DepotInfo',
        details: { done: true, data: '{"30012":12}' },
      },
    });
    workers[2].complete([9]);
    await r.tick(true);
    expect((await r.handle('tool.get', { id: tool.id })).status).toBe('running');
    await assertWaiting();
    workers[2].idle();
    await r.tick(true);
    expect((await r.handle('tool.get', { id: tool.id })).status).toBe('completed');
    expect(r.busy()).toBe(false);
    const activation = r.updates.activatePending();
    try {
      await validationStarted.promise;
      expect(r.updates.channel(channel).status).toBe('downloading');
      expect(workers).toHaveLength(3);
      expect(workers.every((worker) => !worker.closed)).toBe(true);
      await expect(
        r.startRun({ planId: 'table', deviceId: devices[0].id, requestId: 'during-validation' }),
      ).rejects.toThrow('切换');
      await expect(
        r.handle('copilot.start', {
          kind: 'Copilot',
          deviceId: devices[1].id,
          requestId: 'copilot-during-validation',
        }),
      ).rejects.toThrow('切换');
      await expect(
        r.handle('tool.start', {
          kind: 'depot',
          deviceId: devices[2].id,
          clientType: 'Official',
          config: {},
          requestId: 'tool-during-validation',
        }),
      ).rejects.toThrow('切换');
      await expect(r.connectDevice({ address: '127.0.0.1:5561' })).rejects.toThrow('切换');
    } finally {
      allowValidation.resolve();
      await activation;
    }
    expect(r.updates.channel(channel).status).toBe('active');
    expect(r.store.get('active', 'combo')[channel]).toEqual(candidate);
    expect(validations).toHaveLength(1);
    expect(events.filter((event) => event.message === '正在校验更新文件，请稍候')).toHaveLength(1);
    expect(workers).toHaveLength(6);
    expect(workers.slice(0, 3).every((worker) => worker.closed)).toBe(true);
    await r.updates.activatePending();
    await r.tick(true);
    await r.updates.activatePending();
    expect(validations).toHaveLength(1);
    expect(workers).toHaveLength(6);
  },
);
