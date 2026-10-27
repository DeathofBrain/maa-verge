/** Keep application SemVer intact while giving RPM prereleases valid metadata. */
import { lstat, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { desktop, run } from './project.mjs';
import { releaseVersion } from './release-assets.mjs';

export function linuxPrereleaseRpm(version) {
  releaseVersion(`v${version}`);
  const separator = version.indexOf('-');
  if (separator < 0) return undefined;
  return {
    version: version.slice(0, separator),
    // RPM rejects '-' in both Version and Release. The leading zero keeps a
    // preview below the same base version's normal Release=1 package.
    release: `0.${version.slice(separator + 1).replaceAll('-', '.')}`,
  };
}

export function linuxBuildArguments(version, platform = process.platform) {
  return platform === 'linux' && linuxPrereleaseRpm(version) ? ['--bundles', 'deb,appimage'] : [];
}

export async function packageLinuxPrereleaseRpm({
  version,
  productName,
  directory = desktop,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  runner = run,
}) {
  if (platform !== 'linux') return;
  const rpm = linuxPrereleaseRpm(version);
  if (!rpm) return;
  const rpmArch = { x64: 'x86_64', arm64: 'aarch64' }[arch];
  if (!rpmArch) throw new Error(`不支持的 Linux RPM 架构：${arch}`);

  // `bundle` reuses the already compiled prerelease executable. The override
  // only changes RPM metadata, never source files or the application's version.
  await runner(
    'pnpm',
    [
      'exec',
      'tauri',
      'bundle',
      '--bundles',
      'rpm',
      '--config',
      JSON.stringify({
        version: rpm.version,
        bundle: { createUpdaterArtifacts: false, linux: { rpm: { release: rpm.release } } },
      }),
    ],
    { cwd: directory },
  );
  const output = path.join(directory, 'src-tauri', 'target', 'release', 'bundle', 'rpm');
  const generated = path.join(
    output,
    `${productName}-${rpm.version}-${rpm.release}.${rpmArch}.rpm`,
  );
  const published = path.join(output, `${productName}-${version}-1.${rpmArch}.rpm`);
  const info = await lstat(generated);
  if (!info.isFile() || info.isSymbolicLink() || info.size === 0)
    throw new Error('RPM 打包产物必须是非空普通文件');
  await rename(generated, published);
  // A repeated unsigned build must not retain an earlier package's signature.
  await rm(`${published}.sig`, { force: true });

  if (env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
    // The signer reads the existing key/password environment variables. Bind
    // the signature to application SemVer rather than RPM's base version.
    await runner('pnpm', ['exec', 'tauri', 'signer', 'sign', '--app-version', version, published], {
      cwd: directory,
    });
  }
  return published;
}
