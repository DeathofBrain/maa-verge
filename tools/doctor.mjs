import { existsSync, accessSync, constants, readFileSync } from 'node:fs';
import path from 'node:path';
import { root, pinnedNode, probe, devEnvironment } from './project.mjs';
import { bunVersion, ensureBun } from './setup-bun.mjs';
import {
  bootstrapHint,
  nativeHint,
  missingWorkspaceDependencies,
  resolveCmake,
  probeCppToolchain,
} from './environment.mjs';

let failures = 0;
function report(ok, label, detail, required = true) {
  console.log(`${ok ? 'OK  ' : required ? 'FAIL' : 'INFO'} ${label}: ${detail}`);
  if (!ok && required) failures++;
}
const native = process.argv.includes('--native');
const pinnedPnpm = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
).packageManager.split('@')[1];
const checks = [
  ['Node.js', 'node', `v${pinnedNode}`],
  ['pnpm', 'pnpm', pinnedPnpm],
];
for (const [label, executable, expected] of checks) {
  const result = probe(executable);
  report(
    result.ok && result.output === expected,
    label,
    `${result.output.split('\n')[0] || 'missing'} (expected ${expected}; repair: ${bootstrapHint()})`,
  );
}
const missingDependencies = missingWorkspaceDependencies();
report(
  !missingDependencies.length,
  'Workspace dependencies',
  missingDependencies.length
    ? `${missingDependencies.join(', ')}; run pnpm install --frozen-lockfile`
    : 'all direct workspace dependencies present',
);
try {
  report(true, 'Bun', `${bunVersion}: ${await ensureBun({ download: false })}`);
} catch (error) {
  report(false, 'Bun', `${error.message}; run pnpm setup:bun`);
}
for (const file of ['pnpm-lock.yaml', 'apps/desktop/src-tauri/Cargo.lock']) {
  report(
    existsSync(path.join(root, file)),
    file,
    existsSync(path.join(root, file)) ? 'present' : 'missing',
  );
}
const pinnedRust = readFileSync(path.join(root, 'rust-toolchain.toml'), 'utf8').match(
  /channel\s*=\s*"([^"]+)"/u,
)[1];
for (const [label, name] of [
  ['Rust', 'rustc'],
  ['Cargo', 'cargo'],
]) {
  const result = probe(name);
  report(
    result.ok && result.output.startsWith(`${name} ${pinnedRust} `),
    label,
    result.ok
      ? result.output
      : `Rust ${pinnedRust} is missing or incomplete. Repair: ${bootstrapHint()}. ${result.output}`,
    native,
  );
}
if (native) {
  report(
    ['win32/x64', 'linux/x64', 'darwin/arm64', 'darwin/x64'].includes(
      `${process.platform}/${process.arch}`,
    ),
    'Native target',
    `${process.platform}/${process.arch}`,
  );
  try {
    const cmake = resolveCmake();
    report(true, 'CMake', `${cmake.version}: ${cmake.executable}`);
    const compiler = probeCppToolchain(cmake.executable);
    report(
      compiler.ok,
      'C++ toolchain',
      compiler.ok ? compiler.output : `${compiler.output}\n${nativeHint()}`,
    );
  } catch (error) {
    report(false, 'CMake / C++ toolchain', error.message);
  }
}
const environment = devEnvironment();
let ancestor = environment.MAAVERGE_DATA_DIR;
while (!existsSync(ancestor) && path.dirname(ancestor) !== ancestor)
  ancestor = path.dirname(ancestor);
let writable = true;
try {
  accessSync(ancestor, constants.W_OK);
} catch {
  writable = false;
}
report(writable, 'Data root', environment.MAAVERGE_DATA_DIR);
const adb = probe(process.env.MAAVERGE_ADB_PATH || 'adb', ['version']);
report(
  adb.ok,
  'ADB',
  adb.ok
    ? adb.output.split('\n')[0]
    : 'Configure MAAVERGE_ADB_PATH or discover the emulator bundled ADB',
  false,
);
if (process.platform === 'linux') {
  for (const pkg of [
    'webkit2gtk-4.1',
    'gtk+-3.0',
    'ayatana-appindicator3-0.1',
    'openssl',
    'librsvg-2.0',
  ]) {
    const result = probe('pkg-config', ['--modversion', pkg]);
    report(
      result.ok,
      pkg,
      result.ok ? result.output : 'See docs/development.md Linux prerequisites',
      native,
    );
  }
} else if (process.platform === 'darwin') {
  const result = probe('xcode-select', ['-p']);
  report(
    result.ok,
    'Xcode command line tools',
    result.ok ? result.output : 'Run xcode-select --install',
    native,
  );
} else if (process.platform === 'win32') {
  let result = probe('where.exe', ['link.exe']);
  if (!result.ok) {
    const vswhere = path.join(
      process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)',
      'Microsoft Visual Studio/Installer/vswhere.exe',
    );
    if (existsSync(vswhere))
      result = probe(vswhere, [
        '-latest',
        '-products',
        '*',
        '-requires',
        'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
        '-find',
        'VC/Tools/MSVC/**/bin/Hostx64/x64/link.exe',
      ]);
  }
  report(
    result.ok && !!result.output,
    'MSVC linker',
    result.ok && result.output
      ? result.output.split('\n')[0]
      : 'Install Visual Studio Build Tools with Desktop development with C++',
    native,
  );
  console.log(
    'INFO WebView2: native launch/install is the verification gate; the installer includes the official bootstrapper.',
  );
}
console.log('INFO No device connection, model request or credential output was performed.');
process.exitCode = failures ? 1 : 0;
