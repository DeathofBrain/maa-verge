import { expect, test } from 'bun:test';
import {
  InfrastWorkflows,
  parseRoomShift,
  type InfrastDriver,
  type RosterEvidence,
} from '@backend/modules/atomic/infrast';
import type {
  AtomicOperatorCard,
  AtomicOperatorObservation,
  AtomicRoomShiftInput,
  AtomicRoomTarget,
} from '@backend/modules/atomic/types';
import { AtomicFailure } from '@backend/modules/atomic/vision';

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
  expect(game.events.filter((event) => event === 'open:room:Dorm:1')).toHaveLength(2);
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
