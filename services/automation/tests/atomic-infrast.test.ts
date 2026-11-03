import { expect, test } from 'bun:test';
import {
  InfrastWorkflows,
  InfrastRoomPrimitives,
  createCapabilityRegistry,
  createInfrastCapabilities,
  createPrimitiveCapabilities,
  parsePrepareRoster,
  parsePreparedRoster,
  parseRoute,
  parseTarget,
  type AtomicResourceProfile,
  type AtomicExecutionPort,
  parseRoomShift,
  type InfrastDriver,
  type RosterEvidence,
  type TrainingObservation,
} from '@maaverge/automation';
import type {
  AtomicOperatorCard,
  AtomicOperatorObservation,
  AtomicRoomShiftInput,
  AtomicRoomTarget,
} from '@maaverge/automation';
import { AtomicFailure } from '@maaverge/automation';
import { attachInfrastWorkflowFixture, syntheticPipeline } from './pipeline-fixture';

/** Synthetic game state only: no controller, MaaCore, screenshots, downloads or accounts. */
function fixture(
  options: {
    capacity?: number;
    names?: string[];
    before?: string[];
    mismatch?: boolean;
    locked?: boolean;
    signal?: AbortSignal;
    afterClick?: () => void;
    entered?: (node: string) => void;
  } = {},
) {
  const events: string[] = [];
  const capacities = new Map<string, number>();
  const committed = new Map<string, string[]>();
  let target: AtomicRoomTarget = { facility: 'Mfg', room: 1 },
    role: string | undefined;
  let selected = [...(options.before ?? ['原干员'])],
    trainee = '原受训者';
  const key = () => `${target.facility}:${target.room}:${role ?? ''}`;
  const check = () => options.signal?.throwIfAborted();
  const capacity = () =>
    target.facility === 'Training' ? 1 : (capacities.get(key()) ?? options.capacity ?? 3);
  const names = options.names ?? ['原干员', '甲', '乙', '丙', '原协助者'];
  const driver: InfrastDriver = {
    async overview() {
      check();
      events.push('overview.read');
      return { frameId: 'overview', rows: [], texts: ['总览'] };
    },
    async enterOverview() {
      check();
      events.push('overview.enter');
      return this.overview();
    },
    async rotateQueue() {
      check();
      events.push('queue.rotate');
    },
    async enterTrim() {
      check();
      events.push('trim.enter');
      return this.trimObservation();
    },
    async trim() {
      check();
      events.push('trim.apply');
    },
    async trimObservation() {
      check();
      events.push('trim.read');
      return { frameId: 'trim', texts: ['整顿'] };
    },
    async openRoom(next, route) {
      check();
      target = next;
      role = undefined;
      events.push(`open:${route}:${target.facility}:${target.room}`);
    },
    async openRoster(next, nextRole) {
      check();
      target = next;
      role = nextRole;
      selected = [
        ...(committed.get(key()) ??
          (role === 'assistant' ? ['原协助者'] : (options.before ?? ['原干员']))),
      ];
      events.push(`roster:${target.facility}:${role ?? 'normal'}`);
    },
    async operators(): Promise<AtomicOperatorObservation> {
      check();
      return {
        frameId: 'operators',
        cards: names.map((name, index) => ({
          name,
          rawName: name,
          nameVerified: true,
          selected: selected.includes(name),
          box: [index * 10, 100, 8, 8],
        })),
        capacity: capacity(),
        selectedCount: selected.length,
        pageIdentity: names.join(','),
      };
    },
    async resetFilter() {
      check();
      events.push('filter.all');
    },
    async page(direction) {
      check();
      events.push(`page:${direction}`);
    },
    async clickOperator(card: AtomicOperatorCard) {
      check();
      events.push(`select:${card.name}`);
      selected.push(card.name);
      options.afterClick?.();
    },
    async clear() {
      check();
      events.push('clear');
      selected = [];
    },
    async verifyConfirmTarget() {
      check();
      events.push('confirm.target');
    },
    async confirm(nextRole) {
      check();
      events.push(`confirm:${nextRole ?? 'normal'}`);
      if (nextRole === 'trainee') return;
      committed.set(key(), options.mismatch ? ['原干员'] : [...selected]);
    },
    async training() {
      check();
      events.push('training.read');
      return { frameId: 'training', locked: options.locked ?? false, trainee };
    },
    async chooseTrainee(name) {
      check();
      events.push(`trainee:${name}`);
      trainee = name;
    },
  };
  attachInfrastWorkflowFixture(driver, { signal: options.signal, entered: options.entered });
  return { driver, events, capacities, committed };
}
const positions: Partial<Record<AtomicRoomShiftInput['facility'], string>> = {
  Mfg: 'B101',
  Trade: 'B102',
  Power: 'B103',
  Dorm: 'B201',
};
const room = (
  facility: AtomicRoomShiftInput['facility'] = 'Mfg',
  operators = ['甲'],
): AtomicRoomShiftInput => ({
  facility,
  room: 1,
  operators,
  ...(positions[facility] ? { position: positions[facility] } : {}),
});

