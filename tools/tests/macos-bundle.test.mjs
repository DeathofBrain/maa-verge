import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyMacosBundle } from '../verify-macos-bundle.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test(
  'real codesign rejects unsealed and modified apps while preserving side-process permissions',
  { skip: process.platform !== 'darwin' },
  async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'maa-verge-bundle-signature-'));
    const app = path.join(directory, 'Maa Verge.app');
    const contents = path.join(app, 'Contents');
    const macos = path.join(contents, 'MacOS');
    const runtime = path.join(contents, 'Resources', 'runtime');
    const sign = (target, entitlements) => {
      const args = [
        '--force',
        '--sign',
        '-',
        '--options',
        'runtime',
        ...(entitlements
          ? ['--entitlements', path.join(root, 'apps/desktop/src-tauri', entitlements)]
          : []),
        target,
      ];
      const result = spawnSync('codesign', args, { encoding: 'utf8', timeout: 30_000 });
      assert.equal(
        result.status,
        0,
        `${result.error?.message ?? ''}${result.stdout}${result.stderr}`,
      );
    };
    const digest = async (file) =>
      createHash('sha256')
        .update(await readFile(file))
        .digest('hex');
    try {
      await mkdir(macos, { recursive: true });
      await mkdir(runtime, { recursive: true });
      // Sign the bare executable first, reproducing the release's missing bundle seal.
      const executable = path.join(directory, 'maaverge');
      await copyFile('/usr/bin/true', executable);
      sign(executable);
      await copyFile(executable, path.join(macos, 'maaverge'));
      await writeFile(
        path.join(contents, 'Info.plist'),
        '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>maaverge</string><key>CFBundleIdentifier</key><string>io.maaverge.signature-test</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>',
      );
      const files = [];
      for (const [name, entitlement] of [
        ['maaverge-runtime', 'RuntimeEntitlements.plist'],
        ['maaverge-core-worker', 'CoreWorkerEntitlements.plist'],
      ]) {
        const file = path.join(runtime, name);
        await copyFile('/usr/bin/true', file);
        sign(file, entitlement);
        files.push([file, await digest(file)]);
      }
      await writeFile(path.join(runtime, 'build-info.json'), '{"fixture":true}');
      await assert.rejects(verifyMacosBundle(app), /CodeResources/);
      sign(app, 'Entitlements.plist');
      await verifyMacosBundle(app);
      for (const [file, hash] of files)
        assert.equal(
          await digest(file),
          hash,
          'outer signing must preserve each side-process signature and entitlements',
        );
      await writeFile(path.join(runtime, 'build-info.json'), '{"tampered":true}');
      await assert.rejects(verifyMacosBundle(app), /签名校验失败/);
      sign(app, 'Entitlements.plist');
      await verifyMacosBundle(app);
      // Re-sealing the outer app cannot hide an invalid runtime signature.
      await writeFile(files[0][0], Buffer.from('not a signed executable'));
      sign(app, 'Entitlements.plist');
      await assert.rejects(verifyMacosBundle(app), /签名校验失败/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
