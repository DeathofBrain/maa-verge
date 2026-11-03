/** 合成端口只验证单事件、预算、证据与 JSON 调用，不连接设备或断言外观。 */
import { expect, spyOn, test } from 'bun:test';
import type { AtomicBox, AtomicExecutionPort, AtomicMatch } from '#automation/core/types';
import type { ReviewedResourceProfile } from '#automation/resources/maacore-adapter';
import {
  loadReviewedResourceProfile,
  resolveReviewedTemplateId,
} from '#automation/resources/maacore-adapter';
import { createCapabilityRegistry } from '#automation/registry/catalog';
import { createPrimitiveCapabilities } from '#automation/primitives/capabilities';
import { createFightCapabilities } from '#custom/fight/capabilities';
import { fightReviewedRules } from '#custom/fight/resources';
import { createMallCapabilities } from '#custom/mall/capabilities';
import { mallReviewedRules } from '#custom/mall/resources';
import { createAwardCapabilities } from '#custom/award/capabilities';
import { awardReviewedRules } from '#custom/award/resources';
import { createRecruitCapabilities } from '#custom/recruit/capabilities';
import { recruitReviewedRules } from '#custom/recruit/resources';
import { createInventoryCapabilities } from '#custom/inventory/capabilities';
import { inventoryReviewedRules } from '#custom/inventory/resources';
import { createStartupCapabilities } from '#custom/startup/capabilities';
import { loadStartupResourceProfile, startupReviewedRules } from '#custom/startup/resources';
import { ReviewedEventVision } from '#automation/composites/reviewed-event';
import { syntheticPipeline } from './pipeline-fixture';

type Specification = { id: string; actionOnly?: boolean };
function fixture(specifications: readonly Specification[]) {
  const boxes: Record<string, AtomicBox> = {};
  const profile: ReviewedResourceProfile = {
    id: 'synthetic-daily',
    clientType: 'Official',
    available: true,
    rules: {},
    actions: {},
    alternatives: {},
    diagnostics: [],
    sources: [],
    adapterBaseline: { repository: 'synthetic', ref: 'test', commit: 'test' },
  };
  for (const [index, spec] of specifications.entries()) {
    boxes[spec.id] = [20 + (index % 20) * 45, 300 + Math.floor(index / 20) * 40, 20, 20];
    if (spec.actionOnly) profile.actions[spec.id] = { box: [1000, 20, 270, 50], delayMs: 0 };
    else {
      profile.rules[spec.id] = {
        id: spec.id,
        kind: 'template',
        templateId: `${spec.id}.png`,
        roi: [0, 0, 1280, 720],
        source: { repository: 'synthetic', ref: 'test', path: 'test' },
      };
      profile.alternatives[spec.id] = [spec.id];
    }
  }
  let visible = new Set<string>();
  let frames = 0;
  let clicks = 0;
  let accepted = true;
  const text: Record<string, string> = {};
  const recognitions: { id: string; frameId: unknown }[] = [];
  const clickInputs: Record<string, unknown>[] = [];
  const presetMatches: Record<string, AtomicMatch[]> = {};
  let rawTexts: string[] = [];
  let onClick: (id: string | undefined) => void = () => {};
  let onFrame: (count: number) => void = () => {};
  const native = syntheticPipeline();
  const port: AtomicExecutionPort = {
    runPipeline: native,
    runContextPipeline: native,
    async execute(operation, input) {
      if (operation === 'frame') {
        onFrame(++frames);
        return { frameId: `f${frames}`, width: 1280, height: 720, data: 'synthetic-frame' };
      }
      if (operation === 'recognize') {
        const id = String(input.templateId ?? '').replace(/\.png$/, '');
        recognitions.push({ id, frameId: input.frameId });
        const matches: AtomicMatch[] =
          input.kind === 'ocr'
            ? rawTexts.map((value, index) => ({
                box: [100 + index * 50, 100, 30, 20],
                score: 1,
                text: value,
              }))
            : visible.has(id)
              ? (presetMatches[id] ?? [
                  {
                    box: boxes[id],
                    score: 1,
                    ...(text[id] === undefined ? {} : { text: text[id] }),
                  },
                ])
              : [];
        return { hit: matches.length > 0, matches, coordinateSize: [1280, 720] };
      }
      if (operation === 'click') {
        clicks++;
        clickInputs.push({ ...input });
        const target = Object.keys(boxes).find(
          (id) =>
            input.x === boxes[id][0] + boxes[id][2] / 2 &&
            input.y === boxes[id][1] + boxes[id][3] / 2,
        );
        onClick(target);
        return { accepted };
      }
      throw new Error(`unexpected test operation ${operation}`);
    },
  };
  return {
    profile,
    port,
    boxes,
    text,
    recognitions,
    clickInputs,
    setMatches(id: string, matches: AtomicMatch[]) {
      presetMatches[id] = structuredClone(matches);
    },
    show(...ids: string[]) {
      visible = new Set(ids);
    },
    raw(...values: string[]) {
      rawTexts = values;
    },
    onClick(handler: typeof onClick) {
      onClick = handler;
    },
    onFrame(handler: typeof onFrame) {
      onFrame = handler;
    },
    accepted(value: boolean) {
      accepted = value;
    },
    get clicks() {
      return clicks;
    },
    get frames() {
      return frames;
    },
  };
}

/** 合成场景推进页面而不等待真实动画；保留等待请求，行为断言仍检查输入次数和后置证据。 */
async function withoutAnimationDelays<T>(run: (delays: number[]) => Promise<T>) {
  const delays: number[] = [];
  const wait = spyOn(ReviewedEventVision.prototype, 'wait').mockImplementation(async (ms) => {
    delays.push(ms);
  });
  try {
    return await run(delays);
  } finally {
    wait.mockRestore();
  }
}

/** 用逻辑时间覆盖实际等待与识别耗时，验证秒级截止；不让测试真实休眠或连接设备。 */
async function withStartupClock<T>(
  run: (clock: {
    now: () => number;
    elapsed: () => number;
    advance: (ms: number) => void;
    waits: number[];
  }) => Promise<T>,
) {
  const startedAt = Date.now();
  let now = startedAt;
  const waits: number[] = [];
  const advance = (ms: number) => {
    now += ms;
  };
  const time = spyOn(Date, 'now').mockImplementation(() => now);
  const wait = spyOn(ReviewedEventVision.prototype, 'wait').mockImplementation(async (ms) => {
    waits.push(ms);
    advance(ms);
  });
  try {
    return await run({ now: () => now, elapsed: () => now - startedAt, advance, waits });
  } finally {
    wait.mockRestore();
    time.mockRestore();
  }
}
function registry(f: ReturnType<typeof fixture>, provider: typeof createFightCapabilities) {
  return createCapabilityRegistry(
    [...createPrimitiveCapabilities(f.port), ...provider(f.port, f.profile)],
    { port: f.port },
  );
}

test('multi-rule observations retain one frame identity without duplicating image payloads', async () => {
  const f = fixture(startupReviewedRules);
  f.show('home');
  const result = await registry(f, createStartupCapabilities).execute('observation.startup', {});
  expect(result.status).toBe('completed');
  expect(f.frames).toBe(1);
  const data = result.data as { frameId: string; evidence: Record<string, unknown> };
  expect(data.frameId).toBe('f1');
  for (const evidence of Object.values(data.evidence)) expect(evidence).not.toHaveProperty('frame');
  expect(JSON.stringify(data)).not.toContain('"data"');
});

test('template references resolve exact or unique suffix and reject ambiguity', () => {
  const templates = new Set(['UiTheme/Default/Recruit.png', 'Battle/EndOfAction.png']);
  expect(resolveReviewedTemplateId(templates, 'Default/Recruit.png')).toBe(
    'UiTheme/Default/Recruit.png',
  );
  expect(resolveReviewedTemplateId(templates, 'EndOfAction.png')).toBe('Battle/EndOfAction.png');
  expect(resolveReviewedTemplateId(new Set(['A/x.png', 'B/x.png']), 'x.png')).toBeUndefined();
});

test('reviewed resource loading records actual identity and fails closed on unsupported algorithms', async () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      Good: { template: 'Good.png', roi: [0, 0, 100, 100] },
      Bad: { template: 'Bad.png', method: 'HSVCount' },
      Loop: { baseTask: 'Loop' },
    }),
  );
  const source = {
    read: async (file: string) => (file === 'tasks/tasks.json' ? bytes : undefined),
    listTemplates: async () => ({ ids: ['folder/Good.png', 'folder/Bad.png'], complete: true }),
  };
  const profile = await loadReviewedResourceProfile(
    source,
    'test',
    [
      { id: 'good', node: 'Good' },
      { id: 'bad', node: 'Bad' },
      { id: 'loop', node: 'Loop' },
    ],
    [],
    'Official',
    { resourceVersion: 'actual-generation' },
  );
  expect(profile.rules.good.templateId).toBe('folder/Good.png');
  expect(profile.rules.good.source.ref).toBe('actual-generation');
  expect(profile.rules.good.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(profile.rules.bad).toBeUndefined();
  expect(profile.rules.loop).toBeUndefined();
  expect(profile.diagnostics.length).toBe(2);
  expect(
    (
      await loadReviewedResourceProfile(
        source,
        'test',
        [{ id: 'good', node: 'Good' }],
        [],
        'YoStarEN',
      )
    ).available,
  ).toBe(false);
});

