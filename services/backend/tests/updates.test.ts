import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { OfficialSource, platformAsset, runUpdateJob, treeHash, UpdateService, type UpdateSource, type UpdateStore } from "../src/updates.ts";
import { zipBytes } from "./archive-fixture.ts";
import { resourceActivityVersions } from '../src/resource-version';

class MemoryStore implements UpdateStore {
  rows = new Map<string, any>();
  get(kind: string, id: string, fallback?: any) { const result = this.rows.get(kind + "|" + id); return result === undefined ? fallback : structuredClone(result); }
  put(kind: string, id: string, value: any) { this.rows.set(kind + "|" + id, structuredClone(value)); }
  delete(kind: string, id: string) { this.rows.delete(kind + "|" + id); }
  all(kind: string) { return [...this.rows.entries()].filter(([key]) => key.startsWith(kind + "|")).map(([, value]) => structuredClone(value)); }
}
const roots: string[] = [];
async function temp() { const root = await realpath(await mkdtemp(path.join(tmpdir(), "maaverge-updates-"))); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
test("platform assets cover all release architectures", () => {
  expect(platformAsset("Darwin", "arm64")).toBe("macos-runtime-universal.zip");
  expect(platformAsset("Darwin", "x86_64")).toBe("macos-runtime-universal.zip");
  expect(platformAsset("Windows", "AMD64")).toBe("win-x64.zip");
  expect(platformAsset("Linux", "x86_64")).toBe("linux-x86_64.tar.gz");
  expect(() => platformAsset("Windows", "x86")).toThrow();
});
test("tree hashes preserve Python pathlib component ordering and Unicode code points", async () => {
  const root = await temp(); await mkdir(path.join(root, "a"));
  const contents = new Map([["a.txt", "1"], ["a/item", "2"], ["Z", "3"], ["b", "4"], ["\ue000", "5"], ["\u{10000}", "6"]]);
  for (const [relative, content] of contents) await writeFile(path.join(root, relative), content);
  const order = process.platform === "win32" ? ["a/item", "a.txt", "b", "Z", "\ue000", "\u{10000}"] : ["Z", "a/item", "a.txt", "b", "\ue000", "\u{10000}"];
  const digest = createHash("sha256");
  for (const relative of order) digest.update(relative).update(contents.get(relative)!);
  expect(await treeHash(root)).toBe(digest.digest("hex"));
});
test("all update states expose the nullable latest version contract and await finish hooks", async () => {
  const root = await temp(), store = new MemoryStore(); let finished = false;
  const updates = fixtureUpdates(root, store, () => false, new FixtureSource(), { finishActivate: async () => { await Bun.sleep(10); finished = true; } });
  for (const state of updates.channels()) expect(state.latestVersion).toBeNull();
  const old = store.get("update", "core"); delete old.latestVersion; store.put("update", "core", old);
  expect(updates.channel("core").latestVersion).toBeNull();
  await updates.check("core"); await updates.prepare("core"); await updates.activate("core");
  expect(finished).toBe(true);
});
test("official resource metadata pins version and archive to the same commit", async () => {
  const urls: string[] = [], commit = "a".repeat(40);
  const source = new OfficialSource((async (url: any) => {
    urls.push(String(url));
    return Response.json(String(url).endsWith("commits/main") ? { sha: commit } : { last_updated: "2026-10-20" });
  }) as typeof fetch);
  const metadata = await source.check("resource");
  expect(urls[1]).toContain(commit); expect(metadata.url.endsWith(commit)).toBe(true);
});
test("download validates SHA-256/size and removes partial files", async () => {
  const root = await temp(), destination = path.join(root, "core.zip"), body = Buffer.from("synthetic package");
  const source = new OfficialSource((async () => new Response(body)) as unknown as typeof fetch);
  const metadata = { version: "v1.0.0", url: "https://example.test/core.zip", size: body.length, digest: "sha256:" + "0".repeat(64) };
  await expect(source.download(metadata, destination, () => {})).rejects.toThrow("SHA-256");
  expect(await readdir(root)).toEqual([]);
  metadata.digest = "sha256:" + createHash("sha256").update(body).digest("hex");
  expect(await source.download(metadata, destination, () => {})).toBe(metadata.digest.slice(7));
  expect(await readFile(destination)).toEqual(body);
});

test('retry and service restart keep a source-bound download cache while versions and data roots stay isolated', async () => {
  const root = await temp(), store = new MemoryStore(), destinations: string[] = [], resumed: string[] = [];
  let version = 'v1.0.0';
  const source: UpdateSource = {
    check: () => ({ version, url: `https://example.test/${version}/core.zip`, name: 'core.zip' }),
    download: async (_metadata, destination) => {
      if (destinations.includes(destination)) resumed.push(await readFile(destination + '.partial', 'utf8'));
      destinations.push(destination);
      await writeFile(destination + '.partial', 'retained bytes');
      throw new Error('synthetic network interruption');
    },
  };
  const updates = new UpdateService(root, store, () => {}, () => false, { source });
  await updates.check('core');
  await expect(updates.prepare('core')).rejects.toThrow('准备更新失败');
  expect(await readFile(destinations[0] + '.partial', 'utf8')).toBe('retained bytes');
  await updates.close();
  const restarted = new UpdateService(root, store, () => {}, () => false, { source });
  await expect(restarted.prepare('core')).rejects.toThrow('准备更新失败');
  expect(destinations[1]).toBe(destinations[0]);
  expect(resumed).toEqual(['retained bytes']);
  expect(await readdir(path.dirname(destinations[1]))).not.toContain('downloads');
  version = 'v1.0.1'; await restarted.check('core');
  await expect(restarted.prepare('core')).rejects.toThrow('准备更新失败');
  expect(destinations[2]).not.toBe(destinations[0]);
  const otherStore = new MemoryStore();
  otherStore.put('settings', 'main', { componentPaths: { core: root, resource: root } });
  const other = new UpdateService(await temp(), otherStore, () => {}, () => false, { source });
  await other.check('core'); await expect(other.prepare('core')).rejects.toThrow('准备更新失败');
  expect(destinations[3]).not.toBe(destinations[2]);
  await restarted.close(); await other.close();
});

test('download preferences are captured per preparation and repeated progress emits bounded events', async () => {
  const root = await temp(), store = new MemoryStore(), events: any[] = [], options: any[] = [];
  const source: UpdateSource = {
    check: () => ({ version: 'v1.0.0', name: 'core.zip' }),
    download: async (_metadata, destination, progress, settings) => {
      options.push(settings);
      for (let index = 0; index < 10_000; index++) progress(Math.trunc(index / 112));
      progress(90); progress(90);
      await writeFile(destination, 'fixture'); return 'a'.repeat(64);
    },
  };
  store.put('settings', 'main', { componentDownload: { engine: 'aria2', aria2Path: '' } });
  const updates = new UpdateService(root, store, (_type, _message, data) => events.push(data.update), () => false, { source, jobRunner: async config => {
    const coreName = process.platform === 'win32' ? 'MaaCore.dll' : process.platform === 'darwin' ? 'libMaaCore.dylib' : 'libMaaCore.so';
    await mkdir(path.join(config.target, 'resource'), { recursive: true });
    await writeFile(path.join(config.target, coreName), 'synthetic core');
    await writeFile(path.join(config.target, 'resource/version.json'), '{}');
    return {};
  } });
  await updates.check('core'); await updates.prepare('core');
  expect(options).toEqual([{ engine: 'aria2', aria2Path: '' }]);
  expect(events.filter(event => event.message === '正在下载官方组件').length).toBeLessThanOrEqual(2);
  expect(events.some(event => event.message === '正在解压并校验组件' && event.progress === 90)).toBe(true);
  expect(updates.channel('core').status).toBe('staged');
  await updates.close();
});
test("fixture resource update activates only at idle and rolls back independently", async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource(); let busy = false;
  const updates = fixtureUpdates(root, store, () => busy, source);
  await updates.check("core"); await updates.prepare("core"); await updates.activate("core");
  await updates.check("resource"); await updates.prepare("resource"); await updates.activate("resource");
  const core = updates.channel("core").currentVersion;
  source.resourceVersion = "b".repeat(40); busy = true;
  await updates.check("resource"); await updates.prepare("resource");
  expect((await updates.activate("resource")).status).toBe("waiting_idle");
  expect(updates.channel("resource").currentVersion).toBe("a".repeat(40));
  busy = false; await updates.activatePending();
  expect(updates.channel("resource").currentVersion).toBe("b".repeat(40));
  expect(updates.channel("core").currentVersion).toBe(core);
  await updates.rollback("resource"); expect(updates.channel("resource").currentVersion).toBe("a".repeat(40));
});
class FixtureSource implements UpdateSource {
  coreVersion = "v6.20.0"; resourceVersion = "a".repeat(40);
  check(channel: string) { return { version: channel === "core" ? this.coreVersion : this.resourceVersion, name: channel + ".zip", source: "fixture" }; }
  async download(metadata: any, destination: string, progress: (percent: number) => void) {
    const old = this.resourceVersion.startsWith("a");
    const files: Record<string, string> = metadata.name === "core.zip" ? {
      "MaaCore.dll": this.coreVersion, "MaaUtils.dll": "native", "resource/version.json": "{}",
      "resource/onnx/model": "model", "resource/tasks/base": "base-task", "resource/config.json": "base-config",
      "resource/minitouch/arm64/tool": "tool", "MAA.dll": "gui", "MAA.exe": "gui", "hostfxr.dll": "dotnet", "externals/coreclr.dll": "dotnet",
    } : {
      "snapshot/resource/version.json": "{}", [`snapshot/resource/tasks/${old ? "old" : "new"}`]: "task",
      ...(old ? { "snapshot/resource/config.json": "override" } : {}),
    };
    const bytes = zipBytes(Object.entries(files).map(([name, content]) => ({ name, content })));
    await writeFile(destination, bytes); progress(90); return createHash("sha256").update(bytes).digest("hex");
  }
}
function fixtureUpdates(root: string, store: MemoryStore, busy: () => boolean, source = new FixtureSource(), hooks: {
  afterActivate?: () => void | Promise<void>; finishActivate?: (error?: string) => void | Promise<void>;
  protectedPaths?: () => string[];
} = {}) {
  const validator = async () => {};
  return new UpdateService(root, store, () => {}, busy, { source, validator, jobRunner: config => runUpdateJob(config, validator), ...hooks });
}

