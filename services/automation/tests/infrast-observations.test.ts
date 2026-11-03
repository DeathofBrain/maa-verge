/** 合成同帧 OCR 事实，验证名单和总览的领域证据边界；不读取截图或断言界面外观。 */
import { expect, test } from 'bun:test';
import {
  AtomicVision,
  atomicFacilities,
  type AtomicExecutionPort,
  type AtomicMatch,
  type AtomicResourceProfile,
} from '@maaverge/automation';
import { unexpectedPipeline } from './pipeline-fixture';

const source = { repository: 'synthetic', ref: 'test', path: 'test' };
const names: Record<string, string> = {
  Mfg: '制造站',
  Trade: '贸易站',
  Power: '发电站',
  Control: '控制中枢',
  Reception: '会客室',
  Office: '办公室',
  Dorm: '宿舍',
  Processing: '加工站',
  Training: '训练室',
  Recycle: '回收站',
};
const match = (text: string, y: number, x = 440): AtomicMatch => ({
  text,
  box: [x, y, 100, 20],
  score: 1,
});

function overviewFixture(texts: AtomicMatch[], labels: Record<string, AtomicMatch[]>) {
  const profile: AtomicResourceProfile = {
    id: 'synthetic',
    clientType: 'Official',
    available: true,
    diagnostics: [],
    sources: [],
    card: null,
    actions: {},
    rules: {
      'queue.rotate': { id: 'queue.rotate', kind: 'ocr', expected: ['队列轮换'], source },
      ...Object.fromEntries(
        atomicFacilities.map((facility) => [
          `facility.label.${facility}`,
          { id: `facility.label.${facility}`, kind: 'ocr', expected: [names[facility]], source },
        ]),
      ),
    },
  };
  const port: AtomicExecutionPort = {
    runPipeline: unexpectedPipeline,
    async execute(operation, input) {
      if (operation === 'frame')
        return { frameId: 'same-frame', width: 1280, height: 720, data: 'synthetic' };
      if (operation !== 'recognize') throw new Error('observation must not mutate the device');
      // 模板只作规则身份，不执行实际视觉算法；领域解析消费同一帧上的已识别事实。
      const pattern = input.templateId;
      const matches =
        pattern === 'queue'
          ? [match('队列轮换', 650)]
          : typeof pattern === 'string'
            ? (labels[pattern] ?? [])
            : texts;
      return { hit: matches.length > 0, matches, coordinateSize: [1280, 720] };
    },
  };
  profile.rules['queue.rotate'] = {
    id: 'queue.rotate',
    kind: 'template',
    templateId: 'queue',
    source,
  };
  for (const facility of atomicFacilities)
    profile.rules[`facility.label.${facility}`].templateId = facility;
  return new AtomicVision(port, profile);
}

test('overview binds duplicate section and room titles to one physical room', async () => {
  const vision = overviewFixture([match('编辑队列', 215), match('编辑队列', 415)], {
    Control: [match('控制中枢', 85), match('控制中枢0000', 130)],
    Reception: [match('会客室', 285), match('会客室00', 330)],
  });
  const result = await vision.overview();
  expect(result.rows.map(({ facility, room, identity }) => ({ facility, room, identity }))).toEqual(
    [
      { facility: 'Control', room: 1, identity: 'Control:1' },
      { facility: 'Reception', room: 1, identity: 'Reception:1' },
    ],
  );
});

test('overview uses explicit repeated-room labels and full positions without inventing ordinals', async () => {
  const vision = overviewFixture(
    [
      match('编辑队列', 215),
      match('B101', 145, 610),
      match('编辑队列', 415),
      match('B102', 345, 610),
    ],
    { Mfg: [match('制造站2', 130), match('制造站3', 330)] },
  );
  expect((await vision.overview()).rows).toMatchObject([
    { facility: 'Mfg', room: 2, position: 'B101', identity: 'Mfg:B101' },
    { facility: 'Mfg', room: 3, position: 'B102', identity: 'Mfg:B102' },
  ]);
});

