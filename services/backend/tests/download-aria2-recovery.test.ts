import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { downloadArchive, type DownloadMetadata } from '../src/download.ts';

const aria2 = path.resolve(
  import.meta.dir,
  '../../../.tools/aria2',
  process.platform === 'win32' ? 'aria2c.exe' : 'aria2c',
);
// This suite never prepares or downloads aria2. CI prepares the bundled executable separately.
const realAria2Test = test.skipIf(!existsSync(aria2));
const roots: string[] = [];
const servers: Server[] = [];
const proxyEnvironment = new Map<string, string>();
const options = { engine: 'aria2' as const, idleTimeoutMs: 5_000 };
const etag = '"immutable-aria2-recovery-fixture"';
const payload = Buffer.from('synthetic aria2 control recovery\n'.repeat(4096));
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

beforeEach(() => {
  // Keep both the HTTP probe and the real child confined to the loopback fixture.
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(?:ALL|HTTP|HTTPS|NO)_PROXY$/i.test(key) && value !== undefined) {
      proxyEnvironment.set(key, value);
      delete process.env[key];
    }
  }
});

afterEach(async () => {
  try {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          }),
      ),
    );
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  } finally {
    for (const [key, value] of proxyEnvironment) process.env[key] = value;
    proxyEnvironment.clear();
  }
});

async function destination() {
  const root = await mkdtemp(path.join(tmpdir(), 'maaverge-real-aria2-recovery-'));
  roots.push(root);
  return path.join(root, 'archive with spaces.zip');
}

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

function respond(request: IncomingMessage, response: ServerResponse, bytes = payload) {
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Number(range[2]) : bytes.length - 1;
  if (start > end || end >= bytes.length) {
    response.writeHead(416, { 'content-range': `bytes */${bytes.length}` });
    response.end();
    return;
  }
  response.writeHead(range ? 206 : 200, {
    etag,
    'accept-ranges': 'bytes',
    'content-length': end - start + 1,
    ...(range ? { 'content-range': `bytes ${start}-${end}/${bytes.length}` } : {}),
  });
  response.end(bytes.subarray(start, end + 1));
}

function metadata(url: string, bytes = payload): DownloadMetadata {
  return { version: 'v1', url, size: bytes.length, digest: 'sha256:' + sha256(bytes) };
}

async function corruptControl(destination: string, metadata: DownloadMetadata, control: Buffer) {
  const partial = destination + '.partial';
  await writeFile(partial, payload.subarray(0, 16));
  await writeFile(partial + '.aria2', control);
  await writeFile(
    partial + '.json',
    JSON.stringify({
      format: 1,
      identity: {
        version: metadata.version,
        url: metadata.url,
        size: metadata.size,
        digest: metadata.digest,
      },
      engine: 'aria2',
      validator: { header: 'etag', value: etag },
      total: metadata.size,
    }),
  );
}

for (const [name, control] of [
  ['truncated', Buffer.from([0, 1])],
  ['unsupported version', Buffer.from('corrupt-control')],
] as const) {
  realAria2Test(
    `real bundled aria2 recovers from a control file with ${name} data and refreshes the original source`,
    async () => {
      let sourceRequests = 0;
      const transfers: string[] = [];
      const origin = await listen((request, response) => {
        if (request.url === '/source') {
          response.writeHead(302, { location: `/archive?generation=${++sourceRequests}` });
          response.end();
          return;
        }
        if (request.headers.range !== 'bytes=0-0') transfers.push(request.url!);
        respond(request, response);
      });
      const file = await destination();
      const release = metadata(origin + '/source');
      await corruptControl(file, release, control);

      expect(await downloadArchive(release, file, () => {}, options)).toBe(sha256(payload));
      expect(await readFile(file)).toEqual(payload);
      expect(sourceRequests).toBe(2);
      expect(transfers).toEqual(['/archive?generation=1', '/archive?generation=2']);
      for (const suffix of ['', '.json', '.aria2']) {
        expect(existsSync(file + '.partial' + suffix)).toBe(false);
      }
    },
    15_000,
  );
}

realAria2Test(
  'real bundled aria2 preserves a network interruption and resumes its existing control file',
  async () => {
    const bytes = Buffer.alloc(3 * 1024 * 1024, 0x61);
    let probes = 0;
    let transfers = 0;
    const resumedRanges: number[] = [];
    const origin = await listen((request, response) => {
      if (request.headers.range === 'bytes=0-0') {
        probes++;
        respond(request, response, bytes);
        return;
      }
      transfers++;
      if (transfers === 1) {
        response.writeHead(200, { etag, 'content-length': bytes.length, 'accept-ranges': 'bytes' });
        response.write(bytes.subarray(0, 1024 * 1024 + 128 * 1024), () => {
          setTimeout(() => response.destroy(), 40);
        });
        return;
      }
      const range = /^bytes=(\d+)-/.exec(request.headers.range || '');
      if (range) resumedRanges.push(Number(range[1]));
      respond(request, response, bytes);
    });
    const file = await destination();
    const release = metadata(origin + '/archive', bytes);

    await expect(downloadArchive(release, file, () => {}, options)).rejects.toThrow(
      'aria2 下载失败',
    );
    expect(probes).toBe(1);
    expect(transfers).toBe(1);
    expect(existsSync(file)).toBe(false);
    expect((await stat(file + '.partial')).size).toBeGreaterThan(0);
    expect((await stat(file + '.partial.aria2')).size).toBeGreaterThan(2);
    expect(existsSync(file + '.partial.json')).toBe(true);

    expect(await downloadArchive(release, file, () => {}, options)).toBe(sha256(bytes));
    expect(probes).toBe(2);
    expect(resumedRanges.some((start) => start > 0)).toBe(true);
    expect(await readFile(file)).toEqual(bytes);
    for (const suffix of ['', '.json', '.aria2']) {
      expect(existsSync(file + '.partial' + suffix)).toBe(false);
    }
  },
  15_000,
);
