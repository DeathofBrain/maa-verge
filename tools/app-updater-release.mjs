/** Assemble and verify Tauri 2 signed application updates. No GitHub writes. */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  installerKind,
  releaseVersion,
  updaterAssetKind,
  releaseInstallerKinds,
  releaseUpdaterAssetKinds,
} from './release-assets.mjs';
import { desktop, run } from './project.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = 'https://github.com/DeathofBrain/maa-verge';
const signatureLimit = 16 * 1024;
const platformInstallers = {
  'windows-x86_64': ['windows-exe-x64', 'windows-full-zip-x64'],
  'darwin-aarch64': ['macos-dmg-arm64'],
  'darwin-x86_64': ['macos-dmg-x64'],
  'linux-x86_64': ['linux-appimage-x64'],
};
const installerSuffixes = {
  'windows-exe-x64': (version) => `_${version}_x64-setup.exe`,
  'windows-full-zip-x64': (version) => `_${version}_x64-full.zip`,
  'macos-dmg-arm64': (version) => `_${version}_aarch64.dmg`,
  'macos-dmg-x64': (version) => `_${version}_x64.dmg`,
  'linux-appimage-x64': (version) => `_${version}_amd64.AppImage`,
};

export function updaterBuildArguments(env = process.env, platform = process.platform) {
  const bundles = { win32: 'nsis', darwin: 'dmg', linux: 'appimage' }[platform];
  if (!bundles) throw new Error('不支持的发行平台');
  return [
    '--config',
    JSON.stringify({
      bundle: {
        // macOS signs the complete DMG below and never emits a tar updater archive.
        createUpdaterArtifacts: platform !== 'darwin' && !!env.TAURI_SIGNING_PRIVATE_KEY?.trim(),
      },
    }),
    '--bundles',
    bundles,
  ];
}

export async function releaseConfiguration(directory = root, tag) {
  const json = async (relative) =>
    JSON.parse(await readFile(path.join(directory, relative), 'utf8'));
  const [pkg, desktop, backend, tauri, cargo] = await Promise.all([
    json('package.json'),
    json('apps/desktop/package.json'),
    json('services/backend/package.json'),
    json('apps/desktop/src-tauri/tauri.conf.json'),
    readFile(path.join(directory, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8'),
  ]);
  const version = releaseVersion(`v${pkg.version}`);
  const cargoPackage = /^\[package\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(cargo)?.[1];
  const cargoVersion = /^version\s*=\s*"([^"]+)"\s*$/m.exec(cargoPackage ?? '')?.[1];
  if (
    [desktop.version, backend.version, tauri.version, cargoVersion].some(
      (value) => value !== version,
    )
  )
    throw new Error('根包、桌面、服务、Tauri 与 Cargo 的应用版本必须完全一致');
  if (tag !== undefined && releaseVersion(tag) !== version)
    throw new Error('发行标签必须与当前源码的应用版本一致；请先提交版本变更');
  return { version, publicKey: tauri.plugins?.updater?.pubkey, productName: tauri.productName };
}

function decodeBase64(value, description) {
  if (
    typeof value !== 'string' ||
    value.length > signatureLimit ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value) ||
    value.length % 4 !== 0
  )
    throw new Error(`${description}不是规范的 Base64`);
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error(`${description}不是规范的 Base64`);
  return bytes;
}
function textBox(value, description) {
  try {
    return new TextDecoder('utf-8', { fatal: true })
      .decode(decodeBase64(value, description))
      .replaceAll('\r\n', '\n')
      .trimEnd()
      .split('\n');
  } catch {
    throw new Error(`${description}格式无效`);
  }
}

/** Verify Tauri's base64(minisign box), including the signed version comment. */
export async function verifyUpdaterSignature(filename, signatureText, publicKey, version) {
  const keyLines = textBox(publicKey?.trim(), '更新公钥');
  if (keyLines.length !== 2 || !keyLines[0].startsWith('untrusted comment: '))
    throw new Error('更新公钥格式无效');
  const key = decodeBase64(keyLines[1], '更新公钥');
  if (key.length !== 42 || key.subarray(0, 2).toString() !== 'Ed')
    throw new Error('更新公钥类型无效');
  const lines = textBox(signatureText.trim(), '更新签名');
  if (
    lines.length !== 4 ||
    !lines[0].startsWith('untrusted comment: ') ||
    !lines[2].startsWith('trusted comment: ')
  )
    throw new Error('更新签名格式无效');
  const signed = decodeBase64(lines[1], '更新签名'),
    global = decodeBase64(lines[3], '签名注释');
  if (
    signed.length !== 74 ||
    signed.subarray(0, 2).toString() !== 'ED' ||
    global.length !== 64 ||
    !signed.subarray(2, 10).equals(key.subarray(2, 10))
  )
    throw new Error('更新签名与公钥不匹配');
  const trusted = lines[2].slice('trusted comment: '.length);
  const fields = trusted.split('\t');
  if (
    fields.length !== 3 ||
    !/^timestamp:\d+$/.test(fields[0]) ||
    !/^file:[^\t\r\n]+$/.test(fields[1]) ||
    fields[2] !== `version:${version}`
  )
    throw new Error('更新签名未绑定正确的应用版本');
  const publicObject = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key.subarray(10)]),
    format: 'der',
    type: 'spki',
  });
  const signature = signed.subarray(10);
  if (!verify(null, Buffer.concat([signature, Buffer.from(trusted)]), publicObject, global))
    throw new Error('更新签名的版本注释校验失败');
  const hash = createHash('blake2b512');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  if (!verify(null, hash.digest(), publicObject, signature)) throw new Error('更新包签名校验失败');
  return signatureText.trim();
}