test('all six providers keep missing resources unavailable without invoking a device', () => {
  for (const [specs, provider] of [
    [startupReviewedRules, createStartupCapabilities],
    [fightReviewedRules, createFightCapabilities],
    [recruitReviewedRules, createRecruitCapabilities],
    [mallReviewedRules, createMallCapabilities],
    [awardReviewedRules, createAwardCapabilities],
    [inventoryReviewedRules, createInventoryCapabilities],
  ] as const) {
    const f = fixture(specs);
    f.profile.rules = {};
    f.profile.actions = {};
    const resourceFreeLifecycle = new Set([
      'game.startup.launch',
      'game.startup.close',
      'workflow.startup.close',
    ]);
    expect(
      provider(f.port, f.profile)
        .filter((item) => !resourceFreeLifecycle.has(item.descriptor.id))
        .every((item) => !item.descriptor.available),
    ).toBe(true);
    expect(f.frames).toBe(0);
  }
});

test('startup workflow advances reviewed pages and verifies actual home evidence', async () => {
  const f = fixture(startupReviewedRules);
  f.show('start');
  f.onClick((id) => {
    if (id === 'start') f.show('wake');
    else if (id === 'wake') f.show('home', 'entry');
    else throw new Error('unexpected login input');
  });
  const result = await withoutAnimationDelays(async (delays) => {
    const result = await registry(f, createStartupCapabilities).execute(
      'workflow.startup.login',
      {},
    );
    expect(delays).toContain(3000);
    expect(delays.filter((delay) => delay === 1000).length).toBeGreaterThanOrEqual(3);
    return result;
  });
  expect(result.message).toBeUndefined();
  expect(result.status).toBe('completed');
  expect(result.verified).toBe(true);
  expect(f.clicks).toBe(2);
});

test('startup binds real close imagery and keeps supply dismissal separate from its OCR evidence', async () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      CloseAnnoBase: { template: 'empty.png', action: 'ClickSelf' },
      CloseAnno: { baseTask: 'CloseAnnoBase', roi: [1100, 0, 180, 200] },
      TodaysSupplies: {
        algorithm: 'OcrDetect',
        text: ['今日配给'],
        action: 'ClickRect',
        roi: [500, 50, 300, 150],
        specificRect: [1000, 1, 270, 340],
      },
    }),
  );
  const source = {
    read: async (file: string) => (file === 'tasks/tasks.json' ? bytes : undefined),
    listTemplates: async () => ({
      ids: ['empty.png', 'WakeUp/CloseAnno/CloseAnno.png'],
      complete: true,
    }),
  };
  const profile = await loadStartupResourceProfile(source);
  expect(profile.rules['popup.close'].templateId).toBe('WakeUp/CloseAnno/CloseAnno.png');
  expect(profile.rules['popup.supplies'].expected).toEqual(['今日配给']);
  expect(profile.actions['popup.supplies.close'].box).toEqual([1000, 1, 270, 340]);
  expect(profile.rules['popup.title'].expected).toContain('许愿墙');
  expect(profile.rules['popup.title'].roi).toEqual([0, 0, 1280, 720]);
});

test('startup waits through unrecognized and known loading pages without issuing input', async () => {
  const f = fixture(startupReviewedRules);
  f.onFrame((count) => f.show(...(count === 2 ? ['loading.update'] : count >= 3 ? ['home'] : [])));
  await withoutAnimationDelays(async (delays) => {
    const result = await registry(f, createStartupCapabilities).execute(
      'game.startup.login_step',
      {},
    );
    expect(result.status).toBe('completed');
    expect((result.data as any).home).toBe(true);
    expect((result.data as any).changed).toBe(false);
    expect(delays).toContain(5000);
    expect(delays.filter((delay) => delay === 1000)).toHaveLength(3);
  });
  expect(f.clicks).toBe(0);
});

test('a confirmed start input permits cold loading past twenty seconds before stable home', async () => {
  await withStartupClock(async (clock) => {
    const f = fixture(startupReviewedRules);
    const startedAt = clock.now();
    const rootDeadlines: (number | undefined)[] = [];
    const runPipeline = f.port.runPipeline;
    f.port.runPipeline = async (entry, graph, custom, context) => {
      rootDeadlines.push(context.deadline);
      await runPipeline(entry, graph, custom, context);
    };
    f.show('start');
    f.onClick((id) => {
      expect(id).toBe('start');
      f.show('loading.text');
    });
    // 包含官方 3 秒 postDelay，后置只读等待超过 20 秒才出现主页。
    f.onFrame(() => {
      if (f.clicks) f.show(clock.elapsed() >= 28000 ? 'home' : 'loading.text');
    });
    const result = await registry(f, createStartupCapabilities).execute(
      'game.startup.login_step',
      {},
    );
    expect(result).toMatchObject({ status: 'completed', verified: true });
    expect(result.data).toMatchObject({ changed: true, trigger: 'start', home: true });
    expect(clock.elapsed()).toBeGreaterThanOrEqual(31000);
    expect(clock.elapsed()).toBeLessThan(63000);
    expect(rootDeadlines).toEqual([startedAt + 120000]);
    expect(f.clicks).toBe(1);
  });
});

test('the ten-step login graph rereads home without repeating its stable wait after cold loading', async () => {
  await withStartupClock(async (clock) => {
    const f = fixture(startupReviewedRules);
    let revision = 0;
    f.port.getInputRevision = () => revision;
    const execute = f.port.execute;
    f.port.execute = async (operation, input, context) => {
      const result = await execute(operation, input, context);
      // 模拟真实识别成本，旧十组稳定等待会耗尽 120 秒；图和输入预算仍保持原样。
      if (operation === 'recognize') clock.advance(200);
      if (operation === 'click') revision++;
      return result;
    };
    let steps = 0;
    const roots = new Set<object | undefined>();
    const submit = f.port.runContextPipeline!;
    f.port.runContextPipeline = async (entry, graph, custom, context) => {
      roots.add(context.rootIdentity);
      if (entry === 'Startup@game@startup@login_step') steps++;
      await submit(entry, graph, custom, context);
    };
    f.show('start');
    f.onClick(() => f.show('loading.text'));
    f.onFrame(() => {
      if (f.clicks) f.show(clock.elapsed() >= 44000 ? 'home' : 'loading.text');
    });
    const result = await registry(f, createStartupCapabilities).execute(
      'workflow.startup.login',
      {},
    );
    expect(result).toMatchObject({ status: 'completed', verified: true });
    expect(steps).toBe(10);
    expect(roots.size).toBe(1);
    expect([...roots][0]).toBeDefined();
    expect(clock.waits.filter((delay) => delay === 1000)).toHaveLength(3);
    expect(clock.elapsed()).toBeGreaterThan(47000);
    expect(clock.elapsed()).toBeLessThan(90000);
    expect(f.clicks).toBe(1);
  });
});

test('independent roots replace caller identities and each require a fresh stable-home window', async () => {
  await withStartupClock(async (clock) => {
    const f = fixture(startupReviewedRules);
    f.port.getInputRevision = () => 0;
    f.show('home');
    const callerRoot = Object.freeze({});
    const context = { rootIdentity: callerRoot, deadline: clock.now() + 120000 };
    const roots = new Set<object | undefined>();
    const submit = f.port.runPipeline;
    f.port.runPipeline = async (entry, graph, custom, ownContext) => {
      roots.add(ownContext.rootIdentity);
      await submit(entry, graph, custom, ownContext);
    };
    const r = registry(f, createStartupCapabilities);
    for (const run of [r.execute, r.execute, r.executeJson]) {
      expect(await run('game.startup.login_step', {}, context)).toMatchObject({
        status: 'completed',
        verified: true,
      });
    }
    expect(roots.size).toBe(3);
    expect(roots.has(callerRoot)).toBe(false);
    expect(clock.waits.filter((delay) => delay === 1000)).toHaveLength(9);
    expect(f.frames).toBe(12);
    expect(f.clicks).toBe(0);
  });
});

