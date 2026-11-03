import { expect, test } from 'bun:test';
import {
  connectionError,
  nativeStartupError,
} from '@backend/infrastructure/native/connection-errors';

test('known ADB diagnostics explain the cause and next step without guessing the emulator state', () => {
  const cases = [
    ['error: device unauthorized.', '尚未授权'],
    ['error: device offline', '已离线'],
    ['offline', '已离线'],
    ['cannot connect to daemon at tcp:5037: Connection refused', 'ADB 服务未启动或无法访问'],
    ['cannot connect to 127.0.0.1:5555: Connection refused', '地址或端口拒绝连接'],
    ["error: device 'serial' not found", '未找到指定设备'],
    ['connect ETIMEDOUT', '超时'],
  ];
  for (const [raw, expected] of cases) expect(connectionError(new Error(raw))).toContain(expected);
  expect(
    connectionError(
      Object.assign(new Error('Command failed: adb devices -l'), {
        stderr: 'cannot connect to daemon',
      }),
    ),
  ).toContain('ADB 服务未启动或无法访问');
  expect(
    connectionError(
      Object.assign(new Error('Command failed: adb connect'), { killed: true }),
      'adb',
    ),
  ).toContain('响应超时');
  const consoleError = Object.assign(new Error('Command failed: ldconsole list2'), {
    killed: true,
  });
  expect(connectionError(consoleError)).toBe('Command failed: ldconsole list2');
  expect(connectionError('spawn ldconsole.exe EACCES')).toBe('spawn ldconsole.exe EACCES');
  expect(connectionError('ldconsole list2 timed out')).not.toContain('ADB');
  for (const raw of [
    'synthetic native connection error',
    'Connection command failed to exec',
    '* daemon not running; starting now at tcp:5037\n* daemon started successfully',
  ])
    expect(connectionError(raw)).toBe(raw);
});

test('Framework startup diagnostics retain unknown details and identify missing resources', () => {
  expect(nativeStartupError('cannot load resource snapshot')).toContain('资源缺失或加载失败');
  expect(nativeStartupError('device lock busy or unavailable')).toContain('权限');
  expect(nativeStartupError('unknown native failure')).toBe('unknown native failure');
});
