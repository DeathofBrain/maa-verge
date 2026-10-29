/** Adopt ordinary local generations, with compatibility for older installer payloads. */
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { releaseVersion } from './release-version';
import { snapshotIntegrity, type SnapshotIntegrity } from './snapshot-integrity';

export interface BundledCore {
  version: string;
  directory: 'core';
  installedHash: string;
}
export interface BundledResource {
  version: string;
  coreVersion: string;
  directory: 'resource';
  installedHash: string;
}
export interface BundledComponents {
  formatVersion: 1;
  core?: BundledCore;
  resource?: BundledResource;
}
export type BundledProgress = {
  stage: 'verifying' | 'copying' | 'checking';
  completed: number;
  total: number;
};
export interface LocalComponentSnapshot {
  version: string;
  coreVersion?: string;
  installedHash: string;
  path: string;
  validatedAt?: string;
  releaseChannel?: 'stable' | 'preview';
}

const invalid = () => new Error('随附组件清单无效，请重新下载安装包');
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const digest = (value: unknown): value is string =>
  typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value);
const version = (value: unknown): value is string =>
  typeof value === 'string' && !/[\r\n]/.test(value) && Boolean(releaseVersion(value));
const pathKey = (value: string) => (process.platform === 'win32' ? value.toLowerCase() : value);

/** Discover completed payloads without trusting a saved absolute installation path. */
export async function readLocalComponentSnapshots(
  directory: string,
  channel: 'core' | 'resource',
): Promise<LocalComponentSnapshot[]> {
  const parent = path.resolve(directory, 'generations');
  try {
    const info = await lstat(parent);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      pathKey(await realpath(parent)) !== pathKey(parent)
    )
      return [];
  } catch {
    return [];
  }
  const snapshots: LocalComponentSnapshot[] = [];
  const entries = await readdir(parent, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (
      !new RegExp(`^${channel}-[a-f0-9]{32}$`).test(entry.name) ||
      !entry.isDirectory() ||
      entry.isSymbolicLink()
    )
      continue;
    const candidate = path.join(parent, entry.name);
    try {
      const filename = path.join(candidate, 'manifest.json');
      const info = await lstat(filename);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.size > 16 * 1024 * 1024 ||
        pathKey(await realpath(filename)) !== pathKey(filename)
      )
        continue;
      const value: unknown = JSON.parse(await readFile(filename, 'utf8'));
      if (
        !record(value) ||
        !digest(value.installedHash) ||
        (channel === 'core'
          ? !version(value.version)
          : typeof value.version !== 'string' ||
            !/^[a-f0-9]{40}$/.test(value.version) ||
            !version(value.coreVersion))
      )
        continue;
      snapshots.push({
        version: value.version as string,
        ...(channel === 'resource' ? { coreVersion: value.coreVersion as string } : {}),
        installedHash: value.installedHash,
        path: candidate,
        ...(typeof value.validatedAt === 'string' ? { validatedAt: value.validatedAt } : {}),
        ...(value.releaseChannel === 'stable' || value.releaseChannel === 'preview'
          ? { releaseChannel: value.releaseChannel }
          : {}),
      });
    } catch {
      /* Damaged or foreign generations never authorize adoption. */
    }
  }
  return snapshots.sort(
    (left, right) =>
      (Date.parse(right.validatedAt ?? '') || 0) - (Date.parse(left.validatedAt ?? '') || 0) ||
      left.path.localeCompare(right.path),
  );
}

async function prepareDestinationParent(directory: string): Promise<void> {
  // Check the nearest existing ancestor before recursive mkdir can follow a
  // junction and create directories outside the configured destination.
  let ancestor = directory;
  for (;;) {
    const info = await lstat(ancestor).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (info) {
      if (
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        pathKey(await realpath(ancestor)) !== pathKey(ancestor)
      )
        throw new Error('组件目标目录不能经过文件系统链接，请在设置中选择其他目录');
      break;
    }
    ancestor = path.dirname(ancestor);
  }
  await mkdir(directory, { recursive: true });
  if (pathKey(await realpath(directory)) !== pathKey(directory))
    throw new Error('组件目标目录不能经过文件系统链接，请在设置中选择其他目录');
}

