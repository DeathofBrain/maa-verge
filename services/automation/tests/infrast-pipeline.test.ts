import { expect, test } from 'bun:test';
import {
  AtomicVision,
  AtomicFailure,
  createInfrastDriver,
  type AtomicExecutionPort,
  type AtomicResourceProfile,
  type AtomicExecutionContext,
} from '@maaverge/automation';
import { runInfrastPipeline } from '../arknights/custom/infrast/pipeline';
import { infrastPipelineDefinitions } from '../arknights/custom/infrast/definitions';
import { syntheticPipeline } from './pipeline-fixture';

const profile = (): AtomicResourceProfile => ({
  id: 'synthetic-pipeline',
  clientType: 'Official',
  available: true,
  diagnostics: [],
  card: null,
  actions: {},
  sources: [],
  rules: Object.fromEntries(
    ['base.entered', 'operators.filter', 'operators.all'].map((id) => [
      id,
      {
        id,
        kind: 'template',
        templateId: `${id}.png`,
        threshold: 0.91,
        source: { repository: 'synthetic', ref: 'fixture', path: 'memory' },
      },
    ]),
  ),
});
const frame = () => ({ frameId: 'fixture-frame', width: 1280, height: 720, data: 'fixture-only' });

test('standard Pipeline branches stop returning once the actual base marker is recognized', async () => {
  let backs = 0;
  const visited: string[] = [];
  const port: AtomicExecutionPort = {
    async execute(operation) {
      if (operation !== 'frame') throw new Error('base navigation uses native Pipeline nodes');
      return frame();
    },
    runPipeline: syntheticPipeline({
      entered(name) {
        visited.push(name);
      },
      recognize(_name, node) {
        expect(node.template).toEqual(['base.entered.png']);
        expect(node.threshold).toBe(0.91);
        return backs === 2;
      },
      action(_name, node) {
        expect(node.action).toBe('ClickKey');
        expect(node.key).toBe(4);
        backs++;
      },
    }),
  };
  await runInfrastPipeline(new AtomicVision(port, profile()), 'Infrast@Base');
  expect(backs).toBe(2);
  expect(visited.at(-1)).toBe('Infrast@Base@Ready3');
});

test('base navigation has a finite return budget and stops before any unrelated task', async () => {
  let backs = 0;
  const port: AtomicExecutionPort = {
    execute: async () => frame(),
    runPipeline: syntheticPipeline({
      recognize: () => false,
      action: () => backs++,
    }),
  };
  await expect(
    runInfrastPipeline(new AtomicVision(port, profile()), 'Infrast@Base'),
  ).rejects.toThrow('不会自动从主界面运行其他任务');
  expect(backs).toBe(4);
});

test('filter Pipeline verifies menu disappearance after the two distinct mutations', async () => {
  let opened = false,
    clicks = 0;
  const visited: string[] = [];
  const port: AtomicExecutionPort = {
    async execute(operation, input) {
      if (operation === 'frame') return frame();
      if (operation === 'recognize') {
        const hit = input.templateId === 'operators.filter.png' ? !opened : opened;
        return {
          hit,
          coordinateSize: [1280, 720],
          matches: hit ? [{ box: [10, 10, 20, 20], score: 1 }] : [],
        };
      }
      if (operation === 'click') {
        clicks++;
        opened = !opened;
        return { accepted: true };
      }
      throw new Error('unexpected primitive');
    },
    runPipeline: syntheticPipeline({ entered: (name) => visited.push(name) }),
  };
  const vision = new AtomicVision(port, profile());
  vision.wait = async () => {};
  await createInfrastDriver(vision).resetFilter();
  expect(clicks).toBe(2);
  expect(opened).toBe(false);
  expect(visited).toEqual(['Infrast@Filter', 'Infrast@Filter@All', 'Infrast@Filter@Check']);
});