test('a host input revision change within one login root requires home to stabilize again', async () => {
  await withStartupClock(async (clock) => {
    const f = fixture(startupReviewedRules);
    let revision = 0;
    let steps = 0;
    f.port.getInputRevision = () => revision;
    f.show('home');
    const submit = f.port.runContextPipeline!;
    f.port.runContextPipeline = async (entry, graph, custom, context) => {
      if (entry === 'Startup@game@startup@login_step' && ++steps === 2) revision++;
      await submit(entry, graph, custom, context);
    };
    expect(
      await registry(f, createStartupCapabilities).execute('workflow.startup.login', {}),
    ).toMatchObject({ status: 'completed', verified: true });
    expect(steps).toBe(10);
    expect(clock.waits.filter((delay) => delay === 1000)).toHaveLength(6);
    expect(f.frames).toBe(17);
    expect(f.clicks).toBe(0);
  });
});

for (const overlay of ['popup.close', 'popup.title', 'loading.text'])
  test(`a fresh ${overlay} invalidates stable home even when the input revision is unchanged`, async () => {
    await withStartupClock(async (clock) => {
      const f = fixture(startupReviewedRules);
      f.port.getInputRevision = () => 0;
      f.text['popup.title'] = '许愿墙';
      f.onFrame((count) => f.show('home', ...(count === 5 ? [overlay] : [])));
      const result = await registry(f, createStartupCapabilities).execute(
        'workflow.startup.login',
        {},
      );
      expect(result).toMatchObject({ status: 'completed', verified: true });
      expect(clock.waits.filter((delay) => delay === 1000)).toHaveLength(6);
      expect(clock.waits).toContain(overlay === 'loading.text' ? 2000 : 250);
      expect(f.frames).toBe(18);
      expect(f.clicks).toBe(0);
    });
  });

test('a failed startup read clears stable evidence before another read in the same context', async () => {
  await withStartupClock(async (clock) => {
    const f = fixture(startupReviewedRules);
    f.port.getInputRevision = () => 0;
    f.show('home');
    const step = createStartupCapabilities(f.port, f.profile).find(
      (item) => item.descriptor.id === 'game.startup.login_step',
    )!;
    const context = { rootIdentity: Object.freeze({}) };
    expect(await step.handler({}, context)).toMatchObject({ status: 'completed', verified: true });
    const execute = f.port.execute;
    let rejectRead = true;
    f.port.execute = async (operation, input, ownContext) => {
      if (operation === 'frame' && rejectRead) {
        rejectRead = false;
        throw new Error('synthetic frame read failed');
      }
      return execute(operation, input, ownContext);
    };
    await expect(step.handler({}, context)).rejects.toThrow('synthetic frame read failed');
    expect(await step.handler({}, context)).toMatchObject({ status: 'completed', verified: true });
    expect(clock.waits.filter((delay) => delay === 1000)).toHaveLength(6);
    expect(f.frames).toBe(8);
    expect(f.clicks).toBe(0);
  });
});

for (const revision of [undefined, -1, Number.NaN, 0.5])
  test(`missing or invalid host revision ${revision} never caches stable home`, async () => {
    await withStartupClock(async (clock) => {
      const f = fixture(startupReviewedRules);
      if (revision !== undefined) f.port.getInputRevision = () => revision;
      f.show('home');
      expect(
        await registry(f, createStartupCapabilities).execute('workflow.startup.login', {}),
      ).toMatchObject({ status: 'completed', verified: true });
      expect(clock.waits.filter((delay) => delay === 1000)).toHaveLength(30);
      expect(f.frames).toBe(41);
      expect(f.clicks).toBe(0);
    });
  });

for (const after of ['unknown', 'loading.text', 'start'])
  test(`a confirmed start followed by persistent ${after} stops after sixty seconds without replay`, async () => {
    await withStartupClock(async (clock) => {
      const f = fixture(startupReviewedRules);
      f.show('start');
      f.onClick(() => f.show(...(after === 'unknown' ? [] : [after])));
      const result = await registry(f, createStartupCapabilities).execute(
        'game.startup.login_step',
        {},
      );
      expect(result).toMatchObject({ status: 'unknown', verified: false });
      expect(result.message).toContain('等待超时');
      expect(clock.elapsed()).toBe(63000);
      expect(f.clicks).toBe(1);
    });
  });

test('the parent remaining deadline truncates the start transition including its post-delay', async () => {
  await withStartupClock(async (clock) => {
    const f = fixture(startupReviewedRules);
    f.show('start');
    f.onClick(() => f.show('loading.text'));
    const result = await registry(f, createStartupCapabilities).execute(
      'game.startup.login_step',
      {},
      { deadline: clock.now() + 18000 },
    );
    expect(result).toMatchObject({ status: 'unknown', verified: false });
    expect(clock.elapsed()).toBe(18000);
    expect(f.clicks).toBe(1);
  });
});

test('home recognition finishing past the local start window cannot bypass its deadline', async () => {
  await withStartupClock(async (clock) => {
    const f = fixture(startupReviewedRules);
    let homeFrames = 0;
    f.show('start');
    f.onClick(() => f.show('home'));
    f.onFrame(() => {
      if (f.clicks && ++homeFrames === 4) clock.advance(58000);
    });
    const result = await registry(f, createStartupCapabilities).execute(
      'game.startup.login_step',
      {},
    );
    expect(result).toMatchObject({ status: 'unknown', verified: false });
    expect(result.message).toContain('等待超时');
    expect(clock.elapsed()).toBe(64000);
    expect(f.clicks).toBe(1);
  });
});

for (const trigger of ['initial', 'wake', 'server', 'popup'])
  test(`${trigger} unknown transition keeps its twenty-second budget`, async () => {
    await withStartupClock(async (clock) => {
      const f = fixture(startupReviewedRules);
      if (trigger === 'popup') {
        f.text['popup.title'] = '许愿墙';
        f.show('popup.title', 'popup.close');
      } else if (trigger !== 'initial') f.show(trigger);
      // 弹窗保留旧标题，其余输入后只留下未知画面；都不能取得 start 专用窗口。
      f.onClick(() => {
        if (trigger !== 'popup') f.show();
      });
      const result = await registry(f, createStartupCapabilities).execute(
        'game.startup.login_step',
        {},
      );
      expect(result).toMatchObject({ status: 'unknown', verified: false });
      expect(clock.elapsed()).toBe(trigger === 'popup' ? 20500 : 20000);
      expect(f.clicks).toBe(trigger === 'initial' ? 0 : 1);
    });
  });

test('a rejected start input does not enter the longer read-only transition', async () => {
  await withStartupClock(async (clock) => {
    const f = fixture(startupReviewedRules);
    f.show('start');
    f.accepted(false);
    const result = await registry(f, createStartupCapabilities).execute(
      'game.startup.login_step',
      {},
    );
    expect(result.status).not.toBe('completed');
    expect(result.verified).toBe(false);
    expect(clock.elapsed()).toBe(0);
    expect(f.clicks).toBe(1);
  });
});

for (const overlay of ['popup.close', 'popup.title'])
  test(`an unknown ${overlay} after start cannot borrow the cold-loading budget`, async () => {
    await withStartupClock(async (clock) => {
      const f = fixture(startupReviewedRules);
      f.show('start');
      f.text['popup.title'] = '许愿墙';
      f.onClick(() => f.show(overlay));
      const result = await registry(f, createStartupCapabilities).execute(
        'game.startup.login_step',
        {},
      );
      expect(result).toMatchObject({ status: 'unknown', verified: false });
      expect(clock.elapsed()).toBe(23000);
      expect(f.clicks).toBe(1);
    });
  });

test('startup loading over a visible home resets the stable-home window', async () => {
  const f = fixture(startupReviewedRules);
  f.onFrame((count) => f.show('home', ...(count === 2 ? ['loading.text'] : [])));
  await withoutAnimationDelays(async (delays) => {
    const result = await registry(f, createStartupCapabilities).execute(
      'game.startup.login_step',
      {},
    );
    expect(result.status).toBe('completed');
    expect(delays).toEqual([1000, 2000, 1000, 1000, 1000]);
  });
  f.onFrame(() => f.show('home', 'loading.text'));
  expect(
    ((await registry(f, createStartupCapabilities).execute('observation.startup', {})).data as any)
      .home,
  ).toBe(false);
  expect(f.clicks).toBe(0);
});