/** 集成夹具仅替换 L3 页面事实；真实注册表、输入契约、业务 handler 和全部 JSON wrapper 均参与。 */
function registeredFixture(game: ReturnType<typeof fixture>) {
  const entered: string[] = [];
  const port: AtomicExecutionPort = {
    async execute() {
      throw new Error('the isolated registry fixture must only use its injected L3 game driver');
    },
    runPipeline: syntheticPipeline({ entered: (node) => entered.push(node) }),
    runContextPipeline: syntheticPipeline({ entered: (node) => entered.push(node) }),
  };
  const profile: AtomicResourceProfile = {
    id: 'synthetic-registry',
    clientType: 'Official',
    available: true,
    diagnostics: [],
    rules: {},
    actions: {},
    sources: [],
    operatorNames: {
      names: ['原干员', '甲', '乙', '丙', '原协助者', '原受训者', '新受训者'],
      source: {
        repository: 'synthetic',
        ref: 'fixture',
        path: 'battle_data.json',
        sha256: '0'.repeat(64),
      },
    },
    card: {
      regions: [],
      nameOffset: [0, 0, 1, 1],
      facilityOffset: [0, 0, 1, 1],
      selectedOffset: [0, 0, 1, 1],
      clickOffset: [0, 0, 1, 1],
      selectedCount: 1,
      selectedLower: [0, 0, 0],
      selectedUpper: [255, 255, 255],
    },
  };
  // 模板只作为可用性元数据，夹具不执行 OCR 或读取任何真实文件。
  for (const capability of createInfrastCapabilities(port, profile))
    for (const id of capability.descriptor.requiredResources ?? [])
      profile.rules[id] = {
        id,
        kind: 'template',
        templateId: `${id}.png`,
        source: { repository: 'synthetic', ref: 'fixture', path: 'memory' },
      };
  for (const id of [
    'training.confirm',
    'training.expandRole',
    'training.allOcr',
    'training.collapseRole',
  ])
    profile.rules[id] = {
      id,
      kind: 'ocr',
      source: { repository: 'synthetic', ref: 'fixture', path: 'memory' },
    };
  for (const id of ['room.bottomTab', 'training.trainee', 'training.assistant'])
    profile.actions[id] = { box: [0, 0, 1, 1], delayMs: 0 };
  const registrations = createInfrastCapabilities(port, profile).map((registration) => {
    const handler: typeof registration.handler = async (input, context) => {
      const primitives = new InfrastRoomPrimitives(game.driver, context);
      switch (registration.descriptor.id) {
        case 'game.infrast.read_room':
          return primitives.readRoom(parseTarget(input), parseRoute(input.route ?? 'room'));
        case 'game.infrast.prepare_roster':
          return primitives.prepareRoster(parsePrepareRoster(input));
        case 'game.infrast.confirm':
          return primitives.confirm(parsePreparedRoster(input.prepared));
        case 'game.infrast.verify_room':
          return primitives.verifyRoom(
            parsePrepareRoster(input.request),
            parsePreparedRoster(input.prepared),
            input.before,
          );
        case 'game.infrast.open_room':
          await game.driver.openRoom(parseTarget(input), parseRoute(input.route ?? 'room'));
          return { status: 'completed', data: {}, verified: true };
        case 'game.infrast.open_roster':
          await game.driver.openRoster(
            parseTarget(input.target),
            input.role as 'trainee' | 'assistant' | undefined,
          );
          return { status: 'completed', data: {}, verified: true };
        case 'game.infrast.read_roster':
          return {
            status: 'completed',
            data: await primitives.roster.roster(Number(input.maxCapacity ?? 5)),
            verified: true,
          };
        case 'game.infrast.reset_filter':
          return primitives.roster.resetFilter();
        case 'game.infrast.page_roster':
          return primitives.roster.page(input.direction as 'left' | 'right');
        case 'game.infrast.select_operator':
          return primitives.roster.selectOperator(input.name as string, input.selected !== false);
        case 'game.infrast.clear_roster':
          return primitives.roster.clear();
        case 'observation.training':
          return { status: 'completed', data: await game.driver.training(), verified: true };
        default:
          return registration.handler(input, context);
      }
    };
    return { ...registration, handler };
  });
  return {
    registry: createCapabilityRegistry([...createPrimitiveCapabilities(port), ...registrations], {
      port,
    }),
    entered,
  };
}