test('lost Custom action acknowledgement prevents the next node and never repeats the click', async () => {
  let clicks = 0;
  const visited: string[] = [];
  const port: AtomicExecutionPort = {
    async execute(operation) {
      if (operation === 'frame') return frame();
      if (operation === 'recognize')
        return {
          hit: true,
          coordinateSize: [1280, 720],
          matches: [{ box: [0, 0, 10, 10], score: 1 }],
        };
      if (operation === 'click') {
        clicks++;
        throw new Error('native acknowledgement lost');
      }
      throw new Error('unexpected primitive');
    },
    runPipeline: syntheticPipeline({ entered: (name) => visited.push(name) }),
  };
  await expect(
    createInfrastDriver(new AtomicVision(port, profile())).resetFilter(),
  ).rejects.toThrow('native acknowledgement lost');
  expect(clicks).toBe(1);
  expect(visited).toEqual(['Infrast@Filter']);
});

test('Custom callbacks cannot substitute parameters or a node from outside the submitted graph', async () => {
  let effects = 0;
  const port: AtomicExecutionPort = {
    async execute() {
      effects++;
      return frame();
    },
    async runPipeline(_entry, _pipeline, custom) {
      await custom('Infrast@Filter', { handler: 'action', action: 'operators.confirm' });
    },
  };
  await expect(
    createInfrastDriver(new AtomicVision(port, profile())).resetFilter(),
  ).rejects.toThrow('与已提交节点不一致');
  expect(effects).toBe(1);
});

test('unsupported base mask and nonstandard frames are rejected before native Pipeline admission', async () => {
  let admissions = 0;
  const port: AtomicExecutionPort = {
    execute: async () => ({ ...frame(), width: 1281 }),
    async runPipeline() {
      admissions++;
    },
  };
  const masked = profile();
  masked.rules['base.entered'].maskRange = [100, 255];
  await expect(runInfrastPipeline(new AtomicVision(port, masked), 'Infrast@Base')).rejects.toThrow(
    '不能安全映射',
  );
  await expect(
    createInfrastDriver(new AtomicVision(port, profile())).resetFilter(),
  ).rejects.toThrow('16:9');
  expect(admissions).toBe(0);
});

test('Pipeline admission submits the shared operator reader without unrelated entry graphs', async () => {
  const submitted: Array<{ entry: string; pipeline: Record<string, unknown> }> = [];
  const port: AtomicExecutionPort = {
    execute: async () => frame(),
    async runPipeline(entry, pipeline) {
      submitted.push({ entry, pipeline });
    },
  };
  const vision = new AtomicVision(port, profile());
  await runInfrastPipeline(vision, 'Infrast@Processing@Roster');
  await runInfrastPipeline(vision, 'Infrast@Training@Assistant');
  for (const { entry, pipeline } of submitted) {
    expect(pipeline[entry]).toBeDefined();
    expect(pipeline['Infrast@Operators@Read']).toBeDefined();
    expect(pipeline['Infrast@Base']).toBeUndefined();
    expect(pipeline['Infrast@Filter']).toBeUndefined();
    expect(pipeline['Infrast@Training@Trainee']).toBeUndefined();
  }
  expect(submitted[0]!.pipeline['Infrast@Training@Assistant']).toBeUndefined();
  expect(submitted[1]!.pipeline['Infrast@Processing@Roster']).toBeUndefined();
});

test('resource bindings remain independent across Pipeline runs and leave JSON definitions untouched', async () => {
  const original = structuredClone(infrastPipelineDefinitions);
  const submitted: Record<string, unknown>[] = [];
  const port: AtomicExecutionPort = {
    execute: async () => frame(),
    async runPipeline(_entry, pipeline) {
      submitted.push(pipeline);
    },
  };
  const first = profile(),
    second = profile();
  Object.assign(first.rules['base.entered']!, {
    templateId: 'first.png',
    threshold: 0.83,
    method: 3,
    roi: [1, 2, 30, 40],
  });
  Object.assign(second.rules['base.entered']!, {
    templateId: 'second.png',
    threshold: 0.95,
    method: 5,
    roi: [5, 6, 70, 80],
  });
  await runInfrastPipeline(new AtomicVision(port, first), 'Infrast@Base');
  await runInfrastPipeline(new AtomicVision(port, second), 'Infrast@Base');
  for (let attempt = 1; attempt <= 5; attempt++) {
    const node = `Infrast@Base@Ready${attempt}`;
    expect(submitted[0]![node]).toMatchObject({
      template: ['first.png'],
      threshold: 0.83,
      method: 3,
      roi: [1, 2, 30, 40],
    });
    expect(submitted[1]![node]).toMatchObject({
      template: ['second.png'],
      threshold: 0.95,
      method: 5,
      roi: [5, 6, 70, 80],
    });
  }
  expect(infrastPipelineDefinitions).toEqual(original);
});