test('startup closes only the reviewed supply and titled popups before confirming an uncovered home', async () => {
  const f = fixture(startupReviewedRules);
  const titles = ['十一月签到', '限时签到', '许愿墙', '活动公告'];
  const inputs: (string | undefined)[] = [];
  f.show('popup.supplies');
  f.onClick((id) => {
    inputs.push(id);
    expect(id).toBe(inputs.length === 1 ? undefined : 'popup.close');
    const title = titles[inputs.length - 1];
    if (title) {
      f.text['popup.title'] = title;
      // 主页在遮罩后仍能识别，不能提前结束或点击任何领奖卡片。
      f.show('home', 'popup.title', 'popup.close');
    } else f.show('home');
  });
  const result = await withoutAnimationDelays(() =>
    registry(f, createStartupCapabilities).execute('workflow.startup.login', {}),
  );
  expect(result.status).toBe('completed');
  expect(result.verified).toBe(true);
  expect(inputs).toEqual([undefined, 'popup.close', 'popup.close', 'popup.close', 'popup.close']);
});

test('home activity-card titles do not block startup observation or authorize a popup click', async () => {
  const f = fixture(startupReviewedRules);
  f.show('home', 'popup.title');
  // 坐标来自第二轮只读识别证据，属于官方首页活动入口区，而非弹窗标题区。
  f.setMatches('popup.title', [
    { box: [76, 95, 77, 22], score: 1, text: '限时签到' },
    { box: [78, 150, 56, 20], score: 1, text: '许愿墙' },
  ]);
  const r = registry(f, createStartupCapabilities);
  const observation = await r.execute('observation.startup', {});
  expect((observation.data as any).evidence['popup.title'].hit).toBe(true);
  expect((observation.data as any).home).toBe(true);
  const result = await withoutAnimationDelays(() => r.execute('workflow.startup.login', {}));
  expect(result.status).toBe('completed');
  expect(result.verified).toBe(true);
  expect(f.clicks).toBe(0);
});

test('closing a reviewed popup permits its title to remain only in the home activity card', async () => {
  const f = fixture(startupReviewedRules);
  f.show('home', 'popup.title', 'popup.close');
  f.text['popup.title'] = '限时签到';
  f.onClick((id) => {
    expect(id).toBe('popup.close');
    f.setMatches('popup.title', [{ box: [76, 95, 77, 22], score: 1, text: '限时签到' }]);
    f.show('home', 'popup.title');
  });
  const result = await withoutAnimationDelays(() =>
    registry(f, createStartupCapabilities).execute('game.startup.login_step', {}),
  );
  expect(result.status).toBe('completed');
  expect((result.data as any).home).toBe(true);
  expect(f.clicks).toBe(1);
});

test('a title outside the home activity cards still blocks readiness without a reviewed close target', async () => {
  const f = fixture(startupReviewedRules);
  f.show('home', 'popup.title');
  f.text['popup.title'] = '许愿墙';
  const r = registry(f, createStartupCapabilities);
  expect(((await r.execute('observation.startup', {})).data as any).home).toBe(false);
  const result = await r.execute('game.startup.login_step', {}, { deadline: Date.now() + 20 });
  expect(result.status).toBe('unknown');
  expect(f.clicks).toBe(0);
});

test('an unknown close button blocks startup home evidence and never authorizes a blind close', async () => {
  const f = fixture(startupReviewedRules);
  f.show('home', 'popup.close');
  const r = registry(f, createStartupCapabilities);
  expect(((await r.execute('observation.startup', {})).data as any).home).toBe(false);
  const result = await r.execute('game.startup.login_step', {}, { deadline: Date.now() + 20 });
  expect(result.status).toBe('unknown');
  expect(f.clicks).toBe(0);
});

test('startup never repeats a popup input whose original title remains visible', async () => {
  const f = fixture(startupReviewedRules);
  f.text['popup.title'] = '许愿墙';
  f.show('home', 'popup.title', 'popup.close');
  f.onClick(() => {});
  const result = await withoutAnimationDelays(() =>
    registry(f, createStartupCapabilities).execute(
      'game.startup.login_step',
      {},
      { deadline: Date.now() + 20 },
    ),
  );
  expect(result.status).toBe('unknown');
  expect(f.clicks).toBe(1);
});

test('startup workflow stops at its input budget when reviewed popups keep replacing one another', async () => {
  const f = fixture(startupReviewedRules);
  f.text['popup.title'] = '许愿墙';
  f.show('popup.title', 'popup.close');
  f.onClick((id) => {
    expect(id).toBe('popup.close');
    f.text['popup.title'] = f.clicks % 2 ? '活动公告' : '许愿墙';
  });
  const result = await withoutAnimationDelays(() =>
    registry(f, createStartupCapabilities).execute('workflow.startup.login', {}),
  );
  expect(result.verified).toBe(false);
  expect((result.data as any).home).toBe(false);
  expect(f.clicks).toBe(10);
});

test('current-stage workflow executes bounded single battles and never authorizes medicine or stone', async () => {
  const f = fixture(fightReviewedRules);
  f.show('stage', 'agent.active', 'series');
  f.text.series = '×1';
  f.onClick((id) => {
    if (id === 'stage') f.show('confirm');
    else if (id === 'confirm') f.show('result');
    else if (id === undefined) f.show('stage', 'agent.active', 'series');
    else throw new Error('unexpected battle input');
  });
  const r = registry(f, createFightCapabilities);
  const result = await r.execute('workflow.fight.current_stage', { times: 2, timeoutMs: 1000 });
  expect(result.message).toBeUndefined();
  expect(result.status).toBe('completed');
  expect(result.verified).toBe(true);
  expect((result.data as any).completedRuns).toBe(2);
  expect(f.clicks).toBe(6);
  f.show('stage', 'agent.active', 'series');
  f.text.series = '×2';
  expect((await r.execute('game.fight.prepare', {})).status).toBe('unavailable');
  expect(f.clicks).toBe(6);
});

test('battle confirmation requires a fresh single-use preparation receipt and does not replay an unknown commit', async () => {
  const f = fixture(fightReviewedRules);
  f.port.getInputRevision = () => 0;
  f.show('confirm');
  const r = registry(f, createFightCapabilities);
  expect((await r.execute('game.fight.start', {})).status).toBe('failed');
  expect(f.clicks).toBe(0);
  f.show('stage', 'agent.active', 'series');
  f.text.series = '×1';
  f.onClick(() => f.show('confirm'));
  expect((await r.execute('game.fight.prepare', {})).status).toBe('completed');
  f.accepted(false);
  expect((await r.execute('game.fight.start', {})).status).toBe('unknown');
  expect(f.clicks).toBe(2);
  f.accepted(true);
  expect((await r.execute('game.fight.start', {})).status).toBe('failed');
  expect(f.clicks).toBe(2);
});

test('medicine screen stops preparation without any consumable input', async () => {
  const f = fixture(fightReviewedRules);
  f.show('stage', 'agent.active', 'series');
  f.text.series = '×1';
  f.onClick(() => f.show('medicine'));
  const result = await registry(f, createFightCapabilities).execute('game.fight.prepare', {});
  expect(result.status).toBe('unavailable');
  expect(f.clicks).toBe(1);
});

test('credit purchase rejects zero, over-budget and ambiguous prices before committing once', async () => {
  const f = fixture(mallReviewedRules);
  f.show('buy', 'currency', 'balance');
  f.text.balance = '100';
  const r = registry(f, createMallCapabilities);
  expect((await r.execute('game.mall.buy_current', {})).status).toBe('failed');
  expect(f.clicks).toBe(0);
  f.raw('50');
  expect((await r.execute('game.mall.buy_current', { maxCredit: 30 })).status).toBe('failed');
  expect(f.clicks).toBe(0);
  f.raw('3', '0');
  expect((await r.execute('game.mall.buy_current', { maxCredit: 30 })).status).toBe('failed');
  expect(f.clicks).toBe(0);
  f.raw('30');
  f.onClick(() => f.show('obtained'));
  const result = await r.execute('game.mall.buy_current', { maxCredit: 30 });
  expect(result.message).toBeUndefined();
  expect(result.status).toBe('completed');
  expect(result.verified).toBe(true);
  expect(f.clicks).toBe(1);
});

test('free credit workflow enters the credit shop and confirms the collection reward', async () => {
  const f = fixture(mallReviewedRules);
  f.show('home', 'entry');
  f.text.balance = '100';
  f.onClick((id) => {
    if (id === 'entry') f.show('store', 'recommended.active', 'balance');
    else if (id === 'store') f.show('store', 'collect', 'credit.currency', 'balance');
    else if (id === 'collect') f.show('obtained');
    else throw new Error('unexpected shop input');
  });
  const result = await registry(f, createMallCapabilities).execute(
    'workflow.mall.collect_credit',
    {},
  );
  expect(result.message).toBeUndefined();
  expect(result.status).toBe('completed');
  expect(result.verified).toBe(true);
  expect(f.clicks).toBe(3);
});

