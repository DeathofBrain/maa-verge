import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/runtime';
import { processRequest } from '../src/entry';

const runtimes: Runtime[] = [];
function runtime(adbExecutable: () => string, installed = true) {
  const instance = new Runtime(mkdtempSync(path.join(tmpdir(), 'maaverge-discovery-')), { adbExecutable });
  runtimes.push(instance);
  if (installed) instance.store.put('active', 'combo', {
    core: { path: 'synthetic-core', version: 'v1' }, resource: { path: 'synthetic-resource', version: 'r1' },
  });
  return instance;
}
const request = (instance: Runtime, method: string) => processRequest(instance, { jsonrpc: '2.0', id: method, method, params: {} });
afterEach(async () => {
  for (const instance of runtimes.splice(0)) { await instance.close(); rmSync(instance.root, { recursive: true, force: true }); }
});

test('device RPC preserves ADB setup diagnostics and releases the automatic discovery lock after failure', async () => {
  let attempts = 0;
  const instance = runtime(() => { attempts++; throw new Error('未找到 ADB；请配置 MAAVERGE_ADB_PATH'); });
  for (const method of ['device.discover', 'device.auto_connect', 'device.auto_connect']) {
    const response = await request(instance, method);
    expect(response.id).toBe(method);
    expect(response.error.code).toBe(-32040);
    expect(response.error.data).toContain('请配置 MAAVERGE_ADB_PATH');
    expect(response.error.message).toBe(method === 'device.discover' ? 'ADB 设备发现失败' : '模拟器自动发现失败');
  }
  expect(attempts).toBe(3); expect(instance.workers.size).toBe(0);
});

test('device auto-connect preserves ADB execution failures through JSON-RPC', async () => {
  // This path never exists: failure precedes any port probe or native worker.
  const instance = runtime(() => path.join(instance.root, 'missing-synthetic-adb'));
  const response = await request(instance, 'device.auto_connect');
  expect(response.error.code).toBe(-32040);
  expect(response.error.message).toBe('模拟器自动发现失败');
  expect(response.error.data).toContain('missing-synthetic-adb');
  expect(instance.workers.size).toBe(0);
});

test('auto-connect without an installed core rejects before resolving ADB', async () => {
  let calls = 0;
  const instance = runtime(() => { calls++; throw new Error('real ADB must not be reached'); }, false);
  const response = await request(instance, 'device.auto_connect');
  expect(response.error.code).toBe(-32040);
  expect(response.error.message).toContain('请先在更新中心安装并启用核心');
  expect(calls).toBe(0);
  expect(instance.workers.size).toBe(0);
});
