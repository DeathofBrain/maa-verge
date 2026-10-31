// Verify the completed app, before release artifacts can be collected/uploaded.
// A linker signature on Contents/MacOS/maaverge does not seal the .app bundle.
import { access, mkdir, readFile, rmdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTemporaryDirectory } from './test-support/temporary-directory.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function verifyMacosBundle(app) {
  await access(path.join(app, 'Contents', '_CodeSignature', 'CodeResources'));
  const targets = ['maaverge-runtime', 'maaverge-core-worker'].map((name) => [
    path.join(app, 'Contents', 'Resources', 'runtime', name),
    false,
  ]);
  targets.push([app, true]);
  for (const [target, deep] of targets) {
    const args = ['--verify', '--strict', '--verbose=2', ...(deep ? ['--deep'] : []), target];
    const result = spawnSync('codesign', args, { encoding: 'utf8', timeout: 60_000 });
    if (result.error || result.status !== 0) {
      throw new Error(
        `macOS 应用签名校验失败：${target}\n${result.error?.message ?? ''}${result.stdout ?? ''}${result.stderr ?? ''}`,
      );
    }
  }
}

export async function verifyMacosDmg(
  image,
  { runCommand = spawnSync, verifyBundle = verifyMacosBundle } = {},
) {
  const temporary = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-bundle-verify-'));
  const mount = path.join(temporary, 'mount');
  await mkdir(mount);
  let mountAttempted = false;
  const command = (executable, args, input) => {
    const result = runCommand(executable, args, {
      encoding: 'utf8',
      timeout: 60_000,
      input,
    });
    if (result.error || result.status !== 0)
      throw new Error(
        `macOS DMG 校验失败：${result.error?.message ?? ''}${result.stdout ?? ''}${result.stderr ?? ''}`,
      );
    return result.stdout;
  };
  const disk = (args) => command('/usr/bin/hdiutil', args);
  try {
    disk(['verify', image]);
    mountAttempted = true;
    disk(['attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount, image]);
    await verifyBundle(path.join(mount, 'Maa Verge.app'));
  } finally {
    // A failed attach can still leave a mounted device. Preserve its root until
    // detach succeeds or the system inventory confirms this exact mount is absent.
    if (mountAttempted) {
      try {
        disk(['detach', mount]);
      } catch (error) {
        let absent = false;
        try {
          const inventory = JSON.parse(
            command(
              '/usr/bin/plutil',
              ['-convert', 'json', '-o', '-', '-'],
              disk(['info', '-plist']),
            ),
          );
          if (!Array.isArray(inventory?.images)) throw new Error('invalid mount inventory');
          absent = !inventory.images.some((image) => {
            if (!Array.isArray(image?.['system-entities']))
              throw new Error('invalid mount entities');
            return image['system-entities'].some((entity) => entity?.['mount-point'] === mount);
          });
        } catch {
          // An unreadable or malformed inventory cannot authorize cleanup.
        }
        if (!absent)
          throw new Error(`macOS DMG 卸载失败，已保留隔离挂载目录：${mount}`, { cause: error });
      }
    }
    // Empty-directory removal adds a final guard against traversing a mounted tree.
    await rmdir(mount);
    await rmdir(temporary);
  }
}

async function verifyBuild() {
  const bundle = path.join(root, 'apps/desktop/src-tauri/target/release/bundle');
  const app = process.argv[2] ?? path.join(bundle, 'macos/Maa Verge.app');
  if (process.argv[2] || existsSync(app)) {
    await verifyMacosBundle(path.resolve(app));
    return app;
  }
  // Tauri removes the intermediate .app when only the DMG target was requested.
  const { productName, version } = JSON.parse(
    await readFile(path.join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'),
  );
  const architecture = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const image = path.join(bundle, 'dmg', `${productName}_${version}_${architecture}.dmg`);
  await verifyMacosDmg(image);
  return image;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') throw new Error('macOS 应用签名必须在 macOS 宿主上校验');
  verifyBuild()
    .then((target) => {
      console.log(`macOS bundle and runtime signatures verified: ${target}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