test('room panel count is bound before roster navigation and cannot remain an unchanged selection after clearing', async () => {
  const events: string[] = [];
  const resources = profile();
  resources.rules['facility.label.Control'] = {
    id: 'facility.label.Control',
    kind: 'ocr',
    source: { repository: 'synthetic', ref: 'fixture', path: 'memory' },
  };
  const port: AtomicExecutionPort = {
    runPipeline: syntheticPipeline(),
    async execute(operation) {
      if (operation === 'frame') return frame();
      if (operation === 'recognize')
        return {
          hit: true,
          matches: [{ box: [400, 20, 100, 20], score: 1 }],
          coordinateSize: [1280, 720],
        };
      throw new Error('the synthetic room driver must not dispatch native input');
    },
  };
  const vision = new AtomicVision(port, resources);
  vision.clickRule = async (id) => {
    events.push(id);
    return true;
  };
  vision.clickFirst = async () => {
    events.push('roster.enter');
    return 'room.list';
  };
  vision.ensureRoomPanel = async () => {
    events.push('room.panel');
  };
  vision.roomCapacity = async (target) => {
    events.push('room.count');
    return { source: 'room_panel', frameId: 'panel', target, occupied: 1, capacity: 5 };
  };
  vision.operators = async () => ({
    frameId: 'roster',
    pageIdentity: 'first',
    cards: [
      { name: '甲', rawName: '甲', nameVerified: true, selected: true, box: [420, 100, 100, 200] },
    ],
  });
  vision.operatorsReady = async () => true;
  const driver = createInfrastDriver(vision);
  await driver.openRoster({ facility: 'Control', room: 1 });
  expect(events).toEqual(['room.panel', 'room.count', 'roster.enter']);
  expect(await driver.operators()).toMatchObject({
    selectionOrigin: 'room_entry',
    room: { occupied: 1, capacity: 5, target: { facility: 'Control', room: 1 } },
  });
  await driver.clear();
  expect((await driver.operators()).selectionOrigin).toBeUndefined();
});

/** 仅模拟导航接受与随后页面事实，区分一次点击、过渡读取和非导航前置拒绝。 */
function roomNavigationFixture(
  options: {
    delayedTitle?: number;
    delayedPosition?: number;
    expiredAfterClick?: boolean;
    unknownRead?: boolean;
  } = {},
) {
  let clicks = 0,
    titleReads = 0,
    positionReads = 0;
  const context: AtomicExecutionContext = {};
  const resources = profile();
  for (const facility of ['Control', 'Mfg'])
    for (const kind of ['icon', 'label']) {
      const id = `facility.${kind}.${facility}`;
      resources.rules[id] = {
        id,
        kind: 'template',
        templateId: id,
        source: { repository: 'synthetic', ref: 'fixture', path: 'memory' },
      };
    }
  const port: AtomicExecutionPort = {
    runPipeline: syntheticPipeline({ recognize: () => true }),
    async execute(operation) {
      if (operation === 'frame') return frame();
      if (operation === 'click') {
        clicks++;
        if (options.expiredAfterClick) context.deadline = Date.now() - 1;
        return { accepted: true };
      }
      throw new Error('room navigation fixture only accepts the single declared click');
    },
  };
  const vision = new AtomicVision(port, resources, context);
  vision.wait = async () => {};
  const label = { box: [440, 130, 100, 20] as [number, number, number, number], score: 1 };
  vision.recognize = async (_image, rule, roi) => {
    if (rule.id.includes('.icon.') || roi?.[0] === 420) return { hit: true, matches: [label] };
    titleReads++;
    if (options.unknownRead) throw new AtomicFailure('native room read unknown', 'unknown');
    const hit = clicks > 0 && titleReads >= (options.delayedTitle ?? 1);
    return { hit, matches: hit ? [label] : [] };
  };
  vision.texts = async () => {
    positionReads++;
    return {
      frame: frame(),
      matches: [
        { ...label, text: positionReads >= (options.delayedPosition ?? 1) ? 'B101' : 'B102' },
      ],
    };
  };
  vision.overview = async () => ({
    frameId: 'overview',
    rows: [{ facility: 'Control', room: 1, box: label.box, identity: 'Control:1' }],
    texts: [],
  });
  return {
    driver: createInfrastDriver(vision),
    clicks: () => clicks,
    titleReads: () => titleReads,
    positionReads: () => positionReads,
  };
}

