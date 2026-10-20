import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const windows = process.platform === 'win32';
export const workspaceId = createHash('sha256').update(root).digest('hex').slice(0, 8);
export const pinnedNode = readFileSync(path.join(root, '.node-version'), 'utf8').trim();
export const port = Number(process.env.MAAVERGE_DEV_PORT || 14000 + parseInt(workspaceId.slice(0, 4), 16) % 1000);
export const desktop = path.join(root, 'apps', 'desktop');

export function executable(name) {
  const local = {
    node: path.join(root, '.tools', 'node', windows ? 'node.exe' : 'bin/node'),
    uv: path.join(root, '.tools', 'uv', windows ? 'uv.exe' : 'uv'),
    cargo: path.join(root, '.tools', 'cargo', 'bin', windows ? 'cargo.exe' : 'cargo'),
    rustc: path.join(root, '.tools', 'cargo', 'bin', windows ? 'rustc.exe' : 'rustc'),
  };
  return local[name] && existsSync(local[name]) ? local[name] : name;
}

export function devEnvironment() {
  const base = process.platform === 'win32'
    ? process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local')
    : process.platform === 'darwin'
      ? path.join(homedir(), 'Library', 'Application Support')
      : process.env.XDG_DATA_HOME || path.join(homedir(), '.local', 'share');
  const localPaths = [path.dirname(executable('node')), path.join(root, '.tools', 'uv'), path.join(root, '.tools', 'cargo', 'bin')]
    .filter((entry) => entry !== '.');
  return {
    ...process.env,
    PATH: [...localPaths, process.env.PATH || ''].join(path.delimiter),
    ...(existsSync(path.join(root, '.tools', 'rustup')) ? {
      CARGO_HOME: path.join(root, '.tools', 'cargo'), RUSTUP_HOME: path.join(root, '.tools', 'rustup'),
    } : {}),
    ...(existsSync(path.join(root, '.tools', 'python')) ? { UV_PYTHON_INSTALL_DIR: path.join(root, '.tools', 'python') } : {}),
    MAAVERGE_MODE: process.env.MAAVERGE_MODE || 'mock',
    MAAVERGE_DATA_DIR: process.env.MAAVERGE_DATA_DIR || path.join(base, 'MAAVerge-dev', workspaceId),
    VITE_WORKSPACE_ID: workspaceId,
  };
}

// Run package-manager .cmd shims via their JavaScript entry where possible.
// Windows shell invocation is restricted to fixed program/argument arrays controlled by tools.
function command(name, args) {
  if (name === 'pnpm') {
    const bootstrap = path.join(root, '.tools', 'pnpm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
    if (existsSync(bootstrap)) return [executable('node'), [bootstrap, ...args]];
    const local = path.join(root, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
    if (existsSync(local)) return [executable('node'), [local, ...args]];
    if (windows) return ['cmd.exe', ['/d', '/s', '/c', `pnpm ${args.map(quoteWindows).join(' ')}`]];
  }
  return [executable(name), args];
}

function quoteWindows(value) {
  if (/[\r\n%&|<>^]/u.test(value)) throw new Error('Unsafe argument in package-manager command');
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function run(name, args = [], options = {}) {
  const [program, arguments_] = command(name, args);
  return new Promise((resolve, reject) => {
    const child = spawn(program, arguments_, { cwd: root, env: devEnvironment(), stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${name} exited ${code ?? signal}`)));
  });
}

export function start(name, args = [], options = {}) {
  const [program, arguments_] = command(name, args);
  return spawn(program, arguments_, { cwd: root, env: devEnvironment(), stdio: 'inherit', ...options });
}

export function probe(name, args = ['--version']) {
  const [program, arguments_] = command(name, args);
  const result = spawnSync(program, arguments_, { cwd: root, env: devEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 15000 });
  return { ok: result.status === 0, output: (result.stdout || result.stderr || result.error?.message || '').trim() };
}

export function terminate(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (windows && child.pid) {
    // Only the process tree launched by this development script is targeted.
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
  } else child.kill('SIGTERM');
}

export function fail(error) {
  console.error(`\n${error.message || error}`);
  process.exitCode = 1;
}
