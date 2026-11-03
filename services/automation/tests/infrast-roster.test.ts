/** 仅使用内存中的当前页与单次待选动作，验证独立 L3 事件的门禁、复读和未知结果边界。 */
import { expect, test } from 'bun:test';
import {
  AtomicFailure,
  InfrastRoster,
  type AtomicOperatorObservation,
  type InfrastRosterDriver,
  type RoomCapacityEvidence,
} from '@maaverge/automation';
type CountedState = AtomicOperatorObservation & { capacity: number; selectedCount: number };

function fixture(
  options: {
    names?: string[];
    selected?: string[];
    capacity?: number;
    selectedCount?: number;
    omitCounts?: boolean;
    room?: RoomCapacityEvidence;
    roomEntry?: boolean;
    readErrorAt?: number;
    afterInput?: (kind: string, state: CountedState) => void;
  } = {},
) {
  const events: string[] = [];
  const selected = new Set(options.selected ?? []);
  const state: CountedState = {
    frameId: 'frame-0',
    cards: (options.names ?? ['甲', '乙']).map((name, index) => ({
      name,
      rawName: name,
      nameVerified: true,
      selected: selected.has(name),
      box: [index * 10, 10, 8, 8],
    })),
    capacity: options.capacity ?? 3,
    selectedCount: options.selectedCount ?? selected.size,
    pageIdentity: 'first',
    ...(options.room ? { room: options.room } : {}),
    ...(options.roomEntry ? { selectionOrigin: 'room_entry' as const } : {}),
  };
  let reads = 0;
  const driver: InfrastRosterDriver = {
    async operators() {
      events.push('read');
      reads++;
      if (reads === options.readErrorAt) throw new AtomicFailure('当前页无法读取');
      state.frameId = `frame-${reads}`;
      if (options.omitCounts) {
        const { capacity: _capacity, selectedCount: _selectedCount, ...page } = state;
        return structuredClone(page);
      }
      return structuredClone(state);
    },
    async resetFilter() {
      events.push('filter');
      delete state.selectionOrigin;
      options.afterInput?.('filter', state);
    },
    async page(direction) {
      events.push(`page:${direction}`);
      options.afterInput?.('page', state);
    },
    async clickOperator(card) {
      events.push(`click:${card.name}`);
      delete state.selectionOrigin;
      const current = state.cards.find((item) => item.name === card.name)!;
      current.selected = !current.selected;
      state.selectedCount += current.selected ? 1 : -1;
      options.afterInput?.('click', state);
    },
    async clear() {
      events.push('clear');
      delete state.selectionOrigin;
      for (const card of state.cards) card.selected = false;
      state.selectedCount = 0;
      options.afterInput?.('clear', state);
    },
  };
  return { state, events, roster: new InfrastRoster(driver) };
}

test('reset filter returns its observed current page without scanning or submitting', async () => {
  const game = fixture();
  const result = await game.roster.resetFilter();
  expect(game.events).toEqual(['filter', 'read']);
  expect(result).toMatchObject({ status: 'completed', verified: true, nativeSuccess: true });
  expect(result.data).toMatchObject({ after: { capacity: 3, selectedCount: 0 } });
});

test('readable cards allow filter and one page navigation without inventing absent counters', async () => {
  const game = fixture({ omitCounts: true, selected: ['甲'] });
  const reset = await game.roster.resetFilter();
  const page = await game.roster.page('right');
  expect(reset).toMatchObject({ status: 'completed', verified: true });
  expect(page).toMatchObject({ status: 'completed', verified: true });
  expect((page.data as any).after.selectedCount).toBeUndefined();
  expect((page.data as any).after.capacity).toBeUndefined();
  expect(game.events).toEqual(['filter', 'read', 'read', 'page:right', 'read']);
});

test('missing complete limits reject selection and clearing before changing any card', async () => {
  const game = fixture({ omitCounts: true });
  expect(await game.roster.selectOperator('甲')).toMatchObject({
    status: 'unavailable',
    verified: false,
  });
  expect(await game.roster.clear()).toMatchObject({ status: 'unavailable', verified: false });
  expect(game.events).toEqual(['read', 'read']);
});

