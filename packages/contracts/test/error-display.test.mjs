import assert from 'node:assert/strict';
import test from 'node:test';
import { errorMessage, RuntimeRequestError } from '../src/error-display.ts';

test('bridge errors preserve their code, diagnostic data and original cause', () => {
  const original = JSON.stringify({ code: -32040, message: '设备连接失败', data: 'Error: 未找到 ADB；请选择模拟器内置 ADB' });
  const error = new RuntimeRequestError(original);
  assert.equal(error.message, '设备连接失败：未找到 ADB；请选择模拟器内置 ADB');
  assert.equal(error.code, -32040);
  assert.equal(error.data, 'Error: 未找到 ADB；请选择模拟器内置 ADB');
  assert.equal(error.cause, original);
  assert.equal(errorMessage(error), error.message);
});

test('known ADB evidence produces a specific reason and useful next step', () => {
  assert.match(errorMessage(new Error('error: device unauthorized')), /设备尚未授权 ADB 调试.*确认调试授权/);
  assert.match(errorMessage('error: device offline'), /设备处于离线状态.*重新连接/);
  assert.match(errorMessage('adb: cannot connect to daemon at tcp:5037'), /ADB 服务启动或连接失败.*端口占用/);
  assert.match(errorMessage('spawn /tools/adb ENOENT'), /找不到 ADB 程序.*有效的 ADB 路径/);
});

test('a generic connection failure cannot prove that ADB or the emulator is disabled', () => {
  assert.equal(errorMessage('设备连接失败'), '设备连接失败');
  assert.equal(errorMessage({ message: '设备连接失败', data: { error: '合成未知错误 723' } }), '设备连接失败：合成未知错误 723');
  assert.doesNotMatch(errorMessage('connect ECONNREFUSED 127.0.0.1:5555'), /ADB 未打开|ADB 未开启|模拟器未启动/);
  assert.equal(errorMessage('合成核心连接失败：ADB 地址不可达'), '合成核心连接失败：ADB 地址不可达');
});

test('network and filesystem evidence receives readable Chinese guidance', () => {
  for (const [detail, expected] of [
    ['getaddrinfo ENOTFOUND api.example.invalid', /无法解析服务器地址.*代理设置/],
    ['request timeout', /请求超时/],
    ['TypeError: Failed to fetch', /网络连接失败/],
    ['ENOSPC: no space left on device', /存储空间不足/],
    ['EROFS: read-only file system', /目录是只读/],
    ['EBUSY: resource busy', /文件正被其他程序占用/],
    ["EACCES: permission denied, open 'settings.json'", /访问权限/],
    ["ENOENT: open 'resource/version.json'", /找不到所需文件或程序/],
    ["ENOENT: no such file or directory, open '/tmp/中文目录/x'", /找不到所需文件或程序/],
    ["ADB connection failed: ENOENT, open '/tmp/中文目录/x'", /找不到所需文件或程序/],
  ]) assert.match(errorMessage(detail), expected, detail);
});

test('structured details stay readable without repeated prefixes or object coercion', () => {
  assert.equal(errorMessage({ message: '更新检查失败', data: { message: 'getaddrinfo ENOTFOUND source.invalid' } }), '更新检查失败：无法解析服务器地址，请检查网络、代理设置和服务器地址后重试。');
  assert.equal(errorMessage({ message: 'Error: 自定义具体原因', data: '自定义具体原因' }), '自定义具体原因');
  assert.equal(errorMessage({ message: '设备连接失败', data: { what: 'Connect', details: { ret: false, error: '合成原生连接错误' } } }), '设备连接失败：合成原生连接错误');
  const decorated = '设备连接失败：设备尚未授权 ADB 调试，请在模拟器或设备上允许 USB 调试后重试';
  assert.equal(errorMessage({ message: decorated, data: 'Error: device unauthorized' }), decorated);
  assert.doesNotMatch(errorMessage('failed to start daemon'), /ADB/);
  const circular = {}; circular.cause = circular;
  assert.match(errorMessage(circular), /未返回具体原因/);
  assert.doesNotMatch(errorMessage(undefined), /undefined|\[object Object\]/);
  assert.match(errorMessage({}), /未返回具体原因/);
  assert.match(errorMessage('[object Object]'), /未返回具体原因/);
});
