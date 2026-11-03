/** 自动换班只依赖内存中的房间、候选与合成 Tasker；验证资源／归属策略和真实阶段返回。 */
import { expect, test } from 'bun:test';
import {
  chooseAutomaticOperators,
  InfrastWorkflows,
  prepareAutomaticRoster,
  type AtomicOperatorCard,
  type AtomicResourceProfile,
  type AtomicRoomTarget,
  type InfrastDriver,
  type RoomCapacityEvidence,
} from '@maaverge/automation';
import { attachInfrastWorkflowFixture } from './pipeline-fixture';

const target: AtomicRoomTarget = { facility: 'Power', room: 1, position: 'B101' };
const profile: AtomicResourceProfile = {
  id: 'synthetic-auto',
  clientType: 'Official',
  available: true,
  diagnostics: [],
  rules: {},
  actions: {},
  card: null,
  sources: [],
  skills: {
    Power: [
      {
        id: 'bskill_pow_spd3',
        efficiency: { all: 20 },
        simple: true,
        rule: {
          id: 'skill.pow',
          kind: 'template',
          templateId: 'fixture',
          source: { repository: 'synthetic', ref: 'fixture', path: 'memory' },
        },
      },
    ],
  },
};
const card = (name: string, extra: Partial<AtomicOperatorCard> = {}): AtomicOperatorCard => ({
  name,
  nameVerified: true,
  selected: false,
  unassigned: true,
  mood: { ratio: 1, source: 'smiley' },
  skills: ['bskill_pow_spd3'],
  box: [420, 100, 100, 200],
  ...extra,
});

test('automatic candidates require exact names, explicit availability, mood and a supported simple skill', () => {
  const cards = [
    card('甲', { unassigned: false }),
    card('乙', { nameVerified: false }),
    card('丙', { mood: { ratio: 0.3, source: 'progress_bar' } }),
    card('丁', { skills: ['complex_formula'] }),
    card('戊'),
  ];
  expect(
    chooseAutomaticOperators(cards, 1, target, profile, { threshold: 0.3, incumbentNames: [] }),
  ).toEqual(['戊']);
  expect(() =>
    chooseAutomaticOperators(cards.slice(0, -1), 1, target, profile, {
      threshold: 0.3,
      incumbentNames: [],
    }),
  ).toThrow('未修改名单');
  expect(
    chooseAutomaticOperators([card('甲', { unassigned: false })], 1, target, profile, {
      threshold: 0.3,
      incumbentNames: ['甲'],
    }),
  ).toEqual(['甲']);
});
test('dorms recover the lowest observed mood and prior assignments cannot be stolen by a later room', () => {
  expect(
    chooseAutomaticOperators(
      [
        card('甲', { mood: { ratio: 0, source: 'smiley' } }),
        card('乙', { mood: { ratio: 0.1, source: 'progress_bar' } }),
        card('丙'),
      ],
      1,
      { facility: 'Dorm', room: 1, position: 'B401' },
      profile,
      { threshold: 0.3, incumbentNames: [] },
    ),
  ).toEqual(['甲']);
  expect(() =>
    chooseAutomaticOperators([card('甲')], 1, target, profile, {
      threshold: 0.3,
      incumbentNames: [],
      excludedNames: ['甲'],
    }),
  ).toThrow('0/1');
});

