import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { link, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { makeTemporaryDirectory } from '../test-support/temporary-directory.mjs';
import {
  copyFrameworkSdk,
  frameworkAssets,
  frameworkInventory,
  frameworkTarget,
  prepareFrameworkSdk,
  verifyFrameworkSdk,
  writeFrameworkManifest,
} from '../maafw-assets.mjs';

const target = 'macos-arm64';
async function fixture(run) {
  const root = await makeTemporaryDirectory(path.join(os.tmpdir(), 'maaverge-maafw-assets-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function payload(root) {
  await mkdir(path.join(root, 'bin'), { recursive: true });
  await mkdir(path.join(root, 'share', 'MaaAgentBinary'), { recursive: true });
  await writeFile(path.join(root, 'bin', 'libMaaFramework.dylib'), 'synthetic native library');
  await writeFile(
    path.join(root, 'share', 'MaaAgentBinary', 'LICENSE'),
    'synthetic dependency license',
  );
  await writeFile(path.join(root, 'LICENSE.md'), 'synthetic framework license');
}
test('official target mapping rejects unsupported architecture and preserves pinned hashes', () => {
  assert.equal(frameworkTarget('darwin', 'arm64'), target);
  assert.equal(frameworkTarget('win32', 'x64'), 'windows-x64');
  assert.throws(() => frameworkTarget('linux', 'arm64'), /Unsupported/);
  assert.equal(Object.keys(frameworkAssets.targets).length, 4);
  for (const asset of Object.values(frameworkAssets.targets))
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
});
test('SDK copies all dependencies and detects later payload modification', () =>
  fixture(async (root) => {
    const source = path.join(root, 'source'),
      destination = path.join(root, 'copy');
    await payload(source);
    await writeFrameworkManifest(source, target);
    await copyFrameworkSdk(source, destination, target);
    assert.deepEqual(await frameworkInventory(source), await frameworkInventory(destination));
    assert.equal(
      (await verifyFrameworkSdk(destination, target)).files['licenses/maaverge/COPYING.GPL3']
        .sha256,
      frameworkAssets.supplementalLicenses['COPYING.GPL3'].sha256,
    );
    const provenance = JSON.parse(
      await readFile(path.join(destination, 'licenses/maaverge/provenance.json'), 'utf8'),
    );
    assert.deepEqual(provenance.licenses, frameworkAssets.supplementalLicenses);
    await writeFile(path.join(destination, 'share', 'MaaAgentBinary', 'LICENSE'), 'changed');
    await assert.rejects(verifyFrameworkSdk(destination, target), /integrity mismatch/);
  }));
test('an older verified SDK cache gains fixed license sidecars without downloading or changing native files', () =>
  fixture(async (root) => {
    const directory = path.join(root, 'sdk');
    await payload(directory);
    const manifest = await writeFrameworkManifest(directory, target);
    await rm(path.join(directory, 'licenses'), { recursive: true });
    manifest.files = await frameworkInventory(directory);
    await writeFile(path.join(directory, 'maafw-manifest.json'), JSON.stringify(manifest));
    await assert.rejects(verifyFrameworkSdk(directory, target), /supplemental license/);
    const nativeBefore = await readFile(path.join(directory, 'bin/libMaaFramework.dylib'));
    await prepareFrameworkSdk({
      target,
      directory,
      download: false,
      extract: async () => {
        throw new Error('must not extract');
      },
      fetchAsset: async () => {
        throw new Error('must not download');
      },
    });
    await verifyFrameworkSdk(directory, target);
    assert.deepEqual(
      await readFile(path.join(directory, 'bin/libMaaFramework.dylib')),
      nativeBefore,
    );
  }));
for (const kind of ['symbolic', 'hard'])
  test(`SDK refuses installed ${kind} links`, () =>
    fixture(async (root) => {
      await payload(root);
      const source = path.join(root, 'LICENSE.md'),
        alias = path.join(root, 'COPYING');
      if (kind === 'hard') await link(source, alias);
      else {
        try {
          await symlink('LICENSE.md', alias);
        } catch (error) {
          if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) return;
          throw error;
        }
      }
      await assert.rejects(frameworkInventory(root), /links|independent/);
    }));
test('invalid digest is rejected before extraction and leaves no candidate', () =>
  fixture(async (root) => {
    let extracted = false;
    const directory = path.join(root, 'sdk');
    await assert.rejects(
      prepareFrameworkSdk({
        target,
        directory,
        asset: { name: frameworkAssets.targets[target].name, size: 3, sha256: '0'.repeat(64) },
        fetchAsset: async () => new Response('abc'),
        extract: async () => {
          extracted = true;
        },
      }),
      /SHA-256/,
    );
    assert.equal(extracted, false);
    assert.deepEqual(await readdir(root), []);
  }));
test('concurrent preparations atomically publish one complete fixed SDK', () =>
  fixture(async (root) => {
    const directory = path.join(root, 'sdk');
    const bytes = Buffer.from('synthetic verified archive');
    const options = {
      target,
      directory,
      asset: {
        name: frameworkAssets.targets[target].name,
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      fetchAsset: async () => new Response(bytes),
      extract: async (_archive, destination) => payload(destination),
    };
    const result = await Promise.all([prepareFrameworkSdk(options), prepareFrameworkSdk(options)]);
    assert.deepEqual(result, [directory, directory]);
    const manifest = await verifyFrameworkSdk(directory, target);
    assert.equal(manifest.archiveSha256, frameworkAssets.targets[target].sha256);
    assert.equal(
      await readFile(path.join(directory, 'LICENSE.md'), 'utf8'),
      'synthetic framework license',
    );
  }));
