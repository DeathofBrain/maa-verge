/** 自定义基建整表准入只用合成资源和设备端口：静态缺口不能触发返回主页、连接或强制停止。 */
import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AtomicResourceProfile, AutomationOptions } from '@maaverge/automation';
import { Runtime } from '@backend/app/runtime';
import { defaultScheduler } from '@backend/modules/schedules/scheduler';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';
import { FakeFramework, frameworkFixtureOptions } from './framework-fixture';

const roots: string[] = [];
const runtimes: Runtime[] = [];
const source = { repository: 'synthetic', ref: 'isolated', path: 'battle_data.json' };

/** 所有静态依赖均显式给出，只有测试指定的姓名或自动补位资源缺口会导致拒绝。 */
function profiles(): AutomationOptions {
  const profile: AtomicResourceProfile = {
    id: 'synthetic-infrast-admission',
    clientType: 'Official',
    available: true,
    diagnostics: [],
    sources: [source],
    operatorNames: { names: ['甲', '乙'], source: { ...source, sha256: '0'.repeat(64) } },
    card: {
      regions: [[0, 0, 100, 100]],
      nameOffset: [0, 0, 80, 20],
      facilityOffset: [0, 20, 80, 20],
      selectedOffset: [0, 40, 80, 20],
      clickOffset: [0, 0, 80, 80],
      selectedCount: 1,
      selectedLower: [0],
      selectedUpper: [255],
      moodOffset: [0, 60, 80, 10],
      skillOffset: [0, 70, 80, 10],
    },
    skills: {},
    actions: {},
    rules: Object.fromEntries(
      [
        'overview.enter',
        'operators.clear',
        'operators.confirm',
        'operators.conflict',
        'operators.filter',
        'operators.all',
      ].map((id) => [id, { id, kind: 'template' as const, templateId: `${id}.png`, source }]),
    ),
  };
  const startupIds = [
    'home',
    'start',
    'wake',
    'server',
    'popup.close',
    'popup.supplies',
    'popup.title',
    'loading.icon',
    'loading.text',
    'loading.resource',
    'loading.update',
    'navigation.back',
  ];
  return {
    profile,
    dailyProfiles: {
      startup: {
        id: 'synthetic-startup-admission',
        clientType: 'Official',
        available: true,
        diagnostics: [],
        sources: [source],
        actions: {},
        rules: Object.fromEntries(
          startupIds.map((id) => [
            id,
            { id, kind: 'template' as const, templateId: `${id}.png`, source },
          ]),
        ),
        alternatives: Object.fromEntries(startupIds.map((id) => [id, [id]])),
        adapterBaseline: { repository: 'synthetic', ref: 'isolated', commit: 'isolated' },
      },
    },
  };
}

