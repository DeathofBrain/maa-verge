/** Engine-specific, immutable views of existing MaaResource assets. */
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assets from '../../../../../3rdparty/maaframework/runtime-assets.json';

export const frameworkVersion = assets.version;
const adapterVersion = 1;
const clients = new Set(['Official', 'Bilibili', 'YoStarEN', 'YoStarJP', 'YoStarKR', 'txwy']);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const pathKey = (value: string) =>
  process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const within = (parent: string, child: string) => {
  const relative = path.relative(parent, child);
  return (
    relative !== '' &&
    !path.isAbsolute(relative) &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep)
  );
};
export interface FrameworkView {
  path: string;
  generation: string;
  sourcePaths: string[];
  ocrAvailable: boolean;
  templates: Record<string, string>;
  diagnostic?: string;
}
export interface FrameworkOcrCapabilities {
  ocrAvailable: boolean;
  diagnostic?: string;
}
export interface PrepareFrameworkResourceOptions {
  source: string;
  destination: string;
  clientType: string;
  frameworkVersion: string;
  signal?: AbortSignal;
  /** Must load the candidate and probe recognition without creating a Controller. */
  validate?: (directory: string) => Promise<FrameworkOcrCapabilities>;
}
type AssetFile = { source: string; relative: string; sha256: string; size: number };
type ResourceManifest = {
  formatVersion: 1;
  adapterVersion: number;
  frameworkVersion: string;
  clientType: string;
  sourcePaths: string[];
  sources: AssetFile[];
  license: { inheritedFrom: string[]; noticeFiles: string[] };
  ocrAvailable: boolean;
  templates: Record<string, string>;
  diagnostic?: string;
  files: Record<string, { sha256: string; size: number }>;
};
async function plainDirectory(directory: string): Promise<void> {
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    pathKey(await realpath(directory)) !== pathKey(directory)
  )
    throw new Error('MaaFramework资源目录不能经过文件系统链接');
}
async function prepareParent(directory: string): Promise<void> {
  let ancestor = directory;
  for (;;) {
    try {
      await plainDirectory(ancestor);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
  await mkdir(directory, { recursive: true });
  await plainDirectory(directory);
}
async function readPlain(filename: string, limit: number, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted();
  await plainDirectory(path.dirname(filename));
  const before = await lstat(filename);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size > limit ||
    pathKey(await realpath(filename)) !== pathKey(filename)
  )
    throw new Error('MaaFramework资源必须是有界的独立普通文件');
  const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await file.stat();
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.nlink !== 1 ||
      opened.size !== before.size
    )
      throw new Error('MaaFramework资源在读取前发生变化');
    const bytes = Buffer.alloc(opened.size + 1);
    let length = 0;
    while (length < bytes.length) {
      signal?.throwIfAborted();
      const result = await file.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const after = await file.stat();
    const current = await lstat(filename);
    signal?.throwIfAborted();
    if (
      length !== opened.size ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      current.dev !== opened.dev ||
      current.ino !== opened.ino ||
      current.nlink !== 1 ||
      current.isSymbolicLink() ||
      pathKey(await realpath(filename)) !== pathKey(filename)
    )
      throw new Error('MaaFramework资源在读取期间发生变化');
    return bytes.subarray(0, length);
  } finally {
    await file.close();
  }
}
async function optionalFile(filename: string): Promise<boolean> {
  try {
    await lstat(filename);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
function validRelative(relative: string): boolean {
  return (
    Boolean(relative) &&
    !relative.includes('\\') &&
    !relative.includes('\0') &&
    !relative.includes(':') &&
    !path.posix.isAbsolute(relative) &&
    relative
      .split('/')
      .every(
        (part) =>
          part &&
          part !== '.' &&
          part !== '..' &&
          !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part),
      )
  );
}
async function templateFiles(root: string, signal?: AbortSignal): Promise<Map<string, string>> {
  signal?.throwIfAborted();
  const result = new Map<string, string>();
  if (!(await optionalFile(root))) return result;
  await plainDirectory(root);
  const visit = async (directory: string, prefix: string): Promise<void> => {
    signal?.throwIfAborted();
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      signal?.throwIfAborted();
      const relative = prefix + entry.name;
      if (!validRelative(relative)) throw new Error('模板包含不安全的相对路径');
      const filename = path.join(directory, entry.name);
      const info = await lstat(filename);
      if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory()))
        throw new Error('模板目录不允许链接或特殊文件');
      if (info.isDirectory()) {
        await plainDirectory(filename);
        await visit(filename, relative + '/');
      } else if (/\.png$/i.test(entry.name)) {
        if (info.nlink !== 1) throw new Error('模板不允许硬链接');
        result.set(relative, filename);
        if (result.size > 50_000) throw new Error('模板数量超出限制');
      }
    }
  };
  await visit(root, '');
  return result;
}
function validTemplate(bytes: Buffer): boolean {
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(pngSignature) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  )
    return false;
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 16_777_216;
}
async function verifyResourceFiles(
  directory: string,
  files: ResourceManifest['files'],
  signal?: AbortSignal,
  withManifest = false,
): Promise<void> {
  const found = new Set<string>();
  const visit = async (current: string, prefix: string): Promise<void> => {
    signal?.throwIfAborted();
    await plainDirectory(current);
    for (const entry of await readdir(current, { withFileTypes: true })) {
      signal?.throwIfAborted();
      const relative = prefix + entry.name,
        filename = path.join(current, entry.name);
      if (!validRelative(relative)) throw new Error('资源视图包含不安全的相对路径');
      const info = await lstat(filename);
      if (info.isDirectory() && !info.isSymbolicLink()) {
        await visit(filename, relative + '/');
        continue;
      }
      if (withManifest && relative === 'manifest.json') continue;
      const expected = files[relative];
      if (!expected) throw new Error('资源视图包含未登记文件');
      const bytes = await readPlain(filename, 128 * 1024 * 1024, signal);
      if (bytes.length !== expected.size || digest(bytes) !== expected.sha256)
        throw new Error('资源视图完整性校验失败');
      found.add(relative);
    }
  };
  await visit(directory, '');
  if (found.size !== Object.keys(files).length) throw new Error('资源视图存在缺失文件');
}
const inFlight = new Map<
  string,
  {
    validate: PrepareFrameworkResourceOptions['validate'];
    signal?: AbortSignal;
    promise: Promise<FrameworkView>;
  }