test('mall navigation preserves its native settle delay and submits each page input only once', async () => {
  const f = fixture(mallReviewedRules);
  f.show('home', 'entry');
  f.text.balance = '100';
  const inputs: string[] = [];
  f.onClick((id) => {
    if (id === 'entry') f.show('store', 'recommended.active', 'balance');
    else if (id === 'store') f.show('store', 'credit.currency', 'balance');
    else throw new Error('already-collected credit navigation must not submit another input');
    inputs.push(id);
  });
  let rootSubmitted = false;
  const run = f.port.runPipeline;
  f.port.runPipeline = async (entry, definitions, ...rest) => {
    if (entry === 'Mall@CollectCredit') {
      rootSubmitted = true;
      // 检查送往原生 Tasker 的图仍保留稳定等待；合成夹具不模拟实际动画耗时。
      expect(definitions[entry]).toMatchObject({
        post_delay: 500,
        max_hit: 1,
        custom_action_param: { primitive: 'game.mall.enter' },
        next: ['Mall@CollectCredit@1'],
      });
    }
    return run(entry, definitions, ...rest);
  };
  const result = await registry(f, createMallCapabilities).execute(
    'workflow.mall.collect_credit',
    {},
  );
  expect(result.status).toBe('completed');
  expect(rootSubmitted).toBe(true);
  expect(inputs).toEqual(['entry', 'store']);
  expect(f.clicks).toBe(2);
});

test('recommendation-page numbers and currency symbols never satisfy credit navigation or balance reads', async () => {
  const f = fixture(mallReviewedRules);
  f.show('store', 'recommended.active', 'credit.currency', 'balance');
  f.text.balance = '999';
  const r = registry(f, createMallCapabilities);
  for (const id of ['observation.mall', 'game.mall.collect_credit']) {
    expect((await r.execute(id, {})).status).toBe('failed');
    expect(f.recognitions.some(({ id }) => id === 'balance')).toBe(false);
  }
  expect(f.clicks).toBe(0);
  f.onClick((id) => {
    if (id !== 'store') throw new Error('only the credit tab may be selected');
    f.show('store', 'credit.currency', 'balance');
  });
  const result = await r.execute('game.mall.open_credit_store', {});
  expect(result.status).toBe('completed');
  expect((result.data as any).changed).toBe(true);
  expect(f.clicks).toBe(1);
  expect(f.recognitions.some(({ id }) => id === 'balance')).toBe(false);
});

test('an already-collected credit page is identified by currency before its balance is read', async () => {
  const f = fixture(mallReviewedRules);
  f.show('store', 'credit.currency', 'balance');
  f.text.balance = '100';
  const r = registry(f, createMallCapabilities);
  expect((await r.execute('game.mall.open_credit_store', {})).status).toBe('completed');
  const observation = await r.execute('observation.mall', {});
  expect(observation.status).toBe('completed');
  expect((observation.data as any).credit).toBe(100);
  const result = await r.execute('game.mall.collect_credit', {});
  expect(result.status).toBe('completed');
  expect((result.data as any).changed).toBe(false);
  expect((result.data as any).credit).toBe(100);
  expect(f.clicks).toBe(0);
  const balance = f.recognitions.find(({ id }) => id === 'balance')!;
  expect(
    f.recognitions.some(
      ({ id, frameId }) => id === 'credit.currency' && frameId === balance.frameId,
    ),
  ).toBe(true);
});

test('credit-tab input remains unknown when only an unrelated number appears after navigation', async () => {
  const f = fixture(mallReviewedRules);
  f.show('store', 'recommended.active', 'balance');
  f.text.balance = '999';
  f.onClick(() => f.show('store', 'balance'));
  const result = await registry(f, createMallCapabilities).execute(
    'game.mall.open_credit_store',
    {},
    { deadline: Date.now() + 25 },
  );
  expect(result.status).toBe('unknown');
  expect(result.verified).toBe(false);
  expect(f.clicks).toBe(1);
  expect(f.recognitions.some(({ id }) => id === 'balance')).toBe(false);
});

test('a larger number after leaving the credit page cannot confirm collection or trigger a retry', async () => {
  const f = fixture(mallReviewedRules);
  f.show('store', 'collect', 'credit.currency', 'balance');
  f.text.balance = '100';
  f.onClick((id) => {
    if (id !== 'collect') throw new Error('only one free collection may be attempted');
    f.text.balance = '999';
    f.show('store', 'recommended.active', 'balance');
  });
  const result = await registry(f, createMallCapabilities).execute(
    'game.mall.collect_credit',
    {},
    { deadline: Date.now() + 25 },
  );
  expect(result.status).toBe('unknown');
  expect(result.verified).toBe(false);
  expect(f.clicks).toBe(1);
  expect(f.recognitions.filter(({ id }) => id === 'balance')).toHaveLength(1);
});

test('completed recruit workflow claims one slot and reads evidence without recruitment consumption', async () => {
  const f = fixture(recruitReviewedRules);
  f.show('home', 'entry');
  f.raw('当前结果文字');
  f.onClick((id) => {
    if (id === 'entry') f.show('page', 'finished');
    else if (id === 'finished') f.show('skip');
    else if (id === 'skip') f.show('result');
    else throw new Error('unexpected recruitment input');
  });
  const result = await registry(f, createRecruitCapabilities).execute(
    'workflow.recruit.collect_one',
    {},
  );
  expect(result.message).toBeUndefined();
  expect(result.status).toBe('completed');
  expect(result.verified).toBe(true);
  expect(f.clicks).toBe(3);
  expect((result.data as any).text[0].text).toBe('当前结果文字');
});

test('inventory read is explicitly incomplete and has no inputs', async () => {
  const f = fixture(inventoryReviewedRules);
  f.show('depot');
  f.raw('材料甲', '123');
  const result = await registry(f, createInventoryCapabilities).execute(
    'observation.inventory.depot',
    {},
  );
  expect(result.message).toBeUndefined();
  expect(result.status).toBe('completed');
  expect((result.data as any).complete).toBe(false);
  expect((result.data as any).scope).toBe('current_screen');
  expect(f.clicks).toBe(0);
});

test('unknown commit does not automatically retry a claim', async () => {
  const f = fixture(recruitReviewedRules);
  f.show('page', 'finished');
  f.accepted(false);
  f.onClick(() => f.show('skip'));
  const result = await registry(f, createRecruitCapabilities).execute(
    'game.recruit.collect_finished',
    {},
  );
  expect(result.status).toBe('unknown');
  expect(result.verified).toBe(false);
  expect(f.clicks).toBe(1);
});

test('daily and weekly award workflow records separate claim evidence', async () => {
  const f = fixture(awardReviewedRules);
  f.show('home', 'entry');
  let rewardCount = 0;
  f.onClick((id) => {
    if (id === 'entry') f.show('weekly', 'claim');
    else if (id === 'weekly') f.show('weekly.active', 'claim');
    else if (id === 'claim') {
      rewardCount++;
      f.show('obtained');
    } else if (id === undefined) f.show(rewardCount === 1 ? 'weekly' : 'weekly.active');
    else throw new Error('unexpected reward input');
  });
  const result = await registry(f, createAwardCapabilities).execute(
    'workflow.award.daily_weekly',
    {},
  );
  expect(result.message).toBeUndefined();
  expect(result.status).toBe('completed');
  expect(result.verified).toBe(true);
  expect((result.data as any).daily.data.changed).toBe(true);
  expect((result.data as any).weekly.data.changed).toBe(true);
  expect(f.clicks).toBe(6);
});

test('award entry revalidates a stable home using a fresh frame and submits one unchanged target', async () => {
  const f = fixture(awardReviewedRules);
  f.show('home', 'entry');
  f.onClick((id) => {
    expect(id).toBe('entry');
    f.show('weekly');
  });
  await withoutAnimationDelays(async (delays) => {
    const result = await registry(f, createAwardCapabilities).execute('game.award.enter', {});
    expect(result.status).toBe('completed');
    expect(delays).toEqual([1000, 1000]);
  });
  expect(f.clicks).toBe(1);
  expect(f.clickInputs[0]).toMatchObject({
    frameId: 'f2',
    x: f.boxes.entry[0] + 10,
    y: f.boxes.entry[1] + 10,
  });
  expect(f.recognitions.filter(({ id }) => id === 'entry').map(({ frameId }) => frameId)).toEqual([
    'f1',
    'f2',
  ]);
});

test('award entry refuses a home that changes during its settle window without issuing input', async () => {
  const f = fixture(awardReviewedRules);
  f.show('home', 'entry');
  f.onFrame((count) => {
    if (count === 2) f.show('home');
  });
  const result = await withoutAnimationDelays(() =>
    registry(f, createAwardCapabilities).execute('game.award.enter', {}),
  );
  expect(result.status).toBe('failed');
  expect(f.clicks).toBe(0);
});

