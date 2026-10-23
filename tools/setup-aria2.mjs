import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanRuntimeEnvironment } from './setup-bun.mjs';

export const aria2Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const aria2Version = '1.37.0';
export const aria2Executable = path.join(aria2Root, '.tools/aria2', process.platform === 'win32' ? 'aria2c.exe' : 'aria2c');
const release = `https://github.com/aria2/aria2/releases/download/release-${aria2Version}/`;
// These are exact upstream release bytes, not digests fetched during installation.
export const aria2Assets = {
  aria2: { name: 'aria2-1.37.0.tar.xz', url: release + 'aria2-1.37.0.tar.xz', sha256: '60a420ad7085eb616cb6e2bdf0a7206d68ff3d37fb5a956dc44242eb2f79b66b', root: 'aria2-1.37.0', notices: ['COPYING', 'LICENSE.OpenSSL', 'AUTHORS'] },
  windows: { name: 'aria2-1.37.0-win-64bit-build1.zip', url: release + 'aria2-1.37.0-win-64bit-build1.zip', sha256: '67d015301eef0b612191212d564c5bb0a14b5b9c4796b76454276a4d28d9b288', root: 'aria2-1.37.0-win-64bit-build1', notices: ['COPYING', 'LICENSE.OpenSSL', 'README.mingw'] },
  openssl: { name: 'openssl-3.5.9.tar.gz', url: 'https://github.com/openssl/openssl/releases/download/openssl-3.5.9/openssl-3.5.9.tar.gz', sha256: '603f5602e2eef00d77fbd429d34dcd5822bb301757a1bc9cdb24c670f1eb859a', root: 'openssl-3.5.9', notices: ['LICENSE.txt', 'AUTHORS.md'] },
  gmp: { name: 'gmp-6.3.0.tar.xz', url: 'https://ftp.gnu.org/gnu/gmp/gmp-6.3.0.tar.xz', sha256: 'a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898', root: 'gmp-6.3.0', notices: ['COPYINGv3', 'COPYING.LESSERv3', 'README'] },
  expat: { name: 'expat-2.5.0.tar.bz2', url: 'https://github.com/libexpat/libexpat/releases/download/R_2_5_0/expat-2.5.0.tar.bz2', sha256: '6f0e6e01f7b30025fa05c85fdad1e5d0ec7fd35d9f61b22f34998de11969ff67', root: 'expat-2.5.0', notices: ['COPYING'] },
  sqlite: { name: 'sqlite-autoconf-3430100.tar.gz', url: 'https://www.sqlite.org/2023/sqlite-autoconf-3430100.tar.gz', sha256: '39116c94e76630f22d54cd82c3cea308565f1715f716d1b2527f1c9c969ba4d9', root: 'sqlite-autoconf-3430100', notices: ['README.txt'], extraNotice: 'sqlite3.c' },
  zlib: { name: 'zlib-1.3.tar.gz', url: 'https://zlib.net/fossils/zlib-1.3.tar.gz', sha256: 'ff0ba4c292013dbc27530b3a81e1f9a813cd39de01ca5e0f8bf355702efa593e', root: 'zlib-1.3', notices: ['LICENSE'] },
  cares: { name: 'c-ares-1.19.1.tar.gz', url: 'https://github.com/c-ares/c-ares/releases/download/cares-1_19_1/c-ares-1.19.1.tar.gz', sha256: '321700399b72ed0e037d0074c629e7741f6b2ec2dda92956abe3e9671d3e268e', root: 'c-ares-1.19.1', notices: ['LICENSE.md'] },
  libssh2: { name: 'libssh2-1.11.0.tar.bz2', url: 'https://libssh2.org/download/libssh2-1.11.0.tar.bz2', sha256: 'e56d81f01f090d3c6eaf5f56c645610fd1a90d92819541d0079ae363d1eed11e', root: 'libssh2-1.11.0', notices: ['COPYING'] },
  gccException: { name: 'GCC-COPYING.RUNTIME', url: 'https://raw.githubusercontent.com/gcc-mirror/gcc/releases/gcc-10.3.0/COPYING.RUNTIME', sha256: '9d6b43ce4d8de0c878bf16b54d8e7a10d9bd42b75178153e3af6a815bdc90f74' },
  gccLicense: { name: 'GCC-COPYING3', url: 'https://raw.githubusercontent.com/gcc-mirror/gcc/releases/gcc-10.3.0/COPYING3', sha256: '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903' },
  mingw: { name: 'mingw-w64-runtime-COPYING', url: 'https://raw.githubusercontent.com/mingw-w64/mingw-w64/v8.0.0/COPYING.MinGW-w64-runtime/COPYING.MinGW-w64-runtime.txt', sha256: 'e9b2dc02451ea29092a1f25fa0f3c07207ed421f1807dffb0c4e6dce69dee7bd' },
};
const windowsExecutableHash = 'be2099c214f63a3cb4954b09a0becd6e2e34660b886d4c898d260febfe9d70c2';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const aria2RecipeSha256 = hash(readFileSync(fileURLToPath(import.meta.url)));
const assetsFor = platform => platform === 'win32' ? [aria2Assets.aria2, aria2Assets.windows, ...['gmp', 'expat', 'sqlite', 'zlib', 'cares', 'libssh2', 'gccException', 'gccLicense', 'mingw'].map(key => aria2Assets[key])] : [aria2Assets.aria2, ...(platform === 'linux' ? [aria2Assets.openssl, aria2Assets.gccException, aria2Assets.gccLicense] : [])];
const provenanceFor = platform => assetsFor(platform).map(({ name, url, sha256 }) => ({ name, url, sha256 }));