test('observed dynamic capacity rejects oversized requests before clear or confirmation', async () => {
  const game = fixture({ capacity: 1 });
  const result = await new InfrastWorkflows(game.driver).setRoom(room('Mfg', ['甲', '乙']), 'room');
  expect(result.status).toBe('failed');
  expect(result.message).toContain('实际开放 1');
  expect(game.events).not.toContain('clear');
  expect(game.events.some((event) => event.startsWith('confirm'))).toBe(false);
});

test('exact roster is checked before confirmation and reread after reopening the actual room', async () => {
  const game = fixture();
  const result = await new InfrastWorkflows(game.driver).setRoom(
    room('Dorm', ['甲', '乙']),
    'room',
  );
  expect(result.status).toBe('completed');
  expect(result.verified).toBe(true);
  expect(game.events.filter((event) => event === 'confirm:normal')).toHaveLength(1);
  // 读取、独立准备和提交后复读各自确认目标；准备组件也可脱离业务链独立调用。
  expect(game.events.filter((event) => event === 'open:room:Dorm:1')).toHaveLength(3);
  const evidence = result.data as {
    before: RosterEvidence;
    selected: RosterEvidence;
    after: RosterEvidence;
  };
  expect(evidence.before.operators).toEqual(['原干员']);
  expect(evidence.selected.operators.sort()).toEqual(['乙', '甲'].sort());
  expect(evidence.after.operators.sort()).toEqual(['乙', '甲'].sort());
});

test('post-confirm mismatch is unknown and never retries a committed action', async () => {
  const game = fixture({ mismatch: true });
  const result = await new InfrastWorkflows(game.driver).setRoom(room(), 'room');
  expect(result.status).toBe('unknown');
  expect(result.verified).toBe(false);
  expect(game.events.filter((event) => event === 'confirm:normal')).toHaveLength(1);
  expect((result.data as any).after.operators).toEqual(['原干员']);
});

test('missing names and incomplete current roster stop before confirmation', async () => {
  const missing = fixture();
  const result = await new InfrastWorkflows(missing.driver).setRoom(
    room('Trade', ['不存在']),
    'room',
  );
  expect(result.status).toBe('failed');
  expect(result.message).toContain('不存在');
  expect(missing.events.some((event) => event.startsWith('confirm'))).toBe(false);
  const incomplete = fixture({ before: ['识别不到的现任'] });
  const read = await new InfrastWorkflows(incomplete.driver).readRoom({
    facility: 'Trade',
    room: 1,
    position: 'B102',
  });
  expect(read.status).toBe('failed');
  expect(read.message).toContain('名单不完整');
});