test('an unresponsive award entry times out after one input and never guesses another point', async () => {
  const f = fixture(awardReviewedRules);
  f.show('home', 'entry');
  const result = await withoutAnimationDelays(() =>
    registry(f, createAwardCapabilities).execute(
      'game.award.enter',
      {},
      { deadline: Date.now() + 20 },
    ),
  );
  expect(result.status).toBe('unknown');
  expect(f.clicks).toBe(1);
});

test('award overlays block navigation, tab selection and claim even when their page remains visible', async () => {
  await withoutAnimationDelays(async () => {
    for (const capability of [
      'game.award.enter',
      'game.award.select_daily',
      'game.award.select_weekly',
      'game.award.claim_current',
    ]) {
      for (const overlay of ['obtained', 'popup.close', 'popup.supplies']) {
        const f = fixture(awardReviewedRules);
        f.show('home', 'entry', 'weekly', 'weekly.active', 'claim', overlay);
        const result = await registry(f, createAwardCapabilities).execute(capability, {});
        expect(result.status).toBe('failed');
        expect(f.clicks).toBe(0);
      }
    }
  });
});

test('award claim preserves pre-delay before acquiring input evidence and closes on the checked frame', async () => {
  const f = fixture(awardReviewedRules);
  f.show('weekly', 'claim');
  f.profile.actions.close.delayMs = 1000;
  f.onClick((id) => f.show(...(id === 'claim' ? ['obtained'] : ['weekly'])));
  await withoutAnimationDelays(async (delays) => {
    f.onFrame(() => expect(delays[0]).toBe(500));
    const r = registry(f, createAwardCapabilities);
    expect((await r.execute('game.award.claim_current', {})).status).toBe('completed');
    expect((await r.execute('game.award.close_reward', {})).status).toBe('completed');
    expect(delays).toEqual([500, 1000]);
  });
  expect(f.clickInputs.map(({ frameId }) => frameId)).toEqual(['f1', 'f3']);
  expect(f.clicks).toBe(2);
});

test('warehouse workflow explicitly selects materials before read-only current-screen output', async () => {
  const f = fixture(inventoryReviewedRules);
  f.show('home', 'depot.entry');
  f.raw('材料甲', '12');
  f.onClick((id) => {
    if (id === 'depot.entry') f.show('depot.materials');
    else if (id === 'depot.materials') f.show('depot');
    else throw new Error('unexpected warehouse input');
  });
  const result = await registry(f, createInventoryCapabilities).execute(
    'workflow.inventory.read_depot',
    {},
  );
  expect(result.message).toBeUndefined();
  expect(result.status).toBe('completed');
  expect((result.data as any).complete).toBe(false);
  expect(f.clicks).toBe(2);
});

test('cancellation after a claim commit stops confirmation without replaying input', async () => {
  const f = fixture(recruitReviewedRules);
  f.show('page', 'finished');
  const controller = new AbortController();
  f.onClick(() => {
    f.show('skip');
    controller.abort(new Error('synthetic cancel'));
  });
  const result = await registry(f, createRecruitCapabilities).execute(
    'game.recruit.collect_finished',
    {},
    { signal: controller.signal },
  );
  expect(result.status).toBe('cancelled');
  expect(f.clicks).toBe(1);
});

test('read-only battle wait respects the inherited deadline and never retries battle input', async () => {
  const f = fixture(fightReviewedRules);
  f.show('running');
  const result = await registry(f, createFightCapabilities).execute(
    'game.fight.wait_result',
    { timeoutMs: 1000, pollMs: 100 },
    { deadline: Date.now() + 25 },
  );
  expect(result.status).toBe('unknown');
  expect(result.verified).toBe(false);
  expect(f.clicks).toBe(0);
});

test('battle batch submits an independent native root for each round and stops on unverified state', async () => {
  const f = fixture(fightReviewedRules);
  f.show('stage', 'agent.active', 'series');
  f.text.series = '×1';
  let roots = 0;
  let rounds = 0;
  const run = f.port.runPipeline;
  f.port.runPipeline = async (...args) => {
    roots++;
    return run(...args);
  };
  f.onClick((id) => {
    if (id === 'stage') f.show(rounds === 0 ? 'confirm' : 'medicine');
    else if (id === 'confirm') f.show('result');
    else if (id === undefined) {
      rounds++;
      f.show('stage', 'agent.active', 'series');
    } else throw new Error('unexpected batch input');
  });
  const result = await registry(f, createFightCapabilities).execute(
    'workflow.fight.current_stage',
    { times: 3, timeoutMs: 1000 },
  );
  expect(result.status).toBe('unavailable');
  expect((result.data as any).completedRuns).toBe(1);
  expect(roots).toBe(2);
  expect(f.clicks).toBe(4);
});

test('a pre-existing recruitment terminal cannot verify a new claim through an overlay', async () => {
  const f = fixture(recruitReviewedRules);
  f.show('page', 'finished', 'skip');
  const result = await registry(f, createRecruitCapabilities).execute(
    'game.recruit.collect_finished',
    {},
  );
  expect(result.status).toBe('failed');
  expect(result.verified).toBe(false);
  expect(f.clicks).toBe(0);
  // 前置与后置证据绑定同一帧，不允许通过再截屏把旧覆盖层忽略掉。
  expect(f.recognitions.find(({ id }) => id === 'finished')?.frameId).toBe(
    f.recognitions.find(({ id }) => id === 'skip')?.frameId,
  );
});

test('existing reward popups block a new credit collection, purchase and task claim', async () => {
  const mall = fixture(mallReviewedRules);
  mall.show('store', 'collect', 'balance', 'buy', 'currency', 'obtained');
  mall.text.balance = '100';
  mall.raw('30');
  const mallRegistry = registry(mall, createMallCapabilities);
  expect((await mallRegistry.execute('game.mall.collect_credit', {})).status).toBe('failed');
  expect((await mallRegistry.execute('game.mall.buy_current', { maxCredit: 30 })).status).toBe(
    'failed',
  );
  expect(mall.clicks).toBe(0);
  const award = fixture(awardReviewedRules);
  award.show('weekly', 'claim', 'obtained');
  expect(
    (await registry(award, createAwardCapabilities).execute('game.award.claim_current', {})).status,
  ).toBe('failed');
  expect(award.clicks).toBe(0);
});

test('battle prepare refuses existing confirm, consumable or terminal overlays before any input', async () => {
  for (const overlay of ['confirm', 'medicine', 'stone', 'running', 'result', 'failed']) {
    const f = fixture(fightReviewedRules);
    f.show('stage', 'agent.active', 'series', overlay);
    f.text.series = '×1';
    const result = await registry(f, createFightCapabilities).execute('game.fight.prepare', {});
    expect(result.status).toBe('failed');
    expect(f.clicks).toBe(0);
    expect(f.frames).toBe(1);
  }
});

test('a stage visible behind an undismissed result never proves that dismissal completed', async () => {
  const f = fixture(fightReviewedRules);
  f.show('result');
  f.onClick(() => f.show('stage', 'result'));
  const result = await registry(f, createFightCapabilities).execute(
    'game.fight.dismiss_result',
    {},
    { deadline: Date.now() + 25 },
  );
  expect(result.status).toBe('unknown');
  expect(result.verified).toBe(false);
  expect(f.clicks).toBe(1);
});

test('a task page visible behind an undismissed reward never proves that dismissal completed', async () => {
  const f = fixture(awardReviewedRules);
  f.show('obtained');
  f.onClick(() => f.show('weekly', 'obtained'));
  const result = await registry(f, createAwardCapabilities).execute(
    'game.award.close_reward',
    {},
    { deadline: Date.now() + 25 },
  );
  expect(result.status).toBe('unknown');
  expect(result.verified).toBe(false);
  expect(f.clicks).toBe(1);
});

test('explicit already-completed reveal and enabled-agent paths remain no-ops', async () => {
  const recruit = fixture(recruitReviewedRules);
  recruit.show('result', 'skip');
  const reveal = await registry(recruit, createRecruitCapabilities).execute(
    'game.recruit.skip_reveal',
    {},
  );
  expect(reveal.status).toBe('completed');
  expect((reveal.data as any).changed).toBe(false);
  expect(recruit.clicks).toBe(0);
  const fight = fixture(fightReviewedRules);
  fight.show('stage', 'agent.active');
  const agent = await registry(fight, createFightCapabilities).execute(
    'game.fight.enable_agent',
    {},
  );
  expect(agent.status).toBe('completed');
  expect((agent.data as any).changed).toBe(false);
  expect(fight.clicks).toBe(0);
});

