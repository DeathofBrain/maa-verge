import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { OfficialSource, platformAsset, runUpdateJob, treeHash, UpdateService, type UpdateSource, type UpdateStore } from "../src/updates.ts";
import { zipBytes } from "./archive-fixture.ts";

class MemoryStore implements UpdateStore {
  rows = new Map<string, any>();
  get(kind: string, id: string, fallback?: any) { const result = this.rows.get(kind + "|" + id); return result === undefined ? fallback : structuredClone(result); }
  put(kind: string, id: string, value: any) { this.rows.set(kind + "|" + id, structuredClone(value)); }
  delete(kind: string, id: string) { this.rows.delete(kind + "|" + id); }
  all(kind: string) { return [...this.rows.entries()].filter(([key]) => key.startsWith(kind + "|")).map(([, value]) => structuredClone(value)); }
}
const roots: string[] = [];
async function temp() { const root = await mkdtemp(path.join(tmpdir(), "maaverge-updates-")); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
test("platform assets cover all release architectures", () => {
  expect(platformAsset("Darwin", "arm64")).toBe("macos-runtime-universal.zip");
  expect(platformAsset("Darwin", "x86_64")).toBe("macos-runtime-universal.zip");
  expect(platformAsset("Windows", "AMD64")).toBe("win-x64.zip");
  expect(platformAsset("Linux", "x86_64")).toBe("linux-x86_64.tar.gz");
  expect(() => platformAsset("Windows", "x86")).toThrow();
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
test("mock resource update activates only at idle and rolls back independently", async () => {
  const root = await temp(), store = new MemoryStore(); let busy = true;
  const updates = new UpdateService(root, store, () => {}, () => busy);
  const core = updates.channel("core").currentVersion;
  await updates.check("resource"); await updates.prepare("resource");
  expect((await updates.activate("resource")).status).toBe("waiting_idle");
  expect(updates.channel("resource").currentVersion).toBe("2026.10.18");
  busy = false; await updates.activatePending();
  expect(updates.channel("resource").currentVersion).toBe("2026.10.20.2");
  expect(updates.channel("core").currentVersion).toBe(core);
  await updates.rollback("resource"); expect(updates.channel("resource").currentVersion).toBe("2026.10.18");
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
test("native install/update use selective extraction; resource overlays rebase on immutable core", async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  const validator = async (core: string, resource: string, version: string) => {
    expect(await readFile(path.join(core, "MaaCore.dll"), "utf8")).toBe(version);
    expect(await readFile(path.join(resource, "resource/onnx/model"), "utf8")).toBe("model");
    expect(await Bun.file(path.join(core, "MAA.dll")).exists()).toBe(false);
    expect(await Bun.file(path.join(core, "externals/coreclr.dll")).exists()).toBe(false);
  };
  const updates = new UpdateService(root, store, () => {}, () => false, { mode: "native", source, validator, jobRunner: (config) => runUpdateJob(config, validator) });
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
  const root = await temp(), store = new MemoryStore(); let attempts = 0;
  const updates = new UpdateService(root, store, () => {}, () => false, { afterActivate: () => { if (++attempts === 1) throw new Error("synthetic reconnect failure"); } });
  const original = store.get("active", "combo");
  await updates.check("core"); await updates.prepare("core");
  await expect(updates.activate("core")).rejects.toThrow("更新切换失败");
  expect(store.get("active", "combo")).toEqual(original); expect(attempts).toBe(2);
  expect(store.get("staged", "core")).toBeDefined();
});
test("restart marks interrupted preparations failed; stable channel rejects downgrade", async () => {
  const root = await temp(), store = new MemoryStore(), source = new FixtureSource();
  new UpdateService(root, store, () => {}, () => false);
  store.put("update", "core", { ...store.get("update", "core"), status: "downloading", currentVersion: "v6.21.0" });
  const updates = new UpdateService(root, store, () => {}, () => false, { mode: "native", source });
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
  const updates = new UpdateService(root, store, () => {}, () => false, { mode: "native", source });
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
  const updates = new UpdateService(root, store, () => {}, () => false, { mode: "native", source: new FixtureSource(), jobCommand: [process.execPath, script] });
  await updates.check("core");
  const preparation = updates.prepare("core"); const failure = preparation.catch(() => {});
  let started = false;
  for (let index = 0; index < 100; index++) {
    const entries = await readdir(path.join(root, "generations"));
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