test('clipped row title without a physical-row anchor does not become another room', async () => {
  const vision = overviewFixture([match('编辑队列', 215)], {
    Control: [match('控制中枢', 130)],
    Mfg: [match('制造站2', 690)],
  });
  expect((await vision.overview()).rows).toHaveLength(1);
});

for (const title of ['制造站', '制造站100('])
  test(`ambiguous repeated-room identity ${title} fails instead of reporting verified room data`, async () => {
    const vision = overviewFixture([match('编辑队列', 215)], { Mfg: [match(title, 130)] });
    await expect(vision.overview()).rejects.toThrow('编号');
  });

test('conflicting full positions in one row fail rather than silently skipping that room', async () => {
  const vision = overviewFixture(
    [match('编辑队列', 215), match('B101', 145, 610), match('B102', 145, 730)],
    { Mfg: [match('制造站1', 130)] },
  );
  await expect(vision.overview()).rejects.toThrow('冲突');
});

test('two actual rows cannot both claim the same singleton room identity', async () => {
  const vision = overviewFixture([match('编辑队列', 215), match('编辑队列', 415)], {
    Control: [match('控制中枢', 130), match('控制中枢', 330)],
  });
  await expect(vision.overview()).rejects.toThrow('同一房间');
});

test('a tutorial or empty panel with a background queue button supplies no room proof', async () => {
  const vision = overviewFixture([match('进驻总览', 150), match('查看本说明', 620)], {
    Control: [match('控制中枢', 130)],
  });
  await expect(vision.overview()).rejects.toThrow('未确认');
});

/** 小型官方姓名夹具仅供领域校验，当前页 OCR 则独立提供原文与锚点。 */
function operatorCardFixture(
  rawName = '甲',
  options: { clientType?: string; missingDictionary?: boolean; noAnchors?: boolean } = {},
) {
  const calls: string[] = [];
  const profile: AtomicResourceProfile = {
    id: 'synthetic',
    clientType: options.clientType ?? 'Official',
    available: true,
    diagnostics: [],
    sources: [],
    actions: {},
    ...(options.missingDictionary
      ? {}
      : {
          operatorNames: {
            names: ['甲'],
            source: { ...source, path: 'battle_data.json', sha256: '0'.repeat(64) },
          },
        }),
    rules: Object.fromEntries(
      ['operators.name', 'operators.anchor.0', 'operators.anchor.1', 'operators.anchor.2'].map(
        (id) => [
          id,
          { id, kind: id === 'operators.name' ? 'ocr' : 'template', templateId: id, source },
        ],
      ),
    ),
    card: {
      regions: [[400, 200, 400, 300]],
      nameOffset: [0, 10, 100, 20],
      facilityOffset: [0, -80, 80, 20],
      selectedOffset: [-20, -70, 10, 80],
      clickOffset: [20, 0, 10, 80],
      selectedCount: 100,
      selectedLower: [95, 0, 0],
      selectedUpper: [105, 255, 255],
    },
  };
  const port: AtomicExecutionPort = {
    runPipeline: unexpectedPipeline,
    async execute(operation, input) {
      calls.push(operation);
      if (operation === 'frame')
        return { frameId: 'cards', width: 1280, height: 720, data: 'synthetic' };
      if (operation === 'click') return { accepted: true };
      if (operation !== 'recognize') throw new Error('card reading must not mutate');
      const matches =
        input.kind === 'color'
          ? [{ ...match('', 230), count: 100 }]
          : input.templateId === 'operators.name'
            ? [match(rawName, 310)]
            : input.kind === 'template'
              ? options.noAnchors
                ? []
                : [match('anchor', 300, 450)]
              : [match('20/24', 220)];
      return { hit: true, matches, coordinateSize: [1280, 720] };
    },
  };
  const vision = new AtomicVision(port, profile);
  vision.wait = async () => {};
  return { vision, calls };
}

