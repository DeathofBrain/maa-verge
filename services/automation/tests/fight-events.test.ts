/** 合成数据验证倍率、掉落证据和批次停止语义；不连接设备，不断言产品外观。 */
import { expect, spyOn, test } from 'bun:test';
import { PNG } from 'pngjs';
import { createFightCapabilities } from '#custom/fight/capabilities';
import {
  checkFightInputs,
  fightReviewedRules,
  loadFightResourceProfile,
  type FightResourceProfile,
} from '#custom/fight/resources';
import { decodeFightFrame, fightBaselines } from '#custom/fight/pixels';
import type { AtomicExecutionPort, AtomicFrame } from '#automation/core/types';
import { ReviewedEventVision } from '#automation/composites/reviewed-event';
const unexpectedPipeline: AtomicExecutionPort['runPipeline'] = async () => {
  throw new Error('independent handler fixture must not start native Tasker');
};

function profile(): FightResourceProfile {
  const value: FightResourceProfile = {
    id: 'synthetic-fight',
    clientType: 'Official',
    available: true,
    rules: {},
    actions: {},
    alternatives: {},
    diagnostics: [],
    sources: [],
    adapterBaseline: { repository: 'synthetic', ref: 'test', commit: 'test' },
    dropLayout: {
      roi: [0, 636, 1280, 2],
      range: [30, 255],
      minWidth: 100,
      maxSpacing: 17,
      itemOffset: [0, -130, 138, 130],
      quantityOffset: [62, 90, 43, 22],
      items: { '30013': 'items/30013.png' },
      threshold: 0.65,
    },
  };
  for (const spec of fightReviewedRules) {
    if ('actionOnly' in spec && spec.actionOnly)
      value.actions[spec.id] = { box: [1200, 20, 20, 20], delayMs: 0 };
    else {
      value.rules[spec.id] = {
        id: spec.id,
        kind: 'template',
        templateId: `${spec.id}.png`,
        source: { repository: 'synthetic', ref: 'test', path: 'test' },
      };
      value.alternatives[spec.id] = [spec.id];
    }
  }
  return value;
}

function pngFrame(right = 478): AtomicFrame {
  const width = 1280,
    height = 720,
    png = new PNG({ width, height });
  for (let offset = 3; offset < png.data.length; offset += 4) png.data[offset] = 255;
  for (const y of [635, 636])
    for (let x = 200; x < right; x++)
      png.data.fill(100, (y * width + x) * 4, (y * width + x) * 4 + 3);
  return { frameId: 'frame-1', width, height, data: PNG.sync.write(png).toString('base64') };
}

test('baseline derivative determines slot geometry and rejects hidden or invalid image data', () => {
  const p = profile(),
    frame = pngFrame();
  expect(fightBaselines(decodeFightFrame(frame), p.dropLayout!)).toEqual([[200, 636, 277, 1]]);
  expect(() => fightBaselines(decodeFightFrame(pngFrame(1280)), p.dropLayout!)).toThrow('拼接');
  expect(() => decodeFightFrame({ ...frame, data: 'synthetic-frame' })).toThrow();
  expect(() => decodeFightFrame({ ...frame, width: 1920 })).toThrow();
});

test('drop quantities bind the baseline slot and reject missing, ambiguous or approximate numbers', async () => {
  for (const text of ['3', '', '1万', '0', '×1']) {
    const p = profile(),
      reads: number[][] = [];
    const port: AtomicExecutionPort = {
      runPipeline: unexpectedPipeline,
      async execute(operation, input) {
        if (operation === 'frame') return pngFrame();
        if (operation !== 'recognize') throw new Error('read-only drop reader issued input');
        const roi = input.roi as number[] | undefined;
        const template = String(input.templateId);
        const hit =
          template === 'result.png' ||
          template === 'drops.type.Normal.png' ||
          (template === 'items/30013.png' && roi?.[0] === 339);
        if (input.onlyRec) {
          reads.push(roi!);
          return {
            hit: !!text,
            matches: text ? [{ box: roi, score: 1, text }] : [],
            coordinateSize: [1280, 720],
          };
        }
        return {
          hit,
          matches: hit ? [{ box: [roi?.[0] ?? 10, roi?.[1] ?? 10, 20, 20], score: 1 }] : [],
          coordinateSize: [1280, 720],
        };
      },
    };
    const read = createFightCapabilities(port, p).find(
      (item) => item.descriptor.id === 'game.fight.read_drops',
    )!;
    if (text === '3') {
      const result = await read.handler({ itemIds: ['30013'] }, {});
      expect(result.data).toMatchObject({ drops: { '30013': 3 } });
      expect(reads).toEqual([[401, 596, 43, 22]]);
    } else await expect(read.handler({ itemIds: ['30013'] }, {})).rejects.toThrow('数量证据');
  }
});

