import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { operatorResource } from '../src/modules/resources/operator-resources';
import { Runtime } from '../src/app/runtime';
import {
  validateOperatorResourceParams,
  validateOperatorResourceResult,
} from '../../../packages/contracts/src/validators.js';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQ13X+DwACbQGH9E2oMAAAAABJRU5ErkJggg==',
  'base64',
);
const operator = {
  name: '白面鸮',
  name_en: 'Ptilopsis',
  name_jp: 'フィリオプシス',
  name_kr: '프틸롭시스',
  name_tw: '白面鴞',
  rarity: 5,
};
const temporary = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-operator-test-'));
  roots.push(root);
  return root;
};
function pack(
  files: Record<string, unknown> = {
    'battle_data.json': { chars: { char_128_plosis: operator } },
    'template/avatar/char_128_plosis.png': image,
  },
) {
  const root = temporary();
  for (const [relative, value] of Object.entries(files)) {
    const filename = path.join(root, 'resource', relative);
    mkdirSync(path.dirname(filename), { recursive: true });
    writeFileSync(filename, Buffer.isBuffer(value) ? value : JSON.stringify(value));
  }
  return { resource: { path: root, version: 'synthetic-resource-1' } };
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('installed operator resources', () => {
  test('explicit identity resolves duplicate names without selecting a different operator', async () => {
    const combo = pack({
      'battle_data.json': { chars: { char_one: operator, char_two: operator } },
      'template/avatar/char_two.png': image,
    });
    expect(await operatorResource(combo, operator.name)).toMatchObject({ id: null, data: null });
    expect(await operatorResource(combo, operator.name, 'Official', 'char_two')).toMatchObject({
      id: 'char_two',
      data: image.toString('base64'),
    });
    expect(await operatorResource(combo, operator.name, 'Official', 'char_missing')).toMatchObject({
      id: null,
      data: null,
    });
  });
  test('resolves client names and unique cross-language aliases with one-based rarity', async () => {
    const combo = pack();
    expect(await operatorResource(combo, '白面鸮')).toEqual({
      name: '白面鸮',
      id: 'char_128_plosis',
      rarity: 5,
      mimeType: 'image/png',
      data: image.toString('base64'),
      resourceVersion: 'synthetic-resource-1',
    });
    expect(await operatorResource(combo, '白面鸮', 'Bilibili')).toMatchObject({
      rarity: 5,
      data: image.toString('base64'),
    });
    for (const [clientType, name] of [
      ['YoStarEN', operator.name_en],
      ['YoStarJP', operator.name_jp],
      ['YoStarKR', operator.name_kr],
      ['txwy', operator.name_tw],
    ] as const) {
      expect(await operatorResource(combo, name, clientType)).toMatchObject({
        name,
        id: 'char_128_plosis',
        rarity: 5,
      });
      expect(await operatorResource(combo, '白面鸮', clientType)).toMatchObject({
        name,
        id: 'char_128_plosis',
        rarity: 5,
      });
    }
  });
  test('same-name forms keep a consistent rarity without guessing an avatar, and conflicting stars stay unknown', async () => {
    const combo = pack({
      'battle_data.json': {
        chars: {
          char_002_amiya: { name: '阿米娅', rarity: 5 },
          char_1001_amiya2: { name: '阿米娅', rarity: 5 },
          trap_amiya: { name: '阿米娅', rarity: 1 },
          char_508_sharp: { name: 'Sharp', rarity: 5 },
          char_609_sharp: { name: 'Sharp', rarity: 6 },
          char_first: { name: '第一人', name_en: 'Shared', rarity: 4 },
          char_second: { name: '第二人', name_en: 'Shared', rarity: 4 },
        },
      },
      'template/avatar/char_002_amiya.png': image,
    });
    expect(await operatorResource(combo, '阿米娅')).toMatchObject({
      name: '阿米娅',
      id: null,
      rarity: 5,
      data: null,
    });
    expect(await operatorResource(combo, 'Sharp')).toMatchObject({
      id: null,
      rarity: null,
      data: null,
    });
    expect(await operatorResource(combo, 'Shared', 'YoStarEN')).toMatchObject({
      name: 'Shared',
      id: null,
      rarity: 4,
      data: null,
    });
    expect(await operatorResource(combo, 'Shared')).toMatchObject({
      id: null,
      rarity: 4,
      data: null,
    });
  });
  test('unknown names, unavailable client metadata and missing artwork retain text fallbacks', async () => {
    expect(await operatorResource({}, '未收录干员')).toEqual({
      name: '未收录干员',
      id: null,
      rarity: null,
      data: null,
      mimeType: null,
      resourceVersion: null,
    });
    const combo = pack({
      'battle_data.json': {
        chars: {
          char_128_plosis: operator,
          char_future: { name: '国服新干员', rarity: 6 },
          char_unknown: { name: '未知星级', rarity: 7 },
        },
      },
    });
    expect(await operatorResource(combo, '白面鸮')).toMatchObject({
      id: 'char_128_plosis',
      rarity: 5,
      data: null,
    });
    expect(await operatorResource(combo, '国服新干员', 'YoStarEN')).toMatchObject({
      id: null,
      rarity: null,
      data: null,
    });
    expect(await operatorResource(combo, '未知星级')).toMatchObject({
      id: 'char_unknown',
      rarity: null,
      data: null,
    });
  });
  test('active generations, rollback and global template overlays keep their resource identity', async () => {
    const first = pack(),
      second = pack({
        'battle_data.json': { chars: { char_128_plosis: { ...operator, rarity: 6 } } },
        'template/avatar/char_128_plosis.png': image,
        'global/YoStarJP/resource/template/avatar/char_128_plosis.png': image,
      });
    second.resource.version = 'synthetic-resource-2';
    expect(await operatorResource(second, 'フィリオプシス', 'YoStarJP')).toMatchObject({
      rarity: 6,
      data: image.toString('base64'),
      resourceVersion: 'synthetic-resource-2',
    });
    expect(await operatorResource(first, '白面鸮')).toMatchObject({
      rarity: 5,
      resourceVersion: 'synthetic-resource-1',
    });
  });
  test('malformed metadata, unsafe IDs, corrupt and oversized images never cross the boundary', async () => {
    for (const data of [
      Buffer.from('{invalid'),
      Buffer.alloc(4 * 1024 * 1024 + 1),
      [],
      { chars: [] },
    ]) {
      expect(await operatorResource(pack({ 'battle_data.json': data }), '白面鸮')).toMatchObject({
        id: null,
        data: null,
      });
    }
    const unsafe = pack({ 'battle_data.json': { chars: { 'char_../outside': operator } } });
    expect(await operatorResource(unsafe, '白面鸮')).toMatchObject({ id: null, data: null });
    for (const png of [
      Buffer.from('not-png'),
      image.subarray(0, 24),
      Buffer.alloc(512 * 1024 + 1),
    ]) {
      expect(
        await operatorResource(
          pack({
            'battle_data.json': { chars: { char_128_plosis: operator } },
            'template/avatar/char_128_plosis.png': png,
          }),
          '白面鸮',
        ),
      ).toMatchObject({ rarity: 5, data: null, mimeType: null });
    }
  });
  test('linked roots and avatar directories cannot redirect reads outside a generation', async () => {
    const outside = pack(),
      linked = temporary();
    symlinkSync(
      path.join(outside.resource.path, 'resource'),
      path.join(linked, 'resource'),
      'junction',
    );
    expect(await operatorResource({ resource: { path: linked } }, '白面鸮')).toMatchObject({
      id: null,
      data: null,
    });
    const combo = pack({ 'battle_data.json': { chars: { char_128_plosis: operator } } });
    mkdirSync(path.join(combo.resource.path, 'resource/template'), { recursive: true });
    symlinkSync(
      path.join(outside.resource.path, 'resource/template/avatar'),
      path.join(combo.resource.path, 'resource/template/avatar'),
      'junction',
    );
    expect(await operatorResource(combo, '白面鸮')).toMatchObject({
      id: 'char_128_plosis',
      data: null,
    });
  });
  test('typed RPC validates requests and reads only the active installed generation', async () => {
    const runtime = new Runtime(temporary(), { calendar: { fetcher: null } });
    runtimes.push(runtime);
    const combo = pack();
    runtime.store.put('active', 'combo', combo);
    const result = await runtime.handle('resources.operator', { name: '白面鸮' });
    expect(validateOperatorResourceResult(result)).toBe(true);
    expect(result).toMatchObject({
      id: 'char_128_plosis',
      rarity: 5,
      data: image.toString('base64'),
    });
    expect(validateOperatorResourceParams({ name: '白面鸮' })).toBe(true);
    for (const params of [
      {},
      { name: '' },
      { name: '白面鸮\n' },
      { name: 'x'.repeat(301) },
      { name: '白面鸮', path: combo.resource.path },
      { name: '白面鸮', clientType: 'invalid' },
    ]) {
      await expect(runtime.handle('resources.operator', params)).rejects.toMatchObject({
        code: -32602,
      });
    }
    runtime.store.put('active', 'combo', {});
    expect(await runtime.handle('resources.operator', { name: '白面鸮' })).toMatchObject({
      id: null,
      rarity: null,
      data: null,
    });
    expect(runtime.workers.size).toBe(0);
  });
});