test('empty roster is an explicit clear, while duplicate names are rejected', async () => {
  const game = fixture({ capacity: 1 });
  expect((await new InfrastWorkflows(game.driver).setRoom(room('Power', []), 'room')).status).toBe(
    'completed',
  );
  expect(game.committed.get('Power:1:')).toEqual([]);
  expect(() => parseRoomShift(room('Power', ['甲', '甲']))).toThrow('重复');
  expect(() => parseRoomShift({ facility: 'Power', room: 1 })).toThrow('operators');
});

test('Processing and Recycle remain independent facility targets', async () => {
  const game = fixture({ capacity: 1 });
  const result = await new InfrastWorkflows(game.driver).batch(
    [room('Processing'), room('Recycle', ['乙'])],
    'room',
  );
  expect(result.status).toBe('completed');
  expect(game.committed.get('Processing:1:')).toEqual(['甲']);
  expect(game.committed.get('Recycle:1:')).toEqual(['乙']);
  expect(game.events).toContain('open:room:Processing:1');
  expect(game.events).toContain('open:room:Recycle:1');
});

test('all declared facilities use real per-room roster verification rather than static capacity', async () => {
  for (const facility of [
    'Mfg',
    'Trade',
    'Power',
    'Control',
    'Reception',
    'Office',
    'Dorm',
    'Processing',
    'Recycle',
  ] as const) {
    const game = fixture({ capacity: 1 });
    const result = await new InfrastWorkflows(game.driver).setRoom(room(facility), 'room');
    expect(result.status).toBe('completed');
    expect((result.data as any).after.capacity).toBe(1);
  }
});

test('overview batch preserves completed room evidence and stops after the first failure', async () => {
  const game = fixture();
  const result = await new InfrastWorkflows(game.driver).batch(
    [room('Mfg'), room('Power', ['不存在']), room('Trade', ['乙'])],
    'overview',
  );
  expect(result.status).toBe('partial');
  expect((result.data as any).rooms.map((item: any) => item.result.status)).toEqual([
    'completed',
    'failed',
  ]);
  expect((result.data as any).remaining).toHaveLength(1);
  expect(game.events).toContain('open:overview:Mfg:1');
  expect(game.events).not.toContain('open:overview:Trade:1');
});

test('training active lock rejects a different trainee before changing either role', async () => {
  const game = fixture({ locked: true });
  const result = await new InfrastWorkflows(game.driver).setRoom(
    { facility: 'Training', room: 1, trainee: '新受训者', assistant: '甲' },
    'room',
  );
  expect(result.status).toBe('failed');
  expect(result.message).toContain('锁定');
  expect(
    game.events.some((event) => event.startsWith('trainee:') || event.startsWith('select:')),
  ).toBe(false);
});

test('training permits an assistant change while locked and preserves the omitted trainee', async () => {
  const game = fixture({ locked: true });
  const result = await new InfrastWorkflows(game.driver).setRoom(
    { facility: 'Training', room: 1, assistant: '甲' },
    'room',
  );
  expect(result.status).toBe('completed');
  expect(game.events).toContain('confirm:assistant');
  expect(game.events.some((event) => event.startsWith('trainee:'))).toBe(false);
  expect((result.data as any).after.trainee).toBe('原受训者');
  expect(() => parseRoomShift({ facility: 'Training', room: 1, operators: ['甲'] })).toThrow(
    '双角色',
  );
});

test('training idle changes roles separately, rereads both, and never starts training', async () => {
  const game = fixture();
  const result = await new InfrastWorkflows(game.driver).setRoom(
    { facility: 'Training', room: 1, trainee: '新受训者', assistant: '甲' },
    'room',
  );
  expect(result.status).toBe('completed');
  expect(game.events).toContain('roster:Training:trainee');
  expect(game.events).toContain('roster:Training:assistant');
  expect(game.events).toContain('confirm:trainee');
  expect(game.events).toContain('confirm:assistant');
  expect((result.data as any).after).toMatchObject({ locked: false, trainee: '新受训者' });
  expect(game.events.some((event) => /continue|start|reward/.test(event))).toBe(false);
});

