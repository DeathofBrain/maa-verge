import { lstat, mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildResourceKnowledge, validResourceKnowledgePack } from './resource-knowledge';
import { productKnowledge, productKnowledgeDigest } from './product-knowledge';
import type { ClientType, Combo } from '../resources/item-resources';

const within = (parent: string, child: string) => {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  );
};
async function outputRealpath(file: string): Promise<string> {
  let ancestor = path.resolve(file);
  const suffix: string[] = [];
  for (;;) {
    try {
      return path.join(await realpath(ancestor), ...suffix);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const entry = await lstat(ancestor).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (entry) throw new Error('输出目录包含无法解析的链接');
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error('无法解析输出目录');
    suffix.unshift(path.basename(ancestor));
    ancestor = parent;
  }
}
async function json(file: string): Promise<any> {
  try {
    if ((await stat(file)).size > 24 * 1024 * 1024) return;
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return;
  }
}
async function publish(file: string, value: unknown) {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  try {
    if ((await stat(file)).size <= 24 * 1024 * 1024 && (await readFile(file, 'utf8')) === bytes)
      return;
  } catch {
    /* First build. */
  }
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    const handle = await open(temporary, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Offline public-data export. It opens no business database, model, device or network connection. */
export async function buildKnowledgeFiles(combo: Combo, clientType: ClientType, output: string) {
  if (!combo.resource?.path) throw new Error('请指定包含 resource 子目录的资源 generation');
  const source = await realpath(combo.resource.path),
    destination = path.resolve(output);
  if (within(source, destination)) throw new Error('数据集输出目录不能位于原生资源目录内');
  const directory = path.join(destination, clientType);
  if (
    within(source, await outputRealpath(destination)) ||
    within(source, await outputRealpath(directory))
  )
    throw new Error('数据集输出目录不能链接到原生资源目录内');
  await mkdir(destination, { recursive: true });
  if (within(source, await realpath(destination)))
    throw new Error('数据集输出目录不能链接到原生资源目录内');
  await mkdir(directory, { recursive: true });
  if (within(source, await realpath(directory)))
    throw new Error('客户端输出目录不能链接到原生资源目录内');
  const manifest = await json(path.join(directory, 'manifest.json'));
  const prior =
    typeof manifest?.resources === 'string' &&
    /^resources-[a-f0-9]{64}\.json$/.test(manifest.resources)
      ? await json(path.join(directory, manifest.resources))
      : undefined;
  const pack = await buildResourceKnowledge(
    combo,
    clientType,
    validResourceKnowledgePack(prior) ? prior : undefined,
  );
  if (!pack.sources.some((source) => source.status === 'available'))
    throw new Error('没有可解析的资源文件；未发布知识包');
  const resources = `resources-${pack.fingerprint}.json`,
    product = `product-${productKnowledgeDigest}.json`;
  const records = productKnowledge(),
    counts: Record<string, number> = {};
  for (const row of [...pack.records, ...records]) counts[row.kind] = (counts[row.kind] ?? 0) + 1;
  const result = {
    formatVersion: 1,
    clientType,
    resources,
    product,
    resourceFingerprint: pack.fingerprint,
    productFingerprint: productKnowledgeDigest,
    counts,
    diagnostics: pack.diagnostics,
  };
  await publish(path.join(directory, resources), pack);
  await publish(path.join(directory, product), {
    formatVersion: 1,
    digest: productKnowledgeDigest,
    records,
  });
  // Only the small manifest changes after both immutable data files have been published.
  await publish(path.join(directory, 'manifest.json'), result);
  return { manifest: path.join(directory, 'manifest.json'), ...result };
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2),
      options: Record<string, string> = {};
    for (let i = 0; i < args.length; i += 2) {
      if (
        !['--resource', '--output', '--client', '--version'].includes(args[i]) ||
        !args[i + 1] ||
        args[i + 1].startsWith('--') ||
        options[args[i]]
      )
        throw new Error(
          '用法：pnpm knowledge:build --resource <generation> [--output <目录>] [--client Official] [--version <资源版本>]',
        );
      options[args[i]] = args[i + 1];
    }
    const client = options['--client'] ?? 'Official';
    if (!['Official', 'Bilibili', 'YoStarEN', 'YoStarJP', 'YoStarKR', 'txwy'].includes(client))
      throw new Error('客户端无效');
    if (!options['--resource']) throw new Error('缺少 --resource <generation>');
    const result = await buildKnowledgeFiles(
      {
        resource: {
          path: path.resolve(options['--resource']),
          ...(options['--version'] ? { version: options['--version'] } : {}),
        },
      },
      client as ClientType,
      options['--output'] ?? path.resolve(import.meta.dir, '../../../../../config/knowledge'),
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
  }
}