for (const route of ['room', 'overview'] as const)
  test(`delayed ${route} navigation title is awaited without another click`, async () => {
    const game = roomNavigationFixture({ delayedTitle: 3 });
    await game.driver.openRoom({ facility: 'Control', room: 1 }, route);
    expect(game.clicks()).toBe(1);
    expect(game.titleReads()).toBe(3);
  });

test('navigation waits for the complete requested position as well as the facility title', async () => {
  const game = roomNavigationFixture({ delayedPosition: 2 });
  await game.driver.openRoom({ facility: 'Mfg', room: 1, position: 'B101' }, 'room');
  expect(game.clicks()).toBe(1);
  expect(game.positionReads()).toBe(2);
});

test('wrong target after the parent deadline stays unknown and never repeats navigation', async () => {
  const game = roomNavigationFixture({ delayedTitle: 100, expiredAfterClick: true });
  await expect(
    game.driver.openRoom({ facility: 'Control', room: 1 }, 'room'),
  ).rejects.toMatchObject({
    status: 'unknown',
  });
  expect(game.clicks()).toBe(1);
  expect(game.titleReads()).toBe(1);
});

test('unknown navigation observations are not retried or converted into successful room entry', async () => {
  const game = roomNavigationFixture({ unknownRead: true });
  await expect(game.driver.openRoom({ facility: 'Control', room: 1 }, 'room')).rejects.toThrow(
    'native room read unknown',
  );
  expect(game.clicks()).toBe(1);
  expect(game.titleReads()).toBe(1);
});

test('non-navigation room preconditions still reject a wrong page immediately before input', async () => {
  const game = roomNavigationFixture();
  await expect(game.driver.openRoster({ facility: 'Control', room: 1 })).rejects.toThrow(
    '设施标题',
  );
  expect(game.clicks()).toBe(0);
  expect(game.titleReads()).toBe(1);
});

function overviewNavigationFixture(
  options: {
    delayedQueue?: number;
    expiredAfterClick?: boolean;
    ambiguousRows?: boolean;
  } = {},
) {
  let clicks = 0,
    queueReads = 0,
    observations = 0;
  const context: AtomicExecutionContext = {};
  const resources = profile();
  resources.rules['queue.rotate'] = {
    id: 'queue.rotate',
    kind: 'template',
    templateId: 'queue',
    source: { repository: 'synthetic', ref: 'fixture', path: 'memory' },
  };
  const port: AtomicExecutionPort = {
    runPipeline: syntheticPipeline({ recognize: () => true }),
    execute: async () => frame(),
  };
  const vision = new AtomicVision(port, resources, context);
  vision.wait = async () => {};
  vision.clickRule = async (id) => {
    if (id !== 'overview.enter') throw new Error('unexpected overview navigation input');
    clicks++;
    if (options.expiredAfterClick) context.deadline = Date.now() - 1;
    return true;
  };
  vision.recognize = async () => {
    queueReads++;
    const hit = queueReads >= (options.delayedQueue ?? 1);
    return { hit, matches: hit ? [{ box: [1100, 650, 100, 30], score: 1 }] : [] };
  };
  vision.overview = async () => {
    observations++;
    if (!clicks) throw new AtomicFailure('not on overview');
    if (options.ambiguousRows) throw new AtomicFailure('ambiguous physical rows');
    return { frameId: 'overview', rows: [], texts: [] };
  };
  return {
    driver: createInfrastDriver(vision),
    clicks: () => clicks,
    queueReads: () => queueReads,
    observations: () => observations,
  };
}

test('opening overview waits for its delayed queue marker through reads without another click', async () => {
  const game = overviewNavigationFixture({ delayedQueue: 3 });
  await game.driver.enterOverview();
  expect(game.clicks()).toBe(1);
  expect(game.queueReads()).toBe(3);
  expect(game.observations()).toBe(2);
});