test('queue rotation clicks once, never trims, and reports unknown without an explicit roster expectation', async () => {
  const game = fixture();
  const result = await new InfrastWorkflows(game.driver).queueRotate();
  expect(result.status).toBe('unknown');
  expect(result.nativeSuccess).toBe(true);
  expect(result.verified).toBe(false);
  expect(game.events.filter((event) => event === 'queue.rotate')).toHaveLength(1);
  expect((result.data as any).trimExecuted).toBe(false);
  expect(game.events.some((event) => /trim|整顿/.test(event))).toBe(false);
});

test('queue rotation has a verified path through explicit expected room rosters', async () => {
  const game = fixture({ before: ['甲'], capacity: 1 });
  const result = await new InfrastWorkflows(game.driver).queueRotate([room('Power')]);
  expect(result.status).toBe('completed');
  expect(result.verified).toBe(true);
  expect((result.data as any).checkedRooms).toHaveLength(1);
  expect(game.events.filter((event) => event === 'queue.rotate')).toHaveLength(1);
  const mismatch = fixture({ capacity: 1 });
  const failed = await new InfrastWorkflows(mismatch.driver).queueRotate([room('Power')]);
  expect(failed.status).toBe('unknown');
  expect(mismatch.events.filter((event) => event === 'queue.rotate')).toHaveLength(1);
});

test('ambiguous queue action is never replayed', async () => {
  const game = fixture();
  game.driver.rotateQueue = async () => {
    game.events.push('queue.rotate');
    throw new AtomicFailure('原生结果未知', 'unknown');
  };
  const result = await new InfrastWorkflows(game.driver).queueRotate();
  expect(result.status).toBe('unknown');
  expect(game.events.filter((event) => event === 'queue.rotate')).toHaveLength(1);
});

test('trim is independently invoked once and never performs queue rotation', async () => {
  const game = fixture();
  const result = await new InfrastWorkflows(game.driver).trim();
  expect(result.status).toBe('unknown');
  expect(result.nativeSuccess).toBe(true);
  expect(result.verified).toBe(false);
  expect(game.events.filter((event) => event === 'trim.apply')).toHaveLength(1);
  expect(game.events).not.toContain('queue.rotate');
  expect((result.data as any).queueRotationExecuted).toBe(false);
});

test('cancellation preserves completed rooms and never confirms a later partially selected room', async () => {
  const abort = new AbortController();
  let clicks = 0;
  const game = fixture({
    signal: abort.signal,
    afterClick: () => {
      if (++clicks === 2) abort.abort();
    },
  });
  const result = await new InfrastWorkflows(game.driver, { signal: abort.signal }).batch(
    [room('Mfg'), room('Trade', ['乙'])],
    'overview',
  );
  expect(result.status).toBe('cancelled');
  expect((result.data as any).rooms[0].result.status).toBe('completed');
  expect((result.data as any).rooms[1].result.status).toBe('cancelled');
  expect(game.events.filter((event) => event === 'confirm:normal')).toHaveLength(1);
});

test('facility ceilings reject an OCR capacity above the facility maximum', async () => {
  const game = fixture({ capacity: 5 });
  const result = await new InfrastWorkflows(game.driver).setRoom(room('Mfg'), 'room');
  expect(result.status).toBe('failed');
  expect(result.message).toContain('上限 3');
  expect(game.events).not.toContain('clear');
});