test('formal battle waits across independent read-only roots without repeating the confirmed start', async () => {
  await withStartupClock(async (clock) => {
    const f = fixture(fightReviewedRules);
    f.text.series = '×1';
    f.show('stage', 'agent.active', 'series');
    let inBattle = false;
    const clicked: string[] = [];
    f.onClick((id) => {
      clicked.push(id ?? 'dismiss');
      if (id === 'stage') f.show('confirm');
      else if (id === 'confirm') {
        inBattle = true;
        f.show('running');
      } else if (id === undefined) {
        inBattle = false;
        f.show('stage', 'agent.active', 'series');
      }
    });
    f.onFrame(() => {
      if (inBattle && clock.elapsed() >= 150000) f.show('result');
    });
    const roots: string[] = [];
    const native = f.port.runPipeline;
    f.port.runPipeline = async (entry, ...args) => {
      roots.push(entry);
      return native(entry, ...args);
    };
    const result = await registry(f, createFightCapabilities).execute(
      'workflow.fight.single_battle',
      { medicine: 0, stone: 0 },
    );
    expect(result).toMatchObject({
      status: 'completed',
      verified: true,
      data: { battleWon: true },
    });
    expect(clicked).toEqual(['stage', 'confirm', 'dismiss']);
    expect(roots).toEqual([
      'Fight@StartSingle',
      'Fight@WaitSingle',
      'Fight@WaitSingle',
      'Fight@WaitSingle',
      'Fight@DismissSingle',
    ]);
    expect(clock.elapsed()).toBeGreaterThanOrEqual(150000);
  });
});

test('medicine confirmation reserves a single proven quantity before input and verifies an actual sanity increase', async () => {
  await withoutAnimationDelays(async () => {
    const f = fixture(fightReviewedRules);
    f.show('medicine', 'medicine.confirm', 'medicine.selected', 'medicine.count', 'sanity');
    f.text['medicine.count'] = '1';
    f.text.sanity = '10/135';
    f.setMatches('medicine.selected', [{ box: [800, 200, 30, 20], score: 1 }]);
    f.setMatches('medicine.count', [{ box: [705, 228, 30, 20], score: 1, text: '1' }]);
    const order: string[] = [];
    f.onClick((id) => {
      order.push('click:' + id);
      f.show('stage', 'sanity');
      f.text.sanity = '70/135';
    });
    const result = await registry(f, createFightCapabilities).execute(
      'game.fight.replenish',
      { medicine: 1, stone: 0 },
      {
        reserveConsumable: async (kind, amount, limit, id) => {
          order.push('reserve');
          expect({ kind, amount, limit }).toEqual({ kind: 'medicine', amount: 1, limit: 1 });
          expect(id).toMatch(/^[a-f0-9-]{36}$/);
        },
      },
    );
    expect(result).toMatchObject({
      status: 'completed',
      verified: true,
      data: {
        kind: 'medicine',
        amount: 1,
        beforeSanity: { current: 10, maximum: 135 },
        afterSanity: { current: 70, maximum: 135 },
      },
    });
    expect(order).toEqual(['reserve', 'click:medicine.confirm']);
  });
});

test('changed medicine quantities after reservation stop without input while keeping the consumed reservation', async () => {
  const f = fixture(fightReviewedRules);
  f.show('medicine', 'medicine.confirm', 'medicine.selected', 'medicine.count', 'sanity');
  f.text.sanity = '10/135';
  f.setMatches('medicine.selected', [{ box: [800, 200, 30, 20], score: 1 }]);
  f.setMatches('medicine.count', [{ box: [705, 228, 30, 20], score: 1, text: '1' }]);
  let reservations = 0;
  const result = await registry(f, createFightCapabilities).execute(
    'game.fight.replenish',
    { medicine: 1 },
    {
      reserveConsumable: async () => {
        reservations++;
        f.setMatches('medicine.count', [{ box: [705, 228, 30, 20], score: 1, text: '2' }]);
      },
    },
  );
  expect(result).toMatchObject({ status: 'unknown', verified: false });
  expect(reservations).toBe(1);
  expect(f.clicks).toBe(0);
});

test('ordinary mail uses explicit no-reward evidence and cannot reuse it after an unrelated input revision', async () => {
  const f = fixture(awardReviewedRules);
  let revision = 0;
  f.port.getInputRevision = () => revision;
  const r = registry(f, createAwardCapabilities);
  f.show('home', 'mail.noaward');
  const result = await r.execute('workflow.award.mail', {});
  expect(result).toMatchObject({
    status: 'completed',
    verified: true,
    data: { noUnclaimedMail: true },
  });
  expect(f.clicks).toBe(0);
  revision++;
  f.show('home');
  expect((await r.execute('game.award.mail_claim', {})).status).toBe('failed');
  expect(f.clicks).toBe(0);
});

/** 公招数据与屏幕都是合成值；验证许可预留、一次性凭据和业务复核，不访问真实账号。 */
const recruitTestTags = ['先锋干员', '近战位', '输出', '费用回复', '生存'];
function recruitmentFixture() {
  const f = fixture(recruitReviewedRules);
  Object.assign(f.profile, {
    recruitment: {
      tags: recruitTestTags,
      operators: [{ id: 'synthetic-three', name: '合成三星', rarity: 3, tags: recruitTestTags }],
    },
  });
  f.setMatches(
    'tags',
    recruitTestTags.map((text, index) => ({
      text,
      score: 1,
      box: [380 + index * 50, 380, 40, 25],
    })),
  );
  f.text.permits = '10';
  f.text['timer.hour'] = '01';
  f.text['timer.minute'] = '00';
  f.setMatches('timer.buttons', [
    { box: f.boxes['timer.buttons'], score: 1 },
    { box: [700, 300, 20, 20], score: 1 },
  ]);
  return f;
}

test('daily recruitment makes an empty or busy list a verified no-op and never consumes permits', async () => {
  const f = recruitmentFixture();
  f.show('page');
  const result = await registry(f, createRecruitCapabilities).execute('workflow.recruit.daily', {
    times: 4,
    maxPermits: 4,
    refresh: false,
  });
  expect(result).toMatchObject({
    status: 'completed',
    verified: true,
    data: { collected: 0, confirmed: 0, visited: [] },
  });
  expect(f.clicks).toBe(0);
});

test('new recruitment verifies each timer input, reserves one permit before confirmation and requires the same slot running', async () => {
  await withoutAnimationDelays(async () => {
    const f = recruitmentFixture();
    let revision = 0,
      reservations = 0;
    f.port.getInputRevision = () => revision;
    f.show('page', 'start');
    f.onClick((id) => {
      revision++;
      if (id === 'start')
        f.show('tags', 'permits', 'confirm', 'timer.hour', 'timer.minute', 'timer.buttons');
      if (id === 'timer.buttons') f.text['timer.hour'] = '09';
      if (id === 'confirm') {
        expect(reservations).toBe(1);
        f.show('page', 'running');
      }
    });
    const r = registry(f, createRecruitCapabilities);
    expect(await r.execute('game.recruit.open_slot', { slot: 0 })).toMatchObject({
      status: 'completed',
      verified: true,
    });
    expect(await r.execute('game.recruit.prepare', {})).toMatchObject({
      status: 'completed',
      verified: true,
      data: { prepared: true, plan: { minutes: 540, selected: [] } },
    });
    const confirm = await r.execute(
      'game.recruit.confirm',
      { maxPermits: 1, reservePermits: 0 },
      {
        reserveConsumable: async (kind, amount, limit) => {
          expect([kind, amount, limit]).toEqual(['recruit', 1, 1]);
          reservations++;
        },
      },
    );
    expect(confirm).toMatchObject({
      status: 'completed',
      verified: true,
      data: { slot: 0, permitConsumed: 1, minutes: 540 },
    });
    const before = f.clicks;
    expect((await r.execute('game.recruit.confirm', { maxPermits: 1 })).status).toBe('failed');
    expect(f.clicks).toBe(before);
  });
});

test('recruit permit reservation does not authorize a changed tag screen or another confirmation attempt', async () => {
  await withoutAnimationDelays(async () => {
    const f = recruitmentFixture();
    let revision = 0;
    f.port.getInputRevision = () => revision;
    f.show('page', 'start');
    f.onClick((id) => {
      revision++;
      if (id === 'start')
        f.show('tags', 'permits', 'confirm', 'timer.hour', 'timer.minute', 'timer.buttons');
      if (id === 'timer.buttons') f.text['timer.hour'] = '09';
    });
    const r = registry(f, createRecruitCapabilities);
    await r.execute('game.recruit.open_slot', { slot: 0 });
    await r.execute('game.recruit.prepare', {});
    const before = f.clicks;
    const result = await r.execute(
      'game.recruit.confirm',
      { maxPermits: 1 },
      {
        reserveConsumable: async () => {
          f.text.permits = '9';
        },
      },
    );
    expect(result).toMatchObject({ status: 'unknown', verified: false });
    expect(f.clicks).toBe(before);
    expect((await r.execute('game.recruit.confirm', { maxPermits: 1 })).status).toBe('failed');
  });
});

