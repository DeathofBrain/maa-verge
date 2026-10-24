import { afterEach, expect, test } from 'bun:test';
import { rpc } from '../../../packages/contracts/src/transport';
import { RuntimeRequestError } from '../../../packages/contracts/src/error-display';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

function bridge(invoke: (command: string, args: unknown) => Promise<unknown>) {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { __TAURI_INTERNALS__: { invoke } } });
}

async function rejected(cause: unknown): Promise<RuntimeRequestError> {
  bridge(async () => { throw cause; });
  try { await rpc('device.discover'); }
  catch (error) { expect(error).toBeInstanceOf(RuntimeRequestError); return error as RuntimeRequestError; }
  throw new Error('Expected RPC rejection');
}

test('RPC formats the desktop JSON rejection into the same readable error used by device diagnostics and banners', async () => {
  const cause = JSON.stringify({ code: -32040, message: 'ADB 设备发现失败', data: '未找到 ADB；请选择模拟器自带的 adb.exe' });
  const error = await rejected(cause);
  expect(error.message).toBe('ADB 设备发现失败：未找到 ADB；请选择模拟器自带的 adb.exe');
  expect(error.cause).toBe(cause);
  expect(error.code).toBe(-32040);
  expect(error.data).toBe('未找到 ADB；请选择模拟器自带的 adb.exe');
});

test('RPC preserves structured native connection details and the original rejection', async () => {
  const cause = { code: -32040, message: '设备连接失败', data: { what: 'Connect', details: { ret: false, error: '合成原生连接错误', instance: 2 } } };
  const error = await rejected(cause);
  expect(error.message).toBe('设备连接失败：合成原生连接错误');
  expect(error.cause).toBe(cause);
  expect(error.code).toBe(-32040);
  expect(error.data).toBe(cause.data);
});

test('RPC handles bridge text, missing details and non-string details without an object placeholder', async () => {
  for (const [cause, message] of [
    ['桌面运行时未启动', '桌面运行时未启动'],
    ['{invalid JSON', '{invalid JSON'],
    [{ code: -1, message: '请求失败' }, '请求失败'],
    [{ code: -1, message: '请求失败', data: null }, '请求失败'],
    [{ code: -1, message: '请求失败', data: 0 }, '请求失败：0'],
    [{ code: -1, message: '请求失败', data: false }, '请求失败：false'],
    [null, '操作失败，未返回具体原因。请重试；若仍失败，可在设置中导出诊断日志。'],
  ] as const) expect((await rejected(cause)).message).toBe(message);
});

test('RPC preserves the original Error as its cause and successful typed requests', async () => {
  const original = new Error('合成宿主错误', { cause: { details: '原始信息' } });
  const error = await rejected(original);
  expect(error.cause).toBe(original);
  expect(error.message).toBe('合成宿主错误：原始信息');
  const devices = [{ address: 'synthetic-device', name: '合成设备', adbState: 'device' }];
  bridge(async (command, args) => { expect(command).toBe('runtime_request'); expect(args).toEqual({ method: 'device.discover', params: {} }); return devices; });
  expect(await rpc('device.discover')).toBe(devices);
});