test('legacy batch limits multiplier by remaining rounds and stops on any verified target', async () => {
  const p = profile(),
    inputs: number[] = [];
  const port: AtomicExecutionPort = {
    runPipeline: unexpectedPipeline,
    execute: async () => {
      throw new Error('coordinator bypassed JSON');
    },
  };
  const batch = createFightCapabilities(port, p).find(
    (item) => item.descriptor.id === 'workflow.fight.legacy_batch',
  )!;
  const context = {
    runWorkflow: async (entry: string, _definitions: unknown, input: Record<string, unknown>) => {
      if (entry === 'Fight@StartSingle') inputs.push(Number(input.series));
      return {
        status: 'completed' as const,
        verified: true,
        data:
          entry === 'Fight@ReadDrops'
            ? { drops: { '30013': 2 } }
            : { battleWon: true, completedRounds: inputs.at(-1) },
      };
    },
  };
  const result = await batch.handler({ times: 5, series: 3, medicine: 0, stone: 0 }, context);
  expect(inputs).toEqual([3, 2]);
  expect(result.data).toMatchObject({ completedRuns: 5, completedBatches: 2 });
  inputs.length = 0;
  const stopped = await batch.handler({ times: 100, series: 3, drops: { '30013': 2 } }, context);
  expect(inputs).toEqual([3]);
  expect(stopped.data).toMatchObject({
    completedRuns: 3,
    reachedTarget: '30013',
    drops: { '30013': 2 },
  });
});

test('series selection binds a unique number, closes its list and verifies the resulting multiplier', async () => {
  for (const ambiguous of [false, true]) {
    let multiplier = 2,
      opened = false,
      clicks = 0;
    const port: AtomicExecutionPort = {
      runPipeline: unexpectedPipeline,
      async execute(operation, input) {
        if (operation === 'frame')
          return { frameId: 'synthetic-series', width: 1280, height: 720, data: 'synthetic' };
        if (operation === 'click') {
          clicks++;
          if (!opened) opened = true;
          else if (input.x === 930) opened = false;
          else multiplier = 3;
          return { accepted: true };
        }
        if (operation !== 'recognize') throw new Error('unexpected series operation');
        const id = String(input.templateId).replace(/\.png$/, '');
        let matches: { box: number[]; score: number; text?: string }[] = [];
        if (id === 'stage' || id === 'agent.active')
          matches = [{ box: [1100, 640, 100, 30], score: 1 }];
        if (id === 'series')
          matches = [{ box: [950, 590, 40, 20], score: 1, text: `×${multiplier}` }];
        if (id === 'series.opened' && opened) matches = [{ box: [920, 380, 20, 20], score: 1 }];
        if (id === 'series.list' && opened)
          matches = [
            { box: [970, 350, 10, 10], score: 1 },
            ...(ambiguous ? [{ box: [970, 400, 10, 10], score: 1 }] : []),
          ];
        if (id === 'series.number') matches = [{ box: input.roi as number[], score: 1, text: '3' }];
        return { hit: !!matches.length, matches, coordinateSize: [1280, 720] };
      },
    };
    const capabilities = createFightCapabilities(port, profile());
    const prepare = capabilities.find((item) => item.descriptor.id === 'game.fight.prepare')!;
    await expect(prepare.handler({ series: 3 }, {})).rejects.toThrow('倍率');
    expect(clicks).toBe(0);
    const set = capabilities.find((item) => item.descriptor.id === 'game.fight.set_series')!;
    const wait = spyOn(ReviewedEventVision.prototype, 'wait').mockImplementation(async () => {});
    try {
      if (ambiguous) {
        await expect(set.handler({ series: 3 }, {})).rejects.toThrow('唯一');
        expect(clicks).toBe(1);
      } else {
        expect((await set.handler({ series: 3 }, {})).data).toMatchObject({
          series: 3,
          changed: true,
        });
        expect(clicks).toBe(3);
        expect(opened).toBe(false);
      }
    } finally {
      wait.mockRestore();
    }
  }
});