test('component roots keep active/staged generations and rollback intact when future downloads move', async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  const updates = fixtureUpdates(root, store, () => false, source);
  await mkdir(path.join(root, 'downloads'), { recursive: true });
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  const activeCore = store.get('active', 'combo').core.path, hash = await treeHash(activeCore);
  await updates.check('resource'); await updates.prepare('resource');
  const stagedPath = store.get('staged', 'resource').path;
  const paths = { core: path.join(root, 'new-core'), resource: path.join(root, 'new-resource') };
  await updates.saveDirectories(paths, componentPaths => store.put('settings', 'main', { componentPaths }));
  expect(updates.channel('core').installDirectory).toBe(paths.core);
  expect(store.get('active', 'combo').core.path).toBe(activeCore);
  expect(store.get('staged', 'resource').path).toBe(stagedPath);
  await updates.activate('resource');
  source.resourceVersion = 'b'.repeat(40);
  await updates.check('resource'); await updates.prepare('resource'); await updates.activate('resource');
  expect(store.get('active', 'combo').resource.path.startsWith(path.join(paths.resource, 'generations'))).toBe(true);
  expect(store.get('active', 'combo').core.path).toBe(activeCore);
  expect(await treeHash(activeCore)).toBe(hash);
  await updates.rollback('resource');
  expect(store.get('active', 'combo').resource.path).toBe(stagedPath);
  expect(await readdir(paths.core)).toEqual([]);
  expect(await readdir(paths.resource)).toEqual(['generations']);
  expect(await readdir(root)).not.toContain('downloads');
});

