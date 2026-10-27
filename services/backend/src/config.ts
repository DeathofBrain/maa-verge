import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';

export type ComponentPaths = { core: string; resource: string };
export function defaultComponentPaths(root: string, applicationDirectory?: string): ComponentPaths {
  return applicationDirectory
    ? {
        core: path.resolve(applicationDirectory, 'MaaCore'),
        resource: path.resolve(applicationDirectory, 'MaaResource'),
      }
    : {
        core: path.resolve(root, 'components', 'core'),
        resource: path.resolve(root, 'components', 'resource'),
      };
}
export function defaultCopilotDirectory(root: string, applicationDirectory?: string): string {
  return path.resolve(applicationDirectory || root, 'cache', 'copilot');
}
export function normalizeComponentPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const absolute =
    path.isAbsolute(trimmed) &&
    (process.platform !== 'win32' || /^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/i.test(trimmed));
  if (!absolute || /[\x00-\x1f]/.test(trimmed)) throw new Error('组件目录必须使用完整的绝对路径');
  return path.resolve(trimmed);
}

export function standardDataRoot(): string {
  // Device leases and the one-time import keep using the shared legacy root.
  return process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'MAAVerge')
    : process.platform === 'darwin'
      ? path.join(homedir(), 'Library', 'Application Support', 'MAAVerge')
      : path.join(process.env.XDG_DATA_HOME || path.join(homedir(), '.local', 'share'), 'MAAVerge');
}
function programDirectory(applicationDirectory?: string): string {
  return (
    applicationDirectory ||
    process.env.MAAVERGE_APP_DIR ||
    (Bun.isStandaloneExecutable
      ? path.dirname(process.execPath)
      : path.resolve(import.meta.dir, '../../..'))
  );
}
export function dataRoot(applicationDirectory?: string): string {
  if (process.env.MAAVERGE_DATA_DIR)
    return path.resolve(process.env.MAAVERGE_DATA_DIR.replace(/^~(?=$|[\\/])/, homedir()));
  return path.resolve(programDirectory(applicationDirectory), 'config');
}
export function legacyDataRoot(root: string, applicationDirectory?: string): string | undefined {
  // Explicit custom roots and routine tests must never import real user data.
  if (process.env.MAAVERGE_DATA_DIR) return undefined;
  const directory = path.resolve(programDirectory(applicationDirectory));
  if (path.resolve(root) !== path.join(directory, 'config')) return undefined;
  return Bun.isStandaloneExecutable
    ? standardDataRoot()
    : path.join(
        path.dirname(standardDataRoot()),
        'MAAVerge-dev',
        createHash('sha256').update(directory).digest('hex').slice(0, 8),
      );
}
export function deviceLockPath(key: string): string {
  // Shared across checkouts and data roots, including the Python reference.
  return path.join(
    process.env.MAAVERGE_DEVICE_LOCK_DIR || path.join(standardDataRoot(), 'device-locks'),
    createHash('sha256').update(key).digest('hex') + '.lock',
  );
}
export function childEnvironment(source = process.env): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const key of Object.keys(env))
    if (['BUN_OPTIONS', 'BUN_BE_BUN', 'NODE_OPTIONS', 'NODE_PATH'].includes(key.toUpperCase()))
      delete env[key];
  return env;
}
export function nativeEnvironment(core: string, platform = process.platform): NodeJS.ProcessEnv {
  const env = childEnvironment();
  if (platform !== 'win32') {
    const key = platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH';
    env[key] = path.resolve(core) + (env[key] ? ':' + env[key] : '');
  }
  return env;
}
