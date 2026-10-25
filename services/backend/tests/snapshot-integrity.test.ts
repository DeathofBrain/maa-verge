import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { snapshotIntegrity } from '../src/snapshot-integrity';

const roots: string[] = [];
async function temp() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'maaverge-integrity-')));
  roots.push(root); return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function payload(root: string) {
  await mkdir(path.join(root, 'resource', 'onnx'), { recursive: true });
  await writeFile(path.join(root, 'MaaCore.dll'), 'synthetic-core');
  await writeFile(path.join(root, 'resource', 'onnx', 'model'), 'model');
  await writeFile(path.join(root, 'resource', 'version.json'), '{}');
}

test('payload integrity is stable across enumeration order and excludes only the top-level manifest', async () => {
  const root = await temp(); await payload(root);
  // Existing manifests must remain valid after changing disk-read concurrency.
  expect((await snapshotIntegrity(root)).installedHash).toBe('5bb414fe8b76933ca73d1c97b18e44106a9fab4bfdd62f1c1a11192967ce55f7');
  await writeFile(path.join(root, 'manifest.json'), 'installation metadata');
  await writeFile(path.join(root, 'resource', 'manifest.json'), 'payload metadata');
  const initial = await snapshotIntegrity(root);
  expect(initial.installedFiles).toEqual(['MaaCore.dll', 'resource/manifest.json', 'resource/onnx/model', 'resource/version.json']);
  expect(initial.installedHash).toMatch(/^[a-f0-9]{64}$/);
  expect(await snapshotIntegrity(root, [...initial.installedFiles].reverse())).toEqual(initial);
  expect(await snapshotIntegrity(root, initial.installedFiles.map(file => file.replaceAll('/', '\\')))).toEqual(initial);
  await writeFile(path.join(root, 'manifest.json'), 'changed installation metadata');
  expect(await snapshotIntegrity(root)).toEqual(initial);
  await writeFile(path.join(root, 'resource', 'manifest.json'), 'changed payload metadata');
  expect((await snapshotIntegrity(root)).installedHash).not.toBe(initial.installedHash);
});

test('failed concurrent verification closes every opened file before candidate cleanup', async () => {
  const root = await temp(), files: string[] = [];
  for (let index = 0; index < 16; index++) {
    const name = 'model-' + index; files.push(name);
    await writeFile(path.join(root, name), Buffer.alloc(256 * 1024, index));
  }
  await expect(snapshotIntegrity(root, ['000-missing', ...files])).rejects.toThrow();
  // Windows refuses this cleanup if verification still owns open file handles.
  await rm(root, { recursive: true });
});

test.each(['same-size', 'empty', 'larger'])('saved payload hashes detect %s content damage', async kind => {
  const root = await temp(); await payload(root);
  const initial = await snapshotIntegrity(root);
  await writeFile(path.join(root, 'resource', 'onnx', 'model'), kind === 'same-size' ? 'other' : kind === 'empty' ? '' : 'larger-model');
  const changed = await snapshotIntegrity(root, initial.installedFiles);
  expect(changed.installedFiles).toEqual(initial.installedFiles);
  expect(changed.installedHash).not.toBe(initial.installedHash);
});

test('hashes describe relative payloads independently of root paths and file creation order', async () => {
  const left = await temp(), right = await temp();
  await writeFile(path.join(left, '模型'), 'model'); await writeFile(path.join(left, 'a'), 'core');
  await writeFile(path.join(right, 'a'), 'core'); await writeFile(path.join(right, '模型'), 'model');
  expect(await snapshotIntegrity(left)).toEqual(await snapshotIntegrity(right));
  const before = await snapshotIntegrity(right);
  await rm(path.join(right, 'a')); await writeFile(path.join(right, 'ab'), 'core');
  expect((await snapshotIntegrity(right)).installedHash).not.toBe(before.installedHash);
});

test('new payload inventory detects added paths, removed paths and renamed paths', async () => {
  const root = await temp(); await payload(root);
  const initial = await snapshotIntegrity(root);
  await writeFile(path.join(root, 'new.dll'), 'new');
  expect((await snapshotIntegrity(root)).installedHash).not.toBe(initial.installedHash);
  await rm(path.join(root, 'resource', 'onnx', 'model'));
  await expect(snapshotIntegrity(root, initial.installedFiles)).rejects.toThrow();
  await writeFile(path.join(root, 'resource', 'onnx', 'renamed'), 'model');
  expect((await snapshotIntegrity(root)).installedHash).not.toBe(initial.installedHash);
});

test.each([
  [], [''], ['.'], ['..'], ['../outside'], ['resource/../outside'], ['/outside'], ['\\outside'],
  ['C:\\outside'], ['C:outside'], ['resource//model'], ['resource/./model'], ['resource/model/'],
  ['resource/\0model'], ['resource/model', 'resource/model'], ['resource/model', 'resource\\model'], ['manifest.json'],
].map(files => ({ files })))('rejects unsafe or duplicate payload list %j', async ({ files }) => {
  const root = await temp(); await payload(root);
  await expect(snapshotIntegrity(root, files)).rejects.toThrow('组件快照完整性校验失败');
});

test('rejects an empty tree or a manifest-only tree as a payload baseline', async () => {
  const root = await temp();
  await expect(snapshotIntegrity(root)).rejects.toThrow('文件清单不能为空');
  await writeFile(path.join(root, 'manifest.json'), '{}');
  await expect(snapshotIntegrity(root)).rejects.toThrow('文件清单不能为空');
});

test('rejects a supplied directory in place of a regular file', async () => {
  const root = await temp(); await payload(root);
  await expect(snapshotIntegrity(root, ['resource/onnx'])).rejects.toThrow('清单条目不是普通文件');
});

test('rejects root and intermediate directory links, including junctions on Windows', async () => {
  const root = await temp(), target = path.join(root, 'target'); await mkdir(target); await payload(target);
  const link = path.join(root, 'linked');
  await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(snapshotIntegrity(link)).rejects.toThrow('目录不能是链接');
  await expect(snapshotIntegrity(root, ['linked/MaaCore.dll'])).rejects.toThrow('目录不能是链接');
  await expect(snapshotIntegrity(root)).rejects.toThrow('文件系统链接');
  await expect(snapshotIntegrity(path.join(link, 'resource'))).rejects.toThrow('目录不能是链接');
});

test('rejects leaf symbolic links when file symlinks are available', async () => {
  const root = await temp(); await payload(root);
  const link = path.join(root, 'linked.dll');
  try { await symlink(path.join(root, 'MaaCore.dll'), link, 'file'); }
  catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) return;
    throw error;
  }
  await expect(snapshotIntegrity(root)).rejects.toThrow('文件系统链接');
  await expect(snapshotIntegrity(root, ['linked.dll'])).rejects.toThrow('清单条目不是普通文件');
});

test.skipIf(process.platform === 'win32')('rejects filesystem sockets without trying to read them', async () => {
  const root = await temp(), socket = path.join(root, 'special');
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve); });
  try {
    await expect(snapshotIntegrity(root)).rejects.toThrow('特殊文件');
    await expect(snapshotIntegrity(root, ['special'])).rejects.toThrow('清单条目不是普通文件');
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('streaming a large payload yields to execution timers', async () => {
  const root = await temp(); await writeFile(path.join(root, 'large-model'), Buffer.alloc(16 * 1024 * 1024, 1));
  let ticks = 0;
  const timer = setInterval(() => { ticks++; }, 0);
  try { await snapshotIntegrity(root); }
  finally { clearInterval(timer); }
  expect(ticks).toBeGreaterThan(0);
});
