/** Build-time resource-only payloads use the same independent source composition as runtime. */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTemporaryDirectory } from './temporary-directory.mjs';
import { downloadArchive } from '../../services/backend/src/infrastructure/network/download.ts';
import { snapshotIntegrity } from '../../services/backend/src/infrastructure/filesystem/snapshot-integrity.ts';
import {
  RESOURCE_BASE_COMMIT,
  runUpdateJob,
} from '../../services/backend/src/modules/updates/updates.ts';

type LockedArchive = { version: string; url: string; size?: number; sha256?: string };
export type WindowsComponentsLock = {
  formatVersion: 2;
  platform: 'win32';
  arch: 'x64';
  base: LockedArchive;
  resource: LockedArchive;
};
type Options = {
  lockFile: string;
  outputDirectory: string;
  cacheDirectory: string;
  workerPath?: string;
};
type Dependencies = {
  fetcher?: typeof fetch;
  rename?: typeof rename;
  log?: (message: string) => void;
};
export async function readWindowsComponentsLock(filename: string): Promise<WindowsComponentsLock> {
  const lock = JSON.parse(await readFile(filename, 'utf8'));
  if (
    lock?.formatVersion !== 2 ||
    lock.platform !== 'win32' ||
    lock.arch !== 'x64' ||
    lock.base?.version !== RESOURCE_BASE_COMMIT ||
    lock.base.url !==
      `https://codeload.github.com/MaaAssistantArknights/MaaAssistantArknights/zip/${RESOURCE_BASE_COMMIT}` ||
    !/^[a-f0-9]{40}$/.test(lock.resource?.version) ||
    lock.resource.url !==
      `https://codeload.github.com/MaaAssistantArknights/MaaResource/zip/${lock.resource.version}` ||
    !/^[a-f0-9]{64}$/.test(lock.resource.sha256) ||
    !Number.isSafeInteger(lock.resource.size) ||
    lock.resource.size <= 0
  )
    throw new Error('Windows resource lock must pin official immutable source archives');
  return lock;
}
async function verifiedArchive(filename: string, source: LockedArchive): Promise<boolean> {
  const info = await lstat(filename).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return;
    throw error;
  });
  if (!info) return false;
  if (!info.isFile() || info.isSymbolicLink() || (source.size && info.size !== source.size))
    throw new Error('Resource archive size does not match its lock');
  if (source.sha256) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filename)) hash.update(chunk);
    if (hash.digest('hex') !== source.sha256)
      throw new Error('Resource archive SHA-256 does not match its lock');
  }
  return true;
}
export async function prepareWindowsComponentPayloads(
  options: Options,
  dependencies: Dependencies = {},
): Promise<string> {
  const lock = await readWindowsComponentsLock(options.lockFile);
  const output = path.resolve(options.outputDirectory),
    parent = path.dirname(output),
    cache = path.resolve(options.cacheDirectory);
  await mkdir(parent, { recursive: true });
  await mkdir(cache, { recursive: true });
  for (const directory of [parent, cache])
    if ((await realpath(directory)) !== directory || (await lstat(directory)).isSymbolicLink())
      throw new Error('Resource output cannot pass through filesystem links');
  const stage = await makeTemporaryDirectory(path.join(parent, '.windows-resources-'));
  const lease = output + '.lock';
  let leaseDirectory = false;
  try {
    // Contention must clean only this invocation's staging tree and preserve the owner's lease.
    await mkdir(lease);
    leaseDirectory = true;
    const archive = async (source: LockedArchive, label: string) => {
      const target = path.join(cache, `${label}-${source.version}.zip`);
      if (!(await verifiedArchive(target, source))) {
        await downloadArchive(
          { ...source, digest: source.sha256 ? 'sha256:' + source.sha256 : undefined },
          target,
          () => {},
          { fetcher: dependencies.fetcher },
        );
        await verifiedArchive(target, source);
      }
      return target;
    };
    const baseArchive = await archive(lock.base, 'official-resource-base');
    const overlay = await archive(lock.resource, 'MaaResource');
    dependencies.log?.('Composing resources and OCR models without downloading a native engine');
    const resource = path.join(stage, 'resource');
    const result = await runUpdateJob({
      channel: 'resource',
      baseArchive,
      archive: overlay,
      target: resource,
      version: lock.resource.version,
      baseResourceVersion: lock.base.version,
    });
    const integrity = await snapshotIntegrity(resource);
    await writeFile(
      path.join(resource, 'manifest.json'),
      JSON.stringify({
        version: lock.resource.version,
        ...result,
        ...integrity,
        validatedAt: new Date().toISOString(),
      }),
    );
    await writeFile(
      path.join(stage, 'manifest.json'),
      JSON.stringify({
        formatVersion: 2,
        resource: {
          version: lock.resource.version,
          baseResourceVersion: lock.base.version,
          directory: 'resource',
          installedHash: integrity.installedHash,
        },
      }),
    );
    // Publish a complete replacement only after every resource and manifest was validated.
    const previous = output + '.previous-' + randomUUID();
    let moved = false;
    try {
      if (await lstat(output).catch(() => undefined)) {
        if ((await realpath(output)) !== output || (await lstat(output)).isSymbolicLink())
          throw new Error('Existing resource output is not an ordinary directory');
        await (dependencies.rename ?? rename)(output, previous);
        moved = true;
      }
      try {
        await (dependencies.rename ?? rename)(stage, output);
      } catch (error) {
        if (moved) await rename(previous, output);
        throw error;
      }
      if (moved) await rm(previous, { recursive: true, force: true });
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
    return output;
  } finally {
    await rm(stage, { recursive: true, force: true });
    if (leaseDirectory) await rm(lease, { recursive: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const options = {
    lockFile: path.join(root, 'tools/windows-components.lock.json'),
    outputDirectory: path.join(root, 'dist/windows-components'),
    cacheDirectory: path.join(root, '.tools/windows-components/cache'),
  };
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = {
      '--output': 'outputDirectory',
      '--cache': 'cacheDirectory',
      '--lock': 'lockFile',
      '--worker': undefined,
    }[process.argv[index]!];
    if (!process.argv[index + 1] || (!key && process.argv[index] !== '--worker'))
      throw new Error('Invalid resource preparation arguments');
    if (key) options[key as keyof typeof options] = path.resolve(process.argv[index + 1]!);
  }
  await prepareWindowsComponentPayloads(options);
}