test('unwritable component root fails without replacing settings or active generation', async () => {
  const root = await temp(), store = new MemoryStore(), updates = fixtureUpdates(root, store, () => false);
  const file = path.join(root, 'occupied-file'); await writeFile(file, 'keep');
  const before = [...store.rows];
  await expect(updates.saveDirectories({ core: file, resource: root }, componentPaths => store.put('settings', 'main', { componentPaths }))).rejects.toThrow('目录无法写入');
  expect([...store.rows]).toEqual(before);
  expect(await readFile(file, 'utf8')).toBe('keep');
});

test('download root creation errors enter a retryable failed state', async () => {
  const root = await temp(), store = new MemoryStore(), file = path.join(root, 'occupied-file'); await writeFile(file, 'keep');
  store.put('settings', 'main', { componentPaths: { core: file, resource: root } });
  const updates = fixtureUpdates(root, store, () => false);
  await updates.check('core');
  await expect(updates.prepare('core')).rejects.toThrow('请先修复核心与基础资源');
  expect(updates.channel('core').status).toBe('failed');
  expect(store.get('active', 'combo')).toBeUndefined();
});

test.each(['directory', 'empty-directory', 'library', 'base-resource', 'model'])('restart repairs a missing core %s and allows reinstalling the same version', async missing => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  const initial = fixtureUpdates(root, store, () => false, source);
  await initial.check('core'); await initial.prepare('core'); await initial.activate('core');
  const old = store.get('active', 'combo').core;
  await initial.close();
  if (missing === 'directory' || missing === 'empty-directory') {
    await rm(old.path, { recursive: true });
    if (missing === 'empty-directory') await mkdir(old.path);
  } else await rm(path.join(old.path, missing === 'library' ? 'MaaCore.dll' : missing === 'model' ? 'resource/onnx/model' : 'resource/version.json'));
  const updates = fixtureUpdates(root, store, () => false, source);
  expect(updates.channel('core').currentVersion).toBe('未安装');
  expect(updates.channel('resource').currentVersion).toBe('未安装');
  expect(store.get('active', 'combo')).toBeUndefined();
  expect((await updates.check('core')).status).toBe('available');
  await updates.prepare('core'); await updates.activate('core');
  expect(updates.channel('core').currentVersion).toBe(old.version);
  expect(store.get('active', 'combo').core.path).not.toBe(old.path);
  expect(await readdir(root)).toEqual(['generations']);
  await updates.close();
});