test('batch rejects cross-room and training-role assignment conflicts before any effect', async () => {
  const game = fixture();
  const result = await new InfrastWorkflows(game.driver).batch(
    [room('Mfg'), room('Trade')],
    'room',
  );
  expect(result.status).toBe('failed');
  expect(result.message).toContain('同时分配');
  expect(game.events).toEqual([]);
  const roles = await new InfrastWorkflows(game.driver).batch(
    [room('Mfg'), { facility: 'Training', room: 1, assistant: '甲' }],
    'room',
  );
  expect(roles.status).toBe('failed');
  expect(() =>
    parseRoomShift({ facility: 'Training', room: 1, trainee: '甲', assistant: '甲' }),
  ).toThrow('同一干员');
});

test('trainee-only change verifies that the omitted assistant remains unchanged', async () => {
  const game = fixture();
  const result = await new InfrastWorkflows(game.driver).setRoom(
    { facility: 'Training', room: 1, trainee: '新受训者' },
    'room',
  );
  expect(result.status).toBe('completed');
  expect((result.data as any).assistantBefore.operators).toEqual(['原协助者']);
  expect((result.data as any).assistantAfter.operators).toEqual(['原协助者']);
  expect(game.events).not.toContain('confirm:assistant');
});

test('invalid expected room identity and duplicate positions are rejected before queue or batch effects', async () => {
  const game = fixture();
  const invalid = await new InfrastWorkflows(game.driver).queueRotate([
    { facility: 'Mfg', room: 1, operators: ['甲'] },
  ]);
  expect(invalid.status).toBe('unavailable');
  expect(game.events).toEqual([]);
  const duplicate = await new InfrastWorkflows(game.driver).batch(
    [room(), { ...room('Mfg', ['乙']), room: 2 }],
    'overview',
  );
  expect(duplicate.status).toBe('failed');
  expect(duplicate.message).toContain('position');
  expect(game.events).toEqual([]);
});

test('final batch reread catches later migration of an implicitly retained training role', async () => {
  const game = fixture({ names: ['原干员', '原协助者', '原受训者', '甲'] });
  game.driver.training = async () => ({
    frameId: 'training',
    locked: false,
    trainee: game.events.includes('confirm:normal') ? '已被迁走' : '原受训者',
  });
  const result = await new InfrastWorkflows(game.driver).batch(
    [{ facility: 'Training', room: 1, assistant: '甲' }, room('Mfg', ['原受训者'])],
    'room',
  );
  expect(result.status).toBe('partial');
  expect(result.verified).toBe(false);
  expect((result.data as any).rooms.map((item: any) => item.result.status)).toEqual([
    'completed',
    'completed',
  ]);
  expect((result.data as any).finalChecks).toHaveLength(1);
  expect(result.message).toContain('最终复核');
});

test('room JSON executes independent L3 entries in read prepare confirm verify order', async () => {
  const visited: string[] = [];
  const game = fixture({ entered: (node) => visited.push(node) });
  const result = await new InfrastWorkflows(game.driver).setRoom(room(), 'room');
  expect(result.status).toBe('completed');
  expect(
    visited.filter((node) =>
      /^Infrast@Primitive@(ReadRoom|PrepareRoster|Confirm|VerifyRoom)$/.test(node),
    ),
  ).toEqual([
    'Infrast@Primitive@ReadRoom',
    'Infrast@Primitive@PrepareRoster',
    'Infrast@Primitive@Confirm',
    'Infrast@Primitive@VerifyRoom',
  ]);
  expect(visited.at(-1)).toBe('Infrast@ApplyRoom@Return');
  expect(result.nativeSuccess).toBe(true);
});

test('a failed prepare stops the JSON before commit and preserves partial selection evidence', async () => {
  const visited: string[] = [];
  const game = fixture({ entered: (node) => visited.push(node) });
  const result = await new InfrastWorkflows(game.driver).setRoom(
    room('Mfg', ['甲', '缺失']),
    'room',
  );
  expect(result.status).toBe('failed');
  expect(
    (result.data as { selectionAttempt: { clicked: string[] } }).selectionAttempt.clicked,
  ).toEqual(['甲']);
  expect(visited).not.toContain('Infrast@Primitive@Confirm');
  expect(visited).not.toContain('Infrast@Primitive@VerifyRoom');
});