test('current-card reading succeeds without a top counter and never treats morale as capacity', async () => {
  const { vision, calls } = operatorCardFixture();
  const result = await vision.operators();
  expect(result.cards).toMatchObject([{ name: '甲', selected: true }]);
  expect(result.capacity).toBeUndefined();
  expect(result.selectedCount).toBeUndefined();
  expect(result.cards[0]!.stationedIn).toBeUndefined();
  expect(calls).not.toContain('click');
});

test('bounded punctuation changes require exact official-name agreement and preserve the original OCR', async () => {
  const { vision } = operatorCardFixture('、甲');
  const result = await vision.operators();
  expect(result.cards[0]).toMatchObject({ name: '甲', rawName: '、甲', nameVerified: true });
  expect(result.nameSource?.sha256).toBe('0'.repeat(64));
});

test('unknown OCR names stay raw and cannot be clicked even with a fabricated verified flag', async () => {
  const { vision, calls } = operatorCardFixture('、未知');
  const card = (await vision.operators()).cards[0]!;
  expect(card).toMatchObject({ name: '、未知', rawName: '、未知', nameVerified: false });
  await expect(vision.clickCard(card)).rejects.toThrow('官方字典');
  await expect(vision.clickCard({ ...card, nameVerified: true })).rejects.toThrow('官方字典');
  expect(calls).not.toContain('click');
});

test('fresh identity checks use the same official normalization before one card click', async () => {
  const { vision, calls } = operatorCardFixture('、甲');
  const card = (await vision.operators()).cards[0]!;
  await vision.clickCard(card);
  expect(calls.filter((operation) => operation === 'click')).toHaveLength(1);
});

for (const options of [{ missingDictionary: true }, { clientType: 'YoStarEN' }])
  test('missing dictionary or an unsupported client rejects card semantics before any device read', async () => {
    const { vision, calls } = operatorCardFixture('甲', options);
    await expect(vision.operators()).rejects.toThrow('官方干员姓名字典');
    expect(calls).toEqual([]);
  });

test('standalone card observation remains immediate when complete anchors are absent', async () => {
  const { vision } = operatorCardFixture('甲', { noAnchors: true });
  expect(await vision.operatorsReady()).toBe(false);
  await expect(vision.operators()).rejects.toThrow('未识别到完整');
});

function roomFixture(
  counter = '进驻人数5/5',
  panel = '当前房间入住信息',
  facility: 'Control' | 'Reception' = 'Control',
) {
  const profile = overviewFixture([], {}).profile;
  const port: AtomicExecutionPort = {
    runPipeline: unexpectedPipeline,
    async execute(operation, input) {
      if (operation === 'frame')
        return { frameId: 'room-read', width: 1280, height: 720, data: 'synthetic' };
      if (operation !== 'recognize') throw new Error('room read must not mutate');
      const roi = input.roi as number[];
      const matches = input.templateId
        ? [match(`${names[facility]}1F02`, 20)]
        : [match(roi[1] === 650 ? counter : panel, roi[1] === 650 ? 680 : 20, 1050)];
      return { hit: true, matches, coordinateSize: [1280, 720] };
    },
  };
  return new AtomicVision(port, profile);
}

test('room capacity is read from its labelled panel with the target and same-frame provenance', async () => {
  const target = { facility: 'Control', room: 1 } as const;
  expect(await roomFixture().roomCapacity(target)).toEqual({
    source: 'room_panel',
    frameId: 'room-read',
    target,
    occupied: 5,
    capacity: 5,
  });
});

test('label prefixes do not replace the actual per-room count with a theoretical maximum', async () => {
  const control = await roomFixture('ffi进驻人数5/5').roomCapacity({
    facility: 'Control',
    room: 1,
  });
  const reception = await roomFixture('fi进驻人数2/2', undefined, 'Reception').roomCapacity({
    facility: 'Reception',
    room: 1,
  });
  expect(control.capacity).toBe(5);
  expect(reception.capacity).toBe(2);
  await expect(
    roomFixture('进驻人数5/5', undefined, 'Reception').roomCapacity({
      facility: 'Reception',
      room: 1,
    }),
  ).rejects.toThrow('上限');
});