test.each(['model', 'dependency', 'intact'])('legacy core without an inventory can repair the same version: %s', async missing => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  const initial = fixtureUpdates(root, store, () => false, source);
  await initial.check('core'); await initial.prepare('core'); await initial.activate('core'); await initial.close();
  const legacy = store.get('active', 'combo');
  for (const snapshot of Object.values(legacy) as any[]) { delete snapshot.installedFiles; delete snapshot.installedHash; }
  store.put('active', 'combo', legacy);
  if (missing !== 'intact') await rm(path.join(legacy.core.path, missing === 'model' ? 'resource/onnx/model' : 'MaaUtils.dll'));
  const before = await treeHash(legacy.core.path);
  let busy = false;
  const updates = fixtureUpdates(root, store, () => busy, source);
  const checked = await updates.check('core');
  expect(checked).toMatchObject({ currentVersion: source.coreVersion, latestVersion: source.coreVersion, status: 'available' });
  expect(checked.message).toContain('完整性记录');
  expect(store.get('active', 'combo')).toEqual(legacy);
  await updates.prepare('core');
  busy = true; expect((await updates.activate('core')).status).toBe('waiting_idle');
  expect(store.get('active', 'combo')).toEqual(legacy);
  expect(await treeHash(legacy.core.path)).toBe(before);
  busy = false; await updates.activatePending();
  const repaired = store.get('active', 'combo').core;
  expect(repaired.path).not.toBe(legacy.core.path);
  expect(repaired.installedHash).toMatch(/^[a-f0-9]{64}$/);
  expect(await readFile(path.join(repaired.path, 'resource/onnx/model'), 'utf8')).toBe('model');
  expect(await readFile(path.join(repaired.path, 'MaaUtils.dll'), 'utf8')).toBe('native');
  expect((await updates.check('core')).status).toBe('idle');
  await updates.close();
});

test('failed and successful legacy repairs preserve active files and the last usable rollback', async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  const updates = fixtureUpdates(root, store, () => false, source);
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  source.coreVersion = 'v6.20.1';
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  const legacy = store.get('active', 'combo'), previous = store.get('previous', 'combo');
  for (const snapshot of Object.values(legacy) as any[]) { delete snapshot.installedFiles; delete snapshot.installedHash; }
  store.put('active', 'combo', legacy);
  const before = await treeHash(legacy.core.path);
  const download = source.download.bind(source);
  source.download = async () => { throw new Error('synthetic offline'); };
  await updates.check('core'); await expect(updates.prepare('core')).rejects.toThrow('活动版本保持可用');
  expect(store.get('active', 'combo')).toEqual(legacy);
  expect(store.get('previous', 'combo')).toEqual(previous);
  expect(await treeHash(legacy.core.path)).toBe(before);
  source.download = download;
  await updates.prepare('core'); await updates.activate('core');
  expect(store.get('active', 'combo').core.path).not.toBe(legacy.core.path);
  expect(store.get('previous', 'combo')).toEqual(previous);
  expect(await treeHash(legacy.core.path)).toBe(before);
  await updates.close();
});

test.each(['model', 'dependency', 'empty'])('content integrity detects corrupt installed core files: %s', async corrupted => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  const updates = fixtureUpdates(root, store, () => false, source);
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  const old = store.get('active', 'combo').core;
  await writeFile(path.join(old.path, corrupted === 'dependency' ? 'MaaUtils.dll' : 'resource/onnx/model'),
    corrupted === 'empty' ? '' : corrupted === 'dependency' ? 'broken' : 'wrong');
  expect((await updates.check('core')).status).toBe('available');
  expect(updates.channel('core').currentVersion).toBe('未安装');
  await updates.prepare('core'); await updates.activate('core');
  const repaired = store.get('active', 'combo').core;
  expect(repaired.path).not.toBe(old.path);
  expect(await readFile(path.join(repaired.path, 'MaaUtils.dll'), 'utf8')).toBe('native');
  expect(await readFile(path.join(repaired.path, 'resource/onnx/model'), 'utf8')).toBe('model');
  await updates.close();
});

test('legacy resource content hashes detect corruption without inventing an inventory for missing files', async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  const updates = fixtureUpdates(root, store, () => false, source);
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  await updates.check('resource'); await updates.prepare('resource'); await updates.activate('resource');
  const original = store.get('active', 'combo');
  delete original.resource.installedFiles; delete original.resource.installedHash;
  store.put('active', 'combo', original);
  expect((await updates.check('resource')).status).toBe('idle');
  await writeFile(path.join(original.resource.path, 'resource/onnx/model'), 'wrong');
  expect((await updates.check('resource')).status).toBe('available');
  expect(store.get('active', 'combo').resource.path).toBe(original.core.path);
  await updates.prepare('resource'); await updates.activate('resource');
  expect(store.get('active', 'combo').resource.path).not.toBe(original.resource.path);
  expect(updates.channel('resource').currentVersion).toBe(source.resourceVersion);
  await updates.close();
});

test.each(['download', 'job'])('losing the base during a resource %s leaves a repairable core state', async phase => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  const download = source.download.bind(source);
  let removeBase = false, jobStarted = false;
  const eraseBase = async () => { await rm(path.join(store.get('active', 'combo').core.path, 'resource'), { recursive: true }); };
  source.download = async (...args: Parameters<typeof download>) => {
    const digest = await download(...args);
    if (removeBase && phase === 'download') await eraseBase();
    return digest;
  };
  const updates = new UpdateService(root, store, () => {}, () => false, { source, validator: async () => {},
    jobRunner: async config => {
      if (removeBase && config.channel === 'resource') { jobStarted = true; if (phase === 'job') await eraseBase(); }
      return runUpdateJob(config, async () => {});
    },
  });
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  await updates.check('resource'); removeBase = true;
  await expect(updates.prepare('resource')).rejects.toThrow('请先修复核心与基础资源');
  expect(jobStarted).toBe(phase === 'job');
  expect(updates.channel('core').currentVersion).toBe('未安装');
  expect(updates.channel('resource').status).toBe('failed');
  expect(store.get('staged', 'resource')).toBeUndefined();
  removeBase = false;
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  await updates.check('resource'); await updates.prepare('resource'); await updates.activate('resource');
  expect(updates.channel('resource').currentVersion).toBe(source.resourceVersion);
  await updates.close();
});

