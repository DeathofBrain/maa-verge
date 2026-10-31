import { makeTemporaryDirectory } from './temporary-directory.mjs';
/** Official Windows seed payloads; reuse the production downloader/extractor/validator. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { withDependencyTar } from './dependency-tar.mjs';
import { extractArchive } from '../../services/backend/src/infrastructure/filesystem/archives.ts';
import { downloadArchive } from '../../services/backend/src/infrastructure/network/download.ts';
import { nativeWorkerPath } from '../../services/backend/src/infrastructure/native/native-path.ts';
import { snapshotIntegrity } from '../../services/backend/src/infrastructure/filesystem/snapshot-integrity.ts';
import {
  runUpdateJob,
  validateNative,
} from '../../services/backend/src/modules/updates/updates.ts';

type LockedArchive = { version: string; url: string; size: number; sha256: string };
export type WindowsComponentsLock = {
  formatVersion: 1;
  platform: 'win32';
  arch: 'x64';
  core: LockedArchive;
  resource: LockedArchive & { coreVersion: string };
  licenses: {
    coreVersion: string;
    sourceCommit: string;
    license: LockedArchive;
    spdx: LockedArchive;
    maaUtils: LockedArchive;
    gpl3: LockedArchive;
    dependencies: LockedArchive;
  };
};
type Validator = (core: string, resource: string, version: string) => Promise<void> | void;
type Options = {
  lockFile: string;
  outputDirectory: string;
  cacheDirectory: string;
  workerPath: string;
};
type Dependencies = {
  /** Only synthetic tests inject these; the CLI always uses the real implementations. */
  validator?: Validator;
  fetcher?: typeof fetch;
  rename?: typeof rename;
  log?: (message: string) => void;
};

const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT';
const pathKey = (value: string) => (process.platform === 'win32' ? value.toLowerCase() : value);

export async function readWindowsComponentsLock(filename: string): Promise<WindowsComponentsLock> {
  const lock = JSON.parse(await readFile(filename, 'utf8'));
  const archive = (value: any) =>
    value &&
    typeof value.version === 'string' &&
    typeof value.url === 'string' &&
    Number.isSafeInteger(value.size) &&
    value.size > 0 &&
    value.size <= 2 * 1024 ** 3 &&
    /^[a-f0-9]{64}$/.test(value.sha256);
  if (
    lock?.formatVersion !== 1 ||
    lock.platform !== 'win32' ||
    lock.arch !== 'x64' ||
    !archive(lock.core) ||
    !archive(lock.resource) ||
    !archive(lock.licenses?.license) ||
    !archive(lock.licenses?.spdx) ||
    !archive(lock.licenses?.maaUtils) ||
    !archive(lock.licenses?.gpl3) ||
    !archive(lock.licenses?.dependencies) ||
    !/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(lock.core.version) ||
    !/^[a-f0-9]{40}$/.test(lock.resource.version) ||
    lock.resource.coreVersion !== lock.core.version ||
    lock.core.url !==
      `https://github.com/MaaAssistantArknights/MaaAssistantArknights/releases/download/${lock.core.version}/MAA-${lock.core.version}-win-x64.zip` ||
    lock.resource.url !==
      `https://codeload.github.com/MaaAssistantArknights/MaaResource/zip/${lock.resource.version}` ||
    lock.licenses.coreVersion !== lock.core.version ||
    !/^[a-f0-9]{40}$/.test(lock.licenses.sourceCommit) ||
    lock.licenses.license.version !== lock.licenses.sourceCommit ||
    lock.licenses.spdx.version !== lock.licenses.sourceCommit ||
    lock.licenses.license.size > 1024 ** 2 ||
    lock.licenses.spdx.size > 1024 ** 2 ||
    lock.licenses.license.url !==
      `https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/${lock.licenses.sourceCommit}/LICENSE` ||
    lock.licenses.spdx.url !==
      `https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/${lock.licenses.sourceCommit}/LICENSE.spdx` ||
    !/^[a-f0-9]{40}$/.test(lock.licenses.maaUtils.version) ||
    lock.licenses.maaUtils.size > 1024 ** 2 ||
    lock.licenses.maaUtils.url !==
      `https://raw.githubusercontent.com/MaaXYZ/MaaUtils/${lock.licenses.maaUtils.version}/LICENSE.md` ||
    lock.licenses.gpl3.version !== '3.0' ||
    lock.licenses.gpl3.size > 1024 ** 2 ||
    lock.licenses.gpl3.url !== 'https://www.gnu.org/licenses/gpl-3.0.txt' ||
    !/^v\d+\.\d+\.\d+$/.test(lock.licenses.dependencies.version) ||
    lock.licenses.dependencies.url !==
      `https://github.com/MaaAssistantArknights/MaaDeps/releases/download/${lock.licenses.dependencies.version}/MaaDeps-x64-windows-devel.tar.xz`
  )
    throw new Error('Windows component lock is invalid or does not pin official immutable sources');
  return lock;
}

