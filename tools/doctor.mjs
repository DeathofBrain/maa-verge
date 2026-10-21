import { existsSync, accessSync, constants } from 'node:fs';
import path from 'node:path';
import { root, pinnedNode, probe, devEnvironment } from './project.mjs';
import { bunVersion, ensureBun } from './setup-bun.mjs';

let failures = 0;
function report(ok, label, detail, required = true) {
  console.log(`${ok ? 'OK  ' : required ? 'FAIL' : 'INFO'} ${label}: ${detail}`);
  if (!ok && required) failures++;
}
const native = process.argv.includes('--native');
const checks = [
  ['Node.js', 'node', /^v24\./u, `Node ${pinnedNode}`],
  ['pnpm', 'pnpm', /^10\./u, 'pnpm 10'],
];
for (const [label, executable, pattern, expected] of checks) {
  const result = probe(executable);
  report(result.ok && pattern.test(result.output), label, result.output.split('\n')[0] || `Install ${expected}`);
}
try { report(true, 'Bun', `${bunVersion}: ${await ensureBun({ download: false })}`); }
catch (error) { report(false, 'Bun', `${error.message}; run pnpm setup:bun`); }
const python = probe('uv', ['run', '--frozen', '--no-sync', 'python', '--version']);
report(python.ok && /^Python 3\.12\./u.test(python.output), 'Python reference tests (optional)', python.output || 'Run uv sync --frozen for reference tests', false);
for (const file of ['pnpm-lock.yaml', 'uv.lock', 'apps/desktop/src-tauri/Cargo.lock']) {
  report(existsSync(path.join(root, file)), file, existsSync(path.join(root, file)) ? 'present' : 'missing');
}
for (const [label, name] of [['Rust', 'rustc'], ['Cargo', 'cargo']]) {
  const result = probe(name);
  report(result.ok, label, result.ok ? result.output : 'Native development requires rustup and the pinned toolchain', native);
}
const environment = devEnvironment();
let ancestor = environment.MAAVERGE_DATA_DIR;
while (!existsSync(ancestor) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
let writable = true;
try { accessSync(ancestor, constants.W_OK); } catch { writable = false; }
report(writable, 'Data root', environment.MAAVERGE_DATA_DIR);
const adb = probe(process.env.MAAVERGE_ADB_PATH || 'adb', ['version']);
report(adb.ok, 'ADB (optional)', adb.ok ? adb.output.split('\n')[0] : 'Not installed; mock mode is available', false);
if (process.platform === 'linux') {
  for (const pkg of ['webkit2gtk-4.1', 'gtk+-3.0', 'ayatana-appindicator3-0.1']) {
    const result = probe('pkg-config', ['--modversion', pkg]);
    report(result.ok, pkg, result.ok ? result.output : 'See docs/development.md Linux prerequisites', native);
  }
} else if (process.platform === 'darwin') {
  const result = probe('xcode-select', ['-p']);
  report(result.ok, 'Xcode command line tools', result.ok ? result.output : 'Run xcode-select --install', native);
} else if (process.platform === 'win32') {
  let result = probe('where.exe', ['link.exe']);
  if (!result.ok) {
    const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe');
    if (existsSync(vswhere)) result = probe(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-find', 'VC/Tools/MSVC/**/bin/Hostx64/x64/link.exe']);
  }
  report(result.ok && !!result.output, 'MSVC linker', result.ok && result.output ? result.output.split('\n')[0] : 'Install Visual Studio Build Tools with Desktop development with C++', native);
  console.log('INFO WebView2: native launch/install is the verification gate; the installer includes the official bootstrapper.');
}
console.log('INFO No device connection, model request or credential output was performed.');
process.exitCode = failures ? 1 : 0;
