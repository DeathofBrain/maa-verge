import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  downloadArchive,
  type DownloadMetadata,
} from '@backend/infrastructure/network/download.ts';

const roots: string[] = [];
type Sample = { percent: number; speed: number | undefined };
const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const mocked = (fetcher: (...args: any[]) => Response) => fetcher as unknown as typeof fetch;

async function destination() {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-download-speed-'));
  roots.push(root);
  return path.join(root, 'archive.zip');
}

async function waitFor(check: () => boolean, message: string) {
  const deadline = performance.now() + 5_000;
  while (!check()) {
    if (performance.now() >= deadline) throw new Error(message);
    await Bun.sleep(10);
  }
}

function controlledBody() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  return { body, controller };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('unknown-length downloads report changing speed at the same percentage and zero while stalled', async () => {
  const file = await destination(),
    { body, controller } = controlledBody(),
    abort = new AbortController(),
    samples: Sample[] = [],
    bytes = Buffer.alloc(2_048, 7);
  const pending = downloadArchive(
    { url: 'https://example.test/stream', version: 'v1' },
    file,
    (percent, speed) => samples.push({ percent, speed }),
    {
      fetcher: mocked(() => new Response(body)),
      signal: abort.signal,
      retryDelaysMs: [],
    },
  );
  const settled = pending.catch(() => {});
  try {
    await waitFor(() => samples.length > 0, 'Download did not start');
    expect(samples[0]).toEqual({ percent: 25, speed: 0 });
    controller.enqueue(bytes);
    await waitFor(() => samples.some((sample) => (sample.speed ?? 0) > 0), 'No transfer speed');
    const moving = samples.findIndex((sample) => (sample.speed ?? 0) > 0);
    await waitFor(
      () => samples.slice(moving + 1).some((sample) => sample.speed === 0),
      'Stalled transfer did not report zero speed',
    );
    expect(samples.every((sample) => sample.percent === 25)).toBe(true);
    controller.close();
    expect(await pending).toBe(digest(bytes));
    expect(await readFile(file)).toEqual(bytes);
    expect(samples.at(-1)).toEqual({ percent: 90, speed: undefined });
    const count = samples.length;
    await Bun.sleep(600);
    expect(samples).toHaveLength(count);
  } finally {
    abort.abort();
    await settled;
  }
});

test('a failed transfer clears its rate and stops emitting timer callbacks', async () => {
  const file = await destination(),
    { body, controller } = controlledBody(),
    samples: Sample[] = [];
  const pending = downloadArchive(
    { url: 'https://example.test/failure', version: 'v1' },
    file,
    (percent, speed) => samples.push({ percent, speed }),
    { fetcher: mocked(() => new Response(body)), retryDelaysMs: [] },
  );
  const settled = pending.catch(() => {});
  try {
    await waitFor(() => samples.length > 0, 'Download did not start');
    controller.enqueue(Buffer.alloc(1_024));
    await waitFor(() => samples.some((sample) => (sample.speed ?? 0) > 0), 'No transfer speed');
  } finally {
    controller.error(new Error('synthetic connection failure'));
    await settled;
  }
  await expect(pending).rejects.toThrow('synthetic connection failure');
  expect(samples.at(-1)?.speed).toBeUndefined();
  const count = samples.length;
  await Bun.sleep(600);
  expect(samples).toHaveLength(count);
});

test('HTTP resume counts only newly transferred bytes when sampling speed', async () => {
  const file = await destination(),
    cachedBytes = 100 * 1_024,
    bytes = Buffer.alloc(cachedBytes + 1_024, 3),
    metadata: DownloadMetadata = {
      url: 'https://example.test/resume',
      version: 'v1',
      size: bytes.length,
      digest: 'sha256:' + digest(bytes),
    };
  let sent = false;
  await expect(
    downloadArchive(metadata, file, () => {}, {
      retryDelaysMs: [],
      fetcher: mocked(
        () =>
          new Response(
            new ReadableStream<Uint8Array>(
              {
                pull(controller) {
                  if (sent) controller.error(new Error('synthetic disconnect'));
                  else {
                    sent = true;
                    controller.enqueue(bytes.subarray(0, cachedBytes));
                  }
                },
              },
              { highWaterMark: 0 },
            ),
            { headers: { etag: '"v1"', 'content-length': String(bytes.length) } },
          ),
      ),
    }),
  ).rejects.toThrow('synthetic disconnect');
  expect((await stat(file + '.partial')).size).toBe(cachedBytes);

  const { body, controller } = controlledBody(),
    samples: Sample[] = [],
    abort = new AbortController();
  const pending = downloadArchive(
    metadata,
    file,
    (percent, speed) => samples.push({ percent, speed }),
    {
      signal: abort.signal,
      retryDelaysMs: [],
      fetcher: mocked((_url, options) => {
        expect(new Headers(options.headers).get('range')).toBe(`bytes=${cachedBytes}-`);
        expect(new Headers(options.headers).get('if-range')).toBe('"v1"');
        return new Response(body, {
          status: 206,
          headers: {
            etag: '"v1"',
            'content-length': '1024',
            'content-range': `bytes ${cachedBytes}-${bytes.length - 1}/${bytes.length}`,
          },
        });
      }),
    },
  );
  const settled = pending.catch(() => {});
  try {
    await waitFor(() => samples.length > 0, 'Resumed download did not start');
    expect(samples[0]).toEqual({ percent: 89, speed: 0 });
    controller.enqueue(bytes.subarray(cachedBytes));
    await waitFor(() => samples.some((sample) => (sample.speed ?? 0) > 0), 'No resumed speed');
    const rates = samples.flatMap((sample) => (sample.speed ? [sample.speed] : []));
    expect(Math.max(...rates)).toBeLessThanOrEqual(4_096);
    controller.close();
    expect(await pending).toBe(digest(bytes));
    expect(await readFile(file)).toEqual(bytes);
    expect(samples.at(-1)?.speed).toBeUndefined();
  } finally {
    abort.abort();
    await settled;
  }
});
