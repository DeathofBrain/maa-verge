import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crc32, inflateRawSync } from 'node:zlib';

export const bunRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const bunVersion = readFileSync(path.join(bunRoot, '.bun-version'), 'utf8').trim();
export const bunExecutable = path.join(bunRoot, '.tools', 'bun', process.platform === 'win32' ? 'bun.exe' : 'bun');

// Official bun-v1.4.3 release asset digests. Update together with .bun-version.
const digests = {
  'bun-windows-x64': '0bf84e808552beea67bf1202a287a35c6c825d837b287b3f8e9dd513dba35d3d',
  'bun-linux-x64': '3e730528d89775f03f87f05c06787c4df4099d0a37f3f252e7b829cb23816e18',
  'bun-darwin-x64': '62660e6438eb872278877acca77e1152d5d031324df368d4a81b428211489d2d',
  'bun-darwin-aarch64': '80afd4c069b46a6fa8f3ec520bebc750a7843e4a8d5b9583d29ad436c00a3403',
};

export function cleanRuntimeEnvironment(environment = process.env) {
  const result = { ...environment };
  for (const key of Object.keys(result)) {
    if (['NODE_OPTIONS', 'NODE_PATH', 'BUN_OPTIONS', 'BUN_INSTALL', 'BUN_RUNTIME_TRANSPILER_CACHE_PATH'].includes(key.toUpperCase())) delete result[key];
  }
  return result;
}

function verifyVersion(executable) {
  const result = spawnSync(executable, ['--version'], {
    encoding: 'utf8', env: cleanRuntimeEnvironment(), windowsHide: true, timeout: 15000,
  });
  if (result.status !== 0 || result.stdout.trim() !== bunVersion) {
    throw new Error(`Bun ${bunVersion} validation failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
}

// Bootstrap only: read one exact executable from the verified official ZIP. No
// dependency installer or host unzip command is needed, and no ZIP paths escape.
function executableFromZip(zip, expectedName) {
  let end = -1;
  for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 65557); offset--) {
    if (zip.readUInt32LE(offset) === 0x06054b50 && offset + 22 + zip.readUInt16LE(offset + 20) === zip.length) { end = offset; break; }
  }
  if (end < 0 || zip.readUInt32LE(end + 4) !== 0) throw new Error('Unsupported Bun ZIP directory');
  const entries = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const candidates = [];
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > end || zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid Bun ZIP directory');
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (name === expectedName) {
      const flags = zip.readUInt16LE(cursor + 8);
      const method = zip.readUInt16LE(cursor + 10);
      const checksum = zip.readUInt32LE(cursor + 16);
      const compressedSize = zip.readUInt32LE(cursor + 20);
      const size = zip.readUInt32LE(cursor + 24);
      const local = zip.readUInt32LE(cursor + 42);
      if (flags & 1 || size > 200 * 1024 * 1024 || ![0, 8].includes(method) || local + 30 > cursor || zip.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid Bun executable ZIP entry');
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      if (start + compressedSize > cursor) throw new Error('Truncated Bun ZIP entry');
      const bytes = method === 0 ? zip.subarray(start, start + compressedSize) : inflateRawSync(zip.subarray(start, start + compressedSize), { maxOutputLength: size });
      if (bytes.length !== size || crc32(bytes) !== checksum) throw new Error('Bun ZIP executable checksum mismatch');
      candidates.push(bytes);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (candidates.length !== 1) throw new Error('Bun ZIP must contain exactly one expected executable');
  return candidates[0];
}

export async function ensureBun({ download = true } = {}) {
  if (existsSync(bunExecutable)) { verifyVersion(bunExecutable); return bunExecutable; }
  if (!download) throw new Error('Pinned Bun is missing. Run node tools/setup-bun.mjs.');
  if (bunVersion !== '1.4.3') throw new Error('Update the verified release digests when changing .bun-version');
  const platform = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform];
  const architecture = process.arch === 'arm64' ? 'aarch64' : process.arch;
  const asset = `bun-${platform}-${architecture}`;
  if (!digests[asset]) throw new Error(`Unsupported Bun bootstrap target: ${process.platform}/${process.arch}`);
  const response = await fetch(`https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/${asset}.zip`, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Bun download failed: HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 100 * 1024 * 1024) throw new Error('Bun release archive exceeds 100 MiB');
    chunks.push(chunk);
  }
  const zip = Buffer.concat(chunks);
  if (createHash('sha256').update(zip).digest('hex') !== digests[asset]) throw new Error('Official Bun release SHA-256 mismatch');
  const bytes = executableFromZip(zip, `${asset}/${process.platform === 'win32' ? 'bun.exe' : 'bun'}`);
  mkdirSync(path.dirname(bunExecutable), { recursive: true });
  const temporary = `${bunExecutable}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o755 });
    chmodSync(temporary, 0o755);
    verifyVersion(temporary);
    renameSync(temporary, bunExecutable);
  } finally { rmSync(temporary, { force: true }); }
  return bunExecutable;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`Bun ${bunVersion}: ${await ensureBun({ download: !process.argv.includes('--check') })}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