function fixture(options: { mood?: number; finalMismatch?: boolean } = {}) {
  const targets: AtomicRoomTarget[] = [target, { facility: 'Power', room: 2, position: 'B102' }];
  const committed = new Map<string, string[]>(),
    events: string[] = [];
  let current = target,
    selected: string[] = [],
    room: RoomCapacityEvidence | undefined,
    modified = false,
    confirmations = 0;
  const driver: InfrastDriver = {
    async overview() {
      return { frameId: 'overview', rows: [], texts: [] };
    },
    async enterOverview() {
      return this.overview();
    },
    async rotateQueue() {
      throw new Error('unexpected rotation');
    },
    async enterTrim() {
      throw new Error('unexpected trim');
    },
    async trim() {
      throw new Error('unexpected trim');
    },
    async trimObservation() {
      return { frameId: 'trim', texts: [] };
    },
    async enumerateRooms() {
      events.push('enumerate');
      return { rooms: targets, evidence: { source: 'synthetic_complete_slots' } };
    },
    async resolveRooms(rooms) {
      return rooms.map((room) => ({
        ...room,
        position: targets.find(
          (target) => target.facility === room.facility && target.room === room.room,
        )!.position,
      }));
    },
    async openRoom(next) {
      current = next;
      events.push(`open:${next.position}`);
    },
    async openRoster() {
      selected = [...(committed.get(current.position!) ?? [])];
      modified = false;
      room = {
        source: 'room_panel',
        frameId: `panel-${current.position}`,
        target: current,
        occupied: selected.length,
        capacity: 1,
      };
    },
    async operators() {
      return {
        frameId: 'operators',
        pageIdentity: 'first',
        room,
        ...(!modified ? { selectionOrigin: 'room_entry' as const } : {}),
        cards: ['甲', '乙', '丙'].map((name) =>
          card(name, {
            selected: selected.includes(name),
            unassigned: ![...committed.values()].flat().includes(name),
            mood: { ratio: options.mood ?? 1, source: 'smiley' },
          }),
        ),
      };
    },
    async resetFilter() {
      events.push('filter');
    },
    async page(direction) {
      events.push(`page:${direction}`);
    },
    async clickOperator(operator) {
      modified = true;
      selected = selected.includes(operator.name)
        ? selected.filter((name) => name !== operator.name)
        : [...selected, operator.name];
      events.push(`select:${operator.name}`);
    },
    async clear() {
      modified = true;
      selected = [];
      events.push('clear');
    },
    async verifyConfirmTarget(actual) {
      expect(actual).toEqual(current);
    },
    async confirm() {
      confirmations++;
      committed.set(current.position!, [...selected]);
      events.push(`confirm:${current.position}`);
    },
    async training() {
      return { frameId: 'training', locked: false };
    },
    async chooseTrainee() {
      throw new Error('unexpected training');
    },
  };
  attachInfrastWorkflowFixture(driver, {
    handlers: {
      'game.infrast.prepare_auto_roster': async (input) => ({
        status: 'completed',
        verified: true,
        data: await prepareAutomaticRoster(driver, profile, {}, input as never),
      }),
    },
  });
  if (options.finalMismatch) {
    const read = driver.enumerateRooms!;
    driver.enumerateRooms = async (facilities) => {
      if (confirmations === 2)
        committed.set('B101', [committed.get('B101')?.[0] === '甲' ? '乙' : '甲']);
      return read(facilities);
    };
  }
  return { driver, events, committed };
}
test('daily executes full-capacity automatic room JSON stages and repeats the entire collection plus actual final rosters', async () => {
  const game = fixture();
  const result = await new InfrastWorkflows(game.driver).daily(['Power']);
  expect(result).toMatchObject({ status: 'completed', verified: true, nativeSuccess: true });
  expect(game.events.filter((event) => event.startsWith('confirm:'))).toEqual([
    'confirm:B101',
    'confirm:B102',
  ]);
  expect(game.events.filter((event) => event === 'enumerate')).toHaveLength(2);
  const expectedFirst = chooseAutomaticOperators(
    ['甲', '乙', '丙'].map((name) => card(name)),
    1,
    target,
    profile,
    { threshold: 0.3, incumbentNames: [] },
  );
  expect(game.committed.get('B101')).toEqual(expectedFirst);
  expect(game.committed.get('B102')).toHaveLength(1);
  expect(game.committed.get('B102')).not.toEqual(expectedFirst);
  expect((result.data as any).finalChecks).toHaveLength(2);
});
test('insufficient eligible candidates stop before clearing or confirming any room', async () => {
  const game = fixture({ mood: 0 });
  const result = await new InfrastWorkflows(game.driver).daily(['Power']);
  expect(result).toMatchObject({ status: 'unavailable', verified: false });
  expect(game.events).not.toContain('clear');
  expect(game.events.some((event) => event.startsWith('confirm:'))).toBe(false);
});
test('whole-round final reread detects a later external reassignment and retains both committed rooms without replay', async () => {
  const game = fixture({ finalMismatch: true });
  expect(await new InfrastWorkflows(game.driver).daily(['Power'])).toMatchObject({
    status: 'partial',
    verified: false,
  });
  expect(game.events.filter((event) => event.startsWith('confirm:'))).toHaveLength(2);
});

test('official custom autofill keeps fixed operators and fills another room without taking reserved names', async () => {
  const game = fixture();
  const result = await new InfrastWorkflows(game.driver).customShift(
    {
      plans: [
        {
          rooms: {
            power: [
              { operators: ['甲'], autofill: true },
              { operators: [], autofill: true },
            ],
          },
        },
      ],
    },
    0,
    undefined,
    ['Power'],
  );
  expect(result).toMatchObject({ status: 'completed', verified: true, nativeSuccess: true });
  expect(game.committed.get('B101')).toEqual(['甲']);
  expect(game.committed.get('B102')).toHaveLength(1);
  expect(game.committed.get('B102')).not.toEqual(['甲']);
});
test('official custom empty intent completes as an unchanged plan without opening or clearing rooms', async () => {
  const game = fixture();
  expect(
    await new InfrastWorkflows(game.driver).customShift({
      plans: [{ rooms: { power: [{ operators: [] }] } }],
    }),
  ).toMatchObject({ status: 'completed', verified: true, data: { keptUnchanged: true } });
  expect(game.events).toEqual([]);
});
