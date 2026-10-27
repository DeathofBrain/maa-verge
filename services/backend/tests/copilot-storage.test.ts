import { afterEach, expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CopilotLibrary, defaultCopilotOptions } from '../src/copilot';
import { Store } from '../src/storage';
import { Runtime } from '../src/runtime';
import { parseSettings } from '../src/models';

const roots: string[] = [];
const stores: Store[] = [];
const runtimes: Runtime[] = [];
const restores: (() => void)[] = [];
const content = (title = '缓存作业') =>
  JSON.stringify({ stage_name: 'main_01-07', doc: { title }, actions: [] });

function fixture() {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'maaverge-copilot-storage-'));
  roots.push(root);
  const store = new Store(root);
  stores.push(store);
  const storage = { directory: '', deleteJsonFiles: false };
  const changed: string[] = [];
  const library = new CopilotLibrary(root, store, {
    coreVersion: () => 'v6.20.0',
    resourceDirectory: () => undefined,
    storage: () => storage,
    changed: (message) => changed.push(message),
  });
  const imported = async (raw = content()) => {
    const preview = await library.preview({ content: raw });
    return library.import({ previewId: preview.id }).items[0]!;
  };
  return { root, store, storage, library, imported, changed };
}

afterEach(async () => {
  for (const restore of restores.splice(0).reverse()) restore();
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test('preview does not create a library JSON copy, while import uses isolated default cache', async () => {
  const { root, library } = fixture();
  const directory = path.join(root, 'cache', 'copilot');
  expect(library.storageInfo()).toEqual({ directory });
  const preview = await library.preview({ content: content() });
  expect(fs.existsSync(directory)).toBe(false);
  const record = library.import({ previewId: preview.id }).items[0]!;
  expect(fs.readFileSync(path.join(directory, record.versionId + '.json'), 'utf8')).toBe(content());
  expect(
    fs.readFileSync(path.join(root, 'copilot', 'versions', record.versionId + '.json'), 'utf8'),
  ).toBe(content());
});

test('JSON retention is opt-in deletion and never removes immutable queue versions', async () => {
  const { root, library, storage, imported } = fixture();
  const first = await imported();
  const filename = path.join(library.storageInfo().directory, first.versionId + '.json');
  expect(library.delete({ id: first.id })).toEqual({ deleted: true, deletedCount: 1 });
  expect(fs.existsSync(filename)).toBe(true);
  const second = await imported();
  library.workspaceSave({
    workspace: {
      kind: 'Copilot',
      options: defaultCopilotOptions(),
      queue: [
        {
          id: 'protected-entry',
          versionId: second.versionId,
          enabled: true,
          isRaid: true,
          navName: '1-7',
        },
      ],
    },
  });
  storage.deleteJsonFiles = true;
  library.delete({ id: second.id });
  expect(fs.existsSync(filename)).toBe(false);
  expect(
    fs.readFileSync(path.join(root, 'copilot', 'versions', second.versionId + '.json'), 'utf8'),
  ).toBe(content());
  expect(library.get({ versionId: second.versionId }).title).toBe('缓存作业');
  expect(library.workspaceGet({ kind: 'Copilot' }).queue[0]!.versionId).toBe(second.versionId);
});

test('shared cache JSON survives until its last library record is deleted', async () => {
  const { library, storage, imported } = fixture();
  const first = await imported(),
    second = await imported();
  expect(first.id).not.toBe(second.id);
  expect(first.versionId).toBe(second.versionId);
  const filename = path.join(library.storageInfo().directory, first.versionId + '.json');
  storage.deleteJsonFiles = true;
  library.delete({ id: first.id });
  expect(fs.existsSync(filename)).toBe(true);
  library.delete({ id: second.id });
  expect(fs.existsSync(filename)).toBe(false);
});

test('changing storage directories retains old locations and deletion follows each recorded copy', async () => {
  const { root, library, storage, imported } = fixture();
  const record = await imported();
  const oldDirectory = library.storageInfo().directory;
  storage.directory = path.join(root, 'custom-json');
  const next = await imported(content('另一位置'));
  expect(fs.existsSync(path.join(oldDirectory, record.versionId + '.json'))).toBe(true);
  expect(fs.existsSync(path.join(storage.directory, record.versionId + '.json'))).toBe(false);
  storage.deleteJsonFiles = true;
  library.delete({ ids: [record.id, next.id] });
  expect(fs.existsSync(path.join(oldDirectory, record.versionId + '.json'))).toBe(false);
  expect(fs.existsSync(path.join(storage.directory, next.versionId + '.json'))).toBe(false);
});

test('reimporting the same preview in another directory preserves both owned file locations', async () => {
  const { root, library, storage } = fixture();
  const preview = await library.preview({ content: content() });
  const record = library.import({ previewId: preview.id }).items[0]!;
  const oldDirectory = library.storageInfo().directory;
  storage.directory = path.join(root, 'second-cache');
  library.import({ previewId: preview.id });
  storage.deleteJsonFiles = true;
  library.delete({ id: record.id });
  expect(fs.existsSync(path.join(oldDirectory, record.versionId + '.json'))).toBe(false);
  expect(fs.existsSync(path.join(storage.directory, record.versionId + '.json'))).toBe(false);
});

test('identical external JSON is never claimed or deleted and conflicting contents are never replaced', async () => {
  const { library, storage, imported } = fixture();
  const directory = library.storageInfo().directory;
  fs.mkdirSync(directory, { recursive: true });
  const versionId = createHash('sha256').update(content()).digest('hex');
  const filename = path.join(directory, versionId + '.json');
  fs.writeFileSync(filename, content());
  const record = await imported();
  storage.deleteJsonFiles = true;
  library.delete({ id: record.id });
  expect(fs.readFileSync(filename, 'utf8')).toBe(content());
  fs.writeFileSync(filename, '外部同名文件');
  await expect(imported()).rejects.toThrow('不会覆盖');
  expect(library.list().total).toBe(0);
  expect(fs.readFileSync(filename, 'utf8')).toBe('外部同名文件');
});

test('cache directories cannot point to execution versions directly or through directory aliases', () => {
  const { root, library } = fixture();
  const versions = path.join(root, 'copilot', 'versions');
  expect(() => library.validateStorageDirectory(versions)).toThrow('受保护');
  expect(() => library.validateStorageDirectory(path.join(versions, 'subdirectory'))).toThrow(
    '受保护',
  );
  const alias = path.join(root, 'aliased-versions');
  fs.symlinkSync(versions, alias, process.platform === 'win32' ? 'junction' : 'dir');
  expect(() => library.validateStorageDirectory(alias)).toThrow('受保护');
  expect(() => library.validateStorageDirectory(path.join(alias, 'nested'))).toThrow('受保护');
});

test('replaced cache files cancel a whole deletion before records or other files change', async () => {
  const { library, storage, imported } = fixture();
  const first = await imported(content('保留甲')),
    second = await imported(content('保留乙'));
  const directory = library.storageInfo().directory;
  const firstFile = path.join(directory, first.versionId + '.json');
  const secondFile = path.join(directory, second.versionId + '.json');
  fs.writeFileSync(secondFile, '已被用户替换');
  storage.deleteJsonFiles = true;
  expect(() => library.delete({ all: true })).toThrow('文件已变化');
  expect(library.list().total).toBe(2);
  expect(fs.readFileSync(firstFile, 'utf8')).toBe(content('保留甲'));
  expect(fs.readFileSync(secondFile, 'utf8')).toBe('已被用户替换');
});

test('category deletion optionally removes all members across pages and all deletion covers uncategorized work', async () => {
  const { library, imported } = fixture();
  const category = library.categorySave({ name: '跨页分类' });
  const keep = library.categorySave({ name: '保留分类' });
  const ids: string[] = [];
  for (let index = 0; index < 23; index++)
    ids.push((await imported(content(`分类作业 ${index}`))).id);
  library.categoryAssign({ ids, categoryId: category.id });
  const outside = await imported(content('未分类作业'));
  expect(library.categoryDelete({ id: category.id, deleteCopilots: true })).toEqual({
    deleted: true,
    deletedCount: 23,
  });
  expect(library.list().items.map((record) => record.id)).toEqual([outside.id]);
  expect(library.categoryList().items.map((item) => item.id)).toEqual([keep.id]);
  const justCategory = library.categorySave({ name: '只删分类' });
  library.categoryAssign({ ids: [outside.id], categoryId: justCategory.id });
  expect(library.categoryDelete({ id: justCategory.id })).toEqual({
    deleted: true,
    deletedCount: 0,
  });
  expect(library.get({ id: outside.id }).categoryId).toBeNull();
  for (let index = 0; index < 22; index++) await imported(content(`全库作业 ${index}`));
  expect(library.delete({ all: true })).toEqual({ deleted: true, deletedCount: 23 });
  expect(library.list().total).toBe(0);
  expect(library.categoryList().items.map((item) => item.id)).toEqual([keep.id]);
});

test.each(['writeFileSync', 'fsyncSync'] as const)(
  'failed cache %s rolls back imported records and removes its partial JSON copy',
  async (operation) => {
    const { library, store } = fixture();
    const preview = await library.preview({ content: content() });
    const failure = spyOn(fs, operation).mockImplementation(() => {
      throw new Error('synthetic cache write failure');
    });
    restores.push(() => failure.mockRestore());
    expect(() => library.import({ previewId: preview.id })).toThrow(
      'synthetic cache write failure',
    );
    expect(library.list().total).toBe(0);
    expect(store.all('copilot_cache')).toEqual([]);
    expect(fs.readdirSync(library.storageInfo().directory)).toEqual([]);
  },
);

test('failed cache staging restores earlier files and retains all selected library records', async () => {
  const { library, storage, imported } = fixture();
  const first = await imported(content('甲')),
    second = await imported(content('乙'));
  const originalRename = fs.renameSync;
  let calls = 0;
  const failure = spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (++calls === 2) throw new Error('synthetic rename failure');
    originalRename(from, to);
  });
  restores.push(() => failure.mockRestore());
  storage.deleteJsonFiles = true;
  expect(() => library.delete({ all: true })).toThrow('synthetic rename failure');
  expect(library.list().total).toBe(2);
  expect(fs.existsSync(path.join(library.storageInfo().directory, first.versionId + '.json'))).toBe(
    true,
  );
  expect(
    fs.existsSync(path.join(library.storageInfo().directory, second.versionId + '.json')),
  ).toBe(true);
});

