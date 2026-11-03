/** 确认门禁的语义与副作用回归：合成每张新帧的房间、位置和受训者，不断言外观。 */
import { expect, test } from 'bun:test';
import {
  AtomicVision,
  createInfrastDriver,
  InfrastRoomPrimitives,
  type AtomicExecutionPort,
  type AtomicMatch,
  type AtomicResourceProfile,
  type AtomicRoomTarget,
} from '@maaverge/automation';
import { syntheticPipeline } from './pipeline-fixture';

const source = { repository: 'synthetic', ref: 'fixture', path: 'memory' };
const target: AtomicRoomTarget = { facility: 'Mfg', room: 1, position: 'B101' };
const trainingTarget: AtomicRoomTarget = { facility: 'Training', room: 1 };
const label = (text: string, x = 40, y = 90): AtomicMatch => ({
  text,
  box: [x, y, 100, 20],
  score: 1,
});

/** 宿主输入代际故意固定，模拟用户直接操作模拟器后只有新帧能够发现页面变化。 */
function fixture(
  options: {
    wrongFacility?: boolean;
    outsideFacility?: boolean;
    position?: string;
    extraPosition?: string;
    extraFacility?: string;
    outsidePosition?: boolean;
    changedAfterChecks?: number;
    conflict?: boolean;
    collapse?: boolean;
    trainee?: string;
    changedTraineeAfterReads?: number;
  } = {},
) {
  let frames = 0,
    targetChecks = 0,
    traineeReads = 0;
  const checks: string[] = [];
  const clicks: string[] = [];
  const traineeFrames: string[] = [];
  const profile: AtomicResourceProfile = {
    id: 'synthetic-confirm',
    clientType: 'Official',
    available: true,
    diagnostics: [],
    card: null,
    sources: [],
    operatorNames: { names: ['甲', '乙'], source: { ...source, sha256: '0'.repeat(64) } },
    actions: { 'operators.confirm': { box: [1100, 620, 100, 50], delayMs: 0 } },
    rules: Object.fromEntries(
      [
        'facility.label.Mfg',
        'facility.label.Training',
        'facility.label.Reception',
        'operators.conflict',
        'training.collapseRole',
        'training.confirm',
        'training.page',
        'training.idle',
        'training.processing',
        'training.operator',
      ].map((id) => [
        id,
        {
          id,
          kind: 'template',
          templateId: id,
          ...(id === 'facility.label.Mfg' ? { expected: ['制造站'] } : {}),
          ...(id === 'facility.label.Training' ? { expected: ['训练室'] } : {}),
          ...(id === 'facility.label.Reception' ? { expected: ['会客室'] } : {}),
          source,
        },
      ]),
    ),
  };
  const port: AtomicExecutionPort = {
    runPipeline: syntheticPipeline(),
    getInputRevision: () => 0,
    async execute(operation, input) {
      if (operation === 'frame')
        return { frameId: `confirm-${++frames}`, width: 1280, height: 720, data: 'synthetic' };
      if (operation === 'click') {
        clicks.push(String(input.frameId));
        return { accepted: true };
      }
      if (operation !== 'recognize') throw new Error('unexpected confirm operation');
      const id = input.templateId;
      let matches: AtomicMatch[] = [];
      if (typeof id === 'string' && id.startsWith('facility.label.')) {
        targetChecks++;
        checks.push(String(input.frameId));
        const changed =
          options.wrongFacility || targetChecks > (options.changedAfterChecks ?? Infinity);
        matches = [
          label(
            changed ? '会客室' : id === 'facility.label.Mfg' ? '制造站' : '训练室',
            options.outsideFacility ? 500 : 40,
          ),
        ];
      } else if (id === undefined) {
        matches = [label(options.position ?? 'B101', 200, options.outsidePosition ? 300 : 90)];
        if (options.extraPosition) matches.push(label(options.extraPosition, 200, 120));
        if (options.extraFacility) matches.push(label(options.extraFacility, 40, 120));
      } else if (id === 'operators.conflict' && options.conflict) {
        matches = [label('确认冲突', 1000, 600)];
      } else if (id === 'training.collapseRole' && options.collapse) {
        matches = [label('收起', 1000, 600)];
      } else if (id === 'training.operator') {
        traineeReads++;
        traineeFrames.push(String(input.frameId));
        const trainee =
          traineeReads > (options.changedTraineeAfterReads ?? Infinity)
            ? '乙'
            : (options.trainee ?? '甲');
        matches = [label(`${trainee}\n技能`, 500, 300)];
      } else if (['training.confirm', 'training.page', 'training.idle'].includes(String(id))) {
        matches = [label(String(id), 1000, 600)];
      }
      return { hit: matches.length > 0, matches, coordinateSize: [1280, 720] };
    },
  };
  const vision = new AtomicVision(port, profile);
  vision.wait = async () => {};
  return { vision, driver: createInfrastDriver(vision), checks, clicks, traineeFrames };
}

