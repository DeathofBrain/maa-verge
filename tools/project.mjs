import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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
  const localPaths = [path.dirname(executable('node')), path.join(root, '.tools', 'cmake', 'bin'), path.join(root, '.tools', 'uv'), path.join(root, '.tools', 'cargo', 'bin')]
    .filter((entry) => entry !== '.');
  return {
    ...process.env,
    PATH: [...localPaths, process.env.PATH || ''].join(path.delimiter),
    ...(existsSync(path.join(root, '.tools', 'rustup')) ? {
      CARGO_HOME: path.join(root, '.tools', 'cargo'), RUSTUP_HOME: path.join(root, '.tools', 'rustup'),
    } : {}),
    ...(existsSync(path.join(root, '.tools', 'python')) ? { UV_PYTHON_INSTALL_DIR: path.join(root, '.tools', 'python') } : {}),
    MAAVERGE_MODE: process.env.MAAVERGE_MODE || 'native',
    MAAVERGE_DATA_DIR: process.env.MAAVERGE_DATA_DIR || path.join(root, 'config'),
    VITE_WORKSPACE_ID: workspaceId,
  };
}

// Call the JavaScript entry directly so Windows .cmd quoting cannot change argv.
function command(name, args) {
  if (name === 'pnpm') {
    const lifecycle = process.env.npm_execpath;
    const candidates = [
      ...(lifecycle && /^pnpm\.(?:cjs|mjs|js)$/iu.test(path.basename(lifecycle)) ? [lifecycle] : []),
      path.join(root, '.tools', 'pnpm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
      path.join(root, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
    ];
    const entry = candidates.find((candidate) => existsSync(candidate));
    if (entry) return [executable('node'), [entry, ...args]];
    if (windows) {
      const discovered = spawnSync('where.exe', ['pnpm'], {
        env: devEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 15000,
      });
      for (const shim of (discovered.stdout || '').trim().split(/\r?\n/u).filter(Boolean)) {
        if (path.extname(shim).toLowerCase() === '.exe' && existsSync(shim)) return [shim, args];
        const directory = path.dirname(shim);
        // npm globals and pnpm/action-setup use different shim directories.
        const adjacent = [
          path.join(directory, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
          path.join(directory, '..', 'pnpm', 'bin', 'pnpm.cjs'),
          path.join(directory, 'pnpm.cjs'),
          path.join(directory, 'node_modules', 'corepack', 'dist', 'pnpm.js'),
          path.join(directory, '..', 'corepack', 'dist', 'pnpm.js'),
        ].find((candidate) => existsSync(candidate));
        if (adjacent) return [executable('node'), [adjacent, ...args]];
      }
      throw new Error('Cannot locate a pnpm JavaScript entry or executable. Run tools/bootstrap.ps1.');
    }
  }
  return [executable(name), args];
}

export function run(name, args = [], options = {}) {
  const [program, arguments_] = command(name, args);
  return new Promise((resolve, reject) => {
    const child = spawn(program, arguments_, { cwd: root, env: devEnvironment(), stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${name} exited ${code ?? signal}`)));
  });
}

const managedProcessGroups = new WeakMap();

export function start(name, args = [], options = {}) {
  const [program, arguments_] = command(name, args);
  // A dedicated group lets cleanup reach grandchildren such as the Tauri app,
  // even when the package-manager/CLI process has already exited.
  const child = spawn(program, arguments_, { cwd: root, env: devEnvironment(), stdio: 'inherit', ...options, ...(!windows ? { detached: true } : {}) });
  if (!windows && child.pid) managedProcessGroups.set(child, child.pid);
  return child;
}

export function probe(name, args = ['--version']) {
  let program, arguments_;
  try { [program, arguments_] = command(name, args); }
  catch (error) { return { ok: false, output: error.message }; }
  const result = spawnSync(program, arguments_, { cwd: root, env: devEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 15000 });
  return { ok: result.status === 0, output: (result.stdout || result.stderr || result.error?.message || '').trim() };
}

export function terminate(child) {
  if (!child) return;
  const group = managedProcessGroups.get(child);
  if (group) {
    managedProcessGroups.delete(child);
    try { process.kill(-group, 'SIGTERM'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    return;
  }
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (windows && child.pid) {
    // Only the process tree launched by this development script is targeted.
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
  } else child.kill('SIGTERM');
}

export function fail(error) {
  console.error(`\n${error.message || error}`);
  process.exitCode = 1;
}