test('missing room capacity cannot become complete room or prepared roster evidence', async () => {
  const game = fixture({ omitCounts: true });
  await expect(game.roster.roster()).rejects.toThrow('证据');
  await expect(game.roster.selectExact(['甲'], 5, {})).rejects.toThrow('实际容量');
  expect(game.events).toEqual(['read', 'filter', 'read']);
});

const roomEvidence: RoomCapacityEvidence = {
  source: 'room_panel',
  frameId: 'room-frame',
  target: { facility: 'Control', room: 1 },
  occupied: 1,
  capacity: 3,
};

test('new unchanged room selection is complete only after its exact occupied count is read as unique names', async () => {
  const game = fixture({ omitCounts: true, room: roomEvidence, roomEntry: true, selected: ['乙'] });
  expect(await game.roster.roster()).toMatchObject({
    operators: ['乙'],
    capacity: 3,
    room: roomEvidence,
  });
  expect(game.events).toEqual(['read']);
});

test('room capacity alone cannot authorize clearing when modified selection totals cannot be independently read', async () => {
  const game = fixture({ omitCounts: true, room: roomEvidence, selected: ['乙'] });
  await expect(game.roster.selectExact(['甲'], 5, {})).rejects.toThrow('未修改名单');
  expect(game.events).toEqual(['filter', 'read']);
});

test('one scan rejects room evidence changing under the list even when capacity stays equal', async () => {
  const game = fixture({
    omitCounts: true,
    room: structuredClone(roomEvidence),
    roomEntry: true,
    afterInput(kind, state) {
      if (kind === 'page') state.room = { ...roomEvidence, frameId: 'other-room-frame' };
    },
  });
  await expect(game.roster.roster()).rejects.toThrow('混合画面');
  expect(game.events).not.toContain('clear');
});

test('accepted swipes without movement never prove a hidden selected roster complete', async () => {
  const game = fixture({
    omitCounts: true,
    room: { ...roomEvidence, occupied: 2 },
    roomEntry: true,
    selected: ['甲'],
  });
  await expect(game.roster.roster()).rejects.toThrow('名单不完整');
  expect(game.events).not.toContain('clear');
});

test('filtering invalidates the room-entry count as a selection-total source', async () => {
  const game = fixture({ omitCounts: true, room: roomEvidence, roomEntry: true, selected: ['甲'] });
  expect((await game.roster.resetFilter()).status).toBe('completed');
  await expect(game.roster.roster()).rejects.toThrow('完整已选人数证据');
});

test('unknown selected names cannot become complete roster evidence or authorize a card input', async () => {
  const game = fixture({ selected: ['甲'] });
  game.state.cards[0]!.rawName = '、未识别';
  game.state.cards[0]!.nameVerified = false;
  await expect(game.roster.roster()).rejects.toThrow('官方字典');
  expect(await game.roster.selectOperator('甲')).toMatchObject({
    status: 'unavailable',
    verified: false,
  });
  expect(game.events).not.toContain('click:甲');
});

test('an unselected unknown name also cannot be chosen by its raw OCR label', async () => {
  const game = fixture();
  game.state.cards[0]!.nameVerified = false;
  expect(await game.roster.selectOperator('甲')).toMatchObject({
    status: 'unavailable',
    verified: false,
  });
  expect(game.events).toEqual(['read']);
});

for (const direction of ['left', 'right'] as const)
  test(`one ${direction} roster page input is bracketed by page observations`, async () => {
    const game = fixture();
    const result = await game.roster.page(direction);
    expect(game.events).toEqual(['read', `page:${direction}`, 'read']);
    expect(result).toMatchObject({ status: 'completed', verified: true });
    // 同一页可能已经到边缘；本事件只报告没有观察到变化，不自动补滑或声称绝对边界。
    expect(result.data).toMatchObject({ direction, pageChanged: false });
  });