test('ordinary confirm binds actual facility, complete position and input to one fresh frame', async () => {
  const game = fixture();
  await game.driver.confirm(undefined, target);
  expect(game.clicks).toHaveLength(1);
  expect(game.clicks).toEqual(game.checks);
});

for (const [reason, options] of [
  ['wrong actual facility', { wrongFacility: true }],
  ['facility label outside the room header', { outsideFacility: true }],
  ['missing complete position', { position: '' }],
  ['wrong complete position', { position: 'B102' }],
  ['a floor without a complete position', { position: 'B1' }],
  ['a longer unrelated position', { position: 'B1010' }],
  ['conflicting positions in one title', { position: 'B101/B102' }],
  ['conflicting positions in separate header labels', { extraPosition: 'B102' }],
  ['conflicting facilities in the same header', { extraFacility: '会客室' }],
  ['a card position outside the room header', { outsidePosition: true }],
] as const)
  test(`confirm rejects ${reason} before any input`, async () => {
    const game = fixture(options);
    await expect(game.driver.confirm(undefined, target)).rejects.toMatchObject({
      status: 'unavailable',
    });
    expect(game.clicks).toEqual([]);
  });

test('repeated facilities require an explicit complete position before any confirm input', async () => {
  const game = fixture();
  await expect(game.driver.confirm(undefined, { facility: 'Mfg', room: 1 })).rejects.toThrow(
    '完整房间 position',
  );
  expect(game.clicks).toEqual([]);
});

test('a manual room change after the initial target check is rejected by the actual action frame', async () => {
  const game = fixture({ changedAfterChecks: 1 });
  await game.driver.verifyConfirmTarget!(target);
  await expect(game.driver.confirm(undefined, target)).rejects.toThrow('当前实际设施');
  expect(game.checks).toHaveLength(2);
  expect(new Set(game.checks).size).toBe(2);
  expect(game.clicks).toEqual([]);
});

test('an optional conflict input rechecks its own frame after the initial submit', async () => {
  const game = fixture({ conflict: true });
  await game.driver.confirm(undefined, target);
  expect(game.clicks).toHaveLength(2);
  expect(game.clicks).toEqual(game.checks);
  expect(new Set(game.checks).size).toBe(2);
});

test('a changed target after submit prevents conflict input and keeps the wrapper outcome unknown', async () => {
  const game = fixture({ conflict: true, changedAfterChecks: 2 });
  const primitive = new InfrastRoomPrimitives(game.driver);
  const prepared = {
    target,
    role: 'normal' as const,
    route: 'room' as const,
    selected: { frameId: 'prepared', capacity: 3, operators: ['甲'], complete: true as const },
  };
  // 名单已由独立用例验证完整性；这里保留真正的目标核验、JSON 和实际输入处理器。
  primitive.roster.roster = async () => prepared.selected;
  const result = await primitive.confirm(prepared);
  expect(result.status).toBe('unknown');
  expect(result.verified).toBe(false);
  expect(game.checks).toHaveLength(3);
  expect(game.clicks).toEqual([game.checks[1]!]);
});

test('trainee confirm verifies the exact prepared name in the same frame before each input', async () => {
  const game = fixture({ collapse: true });
  await game.driver.confirm('trainee', trainingTarget, '甲');
  expect(game.clicks).toHaveLength(2);
  expect(game.clicks).toEqual(game.checks);
  expect(game.clicks).toEqual(game.traineeFrames);
});

test('a changed trainee blocks the actual confirm input without navigating or submitting', async () => {
  const game = fixture({ trainee: '乙' });
  await expect(game.driver.confirm('trainee', trainingTarget, '甲')).rejects.toThrow(
    '当前已选受训者',
  );
  expect(game.clicks).toEqual([]);
  expect(game.checks).toEqual(game.traineeFrames);
});

test('the optional collapse input does not authorize a later input after the trainee changes', async () => {
  const game = fixture({ collapse: true, changedTraineeAfterReads: 1 });
  await expect(game.driver.confirm('trainee', trainingTarget, '甲')).rejects.toThrow(
    '当前已选受训者',
  );
  expect(game.clicks).toEqual([game.checks[0]!]);
  expect(game.checks).toHaveLength(2);
  expect(game.checks).toEqual(game.traineeFrames);
});

test('a trainee change after collapse preserves an unknown result and never replays either input', async () => {
  const game = fixture({ collapse: true, changedTraineeAfterReads: 2 });
  const primitive = new InfrastRoomPrimitives(game.driver);
  const result = await primitive.confirm({
    target: trainingTarget,
    role: 'trainee',
    route: 'room',
    selected: { trainee: '甲' },
  });
  expect(result.status).toBe('unknown');
  expect(result.verified).toBe(false);
  expect(game.clicks).toEqual([game.checks[1]!]);
  expect(game.checks).toHaveLength(3);
  expect(game.traineeFrames).toHaveLength(3);
});
