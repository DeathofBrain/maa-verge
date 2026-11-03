import { afterEach, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { FakeFramework, frameworkFixtureOptions, seedFrameworkResource } from './framework-fixture';
import { defaultCapture, defaultConnection } from '@backend/modules/settings/models';
import { parseRecognition, recognitionKey } from '@backend/modules/recognition/recognition';
import {
  validateItemResourceParams,
  validateItemResourceResult,
  validateRecognitionParams,
  validateRecognitionResult,
} from '@contracts/validators.js';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const operator = {
  id: 'char_172_svrash',
  name: '银灰',
  own: true,
  elite: 2,
  level: 90,
  potential: 1,
  rarity: 6,
};
// 完整扫描暂停迁移；已有结构化历史只读保留，当前屏识别不得写入完整资料。
async function fixture() {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-recognition-history-'));
  roots.push(root);
  const worker = new FakeFramework();
  const r = new Runtime(
    root,
    frameworkFixtureOptions({ frameworkWorkerFactory: async () => worker }),
  );
  runtimes.push(r);
  seedFrameworkResource(r);
  const device = await r.connectDevice({ address: '127.0.0.1:5555' });
  return { root, r, worker, device };
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
test('unsupported full scans preserve existing client/device history and do not submit native work', async () => {
  const { r, device, worker, root } = await fixture();
  const saved = {
    deviceId: device.id,
    kind: 'depot',
    clientType: 'Official',
    collectedAt: '2026-10-01T00:00:00Z',
    runId: 'old-run',
    items: [{ id: '30012', name: '固源岩', quantity: 12 }],
    operators: [],
  };
  r.store.put('recognition', recognitionKey(device.id, 'Official', 'depot'), saved);
  for (const type of ['Depot', 'OperBox', 'UserDataUpdate']) {
    await r.handle('plan.save', { plan: { id: 'scan', name: '旧扫描', tasks: [{ type }] } });
    await expect(
      r.startRun({ planId: 'scan', deviceId: device.id, requestId: type }),
    ).rejects.toMatchObject({ code: -32010 });
  }
  expect(worker.submitted).toHaveLength(0);
  expect(await r.handle('recognition.get', { deviceId: device.id, kind: 'depot' })).toEqual(saved);
  expect(
    (
      await r.handle('recognition.get', {
        deviceId: device.id,
        kind: 'depot',
        clientType: 'Bilibili',
      })
    ).items,
  ).toEqual([]);
  await r.close();
  const reopened = new Runtime(root, frameworkFixtureOptions());
  runtimes.push(reopened);
  expect(await reopened.handle('recognition.get', { deviceId: device.id, kind: 'depot' })).toEqual(
    saved,
  );
});
test('recognition RPC returns empty persisted knowledge for new devices and rejects arbitrary paths', async () => {
  const { r, device } = await fixture();
  const empty = await r.handle('recognition.get', { deviceId: device.id, kind: 'operators' });
  expect(validateRecognitionResult(empty)).toBe(true);
  expect(empty.operators).toEqual([]);
  await expect(
    r.handle('recognition.get', { deviceId: 'unknown', kind: 'depot' }),
  ).rejects.toMatchObject({ code: -32004 });
  for (const params of [
    { itemId: '../private' },
    { itemId: '30012', resourcePath: 'arbitrary' },
    { itemId: '30012', clientType: 'unknown' },
  ])
    expect(validateItemResourceParams(params)).toBe(false);
});
test('same-name owned forms do not erase explicit unowned operators from a completed scan', () => {
  const owned = { ...operator, id: 'char_owned_form_1', name: '合成多形态干员' };
  const missing = { id: 'char_missing', name: '合成未拥有干员', rarity: 6, own: false };
  const all = [
    owned,
    { ...owned, id: 'char_owned_form_2' },
    missing,
    { ...owned, id: 'char_owned_form_3' },
  ];
  const callback = (all_opers: unknown[]) => ({
    taskchain: 'OperBox',
    what: 'OperBoxInfo',
    details: { done: true, own_opers: [owned], all_opers },
  });
  expect(parseRecognition('OperBox', callback(all))).toEqual({
    items: [],
    operators: [owned, { ...missing, elite: -1, level: -1, potential: -1 }],
  });
  for (const invalid of [
    [...all, missing],
    [...all, { arbitrary: true }],
  ]) {
    expect(parseRecognition('OperBox', callback(invalid))).toEqual({
      items: [],
      operators: [owned],
    });
  }
});

test('recognition parser rejects malformed or oversized callback data and duplicate operator identities', () => {
  const callback = (type: 'Depot' | 'OperBox', details: any) => ({
    taskchain: type,
    what: type === 'Depot' ? 'DepotInfo' : 'OperBoxInfo',
    details,
  });
  for (const data of [
    'null',
    '[]',
    '{}',
    '{"30012":0}',
    '{"30012":2147483648}',
    '{"30012":1.5}',
    '{"30012":true}',
    'invalid',
    JSON.stringify({ ['x'.repeat(201)]: 1 }),
    ' '.repeat(1024 * 1024 + 1),
  ]) {
    expect(parseRecognition('Depot', callback('Depot', { done: true, data }))).toBeUndefined();
  }
  for (const own_opers of [
    [],
    [{ ...operator, elite: 0.5 }],
    [{ ...operator, name: '' }],
    [operator, operator],
    Array.from({ length: 2001 }, (_, index) => ({ ...operator, id: String(index) })),
    Array.from({ length: 2000 }, (_, index) => ({
      ...operator,
      id: String(index),
      name: '🦖'.repeat(300),
    })),
  ]) {
    expect(
      parseRecognition('OperBox', callback('OperBox', { done: true, own_opers })) === undefined,
    ).toBe(true);
  }
  expect(
    parseRecognition('OperBox', callback('OperBox', { done: true, own_opers: [operator] })),
  ).toEqual({ items: [], operators: [operator] });
});