async function verifiedArchive(filename: string, source: LockedArchive): Promise<boolean> {
  let info;
  try {
    info = await lstat(filename);
  } catch (error) {
    if (missing(error)) return false;
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size !== source.size)
    throw new Error(`Component archive does not match the locked size: ${filename}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  if (hash.digest('hex') !== source.sha256)
    throw new Error(`Component archive does not match the locked SHA-256: ${filename}`);
  return true;
}

async function plainDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    pathKey(await realpath(directory)) !== pathKey(directory)
  )
    throw new Error('Component build directories must not pass through filesystem links');
}

/** Only delete temporary direct children that this invocation reserved with mkdtemp. */
async function removeTemporary(directory: string, parent: string, prefix: string): Promise<void> {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith(prefix))
    throw new Error('Refusing to remove a path outside the component build directory');
  const info = await lstat(resolved).catch((error) => {
    if (!missing(error)) throw error;
  });
  if (info && (!info.isDirectory() || info.isSymbolicLink()))
    throw new Error('Refusing to remove an unexpected component build path');
  await rm(resolved, { recursive: true, force: true });
}

const legalName = (name: string) =>
  /^(?:licen[cs]es?|copying|copyright|notice|(?:third|3rd)[-_]party(?:[-_](?:licen[cs]es?|notices?))?)(?:[._-].*)?$/i.test(
    name,
  );

const execute = promisify(execFile);
const noticePath =
  /^\.\/vcpkg\/installed\/maa-x64-windows\/share\/([a-z0-9][a-z0-9-]*)\/(copyright|vcpkg\.spdx\.json)$/;
const requiredPorts = [
  'opencv4',
  'maa-onnxruntime',
  'maa-fastdeploy',
  'directml-bin',
  'zlib',
  'boost-asio',
];

/** Extract only fixed notice filenames from the verified official dependency SDK.
 * No executables, archive links or SDK libraries are copied into the payload.
 */
async function dependencyNotices(archive: string, target: string): Promise<void> {
  let tar = 'tar';
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot || process.env.WINDIR;
    if (!systemRoot)
      throw new Error('Windows system root is unavailable for dependency extraction');
    // Git/MSYS tar on PATH has different drive-path and external xz requirements.
    tar = path.join(systemRoot, 'System32', 'tar.exe');
  }
  const options = {
    encoding: 'utf8' as const,
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 8 * 1024 ** 2,
  };
  await withDependencyTar(archive, target, tar, async (input: string) => {
    const listing = await execute(tar, ['-tf', input], options);
    const members = listing.stdout.split(/\r?\n/).filter((entry) => noticePath.test(entry));
    if (new Set(members).size !== members.length)
      throw new Error('Dependency notices contain duplicate paths');
    for (const port of requiredPorts)
      for (const name of ['copyright', 'vcpkg.spdx.json'])
        if (!members.includes(`./vcpkg/installed/maa-x64-windows/share/${port}/${name}`))
          throw new Error(`Official dependency notices are incomplete: ${port}/${name}`);
    const extracted = path.join(target, '_source');
    await mkdir(extracted, { recursive: true });
    await execute(tar, ['-xf', input, '-C', extracted, '--', ...members], options);
    for (const member of members) {
      const [, port, name] = noticePath.exec(member)!;
      const source = path.join(extracted, member);
      const info = await lstat(source);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.nlink !== 1 ||
        info.size <= 0 ||
        info.size > 4 * 1024 ** 2 ||
        pathKey(await realpath(source)) !== pathKey(source)
      )
        throw new Error(`Dependency notice is not a plain bounded file: ${member}`);
      await mkdir(path.join(target, port), { recursive: true });
      await cp(source, path.join(target, port, name), { force: false, errorOnExist: true });
    }
    // This tree is a newly reserved child of the current invocation's staging.
    await rm(extracted, { recursive: true });
  });
}

async function preserveLicenses(core: string, resource: string, extracted: string): Promise<void> {
  const roots: string[] = [];
  for (const entry of await readdir(extracted, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      if ((await lstat(path.join(extracted, entry.name, 'resource'))).isDirectory())
        roots.push(path.join(extracted, entry.name));
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }
  if (roots.length !== 1) throw new Error('Resource archive must contain one official source root');
  const sourceLicense = path.join(roots[0]!, 'LICENSE');
  if (!(await lstat(sourceLicense)).isFile()) throw new Error('MaaResource license is missing');
  await mkdir(path.join(resource, 'licenses/MaaResource'), { recursive: true });
  await cp(sourceLicense, path.join(resource, 'licenses/MaaResource/LICENSE'));

  for (const entry of await readdir(core, { withFileTypes: true })) {
    if (!legalName(entry.name)) continue;
    const target = ['licenses', 'licences', 'notices'].includes(entry.name.toLowerCase())
      ? path.join(resource, entry.name)
      : path.join(resource, 'licenses/MaaCore-archive', entry.name);
    const from = path.join(core, entry.name);
    if (
      entry.isDirectory() &&
      ['licenses', 'licences', 'notices'].includes(entry.name.toLowerCase())
    ) {
      await mkdir(target, { recursive: true });
      for (const child of await readdir(from))
        await cp(path.join(from, child), path.join(target, child), {
          recursive: true,
          force: false,
          errorOnExist: true,
        });
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await cp(from, target, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }
}

export async function prepareWindowsComponentPayloads(
  options: Options,
  dependencies: Dependencies = {},
): Promise<string> {
  const lock = await readWindowsComponentsLock(options.lockFile);
  const output = path.resolve(options.outputDirectory);
  const parent = path.dirname(output);
  const prefix = `.${path.basename(output)}-`;
  const cache = path.resolve(options.cacheDirectory);
  if (output === parent || pathKey(output) === pathKey(cache))
    throw new Error('Component output must be a dedicated build directory');
  await plainDirectory(parent);
  await plainDirectory(cache);
  // mkdir is the cross-process exclusion point; never steal another build's lock.
  const lease = output + '.lock';
  await mkdir(lease);
  let stage: string | undefined;
  let backup: string | undefined;
  let published = false;
  const move = dependencies.rename ?? rename;
  const log = dependencies.log ?? console.log;
  try {
    stage = await makeTemporaryDirectory(path.join(parent, prefix + 'stage-'));
    const archive = async (source: LockedArchive, filename: string) => {
      const target = path.join(cache, filename);
      if (!(await verifiedArchive(target, source))) {
        log(`Downloading pinned official component ${source.version}`);
        await downloadArchive({ ...source, digest: `sha256:${source.sha256}` }, target, () => {}, {
          fetcher: dependencies.fetcher,
        });
        await verifiedArchive(target, source);
      }
      return target;
    };
    const coreArchive = await archive(lock.core, `MAA-${lock.core.version}-win-x64.zip`);
    const resourceArchive = await archive(
      lock.resource,
      `MaaResource-${lock.resource.version}.zip`,
    );
    const license = await archive(
      lock.licenses.license,
      `MaaAssistantArknights-${lock.licenses.sourceCommit}-LICENSE`,
    );
    const spdx = await archive(
      lock.licenses.spdx,
      `MaaAssistantArknights-${lock.licenses.sourceCommit}-LICENSE.spdx`,
    );
    const maaUtilsLicense = await archive(
      lock.licenses.maaUtils,
      `MaaUtils-${lock.licenses.maaUtils.version}-LICENSE.md`,
    );
    const gpl3 = await archive(lock.licenses.gpl3, 'GNU-GPL-3.0.txt');
    const dependenciesArchive = await archive(
      lock.licenses.dependencies,
      `MaaDeps-x64-windows-devel-${lock.licenses.dependencies.version}.tar.xz`,
    );
    const core = path.join(stage, 'core');
    const resource = path.join(stage, 'resource');
    const validator =
      dependencies.validator ??
      ((core, resource, version) =>
        validateNative(core, resource, version, options.workerPath, undefined, false));
    log(`Validating MaaCore ${lock.core.version} with the native worker`);
    await runUpdateJob(
      { channel: 'core', archive: coreArchive, target: core, version: lock.core.version },
      validator,
    );
    log(`Rebasing and validating MaaResource ${lock.resource.version}`);
    await runUpdateJob(
      {
        channel: 'resource',
        archive: resourceArchive,
        target: resource,
        version: lock.resource.version,
        core,
        coreVersion: lock.core.version,
      },
      validator,
    );
    const source = path.join(stage, '_resource-source');
    await extractArchive(resourceArchive, source);
    const coreLicenses = path.join(core, 'licenses');
    await mkdir(path.join(coreLicenses, 'MaaAssistantArknights'), { recursive: true });
    await cp(license, path.join(coreLicenses, 'MaaAssistantArknights/LICENSE'), {
      force: false,
      errorOnExist: true,
    });
    await cp(spdx, path.join(coreLicenses, 'MaaAssistantArknights/LICENSE.spdx'), {
      force: false,
      errorOnExist: true,
    });
    await mkdir(path.join(coreLicenses, 'MaaUtils'), { recursive: true });
    await cp(maaUtilsLicense, path.join(coreLicenses, 'MaaUtils/LICENSE.md'), {
      force: false,
      errorOnExist: true,
    });
    await cp(gpl3, path.join(coreLicenses, 'MaaUtils/GPL-3.0.txt'), {
      force: false,
      errorOnExist: true,
    });
    log(
      `Collecting pinned MaaDeps ${lock.licenses.dependencies.version} native dependency notices`,
    );
    await dependencyNotices(dependenciesArchive, path.join(coreLicenses, 'MaaDeps'));
    await writeFile(path.join(coreLicenses, 'sources.json'), JSON.stringify(lock, null, 2) + '\n', {
      flag: 'wx',
    });
    await preserveLicenses(core, resource, source);
    // Extraction lives inside our newly created staging directory.
    await rm(source, { recursive: true });
    const coreIntegrity = await snapshotIntegrity(core);
    const resourceIntegrity = await snapshotIntegrity(resource);
    const validatedAt = new Date().toISOString();
    for (const [directory, snapshot] of [
      [core, { version: lock.core.version, ...coreIntegrity }],
      [
        resource,
        { version: lock.resource.version, coreVersion: lock.core.version, ...resourceIntegrity },
      ],
    ] as const)
      await writeFile(
        path.join(directory, 'manifest.json'),
        JSON.stringify({ ...snapshot, validatedAt }) + '\n',
      );
    const manifest = {
      formatVersion: 1,
      core: {
        version: lock.core.version,
        directory: 'core',
        installedHash: coreIntegrity.installedHash,
      },
      resource: {
        version: lock.resource.version,
        coreVersion: lock.core.version,
        directory: 'resource',
        installedHash: resourceIntegrity.installedHash,
      },
    };
    await writeFile(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    try {
      const existing = await lstat(output);
      if (!existing.isDirectory() || existing.isSymbolicLink())
        throw new Error('Existing component output must be a plain directory');
      // Only replace an earlier generated payload, never an arbitrary directory.
      const previous = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
      if (
        previous.formatVersion !== 1 ||
        previous.core?.directory !== 'core' ||
        previous.resource?.directory !== 'resource'
      )
        throw new Error('Existing component output is not a generated seed payload');
      backup = await makeTemporaryDirectory(path.join(parent, prefix + 'backup-'));
      await rmdir(backup);
      await move(output, backup);
    } catch (error) {
      if (!missing(error)) throw error;
      // An existing arbitrary directory without a manifest must not be replaced.
      if (await lstat(output).catch(() => undefined)) throw error;
    }
    try {
      await move(stage, output);
      stage = undefined;
      published = true;
    } catch (error) {
      if (backup) {
        try {
          await move(backup, output);
        } catch (restoreError) {
          throw new AggregateError(
            [error, restoreError],
            `Component publishing and restoration failed; previous payload retained at ${backup}`,
          );
        }
        backup = undefined;
      }
      throw error;
    }
    log(`Prepared Windows components: ${output}`);
    return output;
  } finally {
    try {
      if (stage) await removeTemporary(stage, parent, prefix + 'stage-');
      // An unsuccessful restoration leaves the previous payload here for
      // recovery. Only a successfully published replacement grants deletion.
      if (backup && published) await removeTemporary(backup, parent, prefix + 'backup-');
    } finally {
      await rmdir(lease);
    }
  }
}

if (import.meta.main) {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('Windows components require a Windows x64 release build');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  let outputDirectory = path.join(root, 'dist/windows-components');
  let workerPath = nativeWorkerPath();
  for (let index = 2; index < process.argv.length; index += 2) {
    const value = process.argv[index + 1];
    if (!value) throw new Error('Component preparation option is missing its value');
    if (process.argv[index] === '--output') outputDirectory = path.resolve(value);
    else if (process.argv[index] === '--worker') workerPath = path.resolve(value);
    else throw new Error('Unknown component preparation option');
  }
  await prepareWindowsComponentPayloads({
    lockFile: path.join(root, 'tools/windows-components.lock.json'),
    outputDirectory,
    cacheDirectory: path.join(root, '.tools/windows-components/cache'),
    workerPath,
  });
}