test('post-commit cache cleanup failures remain tracked, report committed deletion and can be retried', async () => {
  const { library, storage, imported, changed, store } = fixture();
  const record = await imported();
  const failure = spyOn(fs, 'unlinkSync').mockImplementation(() => {
    throw new Error('synthetic unlink failure');
  });
  restores.push(() => failure.mockRestore());
  storage.deleteJsonFiles = true;
  expect(() => library.delete({ id: record.id })).toThrow(
    '作业记录已删除，但部分 JSON 缓存清理失败',
  );
  expect(library.list().total).toBe(0);
  expect(changed.at(-1)).toContain('清理失败');
  expect(store.all('copilot_cache_cleanup')).toHaveLength(1);
  failure.mockRestore();
  expect(library.delete({ all: true })).toEqual({ deleted: false, deletedCount: 0 });
  expect(store.all('copilot_cache_cleanup')).toEqual([]);
  expect(fs.readdirSync(library.storageInfo().directory)).toEqual([]);
});

test('pending JSON cleanup retains every temporary copy when the same version is imported again', async () => {
  const { library, storage, imported, store } = fixture();
  const first = await imported();
  const failure = spyOn(fs, 'unlinkSync').mockImplementation(() => {
    throw new Error('temporary cleanup failure');
  });
  restores.push(() => failure.mockRestore());
  storage.deleteJsonFiles = true;
  expect(() => library.delete({ id: first.id })).toThrow('清理失败');
  const next = await imported();
  expect(next.versionId).toBe(first.versionId);
  expect(() => library.delete({ id: next.id })).toThrow('清理失败');
  expect(store.all('copilot_cache_cleanup')).toHaveLength(2);
  failure.mockRestore();
  library.delete({ all: true });
  expect(store.all('copilot_cache_cleanup')).toEqual([]);
  expect(fs.readdirSync(library.storageInfo().directory)).toEqual([]);
});