test('repairing a corrupt active core preserves the last valid rollback combination', async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  const updates = fixtureUpdates(root, store, () => false, source);
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  const previous = store.get('active', 'combo');
  source.coreVersion = 'v6.20.1';
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  await writeFile(path.join(store.get('active', 'combo').core.path, 'resource/onnx/model'), 'wrong');
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  expect(store.get('previous', 'combo')).toEqual(previous);
  await updates.rollback('core');
  expect(store.get('active', 'combo')).toEqual(previous);
  await updates.close();
});

test('a candidate modified after validation is rejected without replacing the working core', async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  const updates = fixtureUpdates(root, store, () => false, source);
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  const original = store.get('active', 'combo');
  source.coreVersion = 'v6.20.1'; await updates.check('core'); await updates.prepare('core');
  await writeFile(path.join(store.get('staged', 'core').path, 'MaaUtils.dll'), 'broken');
  await expect(updates.activate('core')).rejects.toThrow('没有已经校验的候选快照');
  expect(store.get('active', 'combo')).toEqual(original);
  expect(store.get('staged', 'core')).toBeUndefined();
  await updates.prepare('core'); await updates.activate('core');
  expect(updates.channel('core').currentVersion).toBe(source.coreVersion);
  await updates.close();
});

test('missing independent resources fall back to bundled resources and reinstall the same commit', async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  const initial = fixtureUpdates(root, store, () => false, source);
  await initial.check('core'); await initial.prepare('core'); await initial.activate('core');
  await initial.check('resource'); await initial.prepare('resource'); await initial.activate('resource');
  const original = store.get('active', 'combo'); await initial.close();
  await rm(path.join(original.resource.path, 'resource'), { recursive: true });
  const updates = fixtureUpdates(root, store, () => false, source);
  expect(store.get('active', 'combo')).toEqual({ core: original.core, resource: original.core });
  expect(updates.channel('resource').currentVersion).toBe('bundled@' + original.core.version);
  expect((await updates.check('resource')).status).toBe('available');
  await updates.prepare('resource'); await updates.activate('resource');
  expect(updates.channel('resource').currentVersion).toBe(source.resourceVersion);
  await updates.rollback('resource');
  expect(updates.channel('resource').currentVersion).toBe('bundled@' + original.core.version);
  await updates.close();
});

test('missing staged and rollback snapshots never block preparing a fresh update', async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource(); let busy = false;
  const updates = fixtureUpdates(root, store, () => busy, source);
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  source.coreVersion = 'v6.20.1';
  await updates.check('core'); await updates.prepare('core');
  busy = true; await updates.activate('core');
  const candidate = store.get('staged', 'core'); await rm(candidate.path, { recursive: true });
  expect((await updates.check('core')).status).toBe('available');
  expect(store.get('staged', 'core')).toBeUndefined();
  await updates.prepare('core'); busy = false; await updates.activate('core');
  const active = store.get('active', 'combo');
  await rm(store.get('previous', 'combo').core.path, { recursive: true });
  await expect(updates.rollback('core')).rejects.toThrow('没有可回滚');
  expect(store.get('active', 'combo')).toEqual(active);
  await updates.close();
});

test('invalid resource metadata is detected before same-version preparation', async () => {
  const root = await temp(), store = new MemoryStore(), updates = fixtureUpdates(root, store, () => false);
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  const core = store.get('active', 'combo').core;
  await writeFile(path.join(core.path, 'resource/version.json'), 'broken-json');
  expect((await updates.prepare('core')).status).toBe('staged');
  expect(updates.channel('core').currentVersion).toBe('未安装');
  await updates.close();
});

test('failed downloads remove temporary archives without creating a downloads directory', async () => {
  const root = await temp(), store = new MemoryStore();
  const source = new FixtureSource();
  source.download = async (_metadata, destination) => { await writeFile(destination, 'partial'); throw new Error('synthetic failure'); };
  const updates = fixtureUpdates(root, store, () => false, source);
  await updates.check('core');
  await expect(updates.prepare('core')).rejects.toThrow('准备更新失败');
  expect(await readdir(root)).toEqual(['generations']);
  await updates.close();
});

