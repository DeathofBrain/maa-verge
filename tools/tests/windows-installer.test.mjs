import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  packageWindowsPortable,
  createWindowsPortableArchive,
  stageWindowsPortable,
  windowsInstallerConfiguration,
} from '../windows-distribution.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tauriRoot = path.join(projectRoot, 'apps/desktop/src-tauri');
const configuration = JSON.parse(readFileSync(path.join(tauriRoot, 'tauri.conf.json'), 'utf8'));
const windows = process.platform === 'win32';
const toolRoot = path.join(process.env.LOCALAPPDATA || '', 'tauri');
const nsis = process.env.MAAVERGE_NSIS_COMPILER || path.join(toolRoot, 'NSIS/makensis.exe');

function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'maa verge installer-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function available(t, files) {
  if (windows && files.every(existsSync)) return true;
  if (windows && process.env.MAAVERGE_INSTALLER_TOOLS_REQUIRED === '1') {
    assert.fail(`Windows installer tools are required: ${files.join(', ')}`);
  }
  t.skip(
    'Windows installer tools are not available; the Windows packaging job runs these checks after bundling.',
  );
  return false;
}

function write(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

const nsisString = (value) => value.replaceAll('$', '$$').replaceAll('"', '$\\"');

test('compiled NSIS cleanup removes default component trees, preserves custom data and skips application updates', (t) => {
  if (!available(t, [nsis])) return;
  const root = fixture(t),
    application = path.join(root, '程序目录');
  const executable = path.join(root, 'cleanup-fixture.exe');
  const source = path.join(root, 'cleanup-fixture.nsi');
  write(
    source,
    '\uFEFF' +
      [
        'Unicode true',
        'RequestExecutionLevel user',
        'SilentInstall silent',
        'Name "Maa Verge installer cleanup fixture"',
        `OutFile "${nsisString(executable)}"`,
        '!include LogicLib.nsh',
        '!include FileFunc.nsh',
        `!include "${nsisString(path.resolve(tauriRoot, configuration.bundle.windows.nsis.installerHooks))}"`,
        'Var UpdateMode',
        'Section "fixture"',
        `  StrCpy $INSTDIR "${nsisString(application)}"`,
        '  StrCpy $UpdateMode 0',
        '  ${GetOptions} $CMDLINE "/UPDATE" $0',
        '  ${IfNot} ${Errors}',
        '    StrCpy $UpdateMode 1',
        '  ${EndIf}',
        '  !insertmacro NSIS_HOOK_POSTUNINSTALL',
        'SectionEnd',
      ].join('\n'),
  );
  execFileSync(nsis, ['/V2', source], { windowsHide: true, timeout: 30_000 });

  const core = path.join(application, 'MaaCore'),
    resource = path.join(application, 'MaaResource');
  const retained = [
    path.join(application, '用户保留.txt'),
    path.join(root, 'custom-components/MaaCore.dll'),
    path.join(application, 'config/native/maaverge.sqlite3'),
    path.join(application, 'config/native/.runtime-lock.sqlite3'),
    path.join(root, 'business/native/maaverge.sqlite3'),
    path.join(root, 'business/native/.data-root.lock'),
  ];
  const components = [
    path.join(core, 'MaaCore.dll'),
    path.join(core, 'resource/version.json'),
    path.join(core, 'downloads/interrupted.zip'),
    path.join(core, 'generations/core-old/manifest.json'),
    path.join(resource, 'generations/resource-old/resource/version.json'),
    path.join(resource, 'downloads/interrupted.zip'),
  ];
  for (const file of [...retained, ...components]) write(file, 'synthetic fixture');

  // This executable runs only the configured cleanup hook against this fixture;
  // it does not register, install or uninstall an application on the host.
  execFileSync(executable, ['/S', '/UPDATE'], { windowsHide: true, timeout: 30_000 });
  for (const file of [...retained, ...components]) assert.ok(existsSync(file), file);
  execFileSync(executable, ['/S'], { windowsHide: true, timeout: 30_000 });
  for (const directory of [core, resource]) assert.equal(existsSync(directory), false, directory);
  for (const file of retained) assert.equal(readFileSync(file, 'utf8'), 'synthetic fixture', file);

  rmSync(retained[0]);
  rmSync(path.join(application, 'config'), { recursive: true });
  execFileSync(executable, ['/S'], { windowsHide: true, timeout: 30_000 });
  assert.equal(existsSync(application), false, 'empty installation directory is removed');
});

test('Windows builds target NSIS only', () => {
  const overlay = JSON.parse(readFileSync(path.join(tauriRoot, 'tauri.windows.conf.json'), 'utf8'));
  assert.deepEqual(overlay.bundle.targets, ['nsis']);
  assert.equal(configuration.bundle.windows.wix, undefined);
});

test('compiled offline component hooks honor selections and preserve active component and business files', async (t) => {
  if (!available(t, [nsis])) return;
  const root = fixture(t),
    components = path.join(root, 'offline'),
    application = path.join(root, '程序目录');
  write(path.join(components, 'manifest.json'), '{"formatVersion":1}');
  write(path.join(components, 'core/MaaCore.dll'), 'core fixture');
  write(path.join(components, 'core/resource/version.json'), 'base fixture');
  write(path.join(components, 'resource/resource/version.json'), 'complete resource fixture');
  write(
    path.join(root, 'apps/desktop/src-tauri/installer/hooks.nsh'),
    readFileSync(path.join(tauriRoot, 'installer/hooks.nsh'), 'utf8'),
  );
  const config = await windowsInstallerConfiguration({ directory: root, components });
  const executable = path.join(root, 'offline-fixture.exe'),
    source = path.join(root, 'fixture.nsi');
  write(
    source,
    '\uFEFF' +
      [
        'Unicode true',
        'RequestExecutionLevel user',
        'SilentInstall silent',
        'Name "Maa Verge optional components fixture"',
        `OutFile "${nsisString(executable)}"`,
        '!include MUI2.nsh',
        `!include "${nsisString(config.bundle.windows.nsis.installerHooks)}"`,
        '!insertmacro MUI_LANGUAGE "SimpChinese"',
        'Section "fixture"',
        '  ClearErrors',
        '  ${GetOptions} $CMDLINE "/UISTATE" $0',
        '  ${IfNot} ${Errors}',
        '    Call MaaVergeComponentsDefaults',
        '    ${If} $MaaVergeCore != 1',
        '      SetErrorLevel 71',
        '      Quit',
        '    ${EndIf}',
        '    ${If} $MaaVergeResource != 1',
        '      SetErrorLevel 72',
        '      Quit',
        '    ${EndIf}',
        '    StrCpy $MaaVergeResource 0',
        '    Call MaaVergeComponentsDefaults',
        '    ${If} $MaaVergeResource != 0',
        '      SetErrorLevel 73',
        '      Quit',
        '    ${EndIf}',
        '    StrCpy $MaaVergeCore 0',
        '    Call MaaVergeComponentsDefaults',
        '    ${If} $MaaVergeCore != 0',
        '      SetErrorLevel 74',
        '      Quit',
        '    ${EndIf}',
        '    StrCpy $MaaVergeCoreCheckbox 0',
        '    StrCpy $MaaVergeResourceCheckbox 0',
        '    StrCpy $MaaVergeResource 1',
        '    Push "callback-stack-sentinel"',
        '    Push 0',
        '    Call MaaVergeCoreClicked',
        '    Pop $0',
        '    ${If} $0 != "callback-stack-sentinel"',
        '      SetErrorLevel 75',
        '      Quit',
        '    ${EndIf}',
        '    ${If} $MaaVergeResource != 0',
        '      SetErrorLevel 76',
        '      Quit',
        '    ${EndIf}',
        '    StrCpy $MaaVergeResource 1',
        '    Push "resource-callback-stack-sentinel"',
        '    Push 0',
        '    Call MaaVergeResourceClicked',
        '    Pop $0',
        '    ${If} $0 != "resource-callback-stack-sentinel"',
        '      SetErrorLevel 77',
        '      Quit',
        '    ${EndIf}',
        '    ${If} $MaaVergeResource != 0',
        '      SetErrorLevel 78',
        '      Quit',
        '    ${EndIf}',
        '    SetErrorLevel 0',
        '    Quit',
        '  ${EndIf}',
        `  StrCpy $INSTDIR "${nsisString(application)}"`,
        '  !insertmacro NSIS_HOOK_POSTINSTALL',
        'SectionEnd',
      ].join('\n'),
  );
  execFileSync(nsis, ['/V2', source], { windowsHide: true, timeout: 30_000 });
  // Call the actual initialization/callback functions in the compiled fixture:
  // revisiting preserves both deselections, and the callback consumes its HWND.
  execFileSync(executable, ['/S', '/UISTATE'], { windowsHide: true, timeout: 30_000 });
  const retained = [
    path.join(application, 'config/native/maaverge.sqlite3'),
    path.join(application, 'MaaCore/generations/active/MaaCore.dll'),
    path.join(root, 'custom/MaaResource/resource.json'),
  ];
  for (const file of retained) write(file, 'retained');
  const bundled = path.join(application, 'runtime/bundled-components');
  for (const args of [
    ['/S', '/UPDATE'],
    ['/S', '/CORE=0'],
  ]) {
    execFileSync(executable, args, { windowsHide: true, timeout: 30_000 });
    assert.equal(existsSync(bundled), false);
  }
  execFileSync(executable, ['/S', '/RESOURCE=0'], { windowsHide: true, timeout: 30_000 });
  assert.equal(readFileSync(path.join(bundled, 'core/MaaCore.dll'), 'utf8'), 'core fixture');
  assert.equal(existsSync(path.join(bundled, 'resource')), false);
  execFileSync(executable, ['/S'], { windowsHide: true, timeout: 30_000 });
  assert.equal(
    readFileSync(path.join(bundled, 'resource/resource/version.json'), 'utf8'),
    'complete resource fixture',
  );
  for (const file of retained) assert.equal(readFileSync(file, 'utf8'), 'retained');
});

test('full portable staging includes only packaged application and complete components', async (t) => {
  const root = fixture(t);
  write(path.join(root, 'package.json'), '{"version":"0.1.3-alpha1"}');
  write(path.join(root, 'app.exe'), 'application fixture');
  write(path.join(root, 'LICENSE'), 'license fixture');
  write(path.join(root, 'dist/runtime/maaverge-runtime/maaverge-runtime.exe'), 'runtime fixture');
  write(
    path.join(root, 'dist/runtime/maaverge-runtime/maaverge-core-worker.exe'),
    'worker fixture',
  );
  write(path.join(root, 'dist/windows-components/manifest.json'), '{"formatVersion":1}');
  write(path.join(root, 'dist/windows-components/core/MaaCore.dll'), 'core fixture');
  write(
    path.join(root, 'dist/windows-components/resource/resource/version.json'),
    'full resource fixture',
  );
  write(path.join(root, 'config/native/maaverge.sqlite3'), 'private data');
  write(path.join(root, '.env'), 'private settings');
  const staging = path.join(root, 'portable');
  await stageWindowsPortable({ directory: root, executable: path.join(root, 'app.exe'), staging });
  assert.equal(readFileSync(path.join(staging, 'Maa Verge.exe'), 'utf8'), 'application fixture');
  assert.equal(
    readFileSync(
      path.join(staging, 'runtime/bundled-components/resource/resource/version.json'),
      'utf8',
    ),
    'full resource fixture',
  );
  for (const name of ['config', '.env', 'uninstall.exe', 'app.exe'])
    assert.equal(existsSync(path.join(staging, name)), false);
  assert.match(readFileSync(path.join(staging, '使用说明.txt'), 'utf8'), /WebView2/);
});

test(
  'portable packaging refuses linked build and staging paths before deleting existing files',
  { skip: !windows },
  async (t) => {
    for (const linkParent of [true, false]) {
      const root = fixture(t);
      write(path.join(root, 'package.json'), '{"version":"0.1.3-alpha1"}');
      const actual = path.join(root, 'retained');
      const versioned = 'windows-portable-0.1.3-alpha1';
      const retained = path.join(actual, linkParent ? versioned : '', 'valuable-file');
      write(retained, 'must survive packaging');
      const build = path.join(root, 'dist');
      if (!linkParent) mkdirSync(build);
      symlinkSync(actual, linkParent ? build : path.join(build, versioned), 'junction');
      await assert.rejects(packageWindowsPortable({ directory: root }), /filesystem links/);
      assert.equal(readFileSync(retained, 'utf8'), 'must survive packaging');
    }
  },
);

test(
  'portable packaging rejects a path-like application version before creating build output',
  { skip: !windows },
  async (t) => {
    const root = fixture(t);
    write(path.join(root, 'package.json'), '{"version":"../unsafe"}');
    await assert.rejects(packageWindowsPortable({ directory: root }));
    assert.equal(existsSync(path.join(root, 'dist')), false);
  },
);

async function readZip(filename) {
  const yauzl = createRequire(new URL('../../services/backend/package.json', import.meta.url))(
    'yauzl',
  );
  return new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const result = new Map();
      zip.once('error', reject);
      zip.once('end', () => resolve(result));
      zip.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) return zip.readEntry();
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks = [];
          stream.once('error', reject);
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.once('end', () => {
            result.set(entry.fileName, {
              bytes: Buffer.concat(chunks),
              flags: entry.generalPurposeBitFlag,
            });
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

test(
  'Windows ZIP output rejects linked parents and directory destinations without deleting their files',
  { skip: !windows },
  async (t) => {
    for (const linkedParent of [true, false]) {
      const root = fixture(t);
      const source = path.join(root, 'source');
      write(path.join(source, 'payload'), 'synthetic payload');
      const actual = path.join(root, 'actual');
      const retained = path.join(actual, linkedParent ? 'full.zip' : 'full.zip/retained');
      write(retained, 'retained file');
      const output = linkedParent ? path.join(root, 'alias') : actual;
      if (linkedParent) symlinkSync(actual, output, 'junction');
      await assert.rejects(
        createWindowsPortableArchive({
          sourceDirectory: source,
          archive: path.join(output, 'full.zip'),
        }),
        /filesystem links|plain file/,
      );
      assert.equal(readFileSync(retained, 'utf8'), 'retained file');
    }
  },
);

test(
  'Windows portable ZIP roundtrip preserves UTF-8 names, nested files, empty files and binary payloads',
  { skip: !windows, timeout: 30_000 },
  async (t) => {
    const root = fixture(t);
    const target = path.join(root, 'cargo');
    write(path.join(root, 'package.json'), '{"version":"0.1.3-alpha1"}');
    write(path.join(target, 'release/maaverge.exe'), Buffer.from([0, 1, 2, 255]));
    write(path.join(root, 'LICENSE'), 'license fixture');
    write(path.join(root, 'dist/runtime/maaverge-runtime/maaverge-runtime.exe'), 'runtime fixture');
    write(
      path.join(root, 'dist/runtime/maaverge-runtime/maaverge-core-worker.exe'),
      'worker fixture',
    );
    write(path.join(root, 'dist/windows-components/manifest.json'), '{"formatVersion":1}');
    write(path.join(root, 'dist/windows-components/resource/resource/中文目录/空文件.json'), '');
    const binary = Buffer.from(Array.from({ length: 4096 }, (_, index) => index % 256));
    write(path.join(root, 'dist/windows-components/resource/resource/中文目录/数据.bin'), binary);
    const archive = await packageWindowsPortable({ directory: root, targetDirectory: target });
    const files = await readZip(archive);
    assert.deepEqual(files.get('Maa Verge.exe').bytes, Buffer.from([0, 1, 2, 255]));
    assert.equal(
      files.get('runtime/bundled-components/resource/resource/中文目录/空文件.json').bytes.length,
      0,
    );
    assert.deepEqual(
      files.get('runtime/bundled-components/resource/resource/中文目录/数据.bin').bytes,
      binary,
    );
    assert.match(files.get('使用说明.txt').bytes.toString('utf8'), /WebView2/);
    for (const [name, entry] of files)
      if (/[^\x00-\x7f]/.test(name)) assert.ok(entry.flags & 0x800, name);
    assert.equal(files.get('MaaVerge.portable').bytes.toString(), '0.1.3-alpha1\n');
    assert.equal(
      readdirSync(path.dirname(archive)).some((entry) => entry.endsWith('.partial')),
      false,
    );
  },
);

test(
  'failed Windows ZIP creation removes its partial output and preserves an earlier archive',
  { skip: !windows, timeout: 30_000 },
  async (t) => {
    const root = fixture(t);
    const source = path.join(root, 'source');
    const locked = path.join(source, 'locked.bin');
    const ready = path.join(root, 'ready');
    const archive = path.join(root, 'output/full.zip');
    write(locked, 'locked synthetic payload');
    write(archive, 'earlier archive');
    const script = path.join(root, 'hold-file.ps1');
    write(
      script,
      [
        'param([string]$File, [string]$Ready)',
        "$ErrorActionPreference = 'Stop'",
        '$stream = [IO.File]::Open($File, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)',
        'try { [IO.File]::WriteAllText($Ready, "ready"); [Console]::ReadLine() | Out-Null } finally { $stream.Dispose() }',
      ].join('\n'),
    );
    const child = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
        '-File',
        locked,
        '-Ready',
        ready,
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const finished = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code));
    });
    try {
      const deadline = Date.now() + 10_000;
      while (!existsSync(ready) && child.exitCode === null && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 25));
      assert.ok(existsSync(ready), 'synthetic reader must hold the file exclusively');
      await assert.rejects(createWindowsPortableArchive({ sourceDirectory: source, archive }));
      assert.equal(readFileSync(archive, 'utf8'), 'earlier archive');
      assert.deepEqual(readdirSync(path.dirname(archive)), ['full.zip']);
    } finally {
      child.stdin.end('\n');
      assert.equal(await finished, 0);
    }
  },
);