async function regularFile(filename, limit = Number.MAX_SAFE_INTEGER) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > limit)
    throw new Error(`发行产物必须是大小有效的普通文件：${path.basename(filename)}`);
  return info;
}
async function listFiles(directory, recurse = false, depth = 0) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('发行产物目录不能包含符号链接');
    const filename = path.join(directory, entry.name);
    if (entry.isFile()) files.push(filename);
    // Tauri writes artifacts directly inside bundle/<format>. Generated .app,
    // AppDir and package staging trees can contain legitimate internal symlinks.
    else if (
      recurse &&
      depth === 0 &&
      entry.isDirectory() &&
      !entry.name.endsWith('.app') &&
      !entry.name.endsWith('.AppDir')
    )
      files.push(...(await listFiles(filename, true, depth + 1)));
    else if (!recurse && entry.isDirectory()) throw new Error('发行文件集合必须是扁平目录');
    else if (!entry.isDirectory()) throw new Error('发行产物目录包含不支持的文件类型');
  }
  return files;
}

/** Sign the complete installer without changing the DMG or its first-install path. */
export async function signMacosInstaller({
  version,
  productName,
  publicKey,
  directory = desktop,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  runner = run,
}) {
  if (platform !== 'darwin') return;
  releaseVersion(`v${version}`);
  const dmgArch = { arm64: 'aarch64', x64: 'x64' }[arch];
  if (!dmgArch) throw new Error('不支持的 macOS 安装包架构');
  const directoryName = path.join(directory, 'src-tauri', 'target', 'release', 'bundle', 'dmg');
  const expected = `${productName}_${version}_${dmgArch}.dmg`;
  const matches = (await listFiles(directoryName)).filter(
    (file) => path.basename(file) === expected,
  );
  if (matches.length !== 1) throw new Error('未找到唯一的 macOS 完整安装包');
  const filename = matches[0];
  await regularFile(filename);
  // An unsigned rebuild must not retain a signature from a previous package.
  await rm(`${filename}.sig`, { force: true });
  if (!env.TAURI_SIGNING_PRIVATE_KEY?.trim()) return filename;
  // Tauri reads the existing key/password from the environment, never argv.
  // --app-version authenticates the application SemVer in the trusted comment.
  await runner('pnpm', ['exec', 'tauri', 'signer', 'sign', '--app-version', version, filename], {
    cwd: directory,
  });
  await regularFile(`${filename}.sig`, signatureLimit);
  await verifyUpdaterSignature(
    filename,
    await readFile(`${filename}.sig`, 'utf8'),
    publicKey,
    version,
  );
  return filename;
}

export async function collectUpdaterArtifacts({
  input,
  output,
  target,
  version,
  publicKey,
  productName = 'Maa Verge',
}) {
  const required = platformInstallers[target];
  if (!required) throw new Error('未知发行平台');
  releaseVersion(`v${version}`);
  if (
    typeof productName !== 'string' ||
    !productName ||
    productName !== productName.trim() ||
    productName.length > 128 ||
    /[<>:"/\\|?*\x00-\x1f]/.test(productName) ||
    productName.endsWith('.')
  )
    throw new Error('配置的产品名称不能用于发行文件名');
  const files = await listFiles(input, true),
    selected = [];
  for (const kind of required) {
    // Tauri uses productName verbatim, including spaces, in bundle filenames.
    // Match complete configured/canonical names, never a guessed prefix, and
    // reject raw + normalized duplicates instead of picking one arbitrarily.
    const suffix = installerSuffixes[kind](version),
      name = `Maa-Verge${suffix}`;
    const accepted = new Set([`${productName}${suffix}`, name]);
    const matches = files.filter((file) => accepted.has(path.basename(file)));
    if (matches.length !== 1) throw new Error(`未找到唯一的发行安装包：${kind}`);
    selected.push({
      file: matches[0],
      name,
      signed: kind !== 'windows-full-zip-x64',
    });
  }
  for (const item of selected) {
    await regularFile(item.file);
    if (item.signed) {
      await regularFile(`${item.file}.sig`, signatureLimit);
      await verifyUpdaterSignature(
        item.file,
        await readFile(`${item.file}.sig`, 'utf8'),
        publicKey,
        version,
      );
    }
  }
  // Fresh destinations keep stale assets from an earlier build out of releases.
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output, { recursive: false });
  const names = [];
  for (const item of selected) {
    await copyFile(item.file, path.join(output, item.name));
    names.push(item.name);
    if (item.signed) {
      await copyFile(`${item.file}.sig`, path.join(output, `${item.name}.sig`));
      names.push(`${item.name}.sig`);
    }
  }
  return names.sort();
}