for (const counter of ['20/24', '5/5', '进驻人数20/24', '进驻人数5/3', '进驻人数5/5进驻人数3/3'])
  test(`room count rejects unrelated, invalid or conflicting evidence ${counter}`, async () => {
    await expect(
      roomFixture(counter).roomCapacity({ facility: 'Control', room: 1 }),
    ).rejects.toThrow();
  });

test('a numeric count outside the confirmed room-info panel cannot prove actual capacity', async () => {
  await expect(
    roomFixture('进驻人数5/5', '全局工作区情况').roomCapacity({ facility: 'Control', room: 1 }),
  ).rejects.toThrow('面板');
});

function panelFixture(
  options: {
    alreadyOpen?: boolean;
    openAfterReads?: number;
    lostReceipt?: boolean;
    wrongTarget?: boolean;
    expired?: boolean;
  } = {},
) {
  const profile = overviewFixture([], {}).profile;
  profile.rules['room.stationed'] = {
    id: 'room.stationed',
    kind: 'template',
    templateId: 'stationed',
    source,
  };
  let clicks = 0,
    readsAfterClick = 0;
  const port: AtomicExecutionPort = {
    runPipeline: unexpectedPipeline,
    async execute(operation, input) {
      if (operation === 'frame')
        return { frameId: `panel-${readsAfterClick}`, width: 1280, height: 720, data: 'synthetic' };
      if (operation === 'click') {
        clicks++;
        if (options.lostReceipt) throw new Error('native receipt lost');
        return { accepted: true };
      }
      if (operation !== 'recognize') throw new Error('unexpected panel operation');
      let matches: AtomicMatch[];
      if (input.templateId === 'Control') {
        matches = [match(options.wrongTarget ? '会客室' : '控制中枢', 20)];
      } else if (input.templateId === 'stationed') {
        matches = [match('进驻信息', 300, 30)];
      } else {
        if (clicks) readsAfterClick++;
        const present =
          options.alreadyOpen || (clicks && readsAfterClick >= (options.openAfterReads ?? 1));
        matches = present ? [match('当前房间入住信息', 20, 850)] : [];
      }
      return { hit: matches.length > 0, matches, coordinateSize: [1280, 720] };
    },
  };
  const vision = new AtomicVision(
    port,
    profile,
    options.expired ? { deadline: Date.now() - 1 } : {},
  );
  vision.wait = async () => {};
  return { vision, clicks: () => clicks, readsAfterClick: () => readsAfterClick };
}

test('an already confirmed room panel is idempotent and never toggles its entry', async () => {
  const game = panelFixture({ alreadyOpen: true });
  await game.vision.ensureRoomPanel({ facility: 'Control', room: 1 });
  expect(game.clicks()).toBe(0);
});

test('a closed room panel is clicked once and delayed opening is checked through reads only', async () => {
  const game = panelFixture({ openAfterReads: 2 });
  await game.vision.ensureRoomPanel({ facility: 'Control', room: 1 });
  expect(game.clicks()).toBe(1);
  expect(game.readsAfterClick()).toBe(2);
});

test('an unconfirmed opening stays unknown after its read deadline without toggling again', async () => {
  const game = panelFixture({ openAfterReads: 100, expired: true });
  await expect(game.vision.ensureRoomPanel({ facility: 'Control', room: 1 })).rejects.toMatchObject(
    {
      status: 'unknown',
    },
  );
  expect(game.clicks()).toBe(1);
});

test('a lost opening receipt is never replayed even if the input may have reached the game', async () => {
  const game = panelFixture({ lostReceipt: true });
  await expect(game.vision.ensureRoomPanel({ facility: 'Control', room: 1 })).rejects.toThrow(
    'receipt lost',
  );
  expect(game.clicks()).toBe(1);
  expect(game.readsAfterClick()).toBe(0);
});

test('wrong-room evidence rejects panel navigation before any click', async () => {
  const game = panelFixture({ wrongTarget: true });
  await expect(game.vision.ensureRoomPanel({ facility: 'Control', room: 1 })).rejects.toThrow(
    '目标不符',
  );
  expect(game.clicks()).toBe(0);
});
