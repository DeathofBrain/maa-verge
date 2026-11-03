/** 官方计划兼容只使用合成 JSON 与总览；不读取用户文件，不连接设备或运行游戏。 */
import { expect, test } from 'bun:test';
import {
  AtomicVision,
  createInfrastDriver,
  parseCustomInfrastPlan,
  checkCustomInfrastPlanResources,
  compileLegacyTask,
  validateCompiledLegacyTaskInputs,
  type AtomicResourceProfile,
  type OverviewRow,
  type AtomicRoomShiftInput,
} from '@maaverge/automation';

function document() {
  return {
    title: '合成明确名单',
    author: 'fixture',
    plans: [
      {
        name: '第一班',
        rooms: {
          power: [{ operators: ['甲'], sort: false, autofill: false }],
          control: [{ operators: ['乙', '丙'], sort: false }],
          manufacture: [{ skip: true, operators: ['丁'], product: 'Battle Record' }],
        },
        drones: { enable: false, room: 'manufacture' },
      },
    ],
  };
}

test('official plan parsing preserves the original document and official array ordinals', () => {
  const original = document(),
    before = JSON.stringify(original);
  expect(parseCustomInfrastPlan(original)).toEqual({
    planIndex: 0,
    name: '第一班',
    rooms: [
      { facility: 'Power', room: 1, operators: ['甲'] },
      { facility: 'Control', room: 1, operators: ['乙', '丙'] },
    ],
  });
  expect(JSON.stringify(original)).toBe(before);
  expect(
    parseCustomInfrastPlan({
      plans: [{ rooms: { power: [{ skip: true }, { operators: ['甲'] }] } }],
    }).rooms[0],
  ).toMatchObject({ room: 2 });
});

test('private room arrays and missing selected plans never replace an official plan', () => {
  expect(() =>
    parseCustomInfrastPlan({ rooms: [{ facility: 'Power', room: 1, operators: ['甲'] }] }),
  ).toThrow('官方');
  expect(() => parseCustomInfrastPlan(document(), 1)).toThrow('计划不存在');
});

for (const [field, value] of Object.entries({
  sort: true,
  product: 'LMD',
  candidates: ['丁'],
  group: '生产组',
}))
  test(`active room option ${field} blocks the entire plan before any room is executed`, () => {
    const plan = document();
    Object.assign(plan.plans[0]!.rooms.power[0]!, { [field]: value });
    expect(() => parseCustomInfrastPlan(plan)).toThrow(`power[0].${field}`);
  });

test('active plan effects and cross-room duplicate operators are rejected before execution', () => {
  const plan = document();
  plan.plans[0]!.drones.enable = true;
  expect(() => parseCustomInfrastPlan(plan)).toThrow('.drones');
  const duplicate = document();
  duplicate.plans[0]!.rooms.control[0]!.operators = ['甲'];
  expect(() => parseCustomInfrastPlan(duplicate)).toThrow('跨房重复');
});

test('official empty room intent is preserved and only explicit autofill enables automatic selection', () => {
  expect(
    parseCustomInfrastPlan({
      plans: [{ rooms: { power: [{}, { operators: [] }, { skip: true }] } }],
    }).rooms,
  ).toEqual([]);
  expect(
    parseCustomInfrastPlan({
      plans: [{ rooms: { power: [{ operators: ['甲'], autofill: true }] } }],
    }),
  ).toMatchObject({
    rooms: [{ facility: 'Power', room: 1, operators: ['甲'] }],
    autoFillRooms: ['Power:1'],
  });
});

test('custom facility selection preserves untouched facilities and their source metadata', () => {
  expect(parseCustomInfrastPlan(document(), 0, ['Power']).rooms).toEqual([
    { facility: 'Power', room: 1, operators: ['甲'] },
  ]);
});

/** 资源输入预检只读取内存字典与能力参数；实际页面证据由运行时另行取得。 */
function resourceProfile(names: string[]): AtomicResourceProfile {
  return {
    id: 'synthetic-preflight',
    clientType: 'Official',
    available: true,
    diagnostics: [],
    rules: {},
    actions: {},
    card: null,
    sources: [],
    operatorNames: {
      names,
      source: {
        repository: 'synthetic',
        ref: 'fixture',
        path: 'battle_data.json',
        sha256: 'a'.repeat(64),
      },
    },
  };
}

