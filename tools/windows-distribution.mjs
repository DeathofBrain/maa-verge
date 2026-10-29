/** Windows offline component installer hooks and an allowlisted full ZIP. */
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root, run } from './project.mjs';
import { releaseVersion } from './release-assets.mjs';

const pathKey = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);

async function plainDirectory(directory) {
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    pathKey(await realpath(directory)) !== pathKey(directory)
  )
    throw new Error('Portable build directories must not pass through filesystem links');
}

function nsisPath(value) {
  if (/[\r\n\0]/u.test(value)) throw new Error('Invalid NSIS path');
  return value.replaceAll('$', '$$').replaceAll('"', '$\\"');
}

async function componentGenerations(components) {
  const manifest = JSON.parse(await readFile(path.join(components, 'manifest.json'), 'utf8'));
  if (manifest.formatVersion !== 1) throw new Error('Invalid prepared component manifest');
  return Object.fromEntries(
    ['core', 'resource'].map((channel) => {
      const component = manifest[channel];
      if (component?.directory !== channel || !/^[a-f0-9]{64}$/.test(component.installedHash))
        throw new Error('Invalid prepared component integrity');
      return [channel, `${channel}-${component.installedHash.slice(0, 32)}`];
    }),
  );
}

export async function windowsInstallerConfiguration({
  directory = root,
  components = path.join(directory, 'dist/windows-components'),
} = {}) {
  const generated = path.join(directory, 'dist/windows-installer');
  const generations = await componentGenerations(components);
  await mkdir(generated, { recursive: true });
  const hook = path.join(generated, 'hooks.nsh');
  await writeFile(
    hook,
    '\uFEFF' +
      [
        `!define MAAVERGE_COMPONENTS_DIR "${nsisPath(components)}"`,
        `!define MAAVERGE_CORE_GENERATION "${generations.core}"`,
        `!define MAAVERGE_RESOURCE_GENERATION "${generations.resource}"`,
        `!include "${nsisPath(path.join(directory, 'apps/desktop/src-tauri/installer/hooks.nsh'))}"`,
        '',
      ].join('\n'),
  );
  return { bundle: { targets: ['nsis'], windows: { nsis: { installerHooks: hook } } } };
}

async function copyTree(source, destination) {
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Portable package cannot contain symlinks: ${source}`);
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(source))
      await copyTree(path.join(source, entry), path.join(destination, entry));
  } else if (info.isFile()) await cp(source, destination, { errorOnExist: true, force: false });
  else throw new Error(`Unsupported portable package entry: ${source}`);
}

export async function stageWindowsPortable({ directory = root, executable, staging }) {
  if (!staging || !executable)
    throw new Error('Portable staging and executable paths are required');
  await mkdir(staging, { recursive: false });
  await copyTree(executable, path.join(staging, 'Maa Verge.exe'));
  await copyTree(
    path.join(directory, 'dist/runtime/maaverge-runtime'),
    path.join(staging, 'runtime'),
  );
  const components = path.join(directory, 'dist/windows-components');
  const generations = await componentGenerations(components);
  for (const [channel, name] of Object.entries(generations))
    await copyTree(
      path.join(components, channel),
      path.join(staging, channel === 'core' ? 'MaaCore' : 'MaaResource', 'generations', name),
    );
  await copyTree(path.join(directory, 'LICENSE'), path.join(staging, 'LICENSE'));
  const { version } = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  await writeFile(path.join(staging, 'MaaVerge.portable'), `${version}\n`);
  await writeFile(
    path.join(staging, '使用说明.txt'),
    [
      `Maa Verge ${version} Windows x64 完整版`,
      '',
      '请完整解压到可写目录后运行 Maa Verge.exe，不要直接在压缩包中启动。',
      'MaaCore 和完整 MaaResource 位于默认组件目录，首次启动校验并登记已有版本。',
      '系统需要 Microsoft Edge WebView2 Runtime；尚未安装时请从微软官网安装。',
      '配置默认保存在本目录的 config 文件夹。升级前退出旧版并备份 config 与作业文件。',
      'ZIP 不注册卸载器、开始菜单或自动迁移已有 MSI 安装；旧 MSI 用户应备份后卸载旧版。',
      '组件版本见 MaaCore / MaaResource 的 generations 目录内 manifest.json，来源见组件许可文件。',
      '',
    ].join('\r\n'),
  );
  return staging;
}

export async function createWindowsPortableArchive({ sourceDirectory, archive }) {
  if (process.platform !== 'win32') throw new Error('Windows ZIP creation requires Windows');
  const source = path.resolve(sourceDirectory);
  const destination = path.resolve(archive);
  const parent = path.dirname(destination);
  const relative = path.relative(source, destination);
  if (
    !relative ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))
  )
    throw new Error('Portable archive must be outside the source tree');
  await plainDirectory(source);
  await mkdir(parent, { recursive: true });
  await plainDirectory(parent);
  try {
    const info = await lstat(destination);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.nlink !== 1 ||
      pathKey(await realpath(destination)) !== pathKey(destination)
    )
      throw new Error('Portable archive destination must be a plain file');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Publish only after .NET has finished the ZIP central directory. The unique
  // sibling is owned by this invocation; a failed build preserves the old ZIP.
  const temporary = path.join(parent, `.${path.basename(destination)}-${randomUUID()}.partial`);
  try {
    await run(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(root, 'tools/package-windows-portable.ps1'),
        '-SourceDirectory',
        source,
        '-ArchivePath',
        temporary,
      ],
      { windowsHide: true },
    );
    const info = await lstat(temporary);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.nlink !== 1 ||
      info.size < 22 ||
      pathKey(await realpath(temporary)) !== pathKey(temporary)
    )
      throw new Error('Windows ZIP creation did not produce a complete regular archive');
    await rename(temporary, destination);
  } finally {
    // The resolved parent was checked before reserving this random sibling.
    await rm(temporary, { force: true });
  }
  return destination;
}

export async function packageWindowsPortable({
  directory = root,
  bundleDirectory,
  targetDirectory,
} = {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('Full Windows packages require a Windows x64 host');
  directory = path.resolve(directory);
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const version = releaseVersion(`v${pkg.version}`);
  const target =
    targetDirectory ??
    process.env.CARGO_TARGET_DIR ??
    path.join(directory, 'apps/desktop/src-tauri/target');
  const output = bundleDirectory ?? path.join(target, 'release/bundle');
  const buildDirectory = path.join(directory, 'dist');
  await mkdir(buildDirectory, { recursive: true });
  await plainDirectory(buildDirectory);
  const staging = path.resolve(buildDirectory, `windows-portable-${version}`);
  if (path.dirname(staging) !== buildDirectory)
    throw new Error('Portable staging must remain inside this checkout build directory');
  try {
    await plainDirectory(staging);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Verify both the resolved parent and existing staging tree before deletion.
  await rm(staging, { recursive: true, force: true });
  await stageWindowsPortable({
    directory,
    executable: path.join(target, 'release/maaverge.exe'),
    staging,
  });
  const portable = path.join(output, 'portable');
  await mkdir(portable, { recursive: true });
  const archive = path.join(portable, `Maa-Verge_${version}_x64-full.zip`);
  return createWindowsPortableArchive({ sourceDirectory: staging, archive });
}