>();
export function prepareFrameworkResources(
  options: PrepareFrameworkResourceOptions,
): Promise<FrameworkView> {
  const key = JSON.stringify([
    path.resolve(options.source),
    path.resolve(options.destination),
    options.clientType,
    options.frameworkVersion,
  ]);
  const previous = inFlight.get(key);
  if (previous && previous.validate === options.validate && previous.signal === options.signal)
    return previous.promise;
  const promise = prepare(options).finally(() => {
    if (inFlight.get(key)?.promise === promise) inFlight.delete(key);
  });
  inFlight.set(key, { validate: options.validate, signal: options.signal, promise });
  return promise;
}
async function prepare(options: PrepareFrameworkResourceOptions): Promise<FrameworkView> {
  const signal = options.signal;
  signal?.throwIfAborted();
  if (!clients.has(options.clientType) || options.frameworkVersion !== frameworkVersion)
    throw new Error('不支持的MaaFramework版本或客户端');
  const source = path.resolve(options.source),
    destination = path.resolve(options.destination);
  if (source === destination || within(source, destination) || within(destination, source))
    throw new Error('资源视图缓存不能与来源目录重叠');
  await plainDirectory(source);
  signal?.throwIfAborted();
  await prepareParent(destination);
  signal?.throwIfAborted();
  const overlay = ['Official', 'Bilibili'].includes(options.clientType)
    ? undefined
    : path.join(source, 'global', options.clientType, 'resource');
  if (overlay) await plainDirectory(overlay);
  const sourcePaths = overlay ? [source, overlay] : [source];
  const staging = path.join(destination, `.prepare-${randomUUID()}`);
  await mkdir(staging);
  const sources: AssetFile[] = [],
    files: ResourceManifest['files'] = {},
    templates: Record<string, string> = {};
  let totalBytes = 0;
  const copy = async (filename: string, relative: string, limit: number, png = false) => {
    const bytes = await readPlain(filename, limit, signal);
    signal?.throwIfAborted();
    if (!bytes.length || (png && !validTemplate(bytes)))
      throw new Error('MaaFramework资源文件为空或PNG模板无效');
    totalBytes += bytes.length;
    if (totalBytes > 1024 ** 3) throw new Error('MaaFramework资源视图超出大小限制');
    const record = { sha256: digest(bytes), size: bytes.length };
    sources.push({ source: filename, relative, ...record });
    files[relative] = record;
    await mkdir(path.dirname(path.join(staging, relative)), { recursive: true });
    signal?.throwIfAborted();
    await writeFile(path.join(staging, relative), bytes, { flag: 'wx' });
    signal?.throwIfAborted();
  };
  try {
    signal?.throwIfAborted();
    const selectedTemplates = await templateFiles(path.join(source, 'template'), signal);
    if (overlay)
      for (const entry of await templateFiles(path.join(overlay, 'template'), signal))
        selectedTemplates.set(...entry);
    for (const [id, filename] of [...selectedTemplates].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      const relative = `image/${id}`;
      await copy(filename, relative, 16 * 1024 * 1024, true);
      templates[id] = relative;
    }
    const base = path.join(source, 'PaddleOCR');
    const localized = overlay && path.join(overlay, 'PaddleOCR');
    const choose = async (relative: string) =>
      localized && (await optionalFile(path.join(localized, relative)))
        ? path.join(localized, relative)
        : path.join(base, relative);
    const detector = await choose('det/inference.onnx');
    const localRec =
      localized &&
      ((await optionalFile(path.join(localized, 'rec/inference.onnx'))) ||
        (await optionalFile(path.join(localized, 'rec/keys.txt'))));
    const recRoot = localRec ? localized! : base;
    const models = [
      [detector, 'model/ocr/det.onnx'],
      [path.join(recRoot, 'rec/inference.onnx'), 'model/ocr/rec.onnx'],
      [path.join(recRoot, 'rec/keys.txt'), 'model/ocr/keys.txt'],
    ];
    let modelReady = true;
    for (const [filename] of models) {
      signal?.throwIfAborted();
      if (!(await optionalFile(filename!))) modelReady = false;
    }
    let diagnostic: string | undefined = modelReady
      ? undefined
      : '当前客户端缺少成套OCR权重或字典；OCR已禁用，未替换模型';
    if (modelReady)
      for (const [filename, relative] of models)
        await copy(filename!, relative!, 128 * 1024 * 1024);
    const noticeFiles: string[] = [];
    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'NOTICE', 'NOTICE.md']) {
      signal?.throwIfAborted();
      const filename = path.join(source, name);
      if (await optionalFile(filename)) {
        await copy(filename, `licenses/${name}`, 1024 * 1024);
        noticeFiles.push(filename);
      }
    }
    let ocrAvailable = false;
    if (options.validate) {
      try {
        signal?.throwIfAborted();
        const result = await options.validate(staging);
        signal?.throwIfAborted();
        if (!result || typeof result.ocrAvailable !== 'boolean')
          throw new Error('OCR校验返回值无效');
        ocrAvailable = modelReady && result.ocrAvailable;
        if (!ocrAvailable)
          diagnostic =
            result.diagnostic || diagnostic || '共享OCR模型未通过MaaFramework兼容性探针；OCR已禁用';
      } catch (error) {
        signal?.throwIfAborted();
        if (!modelReady) throw error;
        diagnostic = '共享OCR模型校验失败；OCR已禁用：' + String(error);
      }
    } else diagnostic = diagnostic || '尚未执行MaaFramework加载与合成图探针；OCR已禁用';
    if (!ocrAvailable && modelReady) {
      await rm(path.join(staging, 'model'), { recursive: true, force: true });
      for (const key of Object.keys(files)) if (key.startsWith('model/')) delete files[key];
      if (options.validate) {
        // A model failure must not conceal an invalid template-only resource.
        signal?.throwIfAborted();
        const result = await options.validate(staging);
        signal?.throwIfAborted();
        if (!result || typeof result.ocrAvailable !== 'boolean')
          throw new Error('模板资源加载校验失败');
      }
    }
    const manifest: ResourceManifest = {
      formatVersion: 1,
      adapterVersion,
      frameworkVersion: options.frameworkVersion,
      clientType: options.clientType,
      sourcePaths,
      sources,
      license: { inheritedFrom: sourcePaths, noticeFiles },
      ocrAvailable,
      templates,
      ...(diagnostic ? { diagnostic: diagnostic.slice(0, 2000) } : {}),
      files,
    };
    try {
      await verifyResourceFiles(staging, files, signal);
    } catch (error) {
      signal?.throwIfAborted();
      throw new Error('资源候选在校验期间发生变化', { cause: error });
    }
    const generation =
      'framework-' + digest(JSON.stringify({ ...manifest, diagnostic: undefined })).slice(0, 32);
    const final = path.join(destination, generation);
    signal?.throwIfAborted();
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
      flag: 'wx',
    });
    try {
      signal?.throwIfAborted();
      await rename(staging, final);
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? ''))
        throw error;
      await plainDirectory(final);
      const saved = JSON.parse(
        (await readPlain(path.join(final, 'manifest.json'), 32 * 1024 * 1024, signal)).toString(
          'utf8',
        ),
      );
      if (
        digest(JSON.stringify({ ...saved, diagnostic: undefined })) !==
        digest(JSON.stringify({ ...manifest, diagnostic: undefined }))
      )
        throw new Error('已存在的资源视图清单不匹配');
      try {
        await verifyResourceFiles(final, files, signal, true);
      } catch (error) {
        signal?.throwIfAborted();
        throw new Error('已存在的资源视图完整性校验失败', { cause: error });
      }
    }
    signal?.throwIfAborted();
    return {
      path: final,
      generation,
      sourcePaths,
      ocrAvailable,
      templates,
      ...(diagnostic ? { diagnostic: diagnostic.slice(0, 2000) } : {}),
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function resolveFrameworkSdk(
  options: {
    applicationRuntimeDirectory?: string;
    checkoutRoot?: string;
    platform?: NodeJS.Platform;
    arch?: string;
  } = {},
): Promise<{ path: string; version: string; target: string }> {
  const systems: Partial<Record<NodeJS.Platform, string>> = {
    win32: 'windows',
    darwin: 'macos',
    linux: 'linux',
  };
  const system = systems[options.platform ?? process.platform];
  const target = `${system}-${options.arch ?? process.arch}`;
  const selected = (assets.targets as Record<string, { sha256: string }>)[target];
  if (!selected) throw new Error('当前平台没有固定版本的MaaFramework SDK');
  const checkoutRoot =
    options.checkoutRoot ?? fileURLToPath(new URL('../../../../../', import.meta.url));
  const candidates = [
    ...(options.applicationRuntimeDirectory
      ? [
          path.join(
            options.applicationRuntimeDirectory,
            'engines',
            'maafw',
            frameworkVersion,
            target,
          ),
        ]
      : []),
    ...(!Bun.isStandaloneExecutable
      ? [path.join(checkoutRoot, '.tools', 'maafw', frameworkVersion, target)]
      : []),
  ];
  for (const directory of candidates) {
    if (!(await optionalFile(directory))) continue;
    await plainDirectory(directory);
    const manifest = JSON.parse(
      (await readPlain(path.join(directory, 'maafw-manifest.json'), 4 * 1024 * 1024)).toString(
        'utf8',
      ),
    );
    if (
      manifest.formatVersion !== 1 ||
      manifest.version !== frameworkVersion ||
      manifest.target !== target ||
      manifest.archiveSha256 !== selected.sha256 ||
      !manifest.files ||
      typeof manifest.files !== 'object'
    )
      throw new Error('MaaFramework SDK与固定资产清单不匹配');
    const library = target.startsWith('windows')
      ? 'MaaFramework.dll'
      : target.startsWith('macos')
        ? 'libMaaFramework.dylib'
        : 'libMaaFramework.so';
    const relative = `bin/${library}`;
    if (!Object.hasOwn(manifest.files, relative)) throw new Error('MaaFramework缺少原生库清单');
    const found = new Set<string>();
    const verifyDirectory = async (current: string, prefix: string): Promise<void> => {
      await plainDirectory(current);
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const name = prefix + entry.name;
        if (!validRelative(name)) throw new Error('MaaFramework SDK包含不安全的相对路径');
        const filename = path.join(current, entry.name);
        const info = await lstat(filename);
        if (info.isDirectory() && !info.isSymbolicLink()) {
          await verifyDirectory(filename, name + '/');
          continue;
        }
        if (name === 'maafw-manifest.json') continue;
        const expected = manifest.files[name];
        if (
          !expected ||
          !Number.isSafeInteger(expected.size) ||
          expected.size < 0 ||
          !/^[a-f0-9]{64}$/.test(expected.sha256)
        )
          throw new Error('MaaFramework SDK文件未登记或清单无效');
        const bytes = await readPlain(filename, 256 * 1024 * 1024);
        if (expected.size !== bytes.length || expected.sha256 !== digest(bytes))
          throw new Error('MaaFramework SDK文件完整性校验失败');
        found.add(name);
      }
    };
    await verifyDirectory(directory, '');
    if (Object.keys(manifest.files).length !== found.size)
      throw new Error('MaaFramework SDK清单存在缺失文件');
    await plainDirectory(path.join(directory, 'share', 'MaaAgentBinary'));
    return { path: directory, version: frameworkVersion, target };
  }
  throw new Error('固定版本MaaFramework SDK尚未准备，请运行node tools/prepare-maafw.mjs');
}
