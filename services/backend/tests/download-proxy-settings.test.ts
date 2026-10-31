import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseSettings } from '@backend/modules/settings/models';
import { Runtime } from '@backend/app/runtime';

const runtimes: Runtime[] = [],
  roots: string[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-proxy-settings-'));
  roots.push(root);
  const runtime = new Runtime(root);
  runtimes.push(runtime);
  return { root, runtime };
}

test('missing download proxy settings stay optional until the user saves a policy', async () => {
  expect(parseSettings()).not.toHaveProperty('downloadProxy');
  const { runtime } = await fixture();
  expect(runtime.snapshot().settings).not.toHaveProperty('downloadProxy');
  expect(runtime.store.get('settings', 'main')).not.toHaveProperty('downloadProxy');
});

test('manual HTTP and HTTPS settings trim outer whitespace and preserve authentication', () => {
  for (const [url, normalized] of [
    ['127.0.0.1:7890', 'http://127.0.0.1:7890/'],
    ['proxy.test:7890', 'http://proxy.test:7890/'],
    ['http://127.0.0.1:7890', 'http://127.0.0.1:7890/'],
    ['https://proxy.test:8443/', 'https://proxy.test:8443/'],
    [
      'http://user:fixture-password@proxy.test:8080',
      'http://user:fixture-password@proxy.test:8080/',
    ],
    ['http://[::1]:7890', 'http://[::1]:7890/'],
    ['http://proxy.test', 'http://proxy.test/'],
    ['https://proxy.test:443', 'https://proxy.test/'],
  ]) {
    expect(
      parseSettings({ downloadProxy: { mode: 'manual', url: '  ' + url + '  ' } }).downloadProxy,
    ).toEqual({ mode: 'manual', url: normalized });
  }
});

test('manual validation rejects unsupported protocols, malformed ports and non-root URLs without leaking credentials', () => {
  const secret = 'fixture-private-password';
  for (const url of [
    '',
    'http:proxy.test:7890',
    'socks5://proxy.test:1080',
    'file:///proxy.pac',
    'http://proxy.test:0',
    'http://proxy.test:65536',
    'http://proxy.test:bad',
    'http://proxy.test:7890/path',
    'http://proxy.test:7890?query',
    'http://proxy.test:7890#fragment',
    'http://proxy.test:7890?',
    'http://proxy.test:7890#',
    'http://proxy.\0test:7890',
    'http://proxy.\ntest:7890',
    `http://user:${secret}@proxy.test:bad`,
    `http://user:${secret}@proxy.test:7890/private`,
  ]) {
    let failure: any;
    try {
      parseSettings({ downloadProxy: { mode: 'manual', url } });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain('手动下载代理地址无效');
    expect(JSON.stringify(failure)).not.toContain(secret);
    expect(String(failure)).not.toContain(secret);
  }
});

test('automatic and direct modes discard unused addresses and reject unknown configuration fields', () => {
  for (const mode of ['auto', 'direct'] as const) {
    expect(
      parseSettings({ downloadProxy: { mode, url: 'http://unused:private@localhost:7890' } })
        .downloadProxy,
    ).toEqual({ mode, url: '' });
  }
  for (const downloadProxy of [
    null,
    { mode: 'manual' },
    { mode: 'pac', url: '' },
    { mode: 'auto', url: 7890 },
    { mode: 'auto', url: '', fallbackToDirect: true },
    { mode: 'manual', url: '', command: 'proxy-command' },
  ])
    expect(() => parseSettings({ downloadProxy })).toThrow('请求参数无效');
});

test('saved proxy policy persists, survives older clients and rejects invalid changes atomically', async () => {
  const { root, runtime } = await fixture();
  const downloadProxy = {
    mode: 'manual' as const,
    url: 'http://fixture-user:fixture-private@localhost:7890/',
  };
  const saved = await runtime.handle('settings.save', {
    settings: { ...runtime.snapshot().settings, downloadProxy },
  });
  expect(saved.downloadProxy).toEqual(downloadProxy);
  expect(
    (await runtime.handle('settings.save', { settings: parseSettings({ theme: 'dark' }) }))
      .downloadProxy,
  ).toEqual(downloadProxy);
  await expect(
    runtime.handle('settings.save', {
      settings: { ...saved, downloadProxy: { mode: 'manual', url: 'socks5://invalid:1080' } },
    }),
  ).rejects.toThrow('手动下载代理地址无效');
  expect(runtime.snapshot().settings.downloadProxy).toEqual(downloadProxy);
  expect(JSON.stringify((runtime as any).diagnosticSummary())).not.toContain('fixture-private');
  await runtime.close();
  runtimes.splice(runtimes.indexOf(runtime), 1);
  const restarted = new Runtime(root);
  runtimes.push(restarted);
  expect(restarted.snapshot().settings.downloadProxy).toEqual(downloadProxy);
  const automatic = await restarted.handle('settings.save', {
    settings: {
      ...restarted.snapshot().settings,
      downloadProxy: { mode: 'auto', url: downloadProxy.url },
    },
  });
  expect(automatic.downloadProxy).toEqual({ mode: 'auto', url: '' });
});
