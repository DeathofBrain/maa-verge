import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { downloadArchive } from '../src/infrastructure/network/download.ts';

const roots: string[] = [];
const payload = Buffer.from('verified archive');
const digest = createHash('sha256').update(payload).digest('hex');
const metadata = {
  version: 'v1',
  url: 'https://example.test/archive',
  size: payload.length,
  digest: 'sha256:' + digest,
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

for (const controlFile of [true, false]) {
  test(`legacy aria2 sparse bytes are discarded with control file ${controlFile}`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'maaverge-legacy-download-'));
    roots.push(root);
    const destination = path.join(root, 'archive.zip');
    // aria2 can preallocate the full length with holes; file size is not a prefix.
    await writeFile(destination + '.partial', Buffer.alloc(payload.length));
    if (controlFile) await writeFile(destination + '.partial.aria2', 'legacy control');
    await writeFile(
      destination + '.partial.json',
      JSON.stringify({
        format: 1,
        engine: 'aria2',
        identity: metadata,
        validator: { header: 'etag', value: '"v1"' },
        total: payload.length,
      }),
    );
    let requests = 0;
    const fetcher = ((_url: string, options: RequestInit) => {
      requests++;
      const headers = new Headers(options.headers);
      expect(headers.has('range')).toBe(false);
      expect(headers.has('if-range')).toBe(false);
      return new Response(payload, {
        headers: { etag: '"v1"', 'content-length': String(payload.length) },
      });
    }) as unknown as typeof fetch;

    expect(await downloadArchive(metadata, destination, () => {}, { fetcher })).toBe(digest);
    expect(requests).toBe(1);
    expect(await readFile(destination)).toEqual(payload);
    for (const suffix of ['.partial', '.partial.json', '.partial.aria2']) {
      expect(await Bun.file(destination + suffix).exists()).toBe(false);
    }
  });
}

test('existing built-in HTTP partials still resume after the downloader migration', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-existing-download-'));
  roots.push(root);
  const destination = path.join(root, 'archive.zip');
  await writeFile(destination + '.partial', payload.subarray(0, 4));
  await writeFile(
    destination + '.partial.json',
    JSON.stringify({
      format: 1,
      engine: 'builtin',
      identity: metadata,
      validator: { header: 'etag', value: '"v1"' },
      total: payload.length,
    }),
  );
  const fetcher = ((_url: string, options: RequestInit) => {
    expect(new Headers(options.headers).get('range')).toBe('bytes=4-');
    expect(new Headers(options.headers).get('if-range')).toBe('"v1"');
    return new Response(payload.subarray(4), {
      status: 206,
      headers: {
        etag: '"v1"',
        'content-range': `bytes 4-${payload.length - 1}/${payload.length}`,
      },
    });
  }) as unknown as typeof fetch;

  expect(await downloadArchive(metadata, destination, () => {}, { fetcher })).toBe(digest);
  expect(await readFile(destination)).toEqual(payload);
});
