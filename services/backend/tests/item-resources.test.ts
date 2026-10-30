import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { itemResource, itemResourceNames } from '../src/modules/resources/item-resources';

const roots: string[] = [];
const temporary = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-item-test-'));
  roots.push(root);
  return root;
};
const chunk = (name: string, data: Buffer) => {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(name, 4, 'ascii');
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, result.length - 4)), result.length - 4);
  return result;
};
function png(width = 1, height = 1, raw = Buffer.from([0, 23, 45, 67, 255])) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const image = png();
function pack(
  files: Record<string, unknown> = {
    'item_index.json': { '30012': { name: '固源岩', icon: '30012.png' } },
    'template/items/30012.png': image,
  },
) {
  const root = temporary();
  for (const [relative, value] of Object.entries(files)) {
    const filename = path.join(root, 'resource', relative);
    mkdirSync(path.dirname(filename), { recursive: true });
    writeFileSync(filename, Buffer.isBuffer(value) ? value : JSON.stringify(value));
  }
  return {
    resource: { path: root, version: 'synthetic-resource-1' },
    core: { version: 'v6.20.0' },
  };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('installed item resources', () => {
  test('returns a bounded PNG and verified name from the active resource generation', async () => {
    const combo = pack();
    expect(await itemResource(combo, '30012')).toEqual({
      itemId: '30012',
      name: '固源岩',
      mimeType: 'image/png',
      data: image.toString('base64'),
      resourceVersion: 'synthetic-resource-1',
    });
    expect(await itemResource(combo, '30012', 'Bilibili')).toMatchObject({
      name: '固源岩',
      data: image.toString('base64'),
    });
    expect(await itemResourceNames(combo)).toEqual({ '30012': '固源岩' });
  });
  test('missing resources, unknown items and missing artwork keep a usable text fallback', async () => {
    expect(await itemResource({}, '30012')).toEqual({
      itemId: '30012',
      name: null,
      mimeType: null,
      data: null,
      resourceVersion: null,
    });
    const combo = pack({ 'item_index.json': { '30012': { name: '固源岩' } } });
    expect(await itemResource(combo, '30012')).toMatchObject({
      name: '固源岩',
      mimeType: null,
      data: null,
    });
    expect(await itemResource(combo, 'missing')).toMatchObject({
      name: null,
      mimeType: null,
      data: null,
    });
    expect(await itemResourceNames({})).toEqual({});
  });
  test('selected client names use only its complete index while images overlay shared templates', async () => {
    const overlay = png(1, 1, Buffer.from([0, 255, 0, 0, 255]));
    const combo = pack({
      'item_index.json': {
        '30012': { name: '固源岩', icon: '30012.png' },
        future: { name: '国服新材料', icon: 'future.png' },
      },
      'template/items/30012.png': image,
      'template/items/future.png': image,
      'global/YoStarEN/resource/item_index.json': {
        '30012': { name: 'Orirock Cube', icon: '30012.png' },
      },
      'global/YoStarJP/resource/item_index.json': {
        '30012': { name: '初級源岩', icon: '30012.png' },
      },
      'global/YoStarJP/resource/template/items/30012.png': overlay,
    });
    expect(await itemResource(combo, '30012', 'YoStarEN')).toMatchObject({
      name: 'Orirock Cube',
      data: image.toString('base64'),
    });
    expect(await itemResource(combo, '30012', 'YoStarJP')).toMatchObject({
      name: '初級源岩',
      data: overlay.toString('base64'),
    });
    expect(await itemResource(combo, 'future', 'YoStarEN')).toMatchObject({
      name: null,
      data: null,
    });
    expect(await itemResource(combo, '30012', 'YoStarKR')).toMatchObject({
      name: null,
      data: null,
    });
    expect(await itemResourceNames(combo, 'YoStarEN')).toEqual({ '30012': 'Orirock Cube' });
  });
  test('new active generations and rollback resolve their own artwork and metadata', async () => {
    const first = pack(),
      secondImage = png(1, 1, Buffer.from([0, 0, 0, 255, 255]));
    const second = pack({
      'item_index.json': { '30012': { name: '第二代合成材料', icon: '30012.png' } },
      'template/items/30012.png': secondImage,
    });
    second.resource.version = 'synthetic-resource-2';
    expect((await itemResource(first, '30012')).data).toBe(image.toString('base64'));
    expect(await itemResource(second, '30012')).toMatchObject({
      name: '第二代合成材料',
      data: secondImage.toString('base64'),
      resourceVersion: 'synthetic-resource-2',
    });
    expect((await itemResource(first, '30012')).name).toBe('固源岩');
  });
  test('caller IDs and pack icon aliases cannot introduce paths or Windows device names', async () => {
    const combo = pack({
      'item_index.json': {
        '30012': { name: '固源岩', icon: '../../outside.png' },
        alias: { name: '合法别名', icon: '30012.png' },
      },
      'template/items/30012.png': image,
    });
    for (const itemId of [
      '../30012',
      'C:\\30012',
      '/30012',
      '30012.png',
      '30012:secret',
      '\u000030012',
      'CON',
      'NUL',
      'LPT1',
      'x'.repeat(201),
    ]) {
      expect(await itemResource(combo, itemId)).toMatchObject({ name: null, data: null });
    }
    expect(await itemResource(combo, '30012')).toMatchObject({ name: '固源岩', data: null });
    expect(await itemResource(combo, 'alias')).toMatchObject({
      name: '合法别名',
      data: image.toString('base64'),
    });
  });
  test('corrupt, truncated and decompression-bomb PNGs never cross the image boundary', async () => {
    const badCrc = Buffer.from(image);
    badCrc[badCrc.length - 1] ^= 1;
    for (const value of [
      Buffer.from('not a PNG'),
      image.subarray(0, 24),
      badCrc,
      png(1025),
      png(1, 1, Buffer.from([9, 1, 2, 3, 4])),
      png(1, 1, Buffer.alloc(8 * 1024 * 1024 + 1025)),
    ]) {
      const combo = pack({
        'item_index.json': { '30012': { name: '固源岩' } },
        'template/items/30012.png': value,
      });
      expect(await itemResource(combo, '30012')).toMatchObject({
        name: '固源岩',
        mimeType: null,
        data: null,
      });
    }
  });
  test('oversized artwork and malformed or oversized metadata degrade without throwing', async () => {
    const oversized = pack({
      'item_index.json': { '30012': { name: '固源岩' } },
      'template/items/30012.png': Buffer.alloc(512 * 1024 + 1),
    });
    expect(await itemResource(oversized, '30012')).toMatchObject({ name: '固源岩', data: null });
    for (const value of [
      Buffer.from('{invalid json'),
      Buffer.alloc(4 * 1024 * 1024 + 1),
      [],
      null,
    ]) {
      const combo = pack({ 'item_index.json': value, 'template/items/30012.png': image });
      expect(await itemResource(combo, '30012')).toMatchObject({ name: null, data: null });
    }
  });
  test('directory links cannot redirect resource roots or image directories outside the generation', async () => {
    const outside = pack(),
      linked = temporary();
    symlinkSync(
      path.join(outside.resource.path, 'resource'),
      path.join(linked, 'resource'),
      'junction',
    );
    expect(await itemResource({ resource: { path: linked } }, '30012')).toMatchObject({
      name: null,
      data: null,
    });
    const combo = pack({ 'item_index.json': { '30012': { name: '固源岩' } } });
    symlinkSync(
      path.join(outside.resource.path, 'resource', 'template'),
      path.join(combo.resource.path, 'resource', 'template'),
      'junction',
    );
    expect(await itemResource(combo, '30012')).toMatchObject({ name: '固源岩', data: null });
  });
});