export async function readBundledComponents(
  directory: string,
): Promise<BundledComponents | undefined> {
  const filename = path.join(directory, 'manifest.json');
  const info = await lstat(filename).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!info) return undefined;
  if (!info.isFile() || info.size > 16 * 1024) throw invalid();
  let value: unknown;
  try {
    value = JSON.parse(await readFile(filename, 'utf8'));
  } catch {
    throw invalid();
  }
  if (!record(value) || value.formatVersion !== 1) throw invalid();
  const result: BundledComponents = { formatVersion: 1 };
  if (value.core !== undefined) {
    const core = value.core;
    if (
      !record(core) ||
      !version(core.version) ||
      core.directory !== 'core' ||
      !digest(core.installedHash)
    )
      throw invalid();
    result.core = {
      version: core.version,
      directory: 'core',
      installedHash: core.installedHash,
    };
  }
  if (value.resource !== undefined) {
    const resource = value.resource;
    if (
      !record(resource) ||
      typeof resource.version !== 'string' ||
      resource.version.length !== 40 ||
      !/^[a-f0-9]{40}$/.test(resource.version) ||
      !version(resource.coreVersion) ||
      resource.directory !== 'resource' ||
      !digest(resource.installedHash)
    )
      throw invalid();
    result.resource = {
      version: resource.version,
      coreVersion: resource.coreVersion,
      directory: 'resource',
      installedHash: resource.installedHash,
    };
  }
  return result;
}

/** A missing payload is a normal unchecked NSIS component. Links are never adopted. */
export async function hasBundledPayload(
  directory: string,
  component: BundledCore | BundledResource,
) {
  const info = await lstat(path.join(directory, component.directory)).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    },
  );
  if (!info) return false;
  if (!info.isDirectory() || info.isSymbolicLink()) throw invalid();
  return true;
}

export async function copyBundledPayload(
  directory: string,
  component: BundledCore | BundledResource,
  destination: string,
  progress?: (value: BundledProgress) => void,
): Promise<SnapshotIntegrity> {
  return copyComponentPayload(
    path.resolve(directory, component.directory),
    component.installedHash,
    destination,
    progress,
  );
}

export async function copyComponentPayload(
  sourceDirectory: string,
  installedHash: string,
  destination: string,
  progress?: (value: BundledProgress) => void,
): Promise<SnapshotIntegrity> {
  const source = path.resolve(sourceDirectory);
  const target = path.resolve(destination);
  const relative = path.relative(source, target);
  if (
    !relative ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))
  )
    throw new Error('组件目标目录不能位于随附组件载荷内，请在设置中选择其他目录');
  progress?.({ stage: 'verifying', completed: 0, total: 0 });
  const verified = await snapshotIntegrity(source, undefined, (completed, total) =>
    progress?.({ stage: 'verifying', completed, total }),
  );
  if (verified.installedHash !== installedHash)
    throw new Error('随附组件完整性校验失败，请重新下载安装包');
  const parent = path.dirname(target);
  await prepareDestinationParent(parent);
  // Reserve a new tree before copying; a collision never grants cleanup rights.
  await mkdir(target);
  try {
    const directories = new Map<string, Promise<void>>([[target, Promise.resolve()]]);
    const prepareDirectory = (directory: string): Promise<void> => {
      const previous = directories.get(directory);
      if (previous) return previous;
      const creating = (async () => {
        await prepareDirectory(path.dirname(directory));
        await mkdir(directory);
      })();
      directories.set(directory, creating);
      return creating;
    };
    let next = 0,
      completed = 0;
    let failed = false;
    progress?.({ stage: 'copying', completed: 0, total: verified.installedFiles.length });
    // fs.cp traverses resource trees serially. The verified inventory lets us
    // copy thousands of independent files with bounded disk work and handles.
    const workers = await Promise.allSettled(
      Array.from({ length: Math.min(16, verified.installedFiles.length) }, async () => {
        while (!failed && next < verified.installedFiles.length) {
          const relative = verified.installedFiles[next++]!;
          try {
            const parts = relative.split('/');
            const from = path.join(source, ...parts);
            const to = path.join(target, ...parts);
            const parent = path.dirname(to);
            await prepareDirectory(parent);
            const [info, resolvedSource, resolvedParent] = await Promise.all([
              lstat(from),
              realpath(from),
              realpath(parent),
            ]);
            if (
              !info.isFile() ||
              info.isSymbolicLink() ||
              pathKey(resolvedSource) !== pathKey(from) ||
              pathKey(resolvedParent) !== pathKey(parent)
            )
              throw new Error('随附组件复制路径发生变化，请重新下载安装包');
            await copyFile(from, to, constants.COPYFILE_EXCL);
            progress?.({
              stage: 'copying',
              completed: ++completed,
              total: verified.installedFiles.length,
            });
          } catch (error) {
            failed = true;
            throw error;
          }
        }
      }),
    );
    // Every in-flight copy and directory creation must finish before cleanup,
    // otherwise a late write could recreate a rejected generation on Windows.
    for (const worker of workers) if (worker.status === 'rejected') throw worker.reason;
    progress?.({ stage: 'checking', completed: 0, total: 0 });
    const integrity = await snapshotIntegrity(target, undefined, (completed, total) =>
      progress?.({ stage: 'checking', completed, total }),
    );
    if (integrity.installedHash !== installedHash)
      throw new Error('随附组件复制后校验失败，请检查磁盘后重启重试');
    return integrity;
  } catch (error) {
    await rm(target, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
