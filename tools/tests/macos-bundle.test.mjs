import { makeTemporaryDirectory } from '../test-support/temporary-directory.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyMacosBundle, verifyMacosDmg } from '../verify-macos-bundle.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

for (const scenario of [
  { name: 'partial attach failure is detached before cleanup', attachFails: true },
  {
    name: 'partial attach failure preserves a volume that remains mounted',
    attachFails: true,
    inventory: 'present',
  },
  {
    name: 'detach failure cleans up only after the volume is confirmed absent',
    inventory: 'absent',
  },
  { name: 'detach failure preserves scratch when the inventory is unreadable', inventory: 'error' },
  {
    name: 'detach failure preserves scratch when the inventory is malformed',
    inventory: 'malformed',
  },
]) {
  test(`DMG verification ${scenario.name}`, async () => {
    let mount;
    let verified = false;
    const calls = [];
    const preserved = scenario.inventory && scenario.inventory !== 'absent';
    const result = (stdout = '') => ({ status: 0, stdout, stderr: '' });
    const failed = () => ({ status: 1, stdout: '', stderr: 'synthetic failure' });
    try {
      const pending = verifyMacosDmg('synthetic.dmg', {
        runCommand(executable, args) {
          calls.push(`${path.basename(executable)}:${args[0]}`);
          if (args[0] === 'verify') return result();
          if (args[0] === 'attach') {
            mount = args[args.indexOf('-mountpoint') + 1];
            if (preserved) writeFileSync(path.join(mount, 'mounted-payload'), 'keep this file');
            return scenario.attachFails ? failed() : result();
          }
          if (args[0] === 'detach') return scenario.inventory ? failed() : result();
          if (args[0] === 'info')
            return scenario.inventory === 'error' ? failed() : result('synthetic plist');
          assert.equal(executable, '/usr/bin/plutil');
          return result(
            JSON.stringify(
              scenario.inventory === 'malformed'
                ? { images: [{}] }
                : {
                    images:
                      scenario.inventory === 'present'
                        ? [{ 'system-entities': [{ 'mount-point': mount }] }]
                        : [],
                  },
            ),
          );
        },
        verifyBundle: async () => {
          verified = true;
        },
      });
      if (preserved) await assert.rejects(pending, /已保留隔离挂载目录/);
      else if (scenario.attachFails) await assert.rejects(pending, /synthetic failure/);
      else await pending;
      assert.equal(verified, !scenario.attachFails);
      assert.ok(calls.includes('hdiutil:detach'), 'every attempted attach must be detached');
      assert.equal(existsSync(path.dirname(mount)), Boolean(preserved));
      if (preserved)
        assert.equal(await readFile(path.join(mount, 'mounted-payload'), 'utf8'), 'keep this file');
    } finally {
      // This fixture never mounts an image; only its synthetic directory is removed.
      if (mount) await rm(path.dirname(mount), { recursive: true, force: true });
    }
  });
}

test(
  'real codesign rejects unsealed and modified apps while preserving side-process permissions',
  { skip: process.platform !== 'darwin' },
  async () => {
    const directory = await makeTemporaryDirectory(
      path.join(os.tmpdir(), 'maa-verge-bundle-signature-'),
    );
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
      const image = path.join(directory, 'verified.dmg');
      const imageSource = path.join(directory, 'dmg-source');
      await cp(app, path.join(imageSource, 'Maa Verge.app'), { recursive: true });
      const created = spawnSync(
        '/usr/bin/hdiutil',
        ['create', '-format', 'UDZO', '-srcfolder', imageSource, image],
        { encoding: 'utf8', timeout: 60_000 },
      );
      assert.equal(
        created.status,
        0,
        `${created.error?.message ?? ''}${created.stdout}${created.stderr}`,
      );
      await verifyMacosDmg(image);
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