test('invalid current roster counters reject paging before any swipe', async () => {
  const game = fixture({ selectedCount: 4 });
  const result = await game.roster.page('right');
  expect(result.status).toBe('failed');
  expect(game.events).toEqual(['read']);
});

test('changed selected count after a page input stays unknown without another swipe', async () => {
  const game = fixture({ afterInput: (_kind, state) => state.selectedCount++ });
  const result = await game.roster.page('left');
  expect(result).toMatchObject({ status: 'unknown', verified: false });
  expect(game.events).toEqual(['read', 'page:left', 'read']);
  expect(result.data).toMatchObject({ before: { selectedCount: 0 }, after: { selectedCount: 1 } });
});

test('single visible operator selection defaults to selected and verifies count plus same name', async () => {
  const game = fixture({ selected: ['乙'] });
  const result = await game.roster.selectOperator('甲');
  expect(game.events).toEqual(['read', 'click:甲', 'read']);
  expect(result).toMatchObject({ status: 'completed', verified: true, nativeSuccess: true });
  expect(result.data).toMatchObject({ name: '甲', selected: true, expectedCount: 2, noop: false });
});

test('explicit false deselects one visible operator and verifies the decremented count', async () => {
  const game = fixture({ selected: ['甲', '乙'] });
  const result = await game.roster.selectOperator('甲', false);
  expect(result).toMatchObject({ status: 'completed', verified: true });
  expect(result.data).toMatchObject({ selected: false, expectedCount: 1 });
  expect(game.events).toEqual(['read', 'click:甲', 'read']);
  expect(game.state.cards[0]!.selected).toBe(false);
});

for (const selected of [true, false])
  test(`an already ${selected ? 'selected' : 'unselected'} operator is a verified noop`, async () => {
    const game = fixture({ selected: selected ? ['甲'] : [] });
    const result = await game.roster.selectOperator('甲', selected);
    expect(result).toMatchObject({ status: 'completed', verified: true });
    expect(result.nativeSuccess).toBeUndefined();
    expect(result.data).toMatchObject({ noop: true });
    expect(game.events).toEqual(['read']);
  });

for (const names of [['甲乙'], ['甲', '甲']])
  test(`missing or ambiguous full name ${names.join('/')} never clicks or scans`, async () => {
    const game = fixture({ names });
    const result = await game.roster.selectOperator('甲');
    expect(result.status).toBe('failed');
    expect(game.events).toEqual(['read']);
  });

test('a full current capacity rejects an additional operator before click', async () => {
  const game = fixture({ selected: ['乙'], capacity: 1 });
  const result = await game.roster.selectOperator('甲');
  expect(result.status).toBe('failed');
  expect(game.events).toEqual(['read']);
});

test('count disagreement after clicking preserves before and after and does not retry', async () => {
  const game = fixture({ afterInput: (_kind, state) => state.selectedCount++ });
  const result = await game.roster.selectOperator('甲');
  expect(result).toMatchObject({ status: 'unknown', verified: false });
  expect(result.data).toMatchObject({ before: { selectedCount: 0 }, after: { selectedCount: 2 } });
  expect(game.events).toEqual(['read', 'click:甲', 'read']);
});

test('a matching counter cannot hide a missing same-name selected state', async () => {
  const game = fixture({ afterInput: (_kind, state) => (state.cards[0]!.selected = false) });
  const result = await game.roster.selectOperator('甲');
  expect(result.status).toBe('unknown');
  expect(game.events).toEqual(['read', 'click:甲', 'read']);
});

test('a lost click receipt returns unknown even if the synthetic state changed', async () => {
  const game = fixture({
    afterInput() {
      throw new Error('native receipt lost');
    },
  });
  const result = await game.roster.selectOperator('甲');
  expect(result).toMatchObject({ status: 'unknown', verified: false });
  expect(game.events).toEqual(['read', 'click:甲']);
  expect(game.state.cards[0]!.selected).toBe(true);
});