test('replacing a recorded cache directory with an execution-version junction cannot remove active files', async () => {
  const { root, library, storage, imported } = fixture();
  const record = await imported();
  const cache = library.storageInfo().directory;
  fs.renameSync(cache, cache + '-preserved');
  const versions = path.join(root, 'copilot', 'versions');
  fs.symlinkSync(versions, cache, process.platform === 'win32' ? 'junction' : 'dir');
  storage.deleteJsonFiles = true;
  expect(() => library.delete({ id: record.id })).toThrow('受保护');
  expect(library.list().total).toBe(1);
  expect(fs.readFileSync(path.join(versions, record.versionId + '.json'), 'utf8')).toBe(content());
});

test('runtime settings resolve the application default, preserve omitted preferences and reject unsafe directories', async () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'maaverge-copilot-settings-'));
  roots.push(root);
  const applicationDirectory = path.join(root, 'application');
  const runtime = new Runtime(path.join(root, 'data'), {
    applicationDirectory,
    calendar: { fetcher: null },
  });
  runtimes.push(runtime);
  expect(await runtime.handle('copilot.storage.info', {})).toEqual({
    directory: path.join(applicationDirectory, 'cache', 'copilot'),
  });
  expect(runtime.snapshot().settings.copilotStorage).toBeUndefined();
  const storage = { directory: path.join(root, 'custom-cache'), deleteJsonFiles: true };
  await runtime.handle('settings.save', {
    settings: { ...runtime.snapshot().settings, copilotStorage: storage },
  });
  expect(await runtime.handle('copilot.storage.info', {})).toEqual({
    directory: storage.directory,
  });
  const oldClient = { ...runtime.snapshot().settings };
  delete oldClient.copilotStorage;
  const saved = await runtime.handle('settings.save', { settings: oldClient });
  expect(saved.copilotStorage).toEqual(storage);
  await expect(
    runtime.handle('settings.save', {
      settings: {
        ...saved,
        copilotStorage: { ...storage, directory: path.join(root, 'data', 'copilot', 'versions') },
      },
    }),
  ).rejects.toThrow('受保护');
  await runtime.handle('settings.save', {
    settings: { ...saved, copilotStorage: { directory: '', deleteJsonFiles: false } },
  });
  expect(await runtime.handle('copilot.storage.info', {})).toEqual({
    directory: path.join(applicationDirectory, 'cache', 'copilot'),
  });
  expect(() =>
    parseSettings({ copilotStorage: { directory: 'relative', deleteJsonFiles: true } }),
  ).toThrow('绝对路径');
});
