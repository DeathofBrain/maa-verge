import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { recognitionKey } from '@backend/modules/recognition/recognition';
import { validateItemResourceResult, validateRecognitionResult } from '@contracts/validators.js';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQ13X+DwACbQGH9E2oMAAAAABJRU5ErkJggg==';
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('resource RPC reads only active images and enriches warehouse names without changing collected data', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-resource-rpc-'));
  roots.push(root);
  const runtime = new Runtime(root, { calendar: { fetcher: null } });
  runtimes.push(runtime);
  const pack = path.join(root, 'generation');
  mkdirSync(path.join(pack, 'resource/template/items'), { recursive: true });
  writeFileSync(
    path.join(pack, 'resource/item_index.json'),
    JSON.stringify({ '30012': { name: '固源岩', icon: '30012.png' } }),
  );
  writeFileSync(path.join(pack, 'resource/template/items/30012.png'), Buffer.from(png, 'base64'));
  runtime.store.put('active', 'combo', { resource: { path: pack, version: 'resource-1' } });
  const image = await runtime.handle('resources.item', { itemId: '30012' });
  expect(validateItemResourceResult(image)).toBe(true);
  expect(image).toMatchObject({
    name: '固源岩',
    mimeType: 'image/png',
    data: png,
    resourceVersion: 'resource-1',
  });
  for (const params of [
    { itemId: '../private' },
    { itemId: '30012', path: pack },
    { itemId: '30012', clientType: 'invalid' },
  ]) {
    await expect(runtime.handle('resources.item', params)).rejects.toMatchObject({ code: -32602 });
  }
  runtime.store.put('device', 'synthetic-device', {
    id: 'synthetic-device',
    state: 'offline',
    name: '合成设备',
    address: '127.0.0.1:5555',
  });
  const key = recognitionKey('synthetic-device', 'Official', 'depot');
  const saved = {
    deviceId: 'synthetic-device',
    kind: 'depot',
    clientType: 'Official',
    collectedAt: '2026-10-23T08:00:00Z',
    runId: 'synthetic-run',
    items: [
      { id: '30012', name: '30012', quantity: 42 },
      { id: 'unknown', name: 'unknown', quantity: 3 },
    ],
    operators: [],
  };
  runtime.store.put('recognition', key, saved);
  const result = await runtime.handle('recognition.get', {
    deviceId: 'synthetic-device',
    kind: 'depot',
  });
  expect(validateRecognitionResult(result)).toBe(true);
  expect(result.items).toEqual([
    { id: '30012', name: '固源岩', quantity: 42 },
    { id: 'unknown', name: 'unknown', quantity: 3 },
  ]);
  expect(runtime.store.get('recognition', key)).toEqual(saved);
  expect(
    (await runtime.handle('resources.item', { itemId: '30012', clientType: 'YoStarJP' })).data,
  ).toBeNull();
  runtime.store.put('active', 'combo', {});
  expect((await runtime.handle('resources.item', { itemId: '30012' })).data).toBeNull();
  expect(
    (await runtime.handle('recognition.get', { deviceId: 'synthetic-device', kind: 'depot' }))
      .items,
  ).toEqual(saved.items);
});