test('an unreadable post-click page keeps the original observation and never clicks twice', async () => {
  const game = fixture({ readErrorAt: 2 });
  const result = await game.roster.selectOperator('甲');
  expect(result.status).toBe('unknown');
  expect(result.data).toMatchObject({ before: { selectedCount: 0 }, inputAttempted: true });
  expect(game.events).toEqual(['read', 'click:甲', 'read']);
});

test('clear is attempted once after current capacity checks and verifies zero selection', async () => {
  const game = fixture({ selected: ['甲', '乙'] });
  const result = await game.roster.clear();
  expect(result).toMatchObject({ status: 'completed', verified: true, nativeSuccess: true });
  expect(result.data).toMatchObject({ before: { selectedCount: 2 }, after: { selectedCount: 0 } });
  expect(game.events).toEqual(['read', 'clear', 'read']);
});

test('clear rejects invalid capacity before touching the current selection', async () => {
  const game = fixture({ capacity: 6, selected: ['甲'] });
  const result = await game.roster.clear();
  expect(result.status).toBe('failed');
  expect(game.events).toEqual(['read']);
  expect(game.state.cards[0]!.selected).toBe(true);
});

test('unverified clearing stays unknown with evidence and no second clear', async () => {
  const game = fixture({ selected: ['甲'], afterInput: (_kind, state) => state.selectedCount++ });
  const result = await game.roster.clear();
  expect(result).toMatchObject({ status: 'unknown', verified: false });
  expect(result.data).toMatchObject({ before: { selectedCount: 1 }, after: { selectedCount: 1 } });
  expect(game.events).toEqual(['read', 'clear', 'read']);
});

// 没有全局已选计数时，满员姓名的数量以同次实际房间容量作独立上界；从不使用心情分数。
const fullRoomEvidence: RoomCapacityEvidence = {
  source: 'room_panel',
  frameId: 'room-panel',
  target: { facility: 'Control', room: 1 },
  occupied: 1,
  capacity: 2,
};
test('exact full-capacity rosters use independently observed capacity and selected names', async () => {
  const game = fixture({
    names: ['甲', '乙', '丙'],
    selected: ['丙'],
    omitCounts: true,
    room: fullRoomEvidence,
  });
  const attempt: Record<string, unknown> = {};
  const result = await game.roster.selectExact(['甲', '乙'], 5, attempt);
  expect(result.operators.sort()).toEqual(['乙', '甲'].sort());
  expect(result.capacity).toBe(2);
  expect(game.events.filter((event) => event.startsWith('click:'))).toEqual([
    'click:甲',
    'click:乙',
  ]);
});

test('capacity-bound selection rejects partial or empty requests before clearing', async () => {
  for (const requested of [[], ['甲']]) {
    const game = fixture({ omitCounts: true, room: fullRoomEvidence });
    await expect(game.roster.selectExact(requested, 5, {})).rejects.toThrow('独立核验');
    expect(game.events).not.toContain('clear');
  }
});

test('capacity-bound selection requires actual selected marks and never treats clicks as completion', async () => {
  const game = fixture({
    names: ['甲', '乙', '丙'],
    omitCounts: true,
    room: fullRoomEvidence,
    afterInput: (kind, state) => {
      if (kind === 'click') state.cards.forEach((card) => (card.selected = false));
    },
  });
  await expect(game.roster.selectExact(['甲', '乙'], 5, {})).rejects.toThrow('选中状态');
  expect(game.events.filter((event) => event.startsWith('click:'))).toEqual(['click:甲']);
});

test('capacity-bound scans reject hidden extra selection when a later page exposes it', async () => {
  const game = fixture({
    names: ['甲', '乙', '丙'],
    omitCounts: true,
    room: fullRoomEvidence,
    afterInput: (kind, state) => {
      if (kind === 'click') state.cards.find((card) => card.name === '丙')!.selected = true;
    },
  });
  await expect(game.roster.selectExact(['甲', '乙'], 5, {})).rejects.toThrow('人数或房间容量');
});
