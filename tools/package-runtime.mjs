// 组装自包含 Bun 服务、原生 worker 和许可证，校验运行时目录的交付边界。
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  copyFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import { root, run, windows, fail } from './project.mjs';
import { bunVersion, ensureBun, cleanRuntimeEnvironment } from './setup-bun.mjs';
import { buildCoreWorker } from './build-core-worker.mjs';
import { writeRuntimeNotices } from './runtime-notices.mjs';
import { assertWorkspaceDependencies } from './environment.mjs';

async function main() {
  assertWorkspaceDependencies();
  await run('node', ['tools/generate-agent-knowledge.mjs', '--check']);
  const bun = await ensureBun(),
    native = await buildCoreWorker({ testing: false });
  const directory = path.join(root, 'dist/runtime/maaverge-runtime');
  if (!path.resolve(directory).startsWith(path.join(root, 'dist') + path.sep))
    throw new Error('Unexpected runtime build path');
  // 删除仅限受控 dist 子目录，重新组装以排除旧依赖和环境文件。
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const executable = path.join(directory, windows ? 'maaverge-runtime.exe' : 'maaverge-runtime');
  await run(
    bun,
    [
      'build',
      '--compile',
      '--no-compile-autoload-dotenv',
      '--no-compile-autoload-bunfig',
      path.join(root, 'services/backend/src/entry.ts'),
      '--outfile',
      executable,
    ],
    { env: cleanRuntimeEnvironment() },
  );
  // 服务编译成功后加入独立 worker 与许可，再按宿主平台处理签名。
  const worker = path.join(directory, path.basename(native));
  copyFileSync(native, worker);
  writeRuntimeNotices(directory);
  if (process.platform === 'darwin') {
    for (const [file, entitlements] of [
      [executable, 'RuntimeEntitlements.plist'],
      [worker, 'CoreWorkerEntitlements.plist'],
    ]) {
      const args = [
        '--force',
        '--options',
        'runtime',
        '--sign',
        process.env.APPLE_SIGNING_IDENTITY || '-',
      ];
      if (entitlements)
        args.push('--entitlements', path.join(root, 'apps/desktop/src-tauri', entitlements));
      await run('codesign', [...args, file]);
      await run('codesign', ['--verify', '--strict', file]);
    }
  }
  writeFileSync(
    path.join(directory, 'build-info.json'),
    JSON.stringify(
      {
        platform: process.platform,
        arch: process.arch,
        backend: 'typescript',
        bunVersion,
        cppStandard: 20,
        applicationVersion: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
          .version,
      },
      null,
      2,
    ),
  );
  // 用允许列表收口最终目录，防止开发环境或额外依赖意外进入发行包。
  for (const item of readdirSync(directory))
    if (
      ![
        'maaverge-runtime.exe',
        'maaverge-runtime',
        'maaverge-core-worker.exe',
        'maaverge-core-worker',
        'build-info.json',
        'licenses',
      ].includes(item)
    )
      throw new Error('Unexpected environment/dependency in runtime package: ' + item);
  if (!existsSync(executable)) throw new Error('Bun did not produce the runtime executable');
  console.log(`Self-contained TypeScript runtime: ${executable}`);
}
main().catch(fail);
