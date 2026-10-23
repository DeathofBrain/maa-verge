import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tauriRoot = path.join(projectRoot, 'apps/desktop/src-tauri');
const configuration = JSON.parse(readFileSync(path.join(tauriRoot, 'tauri.conf.json'), 'utf8'));
const windows = process.platform === 'win32';
const toolRoot = path.join(process.env.LOCALAPPDATA || '', 'tauri');
const nsis = process.env.MAAVERGE_NSIS_COMPILER || path.join(toolRoot, 'NSIS/makensis.exe');
const wix = process.env.MAAVERGE_WIX_TOOLS || path.join(toolRoot, 'WixTools314');

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'maa verge installer-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function available(t, files) {
  if (windows && files.every(existsSync)) return true;
  if (windows && process.env.MAAVERGE_INSTALLER_TOOLS_REQUIRED === '1') {
    assert.fail(`Windows installer tools are required: ${files.join(', ')}`);
  }
  t.skip('Windows installer tools are not available; the Windows packaging job runs these checks after bundling.');
  return false;
}

function write(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

const nsisString = value => value.replaceAll('$', '$$').replaceAll('"', '$\\"');

test('compiled NSIS cleanup removes default component trees, preserves custom data and skips application updates', (t) => {
  if (!available(t, [nsis])) return;
  const root = fixture(t), application = path.join(root, '程序目录');
  const executable = path.join(root, 'cleanup-fixture.exe');
  const source = path.join(root, 'cleanup-fixture.nsi');
  write(source, '\uFEFF' + [
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
  ].join('\n'));
  execFileSync(nsis, ['/V2', source], { windowsHide: true, timeout: 30_000 });

  const core = path.join(application, 'MaaCore'), resource = path.join(application, 'MaaResource');
  const retained = [path.join(application, '用户保留.txt'), path.join(root, 'custom-components/MaaCore.dll'),
    path.join(root, 'business/native/maaverge.sqlite3'), path.join(root, 'business/native/.data-root.lock')];
  const components = [path.join(core, 'MaaCore.dll'), path.join(core, 'resource/version.json'),
    path.join(core, 'downloads/interrupted.zip'), path.join(core, 'generations/core-old/manifest.json'),
    path.join(resource, 'generations/resource-old/resource/version.json'), path.join(resource, 'downloads/interrupted.zip')];
  for (const file of [...retained, ...components]) write(file, 'synthetic fixture');

  // This executable runs only the configured cleanup hook against this fixture;
  // it does not register, install or uninstall an application on the host.
  execFileSync(executable, ['/S', '/UPDATE'], { windowsHide: true, timeout: 30_000 });
  for (const file of [...retained, ...components]) assert.ok(existsSync(file), file);
  execFileSync(executable, ['/S'], { windowsHide: true, timeout: 30_000 });
  for (const directory of [core, resource]) assert.equal(existsSync(directory), false, directory);
  for (const file of retained) assert.equal(readFileSync(file, 'utf8'), 'synthetic fixture', file);

  rmSync(retained[0]);
  execFileSync(executable, ['/S'], { windowsHide: true, timeout: 30_000 });
  assert.equal(existsSync(application), false, 'empty installation directory is removed');
});

test('linked MSI scopes recursive cleanup to default component directories on full uninstall, after AppSearch and before costing', (t) => {
  const candle = path.join(wix, 'candle.exe'), light = path.join(wix, 'light.exe');
  if (!available(t, [candle, light])) return;
  const root = fixture(t), source = path.join(root, 'fixture.wxs');
  const fragments = configuration.bundle.windows.wix.fragmentPaths.map(file => path.resolve(tauriRoot, file));
  const groups = configuration.bundle.windows.wix.componentGroupRefs;
  write(source, `<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" UpgradeCode="CF492555-148D-494F-A68E-85A7A8661869" Name="Maa Verge installer fixture" Version="0.1.0" Language="1033" Manufacturer="Maa Verge tests">
    <Package InstallerVersion="450" Compressed="yes" InstallScope="perMachine" />
    <Property Id="INSTALLDIR"><RegistrySearch Id="FixtureInstallDirectory" Root="HKCU" Key="Software\\MaaVergeInstallerFixture" Name="InstallDir" Type="raw" /></Property>
    <Directory Id="TARGETDIR" Name="SourceDir"><Directory Id="ProgramFiles64Folder"><Directory Id="INSTALLDIR" Name="MaaVergeFixture" /></Directory></Directory>
    <Feature Id="Main" Level="1">${groups.map(id => `<ComponentGroupRef Id="${id}" />`).join('')}</Feature>
  </Product>
</Wix>`);
  execFileSync(candle, ['-nologo', '-arch', 'x64', '-ext', 'WixUtilExtension', '-out', root + path.sep, source, ...fragments], { windowsHide: true, timeout: 30_000 });
  const installer = path.join(root, 'fixture.msi');
  const objects = [source, ...fragments].map(file => path.join(root, path.basename(file, '.wxs') + '.wixobj'));
  execFileSync(light, ['-nologo', '-ext', 'WixUtilExtension', '-out', installer, ...objects], { windowsHide: true, timeout: 30_000 });

  const inspect = path.join(root, 'inspect.ps1');
  write(inspect, `
$ErrorActionPreference = 'Stop'
$installer = New-Object -ComObject WindowsInstaller.Installer
$database = $installer.OpenDatabase($args[0], 0)
$tables = @{}
foreach ($table in @('CustomAction', 'InstallExecuteSequence', 'WixRemoveFolderEx')) {
  $view = $database.OpenView(('SELECT * FROM ' + [char]96 + $table + [char]96))
  $view.Execute()
  $rows = @()
  while ($null -ne ($record = $view.Fetch())) {
    $fields = @()
    $count = $record.GetType().InvokeMember('FieldCount', 'GetProperty', $null, $record, $null)
    for ($column = 1; $column -le $count; $column++) {
      $fields += [string]$record.GetType().InvokeMember('StringData', 'GetProperty', $null, $record, @($column))
    }
    $rows += ,$fields
  }
  $tables[$table] = $rows
  $view.Close()
}
$tables | ConvertTo-Json -Depth 4 -Compress
`);
  // Read MSI tables only. Never run msiexec or install/uninstall this fixture.
  const tables = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', inspect, installer], { windowsHide: true, timeout: 30_000, encoding: 'utf8' }));
  const sequence = new Map(tables.InstallExecuteSequence.map(([id, condition, number]) => [id, { condition, number: Number(number) }]));
  const cleanup = tables.CustomAction.filter(([, type, property]) => type === '51' && /^MAAVERGE_(?:CORE|RESOURCE)_CLEANUP_DIR$/u.test(property));
  assert.equal(cleanup.length, 2, JSON.stringify(tables.CustomAction));
  assert.deepEqual(cleanup.map(([, , property, value]) => [property, value]).sort(), [
    ['MAAVERGE_CORE_CLEANUP_DIR', '[INSTALLDIR]\\MaaCore'],
    ['MAAVERGE_RESOURCE_CLEANUP_DIR', '[INSTALLDIR]\\MaaResource'],
  ]);
  for (const [id] of cleanup) {
    const action = sequence.get(id);
    assert.equal(action.condition.replaceAll(/\s+/gu, ' ').trim(), 'Installed AND INSTALLDIR AND REMOVE = "ALL" AND NOT UPGRADINGPRODUCTCODE');
    assert.ok(sequence.get('AppSearch').number < action.number, 'install directory is found first');
    assert.ok(action.number < sequence.get('WixRemoveFoldersEx').number, 'cleanup paths are ready before enumeration');
  }
  assert.ok(sequence.get('WixRemoveFoldersEx').number < sequence.get('CostInitialize').number);
  assert.deepEqual(tables.WixRemoveFolderEx.map(([, component, property, mode]) => [component, property, mode]).sort(), [
    ['MaaVergeDownloadedComponents', 'MAAVERGE_CORE_CLEANUP_DIR', '2'],
    ['MaaVergeDownloadedComponents', 'MAAVERGE_RESOURCE_CLEANUP_DIR', '2'],
  ]);
});