test('overview navigation deadline expiry remains unknown without another input or full observation', async () => {
  const game = overviewNavigationFixture({ delayedQueue: 100, expiredAfterClick: true });
  await expect(game.driver.enterOverview()).rejects.toMatchObject({ status: 'unknown' });
  expect(game.clicks()).toBe(1);
  expect(game.queueReads()).toBe(1);
  expect(game.observations()).toBe(1);
});

test('an overview page marker does not retry or excuse ambiguous physical room evidence', async () => {
  const game = overviewNavigationFixture({ ambiguousRows: true });
  await expect(game.driver.enterOverview()).rejects.toThrow('ambiguous physical rows');
  expect(game.clicks()).toBe(1);
  expect(game.queueReads()).toBe(1);
  expect(game.observations()).toBe(2);
});

test('standalone overview observation still fails immediately without starting navigation', async () => {
  const game = overviewNavigationFixture();
  await expect(game.driver.overview()).rejects.toThrow('not on overview');
  expect(game.clicks()).toBe(0);
  expect(game.queueReads()).toBe(0);
  expect(game.observations()).toBe(1);
});

/** 名单导航夹具只等待完整卡片锚点；姓名读取必须在就绪后执行一次且不能被等待吞掉。 */
function rosterNavigationFixture(
  options: { readyAfterReads?: number; expiredAfterClick?: boolean; ambiguousName?: boolean } = {},
) {
  let clicks = 0,
    anchorReads = 0,
    nameReads = 0;
  const context: AtomicExecutionContext = {};
  const resources = profile();
  resources.rules['facility.label.Processing'] = {
    id: 'facility.label.Processing',
    kind: 'template',
    templateId: 'processing-room',
    source: { repository: 'synthetic', ref: 'fixture', path: 'memory' },
  };
  resources.actions['processing.list'] = { box: [1100, 620, 100, 50], delayMs: 0 };
  const port: AtomicExecutionPort = {
    runPipeline: syntheticPipeline(),
    async execute(operation) {
      if (operation === 'frame') return frame();
      if (operation === 'recognize')
        return {
          hit: true,
          coordinateSize: [1280, 720],
          matches: [{ box: [420, 20, 100, 30], score: 1 }],
        };
      if (operation === 'click') {
        clicks++;
        if (options.expiredAfterClick) context.deadline = Date.now() - 1;
        return { accepted: true };
      }
      throw new Error('roster navigation only accepts its single declared input');
    },
  };
  const vision = new AtomicVision(port, resources, context);
  vision.wait = async () => {};
  vision.operatorsReady = async () => ++anchorReads >= (options.readyAfterReads ?? 1);
  vision.operators = async () => {
    nameReads++;
    if (options.ambiguousName) throw new AtomicFailure('ambiguous operator name');
    return { frameId: 'roster', pageIdentity: 'one', cards: [] };
  };
  return {
    driver: createInfrastDriver(vision),
    clicks: () => clicks,
    anchorReads: () => anchorReads,
    nameReads: () => nameReads,
  };
}

test('roster navigation waits for delayed complete anchors with one input and one strict read', async () => {
  const game = rosterNavigationFixture({ readyAfterReads: 3 });
  await game.driver.openRoster({ facility: 'Processing', room: 1 });
  expect(game.clicks()).toBe(1);
  expect(game.anchorReads()).toBe(3);
  expect(game.nameReads()).toBe(1);
});

test('roster readiness timeout never repeats navigation or reads names from an incomplete page', async () => {
  const game = rosterNavigationFixture({ readyAfterReads: 100, expiredAfterClick: true });
  await expect(game.driver.openRoster({ facility: 'Processing', room: 1 })).rejects.toMatchObject({
    status: 'unknown',
  });
  expect(game.clicks()).toBe(1);
  expect(game.anchorReads()).toBe(1);
  expect(game.nameReads()).toBe(0);
});

test('ready card anchors do not retry or excuse an ambiguous operator name', async () => {
  const game = rosterNavigationFixture({ ambiguousName: true });
  await expect(game.driver.openRoster({ facility: 'Processing', room: 1 })).rejects.toThrow(
    'ambiguous operator name',
  );
  expect(game.clicks()).toBe(1);
  expect(game.anchorReads()).toBe(1);
  expect(game.nameReads()).toBe(1);
});