test('custom static preflight checks the entire official dictionary and rejects an unknown final room before navigation', () => {
  const profile = resourceProfile([
    '甲',
    ...Array.from({ length: 500 }, (_, index) => `合成姓名${index}`),
    '末尾干员',
  ]);
  const document = {
    plans: [{ rooms: { power: [{ operators: ['甲'] }, { operators: ['末尾干员'] }] } }],
  };
  expect(checkCustomInfrastPlanResources(profile, parseCustomInfrastPlan(document))).toEqual([]);
  document.plans[0]!.rooms.power[1]!.operators = ['未知干员'];
  expect(checkCustomInfrastPlanResources(profile, parseCustomInfrastPlan(document))).toEqual([
    expect.stringContaining('第 2 房干员 未知干员'),
  ]);
  const compiled = compileLegacyTask(
    { type: 'Infrast', params: { mode: 10000, filename: '/synthetic.json', plan_index: 0 } },
    { customInfrastPlan: { document, sha256: 'b'.repeat(64) } },
  );
  expect(validateCompiledLegacyTaskInputs(compiled, { profile })).toEqual([
    expect.objectContaining({ field: 'filename', code: 'unavailable_resource' }),
  ]);
});

test('fixed custom rosters remain available without automatic resources while explicit autofill requires them', () => {
  const profile = resourceProfile(['甲']);
  const fixed = parseCustomInfrastPlan({
    plans: [{ rooms: { power: [{ operators: ['甲'] }] } }],
  });
  expect(checkCustomInfrastPlanResources(profile, fixed)).toEqual([]);
  const automatic = parseCustomInfrastPlan({
    plans: [{ rooms: { power: [{ operators: ['甲'], autofill: true }] } }],
  });
  expect(checkCustomInfrastPlanResources(profile, automatic)).toEqual([
    expect.stringContaining('自动补位缺少同代资源：心情观察、简单技能观察'),
  ]);
});

test('compiled inputs are schema-checked before their earlier return-home step can run', () => {
  const compiled = compileLegacyTask({
    type: 'Infrast',
    params: { mode: 0, facility: ['Mfg', 'Mfg'] },
  });
  expect(compiled.supported).toBe(true);
  expect(validateCompiledLegacyTaskInputs(compiled, { profile: resourceProfile([]) })).toEqual([
    expect.objectContaining({
      code: 'invalid_parameter',
      message: expect.stringContaining('daily'),
    }),
  ]);
});

/** 页面驱动只获得已解析的总览事实；该夹具不伪造原生执行回调或名单结果。 */
function overviewFixture(pages: OverviewRow[][]) {
  let index = 0,
    swipes = 0;
  const vision = new AtomicVision(
    {
      async runPipeline() {
        throw new Error('no native pipelines');
      },
      async execute() {
        throw new Error('no native actions');
      },
    },
    {} as AtomicResourceProfile,
  );
  vision.overview = async () => ({ frameId: `overview-${index}`, rows: pages[index]!, texts: [] });
  vision.swipeOverview = async () => {
    swipes++;
    index = Math.min(index + 1, pages.length - 1);
  };
  return { driver: createInfrastDriver(vision), swipes: () => swipes };
}
const row = (room: number, position?: string): OverviewRow => ({
  facility: 'Power',
  room,
  ...(position ? { position } : {}),
  box: [450, 130, 100, 20],
  identity: `Power:${position ?? room}`,
});

test('official room ordinals resolve only after every requested complete position is observed', async () => {
  const game = overviewFixture([[row(1, 'B101')], [row(2, 'B201')]]);
  const rooms: AtomicRoomShiftInput[] = [
    { facility: 'Power', room: 1, operators: ['甲'] },
    { facility: 'Power', room: 2, operators: ['乙'] },
  ];
  expect(await game.driver.resolveRooms!(structuredClone(rooms))).toEqual([
    { ...rooms[0], position: 'B101' },
    { ...rooms[1], position: 'B201' },
  ]);
  expect(game.swipes()).toBe(1);
});

test('missing and conflicting room positions cannot authorize any roster action', async () => {
  await expect(
    overviewFixture([[row(1)]]).driver.resolveRooms!([
      { facility: 'Power', room: 1, operators: ['甲'] },
    ]),
  ).rejects.toThrow('完整房间');
  const game = overviewFixture([[row(1, 'B101')], [row(1, 'B102')]]);
  await expect(
    game.driver.resolveRooms!([
      { facility: 'Power', room: 1, operators: ['甲'] },
      { facility: 'Power', room: 2, operators: ['乙'] },
    ]),
  ).rejects.toThrow('不同完整位置');
  expect(game.swipes()).toBe(1);
});

test('unobserved rooms exhaust only a bounded read-only navigation and never become guessed coordinates', async () => {
  const game = overviewFixture([[row(1, 'B101')]]);
  await expect(
    game.driver.resolveRooms!([{ facility: 'Power', room: 2, operators: ['甲'] }]),
  ).rejects.toThrow('20 页');
  expect(game.swipes()).toBe(20);
});