test('updates retain three generations per component across directory changes and service restarts', async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  let updates = fixtureUpdates(root, store, () => false, source);
  const oldRoot = path.join(root, 'old'), newRoot = path.join(root, 'new');
  await updates.saveDirectories({ core: oldRoot, resource: oldRoot }, componentPaths => store.put('settings', 'main', { componentPaths }));
  for (let index = 0; index < 5; index++) {
    source.coreVersion = 'v6.20.' + index;
    if (index === 2) {
      await updates.saveDirectories({ core: newRoot, resource: newRoot }, componentPaths => store.put('settings', 'main', { componentPaths }));
      await updates.close(); updates = fixtureUpdates(root, store, () => false, source);
    }
    await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  }
  for (let index = 0; index < 5; index++) {
    source.resourceVersion = String(index).repeat(40);
    await updates.check('resource'); await updates.prepare('resource'); await updates.activate('resource');
  }
  const names = (await readdir(path.join(oldRoot, 'generations'))).concat(await readdir(path.join(newRoot, 'generations')));
  expect(names.filter(name => name.startsWith('core-'))).toHaveLength(3);
  expect(names.filter(name => name.startsWith('resource-'))).toHaveLength(3);
  expect(store.get('meta', 'component_roots')).toContain(oldRoot);
  await updates.rollback('resource');
  expect(updates.channel('resource').currentVersion).toBe('3'.repeat(40));
  await updates.close();
});

test('retention protects idle worker paths after resource recovery and cleans them once released', async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  let protectedPaths: string[] = [];
  const updates = fixtureUpdates(root, store, () => false, source, { protectedPaths: () => protectedPaths });
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  await updates.check('resource'); await updates.prepare('resource'); await updates.activate('resource');
  const workerResource = store.get('active', 'combo').resource.path;
  protectedPaths = [workerResource];
  await rm(path.join(workerResource, 'resource/version.json'));
  for (const version of ['b', 'c', 'd', 'e']) {
    source.resourceVersion = version.repeat(40);
    await updates.check('resource'); await updates.prepare('resource'); await updates.activate('resource');
  }
  expect(await Bun.file(path.join(workerResource, 'resource/onnx/model')).exists()).toBe(true);
  expect((await readdir(path.join(root, 'generations'))).filter(name => name.startsWith('resource-'))).toHaveLength(3);
  protectedPaths = []; source.resourceVersion = 'f'.repeat(40);
  await updates.check('resource'); await updates.prepare('resource'); await updates.activate('resource');
  expect(await Bun.file(path.join(workerResource, 'resource/onnx/model')).exists()).toBe(false);
  await updates.close();
});

test('busy workers defer generation cleanup until an idle update boundary', async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource(); let busy = false;
  const updates = fixtureUpdates(root, store, () => busy, source);
  for (let index = 0; index < 3; index++) {
    source.coreVersion = 'v6.20.' + index;
    await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  }
  busy = true; source.coreVersion = 'v6.20.3';
  await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  expect(await readdir(path.join(root, 'generations'))).toHaveLength(4);
  busy = false; await updates.activatePending();
  expect(await readdir(path.join(root, 'generations'))).toHaveLength(3);
  await updates.close();
});

test('resource version labels read installed activity names per client and refresh after rollback', async () => {
  const root = await temp(), store = new MemoryStore(), updates = fixtureUpdates(root, store, () => false);
  const first = path.join(root, 'first'), second = path.join(root, 'second');
  for (const [generation, name] of [[first, '第一活动'], [second, '第二活动']]) {
    await mkdir(path.join(generation, 'resource', 'global', 'YoStarEN', 'resource'), { recursive: true });
    await writeFile(path.join(generation, 'resource', 'version.json'), JSON.stringify({ activity: { name, time: 1 }, last_updated: '2026-10-23 12:00:00' }));
    await writeFile(path.join(generation, 'resource', 'global', 'YoStarEN', 'resource', 'version.json'), JSON.stringify({ activity: { name: `EN ${name}`, time: 1 }, last_updated: '2026-10-22' }));
    await writeFile(path.join(generation, 'MaaCore.dll'), 'synthetic');
  }
  const combo = (generation: string) => ({ core: { path: generation, version: 'v6.20.0' }, resource: { path: generation, version: generation } });
  store.put('active', 'combo', combo(second)); store.put('previous', 'combo', combo(first));
  const activities = updates.channel('resource').resourceActivities;
  expect(activities.find((item: any) => item.clientType === 'Official')).toMatchObject({ name: '第二活动', lastUpdated: '2026-10-23 12:00:00' });
  expect(activities.find((item: any) => item.clientType === 'Bilibili').name).toBe('第二活动');
  expect(activities.find((item: any) => item.clientType === 'YoStarEN').name).toBe('EN 第二活动');
  expect(activities.some((item: any) => item.clientType === 'YoStarJP')).toBe(false);
  await updates.rollback('resource');
  expect(updates.channel('resource').resourceActivities[0].name).toBe('第一活动');
  const corrupt = path.join(root, 'corrupt'); await mkdir(path.join(corrupt, 'resource'), { recursive: true });
  await writeFile(path.join(corrupt, 'resource', 'version.json'), 'x'.repeat(256 * 1024 + 1));
  expect(resourceActivityVersions(corrupt)).toEqual([]);
});

