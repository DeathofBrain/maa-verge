/** Pinned official SDK payloads. No network is used merely by importing this file. */
import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream, lstatSync, readFileSync, realpathSync } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export const frameworkAssets = JSON.parse(
  await readFile(new URL('../3rdparty/maaframework/runtime-assets.json', import.meta.url), 'utf8'),
);
export const frameworkVersion = frameworkAssets.version;
export function frameworkLicenseSupplements(projectRoot = repositoryRoot) {
  return Object.entries(frameworkAssets.supplementalLicenses).map(([name, expected]) => {
    const filename = path.join(projectRoot, '3rdparty', 'maaframework', name);
    const info = lstatSync(filename);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.nlink !== 1 ||
      info.size !== expected.size ||
      key(realpathSync.native(filename)) !== key(filename)
    )
      throw new Error(`MaaFramework supplemental license checksum mismatch: ${name}`);
    const bytes = readFileSync(filename);
    if (createHash('sha256').update(bytes).digest('hex') !== expected.sha256)
      throw new Error(`MaaFramework supplemental license checksum mismatch: ${name}`);
    return { name, bytes, provenance: expected };
  });
}
async function ensureFrameworkLicenses(directory) {
  let changed = false;
  const write = async (relative, bytes) => {
    const filename = path.join(directory, relative);
    await prepareParent(path.dirname(filename));
    try {
      await writeFile(filename, bytes, { flag: 'wx' });
      changed = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const info = await lstat(filename);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.nlink !== 1 ||
        !(await readFile(filename)).equals(bytes)
      )
        throw new Error('MaaFramework supplemental license payload mismatch');
    }
  };
  for (const { name, bytes } of frameworkLicenseSupplements())
    await write(`licenses/maaverge/${name}`, bytes);
  await write(
    'licenses/maaverge/provenance.json',
    Buffer.from(
      JSON.stringify(
        { formatVersion: 1, licenses: frameworkAssets.supplementalLicenses },
        null,
        2,
      ) + '\n',
    ),
  );
  return changed;
}
const key = (value) =>
  process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