async function fixture(connected = false) {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-infrast-admission-'));
  roots.push(root);
  const generation = path.join(root, 'generation');
  mkdirSync(path.join(generation, 'resource'), { recursive: true });
  const worker = new FakeFramework();
  worker.holdTasks = true;
  let connections = 0;
  let resourcePreparations = 0;
  let clock = new Date(2026, 9, 24, 3, 0);
  const runtime = new Runtime(root, {
    ...frameworkFixtureOptions(),
    now: () => new Date(clock),
    frameworkWorkerFactory: async () => {
      connections++;
      return worker;
    },
    frameworkResources: async (_device, resource) => {
      resourcePreparations++;
      return {
        path: resource,
        generation: 'isolated-generation',
        sourcePaths: [resource],
        ocrAvailable: false,
        templates: {},
      };
    },
    validator: async () => {},
  });
  runtimes.push(runtime);
  runtime.store.put('active', 'combo', {
    resource: { path: generation, version: 'isolated-resource' },
  });
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555', name: '隔离合成设备' });
  device.state = 'idle';
  runtime.store.put('device', device.id, device);
  if (!connected) await runtime.disconnectDevice(device.id);
  const selected = profiles();
  // 仅注入不可变资源快照；整表编译、文件读取、准入顺序、调度与原生端口仍使用真实宿主。
  runtime['atomicProfiles'] = async () => selected;
  const effects = () => ({
    connections,
    resourcePreparations,
    calls: structuredClone(worker.calls),
    pipelines: structuredClone(worker.submitted),
    clicks: structuredClone(worker.clicks),
    frameCalls: worker.frameCalls,
  });
  const save = async (operator: string, autofill = false) => {
    const filename = path.join(root, 'custom.json');
    const bytes = JSON.stringify({
      plans: [{ rooms: { power: [{ operators: [operator], autofill }] } }],
    });
    writeFileSync(filename, bytes);
    const plan = await runtime.handle('plan.save', {
      plan: {
        id: 'custom',
        name: '保留前项的自定义尾项',
        tasks: [
          { type: 'CloseDown', enabled: true, params: {} },
          {
            type: 'Infrast',
            enabled: true,
            params: {
              mode: 10000,
              filename,
              plan_index: 0,
              facility: ['Power'],
              drones: '_NotUse',
            },
          },
        ],
      },
    });
    return { plan, filename, bytes };
  };
  const advance = async (finished: () => boolean) => {
    for (let index = 0; index < 40 && !finished(); index++) {
      await runtime.tick(true);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  return {
    runtime,
    worker,
    device,
    selected,
    effects,
    save,
    advance,
    setTime: (second = 0) => {
      clock = new Date(2026, 9, 24, 4, 0, second);
    },
  };
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('an unknown full operator name in the final custom task rejects preflight and launch before any device work', async () => {
  const { runtime, device, effects, save } = await fixture();
  const { filename, bytes } = await save('不存在的干员全名');
  const before = effects();
  const checked = await runtime.executionPreflight({ planId: 'custom', deviceId: device.id });
  expect(checked.supported).toBe(false);
  expect(checked.issues).toContainEqual(
    expect.objectContaining({
      taskIndex: 1,
      taskType: 'Infrast',
      code: 'unavailable_resource',
      message: expect.stringContaining('不是当前官方字典的完整姓名'),
    }),
  );
  await expect(
    runtime.startRun({ planId: 'custom', deviceId: device.id, requestId: 'unknown-tail' }),
  ).rejects.toMatchObject({ code: -32010 });
  expect(effects()).toEqual(before);
  expect(runtime.store.all('run')).toHaveLength(0);
  expect(readFileSync(filename, 'utf8')).toBe(bytes);
});

for (const missing of ['mood', 'skill', 'skills'] as const)
  test(`autofill with missing ${missing} resource rejects the whole table before launch`, async () => {
    const { runtime, device, selected, effects, save } = await fixture();
    await save('甲', true);
    if (missing === 'mood') delete selected.profile.card!.moodOffset;
    if (missing === 'skill') delete selected.profile.card!.skillOffset;
    if (missing === 'skills') delete selected.profile.skills;
    const before = effects();
    const checked = await runtime.executionPreflight({ planId: 'custom', deviceId: device.id });
    expect(checked.supported).toBe(false);
    expect(checked.issues).toContainEqual(
      expect.objectContaining({
        taskIndex: 1,
        code: 'unavailable_resource',
        message: expect.stringContaining('自动补位缺少同代资源'),
      }),
    );
    await expect(
      runtime.startRun({ planId: 'custom', deviceId: device.id, requestId: `missing-${missing}` }),
    ).rejects.toMatchObject({ code: -32010 });
    expect(effects()).toEqual(before);
    expect(runtime.store.all('run')).toHaveLength(0);
  });

test('fixed exact names remain admissible without mood or automatic skill resources', async () => {
  const { runtime, device, selected, effects, save } = await fixture();
  await save('甲');
  delete selected.profile.card!.moodOffset;
  delete selected.profile.card!.skillOffset;
  delete selected.profile.skills;
  const before = effects();
  expect(await runtime.executionPreflight({ planId: 'custom', deviceId: device.id })).toEqual({
    supported: true,
    engine: 'maafw',
    issues: [],
  });
  expect(effects()).toEqual(before);
});

test('forced scheduling rejects an unknown custom tail before countdown or stopping the active execution', async () => {
  const { runtime, worker, device, effects, save, advance, setTime } = await fixture(true);
  await runtime.handle('plan.save', {
    plan: {
      id: 'active',
      name: '进行中的合成执行',
      tasks: [{ type: 'CloseDown', params: {}, enabled: true }],
    },
  });
  const current = await runtime.startRun({
    planId: 'active',
    deviceId: device.id,
    requestId: 'keep-active',
  });
  await advance(() => worker.submitted.length > 0);
  expect(worker.submitted).toHaveLength(1);
  await save('不存在的干员全名');
  runtime.store.put('settings', 'main', {
    ...runtime.snapshot().settings,
    scheduler: { ...defaultScheduler(), forceScheduledStart: true },
  });
  await runtime.handle('schedule.save', {
    schedule: {
      id: 'blocked-custom',
      planId: 'custom',
      deviceId: device.id,
      hour: 4,
      minute: 0,
      enabled: true,
    },
  });
  const before = effects();
  setTime();
  await advance(() => runtime.store.all('schedule_occurrence')[0]?.status === 'failed');
  setTime(20);
  await runtime.tick(true);
  const occurrence = runtime.store.all('schedule_occurrence')[0];
  expect(occurrence).toMatchObject({
    status: 'failed',
    message: expect.stringContaining('不是当前官方字典的完整姓名'),
  });
  expect(runtime.store.events().some((event) => event.type === 'schedule.countdown')).toBe(false);
  expect(effects()).toEqual(before);
  expect(runtime['execution'](current.id).status).toBe('running');
  expect(runtime.store.all('run')).toHaveLength(1);
});