function removeWithin(file, parent) {
  const resolved = path.resolve(file), boundary = path.resolve(parent) + path.sep;
  if (!resolved.startsWith(boundary)) throw new Error(`Refusing aria2 cleanup outside ${parent}`);
  rmSync(resolved, { recursive: true, force: true });
}

export function aria2Target(platform = process.platform, arch = process.arch) {
  if (!['win32/x64', 'linux/x64', 'darwin/x64', 'darwin/arm64'].includes(`${platform}/${arch}`)) throw new Error(`Unsupported aria2 target: ${platform}/${arch}`);
  return `${platform}/${arch}`;
}

export function validateAria2Version(output) {
  if (!output.startsWith(`aria2 version ${aria2Version}\n`) && !output.startsWith(`aria2 version ${aria2Version}\r\n`)) throw new Error(`Expected aria2 ${aria2Version}`);
  if (!/^Enabled Features:.*\bHTTPS\b/m.test(output) || !/^Hash Algorithms:.*\bsha-256\b/m.test(output)) throw new Error('aria2 must support HTTPS and SHA-256');
  return output;
}

export function verifyAria2Asset(bytes, asset) {
  if (hash(bytes) !== asset.sha256) throw new Error(`aria2 source/release SHA-256 mismatch: ${asset.name}`);
  return bytes;
}

