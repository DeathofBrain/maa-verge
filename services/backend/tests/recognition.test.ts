import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { defaultCapture, defaultConnection } from '@backend/modules/settings/models';
import { parseRecognition, recognitionKey } from '@backend/modules/recognition/recognition';
import {
  validateItemResourceParams,
  validateItemResourceResult,
  validateRecognitionParams,
  validateRecognitionResult,
} from '@contracts/validators.js';

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
class RecognitionWorker {
  connected = true;
  safeIdle = true;
  events: any[] = [];
  tasks: any[] = [];
  async connect() {
    return { asyncId: 1 };
  }
  async waitConnected() {
    return this.connected && this.safeIdle;
  }
  async task(task: any) {
    this.tasks.push(task);
    this.safeIdle = false;
    return { taskId: this.tasks.length };
  }
  async stop() {
    return { stopping: true };
  }
  async close() {}
  result(type: 'Depot' | 'OperBox', payload: any, extra: any = {}) {
    this.events.push({
      type: 'callback',
      message: 20003,
      details: {
        taskid: this.tasks.length,
        taskchain: type,
        what: type === 'Depot' ? 'DepotInfo' : 'OperBoxInfo',
        details: payload,
        ...extra,
      },
    });
  }
  complete(pending: number[] = [], success = true) {
    this.events.push(
      {
        type: 'callback',
        message: success ? 10002 : 10000,
        details: { taskid: this.tasks.length },
      },
      { type: 'callback', message: 3, details: { taskid: this.tasks.length } },
    );
    this.idle(pending);
  }
  idle(pending: number[] = []) {
    this.safeIdle = !pending.length;
    this.events.push({ type: 'status', running: false, pendingAsync: pending });
  }
}
function fresh(root: string, worker: RecognitionWorker) {
  const r = new Runtime(root, {
    workerFactory: async () => worker,
    adbExecutable: () => 'synthetic-adb',
    validator: async () => {},
    calendar: { fetcher: null },
  });
  runtimes.push(r);
  return r;
}
async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-recognition-'));
  roots.push(root);
  const worker = new RecognitionWorker(),
    r = fresh(root, worker);
  r.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' },
    resource: { path: 'synthetic-resource', version: 'r1' },
  });
  const device = await r.connectDevice({ address: '127.0.0.1:5555' });
  device.state = 'idle';
  r.store.put('device', device.id, device);
  let serial = 0;
  const start = async (type: string, params: any = {}) => {
    const id = 'recognition-' + ++serial;
    await r.handle('plan.save', { plan: { id, name: '合成识别', tasks: [{ type, params }] } });
    return r.startRun({ planId: id, deviceId: device.id, requestId: id });
  };
  const get = (kind: 'depot' | 'operators', clientType?: string) =>
    r.handle('recognition.get', {
      deviceId: device.id,
      kind,
      ...(clientType ? { clientType } : {}),
    });
  return { root, r, worker, device, start, get };
}
afterEach(async () => {
  for (const r of runtimes.splice(0)) await r.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('structured recognition results', () => {
  test('standalone results appear only after successful completion and safe idle, then survive restart', async () => {
    const { root, r, worker, device, start, get } = await fixture();
    expect(await get('depot')).toEqual({
      deviceId: device.id,
      kind: 'depot',
      clientType: 'Official',
      collectedAt: null,
      runId: null,
      items: [],
      operators: [],
    });
    const run = await start('Depot');
    worker.result('Depot', { done: false, data: '{"30012":99}' });
    await r.tick(true);
    expect((await get('depot')).items).toEqual([]);
    worker.result('Depot', { done: true, data: '{"30012":12,"4001":12345}' });
    await r.tick(true);
    expect((await get('depot')).runId).toBeNull();
    worker.complete([42]);
    await r.tick(true);
    expect((await get('depot')).runId).toBeNull();
    worker.idle();
    await r.tick(true);
    const saved = await get('depot');
    expect(validateRecognitionResult(saved)).toBe(true);
    expect(saved).toMatchObject({ runId: run.id, operators: [] });
    expect(saved.items).toEqual(
      expect.arrayContaining([
        { id: '30012', name: '30012', quantity: 12 },
        { id: '4001', name: '4001', quantity: 12345 },
      ]),
    );
    expect(saved.collectedAt).toBeString();
    expect((await get('depot', 'YoStarJP')).items).toEqual([]);
    const second = { ...device, id: 'other-device', address: '127.0.0.1:5557' };
    r.store.put('device', second.id, second);
    expect(
      (await r.handle('recognition.get', { deviceId: second.id, kind: 'depot' })).items,
    ).toEqual([]);
    await r.close();
    runtimes.splice(runtimes.indexOf(r), 1);
    const reopened = fresh(root, new RecognitionWorker());
    expect(
      await reopened.handle('recognition.get', { deviceId: device.id, kind: 'depot' }),
    ).toEqual(saved);
    expect(reopened.workers.size).toBe(0);
  });
  test('combined user data update persists separate proven steps and excludes arbitrary callback extensions', async () => {
    const { r, worker, start, get } = await fixture();
    const run = await start('UserDataUpdate', { operators: true, depot: true, interval: 'always' });
    worker.result('OperBox', {
      done: true,
      own_opers: [{ ...operator, private_note: 'not retained' }],
      all_opers: [{ arbitrary: 'not retained' }],
    });
    worker.complete();
    await r.tick(true);
    const saved = await get('operators');
    expect(saved).toMatchObject({
      kind: 'operators',
      runId: run.id,
      operators: [operator],
      items: [],
    });
    expect(validateRecognitionResult(saved)).toBe(true);
    expect((await get('depot')).runId).toBeNull();
    worker.result('Depot', { done: true, data: '{"30012":7}' });
    worker.complete([], false);
    await r.tick(true);
    expect(r.store.get('run', run.id).status).toBe('failed');
    expect(await get('operators')).toEqual(saved);
    expect((await get('depot')).runId).toBeNull();
    expect(r.devices()[0].dataSync).toEqual({ operatorsAt: saved.collectedAt, depotAt: null });
  });
  for (const evidence of [
    'partial',
    'malformed',
    'wrong-task',
    'wrong-chain',
    'wrong-what',
    'late',
    'failed',
    'queue-only',
    'stopped',
    'worker-exit',
  ]) {
    test(`${evidence} cannot replace the last successful depot result`, async () => {
      const { r, worker, start, get } = await fixture();
      await start('Depot');
      worker.result('Depot', { done: true, data: '{"30012":12}' });
      worker.complete();
      await r.tick(true);
      const saved = await get('depot'),
        run = await start('Depot');
      if (evidence === 'stopped') await r.stopRun(run.id);
      if (evidence === 'late') worker.complete();
      if (evidence !== 'queue-only')
        worker.result(
          'Depot',
          {
            done: evidence !== 'partial',
            data: evidence === 'malformed' ? '{"30012":-1}' : '{"30012":99}',
          },
          evidence === 'wrong-task'
            ? { taskid: 1 }
            : evidence === 'wrong-chain'
              ? { taskchain: 'OperBox' }
              : evidence === 'wrong-what'
                ? { what: 'OperBoxInfo' }
                : {},
        );
      if (evidence === 'worker-exit') worker.events.push({ type: 'exit' });
      else if (evidence === 'queue-only') {
        worker.events.push({
          type: 'callback',
          message: 3,
          details: { taskid: worker.tasks.length },
        });
        worker.idle();
      } else if (evidence !== 'late') worker.complete([], evidence !== 'failed');
      await r.tick(true);
      expect(r.store.get('run', run.id).status).toBe(evidence === 'stopped' ? 'stopped' : 'failed');
      expect(await get('depot')).toEqual(saved);
    });
  }
  test('confirmed account changes invalidate all client caches on only the current device', async () => {
    const { r, worker, device, start, get } = await fixture();
    r.store.put('device_account', device.id, 'A');
    await start('Depot');
    worker.result('Depot', { done: true, data: '{"30012":12}' });
    worker.complete();
    await r.tick(true);
    const original = await get('depot');
    const other = { ...device, id: 'other-device', address: '127.0.0.1:5557' };
    r.store.put('device', other.id, other);
    const otherResult = { ...original, deviceId: other.id };
    r.store.put('recognition', recognitionKey(other.id, 'Official', 'depot'), otherResult);
    r.store.put('recognition', recognitionKey(device.id, 'YoStarJP', 'depot'), {
      ...original,
      clientType: 'YoStarJP',
    });
    await start('StartUp', { client_type: 'Official', account_name: 'B' });
    worker.complete([42]);
    await r.tick(true);
    expect(await get('depot')).toEqual(original);
    worker.idle();
    await r.tick(true);
    expect((await get('depot')).collectedAt).toBeNull();
    expect((await get('depot', 'YoStarJP')).collectedAt).toBeNull();
    expect(await r.handle('recognition.get', { deviceId: other.id, kind: 'depot' })).toEqual(
      otherResult,
    );
    await start('Depot');
    worker.result('Depot', { done: true, data: '{"30012":3}' });
    worker.complete();
    await r.tick(true);
    const updated = await get('depot');
    await start('StartUp', { client_type: 'Official', account_name: 'C' });
    worker.complete([], false);
    await r.tick(true);
    expect(await get('depot')).toEqual(updated);
    expect(r.store.get('device_account', device.id)).toBe('B');
  });
  test('client overrides collect independent snapshots and current client falls back to the profile', async () => {
    const { r, worker, device, start, get } = await fixture();
    await start('Depot');
    worker.result('Depot', { done: true, data: '{"30012":12}' });
    worker.complete();
    await r.tick(true);
    const official = await get('depot');
    await start('Depot', { client_type: 'YoStarJP' });
    worker.result('Depot', { done: true, data: '{"30012":7}' });
    worker.complete();
    await r.tick(true);
    expect(await get('depot')).toEqual(official);
    expect((await get('depot', 'YoStarJP')).items[0].quantity).toBe(7);
    const settings = r.snapshot().settings;
    r.store.put('settings', 'main', {
      ...settings,
      deviceProfiles: [
        {
          id: 'jp-profile',
          name: '日服',
          address: device.address,
          connection: { ...defaultConnection(), address: device.address, clientType: 'YoStarJP' },
          capture: defaultCapture(),
        },
      ],
    });
    r.store.put('device', device.id, {
      ...r.store.get<any>('device', device.id),
      connectionProfileId: 'jp-profile',
    });
    expect((await get('depot')).clientType).toBe('YoStarJP');
    r.store.put('device_client', device.id, 'Official');
    expect(await get('depot')).toEqual(official);
  });
  test('RPC rejects invalid requests and never returns synthetic data for unknown devices', async () => {
    const { r, device, get } = await fixture();
    for (const params of [
      {},
      { deviceId: device.id, kind: 'materials' },
      { deviceId: device.id, kind: 'depot', clientType: 'unknown' },
      { deviceId: device.id, kind: 'depot', path: 'arbitrary' },
    ]) {
      expect(validateRecognitionParams(params)).toBe(false);
      await expect(r.handle('recognition.get', params)).rejects.toMatchObject({ code: -32602 });
    }
    await expect(
      r.handle('recognition.get', { deviceId: 'unknown', kind: 'depot' }),
    ).rejects.toMatchObject({ code: -32004 });
    const empty = await get('operators');
    expect(validateRecognitionResult(empty)).toBe(true);
    expect(validateRecognitionResult({ ...empty, operators: [{ ...operator, level: '90' }] })).toBe(
      false,
    );
    expect(validateItemResourceParams({ itemId: '30012', clientType: 'Official' })).toBe(true);
    for (const params of [
      { itemId: '../private' },
      { itemId: '30012', resourcePath: 'arbitrary' },
      { itemId: '30012', clientType: 'unknown' },
    ])
      expect(validateItemResourceParams(params)).toBe(false);
    expect(
      validateItemResourceResult({
        itemId: '30012',
        name: null,
        mimeType: null,
        data: null,
        resourceVersion: null,
      }),
    ).toBe(true);
  });
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