export function frameworkTarget(platform = process.platform, architecture = process.arch) {
  const system = { win32: 'windows', darwin: 'macos', linux: 'linux' }[platform];
  const target = `${system}-${architecture}`;
  if (!frameworkAssets.targets[target])
    throw new Error(`Unsupported MaaFramework target: ${target}`);
  return target;
}
export function frameworkSdkDirectory(target = frameworkTarget(), root = repositoryRoot) {
  if (!frameworkAssets.targets[target]) throw new Error('Unknown MaaFramework target');
  return path.join(root, '.tools', 'maafw', frameworkVersion, target);
}
export async function fileHash(filename) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(filename)) hash.update(bytes);
  return hash.digest('hex');
}
async function plainDirectory(directory) {
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    key(await realpath(directory)) !== key(directory)
  )
    throw new Error('MaaFramework path must not contain filesystem links');
}
async function prepareParent(directory) {
  let ancestor = directory;
  for (;;) {
    try {
      await plainDirectory(ancestor);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
  await mkdir(directory, { recursive: true });
  await plainDirectory(directory);
}
function validatePayloadShape(files, target) {
  const library = target.startsWith('windows')
    ? 'MaaFramework.dll'
    : target.startsWith('macos')
      ? 'libMaaFramework.dylib'
      : 'libMaaFramework.so';
  if (
    !files[`bin/${library}`] ||
    !Object.keys(files).some((name) => name.startsWith('share/MaaAgentBinary/')) ||
    !Object.keys(files).some((name) => /licen[cs]e|copying/i.test(name))
  )
    throw new Error('MaaFramework SDK is missing bin, share or license payloads');
}
export async function frameworkInventory(directory) {
  await plainDirectory(directory);
  const files = {};
  const visit = async (current, prefix) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const filename = path.join(current, entry.name);
      const info = await lstat(filename);
      if (info.isSymbolicLink()) throw new Error('MaaFramework payload must not contain links');
      if (info.isDirectory()) {
        await plainDirectory(filename);
        await visit(filename, relative + '/');
      } else if (info.isFile() && info.nlink === 1) {
        if (relative !== 'maafw-manifest.json')
          files[relative] = { size: info.size, sha256: await fileHash(filename) };
      } else throw new Error('MaaFramework payload must contain independent ordinary files');
    }
  };
  await visit(directory, '');
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
export async function writeFrameworkManifest(directory, target) {
  const asset = frameworkAssets.targets[target];
  if (!asset) throw new Error('Unknown MaaFramework target');
  await ensureFrameworkLicenses(directory);
  const files = await frameworkInventory(directory);
  validatePayloadShape(files, target);
  const manifest = {
    formatVersion: 1,
    version: frameworkVersion,
    target,
    source: `https://github.com/${frameworkAssets.repository}/releases/download/${frameworkVersion}/${asset.name}`,
    archiveSha256: asset.sha256,
    files,
  };
  await writeFile(
    path.join(directory, 'maafw-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    { flag: 'w' },
  );
  return manifest;
}
export async function verifyFrameworkSdk(
  directory,
  target = frameworkTarget(),
  { allowMissingSupplements = false } = {},
) {
  await plainDirectory(directory);
  const filename = path.join(directory, 'maafw-manifest.json');
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 4 * 1024 * 1024)
    throw new Error('Invalid MaaFramework manifest');
  const manifest = JSON.parse(await readFile(filename, 'utf8'));
  const asset = frameworkAssets.targets[target];
  if (
    !asset ||
    manifest.formatVersion !== 1 ||
    manifest.version !== frameworkVersion ||
    manifest.target !== target ||
    manifest.archiveSha256 !== asset.sha256
  )
    throw new Error('MaaFramework SDK does not match the pinned asset');
  const files = await frameworkInventory(directory);
  validatePayloadShape(files, target);
  if (!allowMissingSupplements) {
    for (const [name, expected] of Object.entries(frameworkAssets.supplementalLicenses)) {
      const record = files[`licenses/maaverge/${name}`];
      if (!record || record.size !== expected.size || record.sha256 !== expected.sha256)
        throw new Error('MaaFramework SDK supplemental license is missing or invalid');
    }
    if (!files['licenses/maaverge/provenance.json'])
      throw new Error('MaaFramework SDK supplemental license provenance is missing');
  }
  if (JSON.stringify(files) !== JSON.stringify(manifest.files))
    throw new Error('MaaFramework SDK payload integrity mismatch');
  return manifest;
}
export async function prepareFrameworkSdk({
  target = frameworkTarget(),
  directory = frameworkSdkDirectory(target),
  extract,
  download = true,
  fetchAsset = fetch,
  asset = frameworkAssets.targets[target],
} = {}) {
  if (!frameworkAssets.targets[target] || !extract || !asset)
    throw new Error('MaaFramework preparation requires a known target and safe extractor');
  try {
    await verifyFrameworkSdk(directory, target, { allowMissingSupplements: true });
    // Older development caches gain only fixed license sidecars; native payloads remain untouched.
    if (await ensureFrameworkLicenses(directory)) await writeFrameworkManifest(directory, target);
    await verifyFrameworkSdk(directory, target);
    return directory;
  } catch (error) {
    if (await lstat(directory).catch(() => undefined)) throw error;
  }
  if (!download)
    throw new Error('Pinned MaaFramework SDK is missing; run node tools/prepare-maafw.mjs');
  await prepareParent(path.dirname(directory));
  const staging = `${directory}.prepare-${randomUUID()}`;
  const archive = `${staging}.zip`;
  await mkdir(staging);
  try {
    const url = `https://github.com/${frameworkAssets.repository}/releases/download/${frameworkVersion}/${asset.name}`;
    const response = await fetchAsset(url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
    if (!response.ok || !response.body)
      throw new Error(`MaaFramework download failed: HTTP ${response.status}`);
    const { open } = await import('node:fs/promises');
    const output = await open(archive, 'wx');
    const hash = createHash('sha256');
    let size = 0;
    try {
      for await (const bytes of response.body) {
        size += bytes.length;
        if (size > asset.size) throw new Error('MaaFramework download exceeds pinned size');
        hash.update(bytes);
        await output.writeFile(bytes);
      }
      await output.sync();
    } finally {
      await output.close();
    }
    if (size !== asset.size || hash.digest('hex') !== asset.sha256)
      throw new Error('MaaFramework archive SHA-256 mismatch');
    await extract(archive, staging);
    await writeFrameworkManifest(staging, target);
    try {
      await rename(staging, directory);
    } catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error;
      await verifyFrameworkSdk(directory, target);
    }
    return directory;
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(archive, { force: true });
  }
}
export async function copyFrameworkSdk(source, destination, target = frameworkTarget()) {
  const manifest = await verifyFrameworkSdk(source, target);
  await mkdir(destination, { recursive: false });
  try {
    for (const relative of Object.keys(manifest.files)) {
      const from = path.join(source, relative);
      const to = path.join(destination, relative);
      await mkdir(path.dirname(to), { recursive: true });
      await copyFile(from, to, constants.COPYFILE_EXCL);
      const { chmod } = await import('node:fs/promises');
      await chmod(to, (await lstat(from)).mode & 0o777);
    }
    await writeFrameworkManifest(destination, target);
    return destination;
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}