function command(execute, program, args, options = {}) {
  const result = execute(program, args, { env: cleanRuntimeEnvironment(), windowsHide: true, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(`aria2 setup failed (${program}): ${result.error?.message || result.stderr || result.stdout || result.status}`);
  return result.stdout;
}

export function aria2BuildArguments(platform, opensslDirectory) {
  const common = ['--disable-bittorrent', '--disable-metalink', '--disable-websocket', '--disable-libaria2', '--disable-nls', '--without-libxml2', '--without-libexpat', '--without-sqlite3', '--without-libcares', '--without-libssh2', '--without-libz', '--without-libgmp', '--without-libgcrypt', '--without-libnettle', '--without-gnutls', '--without-libuv', '--disable-dependency-tracking'];
  return platform === 'darwin' ? [...common, '--with-appletls', '--without-openssl'] : [...common, '--without-appletls', '--with-openssl', '--with-ca-bundle=/etc/ssl/certs/ca-certificates.crt', 'CXXFLAGS=-O2 -static-libstdc++ -static-libgcc', `OPENSSL_CFLAGS=-I${path.posix.join(opensslDirectory, 'include')}`, `OPENSSL_LIBS=${path.posix.join(opensslDirectory, 'lib/libssl.a')} ${path.posix.join(opensslDirectory, 'lib/libcrypto.a')} -ldl -pthread`];
}

export function sqlitePublicDomainNotice(bytes) {
  const text = bytes.toString('utf8'), marker = text.indexOf('The author disclaims copyright');
  const start = text.lastIndexOf('/*', marker), end = text.indexOf('*/', marker);
  if (marker < 0 || start < 0 || end < marker) throw new Error('Missing SQLite public-domain notice');
  return Buffer.from(text.slice(start, end + 2) + '\n');
}

async function acquire(asset, directory, fetcher) {
  const file = path.join(directory, asset.name);
  if (existsSync(file)) { verifyAria2Asset(readFileSync(file), asset); return file; }
  const response = await fetcher(asset.url, { signal: AbortSignal.timeout(180000), redirect: 'follow' });
  if (!response.ok) throw new Error(`aria2 download failed (${asset.name}): HTTP ${response.status}`);
  if (response.url && new URL(response.url).protocol !== 'https:') throw new Error('aria2 download redirected outside HTTPS');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 80 * 1024 * 1024) throw new Error('aria2 dependency exceeds 80 MiB');
    chunks.push(chunk);
  }
  const bytes = verifyAria2Asset(Buffer.concat(chunks), asset);
  mkdirSync(directory, { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try { writeFileSync(temporary, bytes, { flag: 'wx' }); renameSync(temporary, file); }
  finally { rmSync(temporary, { force: true }); }
  return file;
}

function archiveFile(execute, archive, member) {
  return command(execute, 'tar', ['-xOf', archive, member], { encoding: null });
}

function unpackSource(execute, archive, directory, asset) {
  const entries = command(execute, 'tar', ['-tf', archive]).trim().split(/\r?\n/);
  if (!entries.length || entries.some(name => !name.startsWith(asset.root + '/') || name.includes('\\') || name.split('/').includes('..'))) throw new Error('Unsafe aria2 source archive paths');
  command(execute, 'tar', ['-xf', archive, '-C', directory]);
  return path.join(directory, asset.root);
}

function collectNotices(execute, assets, archives, output, platform) {
  const files = [];
  const save = (name, bytes) => { const file = path.join(output, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes); files.push({ name, sha256: hash(bytes) }); };
  for (const asset of assets) {
    const archive = path.join(archives, asset.name);
    if (!asset.root) { save(asset.name + '.txt', readFileSync(archive)); continue; }
    // Carry full corresponding sources, including GMP under its GPL-3.0-or-later option.
    if (asset !== aria2Assets.windows) save('sources/' + asset.name, readFileSync(archive));
    for (const notice of asset.notices) save(`${asset.root}/${notice}`, archiveFile(execute, archive, `${asset.root}/${notice}`));
    if (asset.extraNotice) save(`${asset.root}/PUBLIC-DOMAIN.txt`, sqlitePublicDomainNotice(archiveFile(execute, archive, `${asset.root}/${asset.extraNotice}`)));
  }
  const instructions = `Bundled aria2 ${aria2Version}; target ${platform}.\n\naria2 is GPL-2.0-or-later; this distribution selects GPL-3.0-or-later. GMP is also distributed under its GPL-3.0-or-later option. No local aria2 source changes. Full upstream sources are included in sources/. The GCC runtime uses the GCC Runtime Library Exception; MinGW runtime notices are included for the official Windows executable.\n\nRebuild Maa Verge's exact integration: use the matching Maa Verge source revision, pnpm install --frozen-lockfile, then node tools/setup-aria2.mjs. Build configuration and compiler output are in ../aria2-build-info.json.\n\nWindows: official upstream release-1.37.0 win-64bit-build1 executable, SHA-256 ${windowsExecutableHash}; its source archive contains Dockerfile.mingw and mingw-config. Extract all matching dependency source archives, use Dockerfile.mingw's build commands with HOST=x86_64-w64-mingw32 and ARIA2_VERSION=release-1.37.0 (the upstream default master is not this release). The archive README.mingw lists the linked dependency versions. GCC Runtime Library Exception permits distribution of eligible compiler runtime code without corresponding GCC source.\n\nLinux: fixed OpenSSL 3.5.9 built with no-shared no-tests no-module no-dso, linked as libssl.a/libcrypto.a; libstdc++ and libgcc are static. glibc and the system CA store remain platform dependencies.\nmacOS: AppleTLS/CommonCrypto and system libc++; no Homebrew runtime libraries.\n`;
  save('REBUILD.txt', Buffer.from(instructions));
  return files;
}

export function readAria2BuildInfo(directory = path.dirname(aria2Executable)) {
  const info = JSON.parse(readFileSync(path.join(directory, 'build-info.json'), 'utf8'));
  if (info.version !== aria2Version || !info.target || !Array.isArray(info.notices) || !info.notices.length) throw new Error('Invalid bundled aria2 build metadata');
  const [platform, arch] = info.target.split('/');
  aria2Target(platform, arch);
  if (info.recipeSha256 !== aria2RecipeSha256 || JSON.stringify(info.sources) !== JSON.stringify(provenanceFor(platform))) throw new Error('Cached aria2 build recipe/source mismatch; remove .tools/aria2 and rerun setup');
  for (const notice of info.notices) {
    if (!/^[\w./-]+$/.test(notice.name) || notice.name.startsWith('/') || notice.name.split('/').includes('..')) throw new Error('Invalid aria2 notice path');
    if (hash(readFileSync(path.join(directory, 'licenses', notice.name))) !== notice.sha256) throw new Error(`aria2 notice checksum mismatch: ${notice.name}`);
  }
  return info;
}

export async function ensureAria2({ download = true, projectRoot = aria2Root, platform = process.platform, arch = process.arch, fetcher = fetch, execute = spawnSync } = {}) {
  const target = aria2Target(platform, arch), tools = path.join(projectRoot, '.tools'), directory = path.join(tools, 'aria2');
  const name = platform === 'win32' ? 'aria2c.exe' : 'aria2c', executable = path.join(directory, name);
  if (existsSync(executable)) {
    const info = readAria2BuildInfo(directory);
    if (info.target !== target || hash(readFileSync(executable)) !== info.executableSha256 || platform === 'win32' && info.executableSha256 !== windowsExecutableHash) throw new Error('Cached aria2 executable checksum/target mismatch; remove .tools/aria2 and rerun setup');
    validateAria2Version(command(execute, executable, ['--version']));
    return executable;
  }
  if (!download) throw new Error('Pinned aria2 is missing. Run node tools/setup-aria2.mjs.');
  const assets = assetsFor(platform);
  const archives = path.join(tools, 'aria2-downloads');
  // Bound concurrency avoids hammering release servers and limits in-memory archives.
  for (const asset of assets) await acquire(asset, archives, fetcher);
  const staging = path.join(tools, `aria2-staging-${process.pid}`);
  if (existsSync(staging)) throw new Error(`aria2 setup already has a staging directory: ${staging}`);
  mkdirSync(staging, { recursive: true });
  // Autotools embeds linker paths into Makefiles. POSIX /tmp keeps those paths
  // independent of checkout names containing whitespace; only finished files
  // are copied back before the atomic rename within .tools/.
  const buildDirectory = platform === 'win32' ? staging : mkdtempSync('/tmp/maaverge-aria2-');
  try {
    const temporary = path.join(staging, name); let configuration = [], compiler = '';
    if (platform === 'win32') {
      const bytes = archiveFile(execute, path.join(archives, aria2Assets.windows.name), `${aria2Assets.windows.root}/aria2c.exe`);
      if (hash(bytes) !== windowsExecutableHash) throw new Error('Official aria2 executable SHA-256 mismatch');
      writeFileSync(temporary, bytes);
    } else {
      const source = unpackSource(execute, path.join(archives, aria2Assets.aria2.name), buildDirectory, aria2Assets.aria2);
      const opensslDirectory = path.join(buildDirectory, 'openssl-install');
      if (platform === 'linux') {
        const openssl = unpackSource(execute, path.join(archives, aria2Assets.openssl.name), buildDirectory, aria2Assets.openssl);
        command(execute, 'perl', ['Configure', 'linux-x86_64', 'no-shared', 'no-tests', 'no-module', 'no-dso', `--prefix=${opensslDirectory}`, '--openssldir=/etc/ssl', '--libdir=lib'], { cwd: openssl });
        command(execute, 'make', ['-j2', 'build_libs'], { cwd: openssl, timeout: 1200000, stdio: 'inherit' });
        command(execute, 'make', ['install_dev'], { cwd: openssl, timeout: 180000 });
      }
      configuration = aria2BuildArguments(platform, opensslDirectory);
      const environment = { ...cleanRuntimeEnvironment(), ...(platform === 'darwin' ? { MACOSX_DEPLOYMENT_TARGET: '13.5' } : {}) };
      command(execute, source + '/configure', configuration, { cwd: source, env: environment });
      command(execute, 'make', ['-j2', '-C', 'lib'], { cwd: source, env: environment, timeout: 600000, stdio: 'inherit' });
      command(execute, 'make', ['-j2', '-C', 'src', 'aria2c'], { cwd: source, env: environment, timeout: 1200000, stdio: 'inherit' });
      copyFileSync(path.join(source, 'src/aria2c'), temporary);
      compiler = command(execute, 'c++', ['--version']).trim();
      if (platform === 'linux') {
        const libraries = command(execute, 'ldd', [temporary]);
        if (/lib(?:ssl|crypto|stdc\+\+|gcc_s)\./.test(libraries) || /not found/.test(libraries)) throw new Error(`aria2 has unexpected dynamic runtime dependencies: ${libraries}`);
      }
      chmodSync(temporary, 0o755);
    }
    const versionOutput = validateAria2Version(command(execute, temporary, ['--version']));
    const notices = collectNotices(execute, assets, archives, path.join(staging, 'licenses'), target);
    const info = { version: aria2Version, target, recipeSha256: aria2RecipeSha256, executableSha256: hash(readFileSync(temporary)), sources: provenanceFor(platform), configuration, compiler, versionOutput, notices };
    writeFileSync(path.join(staging, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
    // Do not copy build trees into the product runtime.
    if (existsSync(directory)) throw new Error('Incomplete aria2 cache exists; remove .tools/aria2 and rerun setup');
    renameSync(staging, directory);
    return executable;
  } finally {
    if (buildDirectory !== staging) removeWithin(buildDirectory, '/tmp');
    removeWithin(staging, tools);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`aria2 ${aria2Version}: ${await ensureAria2({ download: !process.argv.includes('--check') })}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
