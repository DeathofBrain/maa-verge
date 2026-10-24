// Verify the completed app, before release artifacts can be collected/uploaded.
// A linker signature on Contents/MacOS/maaverge does not seal the .app bundle.
import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function verifyMacosBundle(app) {
  await access(path.join(app, 'Contents', '_CodeSignature', 'CodeResources'));
  const targets = ['maaverge-runtime', 'maaverge-core-worker', 'aria2c']
    .map(name => [path.join(app, 'Contents', 'Resources', 'runtime', name), false]);
  targets.push([app, true]);
  for (const [target, deep] of targets) {
    const args = ['--verify', '--strict', '--verbose=2', ...(deep ? ['--deep'] : []), target];
    const result = spawnSync('codesign', args, { encoding: 'utf8', timeout: 60_000 });
    if (result.error || result.status !== 0) {
      throw new Error(`macOS 应用签名校验失败：${target}\n${result.error?.message ?? ''}${result.stdout ?? ''}${result.stderr ?? ''}`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') throw new Error('macOS 应用签名必须在 macOS 宿主上校验');
  const app = path.resolve(process.argv[2] ?? path.join(root, 'apps/desktop/src-tauri/target/release/bundle/macos/Maa Verge.app'));
  verifyMacosBundle(app).then(() => {
    console.log(`macOS bundle and runtime signatures verified: ${app}`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
