import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { downloadArchive, type DownloadMetadata } from '../src/download.ts';

const proxyKey = /^(?:HTTP|HTTPS|ALL|NO)_PROXY$/i;
let previousProxy: [string, string | undefined][];
let executableRoot: string;
let executable: string;
const roots: string[] = [];
const digest = createHash('sha256').update('data').digest('hex');
const metadata = (mode = 'recover'): DownloadMetadata => ({
  version: 'v1',
  url: `https://example.test/${mode}`,
  size: 4,
  digest: 'sha256:' + digest,
});
const probe = ((_url: string) =>
  new Response('d', {
    status: 206,
    headers: { etag: '"v1"', 'content-range': 'bytes 0-0/4', 'content-length': '1' },
  })) as unknown as typeof fetch;

beforeAll(async () => {
  executableRoot = await mkdtemp(path.join(tmpdir(), 'maaverge-control-fixture-'));
  executable = path.join(executableRoot, process.platform === 'win32' ? 'aria2.exe' : 'aria2');
  const result = Bun.spawnSync([
    process.execPath,
    'build',
    '--compile',
    '--no-compile-autoload-dotenv',
    '--no-compile-autoload-bunfig',
    '--outfile',
    executable,
    path.join(import.meta.dir, 'fixtures/aria2-failure.ts'),
  ]);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
}, 30_000);
beforeEach(() => {
  previousProxy = Object.entries(process.env).filter(([key]) => proxyKey.test(key));
  for (const [key] of previousProxy) delete process.env[key];
});
afterEach(async () => {
  for (const key of Object.keys(process.env)) if (proxyKey.test(key)) delete process.env[key];
  for (const [key, value] of previousProxy) process.env[key] = value;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
afterAll(async () => {
  if (executableRoot) await rm(executableRoot, { recursive: true, force: true });
});

async function destination() {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-control-recovery-'));
  roots.push(root);
  return path.join(root, 'archive.zip');
}
async function seed(file: string, source: DownloadMetadata) {
  await writeFile(file + '.partial', 'da');
  await writeFile(file + '.partial.aria2', 'broken control');
  await writeFile(
    file + '.partial.json',
    JSON.stringify({
      format: 1,
      identity: { version: source.version, url: source.url, size: 4, digest: source.digest },
      engine: 'aria2',
      validator: { header: 'etag', value: '"v1"' },
      total: 4,
    }),
  );
}
const calls = async (file: string) => JSON.parse(await readFile(file + '.partial.calls', 'utf8'));

test('control recovery re-probes the original URL and refreshes signed redirects exactly once', async () => {
  const file = await destination();
  const source = metadata();
  await seed(file, source);
  let probes = 0;
  const fetcher = ((url: string) => {
    if (url === source.url) {
      return new Response(null, {
        status: 302,
        headers: { location: `https://cdn.example.test/recover?signature=${++probes}` },
      });
    }
    return probe(url);
  }) as unknown as typeof fetch;
  expect(await downloadArchive(source, file, () => {}, { aria2Path: executable, fetcher })).toBe(
    digest,
  );
  expect(probes).toBe(2);
  expect(await calls(file)).toEqual([
    { url: 'https://cdn.example.test/recover?signature=1', locale: 'C', lang: 'C' },
    { url: 'https://cdn.example.test/recover?signature=2', locale: 'C', lang: 'C' },
  ]);
  expect(await readFile(file, 'utf8')).toBe('data');
  expect(await Bun.file(file + '.partial.aria2').exists()).toBe(false);
});

test('a repeated control error stops after one restart and removes corrupt partials', async () => {
  const file = await destination();
  await expect(
    downloadArchive(metadata('persistent-control-error'), file, () => {}, {
      aria2Path: executable,
      fetcher: probe,
    }),
  ).rejects.toThrow('续传控制文件无效');
  expect(await calls(file)).toHaveLength(2);
  for (const suffix of ['', '.partial', '.partial.json', '.partial.aria2']) {
    expect(await Bun.file(file + suffix).exists()).toBe(false);
  }
});

test('a generic exit code 1 preserves resumable bytes and never retries or changes engine', async () => {
  const file = await destination();
  await expect(
    downloadArchive(metadata('network-error'), file, () => {}, {
      aria2Path: executable,
      fetcher: probe,
    }),
  ).rejects.toThrow('Got EOF from the server');
  expect(await calls(file)).toHaveLength(1);
  expect(await readFile(file + '.partial', 'utf8')).toBe('da');
  expect(await readFile(file + '.partial.aria2', 'utf8')).toBe('recoverable control');
});

test('a control-file open diagnostic cannot authorize deleting a directory', async () => {
  const file = await destination();
  await expect(
    downloadArchive(metadata('control-is-directory'), file, () => {}, {
      aria2Path: executable,
      fetcher: probe,
    }),
  ).rejects.toThrow('续传控制文件无效');
  expect(await calls(file)).toHaveLength(1);
  expect((await stat(file + '.partial.aria2')).isDirectory()).toBe(true);
  expect(await readFile(file + '.partial', 'utf8')).toBe('da');
});

for (const [key, value] of [
  ['HTTPS_PROXY', 'https://127.0.0.1:9'],
  ['http_proxy', 'https://127.0.0.1:9'],
  ['ALL_PROXY', 'https://127.0.0.1:9'],
  ['no_proxy', '*'],
]) {
  test(`${key}=${value} selects compatible HTTP before loading aria2 partials`, async () => {
    const file = await destination();
    const source = metadata();
    await seed(file, source);
    process.env[key] = value;
    let requests = 0;
    const fetcher = ((_url: string, options: RequestInit) => {
      requests++;
      expect(new Headers(options.headers).has('range')).toBe(false);
      expect(new Headers(options.headers).has('if-range')).toBe(false);
      return new Response('data', { headers: { etag: '"v1"', 'content-length': '4' } });
    }) as unknown as typeof fetch;
    expect(
      await downloadArchive(source, file, () => {}, {
        engine: 'aria2',
        aria2Path: path.join(path.dirname(file), 'missing-aria2'),
        fetcher,
      }),
    ).toBe(digest);
    expect(requests).toBe(1);
    expect(await readFile(file, 'utf8')).toBe('data');
    expect(await Bun.file(file + '.partial.calls').exists()).toBe(false);
    expect(await Bun.file(file + '.partial.aria2').exists()).toBe(false);
  });
}

test('ordinary HTTP proxies keep the selected aria2 engine', async () => {
  const file = await destination();
  process.env.HTTPS_PROXY = 'http://127.0.0.1:9';
  process.env.NO_PROXY = 'localhost,127.0.0.1';
  expect(
    await downloadArchive(metadata(), file, () => {}, { aria2Path: executable, fetcher: probe }),
  ).toBe(digest);
  expect(await calls(file)).toHaveLength(1);
});