test('a successful multi-battle page must prove the actual completed round count', async () => {
  for (const text of ['连续代理作战成功3次', '连续代理作战成功2次', '3', '连续代理3次失败']) {
    const port: AtomicExecutionPort = {
      runPipeline: unexpectedPipeline,
      async execute(operation, input) {
        if (operation === 'frame')
          return { frameId: 'synthetic-result', width: 1280, height: 720, data: 'synthetic' };
        if (operation !== 'recognize') throw new Error('result reader issued input');
        const template = String(input.templateId);
        const matches =
          template === 'result.png'
            ? [{ box: [100, 100, 20, 20], score: 1 }]
            : template === 'result.times.png'
              ? [{ box: [73, 378, 221, 31], score: 1, text }]
              : [];
        return { hit: !!matches.length, matches, coordinateSize: [1280, 720] };
      },
    };
    const read = createFightCapabilities(port, profile()).find(
      (item) => item.descriptor.id === 'game.fight.read_result',
    )!;
    if (text === '连续代理作战成功3次')
      expect((await read.handler({ series: 3 }, {})).data).toMatchObject({
        completedRounds: 3,
        battleWon: true,
      });
    else await expect(read.handler({ series: 3 }, {})).rejects.toThrow('实际完成次数');
  }
});

test('legacy batch retains completed counts on unknown evidence and bounds recent history', async () => {
  const p = profile(),
    port: AtomicExecutionPort = {
      runPipeline: unexpectedPipeline,
      execute: async () => {
        throw new Error('unexpected input');
      },
    };
  const batch = createFightCapabilities(port, p).find(
    (item) => item.descriptor.id === 'workflow.fight.legacy_batch',
  )!;
  let started = 0;
  const result = await batch.handler(
    { times: 100, series: 1 },
    {
      runWorkflow: async (entry) => {
        if (entry === 'Fight@StartSingle') started++;
        return started === 23
          ? { status: 'unknown', verified: false, data: null }
          : { status: 'completed', verified: true, data: { battleWon: true, completedRounds: 1 } };
      },
    },
  );
  expect(result.status).toBe('unknown');
  expect(result.data).toMatchObject({ completedRuns: 22, completedBatches: 22 });
  expect((result.data as { recent: unknown[] }).recent).toHaveLength(20);
  const unavailable = profile();
  delete unavailable.dropLayout;
  expect(checkFightInputs(unavailable, { drops: { '30013': 1 } })).toContain(
    '当前资源缺少已审阅掉落基线和数量布局',
  );
});

test('only the proven full grayscale RGBCount branch can become ordinary template matching', async () => {
  for (const ranges of [[[0, 255]], [[1, 255]]]) {
    const source = {
      read: async (file: string) =>
        file === 'tasks/tasks.json'
          ? Buffer.from(
              JSON.stringify({
                'FightSeries-Opened': {
                  template: 'FightSeries-Indicator.png',
                  roi: [900, 370, 70, 40],
                  method: 'RGBCount',
                  colorScales: ranges,
                },
              }),
            )
          : undefined,
      listTemplates: async () => ({ ids: ['FightSeries-Indicator.png'], complete: true }),
    };
    const p = await loadFightResourceProfile(source);
    expect(!!p.rules['series.opened']).toBe(ranges[0]![0] === 0);
    if (p.rules['series.opened']) expect(p.rules['series.opened'].method).toBe(5);
  }
});