test('standalone prepare does not commit and confirm rejects a changed selected roster', async () => {
  const game = fixture();
  const primitive = new InfrastRoomPrimitives(game.driver);
  const request = parsePrepareRoster({
    target: { facility: 'Mfg', room: 1, position: 'B101' },
    route: 'room',
    role: 'normal',
    operators: ['甲'],
  });
  const prepared = await primitive.prepareRoster(request);
  expect(prepared.status).toBe('completed');
  expect(game.events.some((event) => event.startsWith('confirm'))).toBe(false);
  const evidence = prepared.data as Parameters<InfrastRoomPrimitives['confirm']>[0];
  (evidence.selected as RosterEvidence).operators = ['乙'];
  const rejected = await primitive.confirm(evidence);
  expect(rejected.status).toBe('failed');
  expect(rejected.message).toContain('确认前');
  expect(game.events.some((event) => event.startsWith('confirm'))).toBe(false);
});

test('a driver without a fresh actual-target verifier cannot submit a valid prepared roster', async () => {
  const game = fixture();
  const primitive = new InfrastRoomPrimitives(game.driver);
  const prepared = await primitive.prepareRoster(
    parsePrepareRoster({
      target: { facility: 'Mfg', room: 1, position: 'B101' },
      route: 'room',
      role: 'normal',
      operators: ['甲'],
    }),
  );
  expect(prepared.status).toBe('completed');
  delete game.driver.verifyConfirmTarget;
  const result = await primitive.confirm(parsePreparedRoster(prepared.data));
  expect(result.status).toBe('unavailable');
  expect(result.message).toContain('目标新帧核验');
  expect(game.events.some((event) => event.startsWith('confirm'))).toBe(false);
});

test('a wrong actual target rejects before the commit boundary despite unchanged selected names', async () => {
  const game = fixture();
  const primitive = new InfrastRoomPrimitives(game.driver);
  const prepared = await primitive.prepareRoster(
    parsePrepareRoster({
      target: { facility: 'Mfg', room: 1, position: 'B101' },
      route: 'room',
      role: 'normal',
      operators: ['甲'],
    }),
  );
  expect(prepared.status).toBe('completed');
  game.driver.verifyConfirmTarget = async () => {
    throw new AtomicFailure('当前房间已经变化', 'unavailable');
  };
  const result = await primitive.confirm(parsePreparedRoster(prepared.data));
  expect(result.status).toBe('unavailable');
  expect(game.events.some((event) => event.startsWith('confirm:'))).toBe(false);
});

test('a changed trainee is freshly rejected before target verification or confirm dispatch', async () => {
  const game = fixture();
  const primitive = new InfrastRoomPrimitives(game.driver);
  const prepared = await primitive.prepareRoster(
    parsePrepareRoster({
      target: { facility: 'Training', room: 1 },
      route: 'room',
      role: 'trainee',
      name: '甲',
    }),
  );
  expect(prepared.status).toBe('completed');
  game.driver.training = async () => ({ frameId: 'changed-trainee', locked: false, trainee: '乙' });
  const result = await primitive.confirm(parsePreparedRoster(prepared.data));
  expect(result.status).toBe('unavailable');
  expect(result.message).toContain('当前已选受训者');
  expect(game.events).not.toContain('confirm.target');
  expect(game.events).not.toContain('confirm:trainee');
});

test('missing JSON runner reports unavailable without executing a second product path', async () => {
  const game = fixture();
  delete game.driver.runWorkflow;
  const result = await new InfrastWorkflows(game.driver).setRoom(room(), 'room');
  expect(result.status).toBe('unavailable');
  expect(game.events).toEqual([]);
});