test("native install/update use selective extraction; resource overlays rebase on immutable core", async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  const validator = async (core: string, resource: string, version: string) => {
    expect(await readFile(path.join(core, "MaaCore.dll"), "utf8")).toBe(version);
    expect(await readFile(path.join(resource, "resource/onnx/model"), "utf8")).toBe("model");
    expect(await Bun.file(path.join(core, "MAA.dll")).exists()).toBe(false);
    expect(await Bun.file(path.join(core, "externals/coreclr.dll")).exists()).toBe(false);
  };
  const updates = new UpdateService(root, store, () => {}, () => false, { source, validator, jobRunner: (config) => runUpdateJob(config, validator) });
  await updates.check("core"); await updates.prepare("core"); await updates.activate("core");
  const core = store.get("active", "combo").core, coreHash = await treeHash(core.path);
  await updates.check("resource"); await updates.prepare("resource"); await updates.activate("resource");
  const previous = store.get("active", "combo").resource.path, previousHash = await treeHash(previous);
  expect(await readFile(path.join(previous, "resource/config.json"), "utf8")).toBe("override");
  source.resourceVersion = "b".repeat(40);
  await updates.check("resource"); await updates.prepare("resource");
  const candidate = store.get("staged", "resource");
  expect(await readFile(path.join(candidate.path, "resource/config.json"), "utf8")).toBe("base-config");
  expect(await Bun.file(path.join(candidate.path, "resource/tasks/old")).exists()).toBe(false);
  expect(candidate.ownedFiles).toContain("tasks/new"); expect(candidate.ownedFiles).not.toContain("config.json");
  expect(await treeHash(previous)).toBe(previousHash); expect(await treeHash(core.path)).toBe(coreHash);
  await updates.activate("resource"); await updates.rollback("resource");
  expect(store.get("active", "combo").resource.path).toBe(previous);
  source.coreVersion = "v6.20.1";
  await updates.check("core"); await updates.prepare("core");
  expect(await treeHash(core.path)).toBe(coreHash);
  await updates.activate("core"); expect(store.get("active", "combo").core.version).toBe("v6.20.1");
  await updates.rollback("core"); expect(store.get("active", "combo").core).toEqual(core);
});
test("failed candidate reconnection restores original pointer and reinitializes old workers", async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource(); let attempts = 0, fail = false;
  const updates = fixtureUpdates(root, store, () => false, source, { afterActivate: () => { if (fail && ++attempts === 1) throw new Error("synthetic reconnect failure"); } });
  await updates.check("core"); await updates.prepare("core"); await updates.activate("core");
  const original = store.get("active", "combo"); source.coreVersion = "v6.20.1"; fail = true;
  await updates.check("core"); await updates.prepare("core");
  await expect(updates.activate("core")).rejects.toThrow("更新切换失败");
  expect(store.get("active", "combo")).toEqual(original); expect(attempts).toBe(2);
  expect(store.get("staged", "core")).toBeDefined();
});

test('changing core release channel invalidates staged preview and rejects its activation', async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  store.put('settings', 'main', { coreUpdateChannel: 'preview' }); source.coreVersion = 'v6.22.0-beta.1';
  const updates = fixtureUpdates(root, store, () => false, source);
  await updates.check('core'); await updates.prepare('core');
  const preview = store.get('staged', 'core'); expect(preview.releaseChannel).toBe('preview');
  store.put('settings', 'main', { coreUpdateChannel: 'stable' });
  await expect(updates.activate('core')).rejects.toThrow('通道已改变');
  expect(store.get('staged', 'core')).toBeUndefined(); expect(store.get('active', 'combo')).toBeUndefined();
  expect(await Bun.file(path.join(preview.path, 'manifest.json')).exists()).toBe(true);
  await updates.close();
});

test('cached metadata and staged packages cannot downgrade a core after explicit rollback restores a newer version', async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource(), updates = fixtureUpdates(root, store, () => false, source);
  source.coreVersion = 'v6.20.0'; await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  const older = store.get('active', 'combo').core;
  source.coreVersion = 'v6.21.0'; await updates.check('core'); await updates.prepare('core'); await updates.activate('core');
  await updates.rollback('core'); source.coreVersion = 'v6.20.0'; await updates.check('core');
  await updates.rollback('core');
  expect(updates.channel('core').currentVersion).toBe('v6.21.0');
  await expect(updates.prepare('core')).rejects.toThrow('拒绝自动降级');
  expect(updates.channel('core').currentVersion).toBe('v6.21.0');
  store.put('staged', 'core', { ...older, releaseChannel: 'stable' });
  await expect(updates.activate('core')).rejects.toThrow('拒绝自动降级');
  expect(updates.channel('core').currentVersion).toBe('v6.21.0');
  await updates.close();
});