test('recruit prepare stops after a timer input without its expected numeric change', async () => {
  await withoutAnimationDelays(async () => {
    const f = recruitmentFixture();
    let revision = 0;
    f.port.getInputRevision = () => revision;
    f.show('page', 'start');
    f.onClick((id) => {
      revision++;
      if (id === 'start')
        f.show('tags', 'permits', 'confirm', 'timer.hour', 'timer.minute', 'timer.buttons');
    });
    const r = registry(f, createRecruitCapabilities);
    await r.execute('game.recruit.open_slot', { slot: 0 });
    const before = f.clicks,
      result = await r.execute('game.recruit.prepare', {});
    expect(result).toMatchObject({ status: 'unknown', verified: false });
    expect(f.clicks).toBe(before + 1);
    expect((await r.execute('game.recruit.confirm', { maxPermits: 1 })).status).toBe('failed');
  });
});

test('full recruitment daily executes one explicit new slot through independent registered roots', async () => {
  await withoutAnimationDelays(async () => {
    const f = recruitmentFixture();
    let revision = 0,
      reservations = 0;
    f.port.getInputRevision = () => revision;
    f.show('page', 'start');
    f.onClick((id) => {
      revision++;
      if (id === 'start')
        f.show('tags', 'permits', 'confirm', 'timer.hour', 'timer.minute', 'timer.buttons');
      if (id === 'timer.buttons') f.text['timer.hour'] = '09';
      if (id === 'confirm') f.show('page', 'running');
    });
    const result = await registry(f, createRecruitCapabilities).execute(
      'workflow.recruit.daily',
      { times: 1, maxPermits: 1, refresh: false, select: [4], confirm: [3, 4] },
      {
        reserveConsumable: async () => {
          reservations++;
        },
      },
    );
    expect(result).toMatchObject({
      status: 'completed',
      verified: true,
      data: { collected: 0, confirmed: 1, visited: [0] },
    });
    expect(reservations).toBe(1);
    expect(f.clicks).toBe(3);
  });
});

function shoppingFixture() {
  const f = fixture(mallReviewedRules);
  let revision = 0,
    phase: 'list' | 'buy' | 'obtained' = 'list';
  f.port.getInputRevision = () => revision;
  f.text.balance = '500';
  f.text['product.name'] = '招聘许可';
  f.text['product.discount'] = '50';
  f.raw('80');
  f.setMatches('product.card', [{ box: [160, 480, 20, 20], score: 1 }]);
  const list = (sold = false) =>
    f.show(
      'store',
      'credit.currency',
      'balance',
      'product.card',
      'product.name',
      'product.discount',
      ...(sold ? ['product.sold'] : []),
    );
  list();
  f.onClick((id) => {
    revision++;
    if (phase === 'list' && id === undefined) {
      phase = 'buy';
      f.show('buy', 'currency', 'balance');
    } else if (phase === 'buy' && id === 'buy') {
      phase = 'obtained';
      f.show('obtained');
    } else if (phase === 'obtained' && id === undefined) {
      phase = 'list';
      f.text.balance = '420';
      list(true);
    }
  });
  return f;
}

test('credit shopping preserves priority over blacklist, reserves exact prices and closes each confirmed reward once', async () => {
  await withoutAnimationDelays(async () => {
    const f = shoppingFixture();
    let reserved = 0;
    const result = await registry(f, createMallCapabilities).execute(
      'workflow.mall.shopping',
      { maxCredit: 200, buyFirst: ['招聘'], blacklist: ['许可'], onlyDiscount: true },
      {
        reserveConsumable: async (kind, amount, limit) => {
          expect([kind, amount, limit]).toEqual(['credit', 80, 200]);
          expect(f.clicks).toBe(1);
          reserved += amount;
        },
      },
    );
    expect(result).toMatchObject({
      status: 'completed',
      verified: true,
      data: { spent: 80, purchases: 1 },
    });
    expect(reserved).toBe(80);
    expect(f.clicks).toBe(3);
  });
});

test('credit shopping keeps blacklist, discount and 300-credit reserve filters before any product input', async () => {
  const f = shoppingFixture(),
    r = registry(f, createMallCapabilities);
  for (const input of [
    { phase: 'general', blacklist: ['许可'] },
    { phase: 'priority', buyFirst: ['家具'] },
  ])
    expect(await r.execute('game.mall.choose_product', input)).toMatchObject({
      status: 'completed',
      verified: true,
      data: { done: true },
    });
  f.text['product.discount'] = '?';
  expect(
    await r.execute('game.mall.choose_product', { phase: 'general', onlyDiscount: true }),
  ).toMatchObject({ data: { done: true } });
  f.text.balance = '300';
  expect(
    await r.execute('game.mall.choose_product', { phase: 'general', reserveMaxCredit: true }),
  ).toMatchObject({ data: { done: true, reason: 'credit_reserve' } });
  expect(f.clicks).toBe(0);
});

test('credit purchase keeps its reservation and refuses a price change before the single confirmation', async () => {
  await withoutAnimationDelays(async () => {
    const f = shoppingFixture(),
      r = registry(f, createMallCapabilities);
    await r.execute('game.mall.choose_product', { phase: 'priority', buyFirst: ['招聘'] });
    await r.execute('game.mall.open_product', {});
    let reservations = 0;
    const before = f.clicks;
    const result = await r.execute(
      'game.mall.purchase_selected',
      { maxCredit: 200 },
      {
        reserveConsumable: async () => {
          reservations++;
          f.raw('90');
        },
      },
    );
    expect(result).toMatchObject({ status: 'unknown', verified: false });
    expect(reservations).toBe(1);
    expect(f.clicks).toBe(before);
    expect((await r.execute('game.mall.purchase_selected', { maxCredit: 200 })).status).toBe(
      'failed',
    );
    expect(f.clicks).toBe(before);
  });
});

test('friend once-per-day claim and explicit no-friends states finish without a device input', async () => {
  const f = fixture(mallReviewedRules),
    r = registry(f, createMallCapabilities);
  let claims = 0;
  expect(
    await r.execute(
      'workflow.mall.visit_friends',
      { oncePerDay: true },
      {
        claimDailyAction: async (key) => {
          expect(key).toBe('visit_friends');
          claims++;
          return false;
        },
      },
    ),
  ).toMatchObject({ status: 'completed', verified: true, data: { skipped: true } });
  expect(claims).toBe(1);
  expect(f.clicks).toBe(0);
  f.show('friends.list', 'friends.empty');
  expect(await r.execute('workflow.mall.visit_friends', {})).toMatchObject({
    status: 'completed',
    verified: true,
    data: { empty: true },
  });
  expect(f.clicks).toBe(0);
});

test('an unchanged friend page after visiting next remains unknown and never repeats the input', async () => {
  await withStartupClock(async () => {
    const f = fixture(mallReviewedRules);
    f.show('friends.next');
    f.raw('合成好友A', '访问下位');
    const result = await registry(f, createMallCapabilities).execute('game.mall.visit_next', {});
    expect(result).toMatchObject({ status: 'unknown', verified: false });
    expect(f.clicks).toBe(1);
  });
});

test('reviewed friend RGBCount keeps its actual color algorithm and rejects parameter drift', async () => {
  const node = {
    method: 'RGBCount',
    pureColor: true,
    colorScales: [[253, 255]],
    roi: [952, 105, 267, 601],
    templThreshold: 0.8,
  };
  const profile = await loadReviewedResourceProfile(
    {
      async read(path) {
        return path === 'tasks/tasks.json'
          ? Buffer.from(JSON.stringify({ StartToVisit: node }))
          : undefined;
      },
      async listTemplates() {
        return { complete: true, ids: ['StartToVisit.png'] };
      },
    },
    'friends',
    [{ id: 'first', node: 'StartToVisit', rgbPureColor: true }],
    [],
  );
  expect(profile.rules.first).toMatchObject({
    method: 'RGBCount',
    pureColor: true,
    colorScales: [
      [
        [253, 253, 253],
        [255, 255, 255],
      ],
    ],
  });
  node.pureColor = false;
  const changed = await loadReviewedResourceProfile(
    {
      async read(path) {
        return path === 'tasks/tasks.json'
          ? Buffer.from(JSON.stringify({ StartToVisit: node }))
          : undefined;
      },
      async listTemplates() {
        return { complete: true, ids: ['StartToVisit.png'] };
      },
    },
    'friends',
    [{ id: 'first', node: 'StartToVisit', rgbPureColor: true }],
    [],
  );
  expect(changed.rules.first).toBeUndefined();
});