test('an assistant preparation failure after a trainee commit keeps the whole operation unknown', async () => {
  const game = fixture();
  const result = await new InfrastWorkflows(game.driver).setRoom(
    { facility: 'Training', room: 1, trainee: '新受训者', assistant: '缺失' },
    'room',
  );
  expect(result.status).toBe('unknown');
  expect(result.verified).toBe(false);
  expect(game.events.filter((event) => event === 'confirm:trainee')).toHaveLength(1);
  expect(game.events).not.toContain('confirm:assistant');
});

test('registered room workflow validates bindings and preserves the actual nested JSON call order', async () => {
  const game = fixture();
  const { registry, entered } = registeredFixture(game);
  const result = await registry.execute('game.infrast.set_room', room());
  expect(result.status).toBe('completed');
  expect(result.verified).toBe(true);
  expect(result.nativeSuccess).toBe(true);
  expect(entered[0]).toBe('Infrast@Workflow@SetRoom');
  expect(entered).toContain('Infrast@ApplyRoom');
  expect(entered).toContain('Infrast@Primitive@Confirm');
  expect(entered.at(-1)).toBe('Infrast@Workflow@SetRoom@Return');
  expect(game.events.filter((event) => event === 'confirm:normal')).toHaveLength(1);
});

test('registered training workflow keeps role protection while both roles use JSON subchains', async () => {
  const game = fixture();
  const { registry, entered } = registeredFixture(game);
  const result = await registry.execute('game.infrast.set_room', {
    facility: 'Training',
    room: 1,
    trainee: '新受训者',
    assistant: '甲',
  });
  expect(result.status, result.message).toBe('completed');
  expect(result.verified).toBe(true);
  expect(entered.filter((node) => node === 'Infrast@ApplyRole')).toHaveLength(2);
  expect(game.events.filter((event) => event.startsWith('confirm:'))).toEqual([
    'confirm:trainee',
    'confirm:assistant',
  ]);
  expect((result.data as { after: TrainingObservation }).after).toMatchObject({
    trainee: '新受训者',
    locked: false,
  });
});

test('registered prepared inputs reject extra fields before running game effects', async () => {
  const game = fixture();
  const { registry, entered } = registeredFixture(game);
  const result = await registry.execute('game.infrast.prepare_roster', {
    target: { facility: 'Mfg', room: 1, position: 'B101' },
    route: 'room',
    role: 'normal',
    operators: ['甲'],
    shell: 'arbitrary',
  });
  expect(result.status).toBe('failed');
  expect(entered).toEqual([]);
  expect(game.events).toEqual([]);
});

test('independent roster events execute registered JSON entries without confirming a room', async () => {
  const game = fixture();
  const { registry, entered } = registeredFixture(game);
  for (const [id, input] of [
    ['game.infrast.reset_filter', {}],
    ['game.infrast.page_roster', { direction: 'right' }],
    ['game.infrast.select_operator', { name: '甲' }],
    ['game.infrast.clear_roster', {}],
  ] as const) {
    const result = await registry.execute(id, input);
    expect(result.status, result.message).toBe('completed');
    expect(result.verified).toBe(true);
  }
  expect(entered.filter((node) => !node.endsWith('@Return'))).toEqual([
    'Infrast@Primitive@ResetFilter',
    'Infrast@Primitive@PageRoster',
    'Infrast@Primitive@SelectOperator',
    'Infrast@Primitive@ClearRoster',
  ]);
  expect(game.events).toEqual(['filter.all', 'page:right', 'select:甲', 'clear']);
});

test('roster event input schemas reject malformed arguments before submitting any JSON', async () => {
  const game = fixture();
  const { registry, entered } = registeredFixture(game);
  for (const [id, input] of [
    ['game.infrast.reset_filter', { extra: true }],
    ['game.infrast.page_roster', { direction: 'down' }],
    ['game.infrast.select_operator', { name: '甲', selected: 'yes' }],
    ['game.infrast.clear_roster', { extra: true }],
  ] as const) {
    const result = await registry.execute(id, input);
    expect(result.status).toBe('failed');
  }
  expect(entered).toEqual([]);
  expect(game.events).toEqual([]);
});
