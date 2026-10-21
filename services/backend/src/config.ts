import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';

export function dataRoot(): string {
  if (process.env.MAAVERGE_DATA_DIR) return path.resolve(process.env.MAAVERGE_DATA_DIR.replace(/^~(?=$|[\\/])/, homedir()));
  return process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'MAAVerge')
    : process.platform === 'darwin' ? path.join(homedir(), 'Library', 'Application Support', 'MAAVerge')
      : path.join(process.env.XDG_DATA_HOME || path.join(homedir(), '.local', 'share'), 'MAAVerge');
}
export function deviceLockPath(key: string): string {
  // Shared across checkouts and data roots, including the Python reference.
  const standard = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'MAAVerge')
    : process.platform === 'darwin' ? path.join(homedir(), 'Library', 'Application Support', 'MAAVerge')
      : path.join(process.env.XDG_DATA_HOME || path.join(homedir(), '.local', 'share'), 'MAAVerge');
  return path.join(process.env.MAAVERGE_DEVICE_LOCK_DIR || path.join(standard, 'device-locks'), createHash('sha256').update(key).digest('hex') + '.lock');
}
export function childEnvironment(source = process.env): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const key of Object.keys(env)) if (['BUN_OPTIONS', 'BUN_BE_BUN', 'NODE_OPTIONS', 'NODE_PATH'].includes(key.toUpperCase())) delete env[key];
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