test("restart marks interrupted preparations failed; stable channel rejects downgrade", async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  source.coreVersion = 'v6.21.0';
  const original = fixtureUpdates(root, store, () => false, source);
  await original.check('core'); await original.prepare('core'); await original.activate('core'); await original.close();
  store.put("update", "core", { ...store.get("update", "core"), status: "downloading", currentVersion: "v6.21.0" });
  source.coreVersion = 'v6.20.0';
  const updates = new UpdateService(root, store, () => {}, () => false, { source });
  expect(updates.channel("core").status).toBe("failed");
  await expect(updates.check("core")).rejects.toThrow("检查更新失败");
  expect(updates.channel("core").message).toContain("拒绝自动降级");
});
test("close aborts an owned metadata request and drains writes before Store closes", async () => {
  const root = await temp(), store = new MemoryStore();
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const source = new OfficialSource((async (_url: any, options: any) => {
    entered();
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
  }) as typeof fetch);
  const updates = new UpdateService(root, store, () => {}, () => false, { source });
  const pending = updates.check("core"); const failure = pending.catch(() => {});
  await started; await updates.close(); await failure;
  expect(updates.channel("core").status).toBe("failed");
  const saved = structuredClone([...store.rows]);
  await expect(updates.check("core")).rejects.toThrow("关闭");
  expect([...store.rows]).toEqual(saved);
});
test("close terminates an owned update job before returning", async () => {
  const root = await temp(), store = new MemoryStore(), script = path.join(root, "job.ts");
  await writeFile(script, 'const config=await Bun.stdin.json();await Bun.write(config.target+"/started","ready");await Bun.sleep(60000);');
  const updates = new UpdateService(root, store, () => {}, () => false, { source: new FixtureSource(), jobCommand: [process.execPath, script] });
  await updates.check("core");
  const preparation = updates.prepare("core"); const failure = preparation.catch(() => {});
  let started = false;
  for (let index = 0; index < 100; index++) {
    const entries = await readdir(path.join(root, "generations")).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    started = entries.length > 0 && await Bun.file(path.join(root, "generations", entries[0], "started")).exists();
    if (started) break;
    await Bun.sleep(20);
  }
  expect(started).toBe(true);
  const before = performance.now(); await updates.close(); await failure;
  expect(performance.now() - before).toBeLessThan(5000);
  expect(updates.channel("core").status).toBe("failed");
});
test.skipIf(!process.env.MAAVERGE_TEST_NATIVE_WORKER || !process.env.MAAVERGE_TEST_CORE_LIBRARY)("real update-job process validates a synthetic C++ MaaCore without device access", async () => {
  const root = await temp(), archive = path.join(root, "synthetic.zip");
  const core = await readFile(process.env.MAAVERGE_TEST_CORE_LIBRARY!);
  const coreName = process.platform === "win32" ? "MaaCore.dll" : process.platform === "darwin" ? "libMaaCore.dylib" : "libMaaCore.so";
  await writeFile(archive, zipBytes([{ name: coreName, content: core }, { name: "resource/version.json", content: "{}" }, { name: "MAA.exe", content: "excluded" }]));
  const child = Bun.spawn([process.execPath, path.resolve(import.meta.dir, "../src/update-job.ts")], {
    stdin: new Blob([JSON.stringify({ channel: "core", archive, target: path.join(root, "out"), version: "vsynthetic", workerPath: process.env.MAAVERGE_TEST_NATIVE_WORKER })]),
    stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(code, stderr).toBe(0); expect(JSON.parse(stdout)).toEqual({});
  expect(await Bun.file(path.join(root, "out", "MAA.exe")).exists()).toBe(false);
});
test.skipIf(!process.env.MAAVERGE_TEST_COMPILE_UPDATE || !process.env.MAAVERGE_TEST_NATIVE_WORKER || !process.env.MAAVERGE_TEST_CORE_LIBRARY)("compiled service reexecutes itself for update jobs without a Bun environment", async () => {
  const root = await temp(), executable = path.join(root, process.platform === "win32" ? "update-service.exe" : "update-service");
  const build = Bun.spawnSync([process.execPath, "build", "--compile", "--no-compile-autoload-dotenv", "--no-compile-autoload-bunfig", "--outfile", executable, path.join(import.meta.dir, "fixtures/compiled-update.ts")]);
  expect(build.exitCode, build.stderr.toString()).toBe(0);
  const archive = path.join(root, "synthetic.zip"), coreName = process.platform === "win32" ? "MaaCore.dll" : process.platform === "darwin" ? "libMaaCore.dylib" : "libMaaCore.so";
  await writeFile(archive, zipBytes([{ name: coreName, content: await readFile(process.env.MAAVERGE_TEST_CORE_LIBRARY!) }, { name: "resource/version.json", content: "{}" }]));
  const child = Bun.spawn([executable], { cwd: root, env: { ...process.env, PATH: "", NODE_PATH: "", NODE_OPTIONS: "", BUN_OPTIONS: "", BUN_BE_BUN: "" },
    stdin: new Blob([JSON.stringify({ root: path.join(root, "data"), archive, workerPath: process.env.MAAVERGE_TEST_NATIVE_WORKER })]), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(code, stderr).toBe(0); expect(JSON.parse(stdout)).toEqual({ standalone: true, staged: "vsynthetic" });
}, 30_000);
