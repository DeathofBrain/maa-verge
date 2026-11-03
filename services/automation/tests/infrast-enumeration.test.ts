/** 固定格点仅作为房间全集的独立上界；测试传入识别事实，不断言界面外观。 */
import { expect, test } from 'bun:test';
import {
  AtomicVision,
  type AtomicResourceProfile,
  type AtomicMatch,
  type AtomicFacility,
} from '@maaverge/automation';

function fixture() {
  const found: Record<string, AtomicMatch[]> = {
    'base.entered': [{ box: [0, 0, 10, 10], score: 1 }],
  };
  const profile = { rules: {}, actions: {} } as AtomicResourceProfile;
  const all: AtomicFacility[] = ['Mfg', 'Trade', 'Power', 'Dorm', 'Control'];
  const kinds = ['Mfg', 'Trade', 'Power', 'Mfg', 'Trade', 'Power', 'Mfg', 'Mfg', 'Power'];
  for (const [index, facility] of kinds.entries())
    (found[`facility.icon.${facility}`] ??= []).push({
      box: [100 + (index % 3) * 200, 240 + Math.floor(index / 3) * 140, 12, 85],
      score: 1,
    });
  found['facility.icon.Dorm'] = Array.from({ length: 4 }, (_, index) => ({
    box: [800, 180 + index * 130, 80, 50],
    score: 1,
  }));
  found['facility.icon.Control'] = [{ box: [1000, 100, 80, 50], score: 1 }];
  for (const id of ['base.entered', ...all.map((facility) => `facility.icon.${facility}`)])
    profile.rules[id] = {
      id,
      kind: 'template',
      templateId: id,
      source: { repository: 'synthetic', ref: 'fixture', path: 'memory' },
    };
  let inputCalls = 0;
  const vision = new AtomicVision(
    {
      async execute(operation) {
        if (operation !== 'frame') {
          inputCalls++;
          throw new Error('no input allowed');
        }
        return { frameId: 'frame', width: 1280, height: 720, data: '' };
      },
      async runPipeline() {
        throw new Error('no pipeline allowed');
      },
    },
    profile,
  );
  vision.recognize = async (_frame, rule) => ({
    hit: Boolean(found[rule.id]?.length),
    matches: found[rule.id] ?? [],
  });
  return { vision, found, inputCalls: () => inputCalls };
}
test('nine actual independent production cells and four dorm cells prove the fully visible room collection without theoretical per-facility counts', async () => {
  const game = fixture();
  expect(await game.vision.roomCounts(['Mfg', 'Trade', 'Power', 'Dorm', 'Control'])).toMatchObject({
    source: 'base_fixed_slots',
    counts: { Mfg: 4, Trade: 2, Power: 3, Dorm: 4, Control: 1 },
  });
  expect(game.inputCalls()).toBe(0);
});
test('a cropped or not fully unlocked production map does not prove that the observed subset is the whole base', async () => {
  const game = fixture();
  game.found['facility.icon.Mfg']!.pop();
  await expect(game.vision.roomCounts(['Power'])).rejects.toThrow('九个实际房间');
  expect(game.inputCalls()).toBe(0);
});
test('nine hits with overlapping or contradictory cells cannot satisfy the independent layout bound', async () => {
  const game = fixture();
  game.found['facility.icon.Mfg']![0]!.box = [...game.found['facility.icon.Trade']![0]!.box];
  await expect(game.vision.roomCounts(['Power'])).rejects.toThrow('冲突');
});
test('nine production hits missing an official required facility kind do not prove a complete collection', async () => {
  const game = fixture();
  game.found['facility.icon.Mfg']!.push(...game.found['facility.icon.Trade']!);
  game.found['facility.icon.Trade'] = [];
  await expect(game.vision.roomCounts(['Power'])).rejects.toThrow('制造、贸易与发电');
  expect(game.inputCalls()).toBe(0);
});
test('fewer visible dorms cannot be reported as a complete dorm collection', async () => {
  const game = fixture();
  game.found['facility.icon.Dorm']!.pop();
  await expect(game.vision.roomCounts(['Dorm'])).rejects.toThrow('全部 4');
});