export async function createUpdaterManifest({
  input,
  tag,
  publicKey,
  notes = '',
  publishedAt = new Date().toISOString(),
}) {
  const version = releaseVersion(tag),
    files = await listFiles(input),
    kinds = new Map();
  const required = [
    ...releaseInstallerKinds,
    ...releaseUpdaterAssetKinds.filter((kind) => kind !== 'manifest'),
  ];
  if (!Number.isFinite(Date.parse(publishedAt))) throw new Error('发行时间格式无效');
  for (const file of files) {
    const name = path.basename(file),
      kind = installerKind(name, version) || updaterAssetKind(name, version);
    if (!kind || !required.includes(kind) || kinds.has(kind))
      throw new Error(`未知、重复或已生成的发行产物：${name}`);
    await regularFile(file, name.endsWith('.sig') ? signatureLimit : Number.MAX_SAFE_INTEGER);
    kinds.set(kind, file);
  }
  if (required.some((kind) => !kinds.has(kind))) throw new Error('发行安装包或签名集合不完整');
  // Every complete installer used for updates must have a version-bound signature.
  for (const [kind, file] of kinds) {
    if (kind.endsWith('-signature') || kind === 'windows-full-zip-x64') continue;
    const signature = kinds.get(`${kind}-signature`);
    if (!signature) throw new Error('发行安装包缺少更新签名');
    await verifyUpdaterSignature(file, await readFile(signature, 'utf8'), publicKey, version);
  }
  const targets = {
    'windows-x86_64-nsis': 'windows-exe-x64',
    'darwin-aarch64-dmg': 'macos-dmg-arm64',
    'darwin-x86_64-dmg': 'macos-dmg-x64',
    'linux-x86_64': 'linux-appimage-x64',
  };
  const platforms = {};
  for (const [target, kind] of Object.entries(targets)) {
    const file = kinds.get(kind);
    platforms[target] = {
      signature: (await readFile(kinds.get(`${kind}-signature`), 'utf8')).trim(),
      url: `${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(path.basename(file))}`,
    };
  }
  const manifest = {
    version,
    notes: String(notes).slice(0, 16 * 1024),
    pub_date: new Date(publishedAt).toISOString(),
    platforms,
  };
  const manifestPath = path.join(input, 'latest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  const hashes = [];
  for (const file of [...files, manifestPath].sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b), 'en'),
  )) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    hashes.push(`${hash.digest('hex')}  ${path.basename(file)}`);
  }
  await writeFile(path.join(input, 'SHA256SUMS.txt'), `${hashes.join('\n')}\n`, { flag: 'wx' });
  return manifest;
}

async function main() {
  const [command, ...args] = process.argv.slice(2),
    options = {};
  if (!['check', 'collect', 'manifest'].includes(command))
    throw new Error(
      '用法：app-updater-release.mjs check|collect|manifest --tag v版本号 [--target 平台 --input 目录 --output 目录 --notes 文件]',
    );
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/, '');
    if (
      !['tag', 'target', 'input', 'output', 'notes'].includes(name) ||
      options[name] ||
      !args[index + 1]
    )
      throw new Error('发行命令参数无效或重复');
    options[name] = args[index + 1];
  }
  if (!options.tag) throw new Error('必须指定发行标签');
  const config = await releaseConfiguration(root, options.tag);
  if (command === 'check') {
    console.log(`已核对发行版本 ${config.version}`);
    return;
  }
  if (!options.input || (command === 'collect' && (!options.target || !options.output)))
    throw new Error('缺少发行产物目录或目标平台');
  if (command === 'collect') await collectUpdaterArtifacts({ ...options, ...config });
  else {
    let notes = `Maa Verge ${options.tag}`;
    if (options.notes) notes = await readFile(path.resolve(options.notes), 'utf8');
    else {
      try {
        notes = await readFile(path.join(root, 'docs/releases', `${options.tag}.md`), 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await createUpdaterManifest({ ...options, publicKey: config.publicKey, notes });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
