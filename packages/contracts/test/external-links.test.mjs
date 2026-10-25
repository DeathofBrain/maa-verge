import assert from 'node:assert/strict';
import test from 'node:test';
import { openExternalUrl } from '../src/external-links.ts';

test('external links only dispatch web pages through the desktop browser command', async () => {
  const calls = [];
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, params) => { calls.push([command, params]); } } };
  try {
    const url = 'https://www.bilibili.com/video/BV1example/?p=2#reply';
    await openExternalUrl(url);
    assert.deepEqual(calls, [['open_external_url', { url }]]);
    for (const value of ['file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', 'data:text/html,x', '//example.com', 'https://user:pass@example.com', 'https://user@example.com', 'https://example.com/\nvideo', '', 'x'.repeat(2049)]) {
      await assert.rejects(openExternalUrl(value), /仅支持.*HTTP\(S\)/);
    }
    assert.equal(calls.length, 1);
  } finally { delete globalThis.window; }
});

test('browser launch failures are visible and a missing bridge never silently succeeds', async () => {
  await assert.rejects(openExternalUrl('https://example.com/video'), /未连接桌面运行时/);
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async () => { throw '合成浏览器启动失败'; } } };
  try {
    await assert.rejects(openExternalUrl('https://example.com/video'), /无法打开系统浏览器：合成浏览器启动失败/);
  } finally { delete globalThis.window; }
});
