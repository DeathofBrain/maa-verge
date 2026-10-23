import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { aria2ExecutablePath, aria2FeatureArguments, downloadArchive, MAX_DOWNLOAD_BYTES, type DownloadMetadata } from "../src/download.ts";

const roots: string[] = [], servers: Server[] = [];
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const payload = Buffer.from("verified archive ".repeat(2000));
const meta = (url = "https://example.test/archive", data = payload): DownloadMetadata => ({ url, version: "v1", size: data.length, digest: "sha256:" + hash(data) });
async function temp() { const root = await mkdtemp(path.join(tmpdir(), "maaverge-download-")); roots.push(root); return path.join(root, "archive.zip"); }
const mocked = (callback: (url: string, options: RequestInit) => Response | Promise<Response>) => callback as typeof fetch;
const full = (data: Uint8Array = payload, headers: Record<string, string> = {}) => new Response(Buffer.from(data), { headers: { etag: '"v1"', "content-length": String(data.length), ...headers } });
function interrupted(data = payload, headers: Record<string, string> = {}) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(data.subarray(0, 100)); setTimeout(() => controller.error(new Error("synthetic network interruption")), 20); },
  }), { headers: { etag: '"v1"', "content-length": String(data.length), ...headers } });
}
async function seed(destination: string, metadata = meta(), headers: Record<string, string> = {}) {
  await expect(downloadArchive(metadata, destination, () => {}, { engine: "builtin", fetcher: mocked(() => interrupted(payload, headers)) })).rejects.toThrow("interruption");
  expect((await stat(destination + ".partial")).size).toBe(100);
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); })));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("a network interruption survives a new downloader invocation and resumes HTTP Range/If-Range", async () => {
  const destination = await temp(); let attempts = 0, resumed = false;
  const server = createServer((request, response) => {
    attempts++;
    if (attempts === 1) {
      response.writeHead(200, { etag: '"immutable-release"', "content-length": payload.length });
      response.write(payload.subarray(0, 16_000));
      setTimeout(() => response.destroy(), 40);
    } else {
      expect(request.headers.range).toBe("bytes=16000-"); expect(request.headers["if-range"]).toBe('"immutable-release"');
      resumed = true;
      response.writeHead(206, { etag: '"immutable-release"', "content-length": payload.length - 16_000,
        "content-range": `bytes 16000-${payload.length - 1}/${payload.length}` });
      response.end(payload.subarray(16_000));
    }
  });
  servers.push(server); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number }, metadata = meta(`http://127.0.0.1:${address.port}/archive`);
  await expect(downloadArchive(metadata, destination, () => {}, { engine: "builtin" })).rejects.toThrow();
  expect((await stat(destination + ".partial")).size).toBe(16_000);
  expect(await downloadArchive(metadata, destination, () => {}, { engine: "builtin" })).toBe(hash(payload));
  expect(resumed).toBe(true); expect(await readFile(destination)).toEqual(payload);
  expect(await Bun.file(destination + ".partial").exists()).toBe(false);
  expect(await Bun.file(destination + ".partial.json").exists()).toBe(false);
});

test("a server ignoring Range with 200 replaces the partial rather than appending", async () => {
  const destination = await temp(); await seed(destination);
  expect(await downloadArchive(meta(), destination, () => {}, { engine: "builtin", fetcher: mocked((_url, options) => {
    expect(new Headers(options.headers).get("range")).toBe("bytes=100-");
    return full(payload, { etag: '"replacement"' });
  }) })).toBe(hash(payload));
  expect(await readFile(destination)).toEqual(payload);
});

test("a complete partial left before rename recovers from HTTP 416", async () => {
  const destination = await temp(); await seed(destination); await writeFile(destination + ".partial", payload);
  let attempts = 0;
  await downloadArchive(meta(), destination, () => {}, { engine: "builtin", fetcher: mocked((_url, options) => {
    if (++attempts === 1) {
      expect(new Headers(options.headers).get("range")).toBe(`bytes=${payload.length}-`);
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${payload.length}` } });
    }
    expect(new Headers(options.headers).has("range")).toBe(false); return full();
  }) });
  expect(attempts).toBe(2); expect(await readFile(destination)).toEqual(payload);
});

test("official metadata with a null digest still validates its declared size", async () => {
  const destination = await temp();
  expect(await downloadArchive({ ...meta(), digest: null }, destination, () => {}, { engine: "builtin", fetcher: mocked(() => full()) })).toBe(hash(payload));
});

test("unknown-size resources resume using Last-Modified when no strong ETag exists", async () => {
  const destination = await temp(), metadata = { url: meta().url, version: "commit" };
  const modified = "Wed, 21 Oct 2026 07:28:00 GMT";
  await seed(destination, metadata, { etag: 'W/"weak"', "last-modified": modified });
  await downloadArchive(metadata, destination, () => {}, { engine: "builtin", fetcher: mocked((_url, options) => {
    expect(new Headers(options.headers).get("if-range")).toBe(modified);
    return new Response(payload.subarray(100), { status: 206, headers: { "last-modified": modified,
      "content-range": `bytes 100-${payload.length - 1}/${payload.length}` } });
  }) });
  expect(await readFile(destination)).toEqual(payload);
});

test("weak/no validators restart safely and identity or engine changes discard previous bytes", async () => {
  const destination = await temp(); await seed(destination, meta(), { etag: 'W/"weak"' });
  await downloadArchive(meta(), destination, () => {}, { engine: "builtin", fetcher: mocked((_url, options) => {
    expect(new Headers(options.headers).has("range")).toBe(false); return full();
  }) });
  await seed(destination);
  await downloadArchive({ ...meta(), version: "v2" }, destination, () => {}, { engine: "builtin", fetcher: mocked((_url, options) => {
    expect(new Headers(options.headers).has("range")).toBe(false); return full();
  }) });
});

for (const [description, headers] of [
  ["wrong Content-Range offset", { "content-range": `bytes 99-${payload.length - 1}/${payload.length}` }],
  ["changed strong validator", { etag: '"v2"', "content-range": `bytes 100-${payload.length - 1}/${payload.length}` }],
  ["changed total", { "content-range": `bytes 100-${payload.length - 1}/${payload.length + 1}` }],
] as [string, Record<string, string>][]) {
  test(`${description} rejects and removes untrusted bytes`, async () => {
    const destination = await temp(); await seed(destination);
    await expect(downloadArchive(meta(), destination, () => {}, { engine: "builtin", fetcher: mocked(() => new Response(payload.subarray(100), {
      status: 206, headers: { etag: '"v1"', ...headers },
    })) })).rejects.toThrow("下载包");
    expect(await Bun.file(destination + ".partial").exists()).toBe(false);
    expect(await Bun.file(destination).exists()).toBe(false);
  });
}

test("size, maximum size and SHA-256 checks reject corrupt bytes before publication", async () => {
  const destination = await temp();
  await expect(downloadArchive(meta(), destination, () => {}, { engine: "builtin", fetcher: mocked(() => full(payload.subarray(0, 100))) })).rejects.toThrow("大小不符");
  await expect(downloadArchive({ ...meta(), size: MAX_DOWNLOAD_BYTES + 1 }, destination, () => {})).rejects.toThrow("大小");
  await expect(downloadArchive({ ...meta(), digest: "sha256:" + "0".repeat(64) }, destination, () => {}, { engine: "builtin", fetcher: mocked(() => full()) })).rejects.toThrow("SHA-256");
  expect(await Bun.file(destination).exists()).toBe(false); expect(await Bun.file(destination + ".partial").exists()).toBe(false);
  await expect(downloadArchive({ url: meta().url, version: "resource" }, destination, () => {}, {
    engine: "builtin",
    fetcher: mocked(() => new Response(payload, { headers: { "content-length": String(MAX_DOWNLOAD_BYTES + 1) } })),
  })).rejects.toThrow("大小限制");
});

test("each stream chunk refreshes idle timeout, and progress notifications are bounded", async () => {
  const destination = await temp(), data = Buffer.alloc(200, 42), values: number[] = [];
  let timer: ReturnType<typeof setInterval>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let count = 0;
      timer = setInterval(() => { controller.enqueue(data.subarray(count, count += 20)); if (count === data.length) { clearInterval(timer); controller.close(); } }, 25);
    },
    cancel() { clearInterval(timer); },
  });
  const started = performance.now();
  await downloadArchive(meta(meta().url, data), destination, (value) => values.push(value), {
    engine: "builtin",
    idleTimeoutMs: 100, fetcher: mocked(() => new Response(stream, { headers: { "content-length": String(data.length) } })),
  });
  expect(performance.now() - started).toBeGreaterThan(200); expect(values.length).toBeLessThanOrEqual(4);
  expect(values.at(-1)).toBe(90); expect(await readFile(destination)).toEqual(data);
});

test("an idle stream and explicit cancellation preserve a resumable partial", async () => {
  const destination = await temp();
  const stream = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(payload.subarray(0, 100)); } }), {
    headers: { etag: '"v1"', "content-length": String(payload.length) },
  });
  await expect(downloadArchive(meta(), destination, () => {}, { engine: "builtin", idleTimeoutMs: 40, fetcher: mocked(stream) })).rejects.toThrow("空闲超时");
  expect((await stat(destination + ".partial")).size).toBe(100);
  const controller = new AbortController();
  const pending = downloadArchive(meta(), destination, () => {}, { engine: "builtin", signal: controller.signal, fetcher: mocked(() => new Response(new ReadableStream(), {
    status: 206, headers: { etag: '"v1"', "content-range": `bytes 100-${payload.length - 1}/${payload.length}` },
  })) });
  setTimeout(() => controller.abort(new Error("关闭服务")), 20);
  await expect(pending).rejects.toThrow("关闭服务"); expect((await stat(destination + ".partial")).size).toBe(100);
});

test("download requests reject protocol redirects and use a fixed user agent", async () => {
  const destination = await temp();
  await expect(downloadArchive(meta(), destination, () => {}, { engine: "builtin", fetcher: mocked((_url, options) => {
    expect(new Headers(options.headers).get("user-agent")).toBe("maa-verge/0.1");
    expect(options.redirect).toBe("manual"); return new Response(null, { status: 302, headers: { location: "ftp://example.test/archive" } });
  }) })).rejects.toThrow("HTTPS");
});

let executableRoot: string, fakeExecutable: string;
beforeAll(async () => {
  executableRoot = await mkdtemp(path.join(tmpdir(), "maaverge-aria2-fixture-"));
  fakeExecutable = path.join(executableRoot, process.platform === "win32" ? "fake aria2.exe" : "fake aria2");
  const result = Bun.spawnSync([process.execPath, "build", "--compile", "--no-compile-autoload-dotenv", "--no-compile-autoload-bunfig",
    "--outfile", fakeExecutable, path.join(import.meta.dir, "fixtures/aria2.ts")]);
  expect(result.exitCode, result.stderr.toString()).toBe(0);
}, 30_000);
afterAll(async () => { if (executableRoot) await rm(executableRoot, { recursive: true, force: true }); });
const probe = mocked(() => new Response("x", { status: 206, headers: { etag: '"v1"', "content-length": "1", "content-range": "bytes 0-0/4" } }));
const ariaMetadata = (mode = "ok") => ({ url: `https://example.test/${mode}`, version: "v1", size: 4, digest: "sha256:" + hash("data") });

test("POSIX custom aria2 capabilities disable supported protocols and reject an unrecognized executable", async () => {
  const previous = process.env.MAAVERGE_TEST_ARIA2_VERSION;
  try {
    process.env.MAAVERGE_TEST_ARIA2_VERSION = "full";
    const full = await aria2FeatureArguments(fakeExecutable, { aria2Path: fakeExecutable }, "linux");
    expect(full).toContain("--follow-torrent=false"); expect(full).toContain("--follow-metalink=false");
    expect(full).toContain("--enable-dht=false"); expect(full).toContain("--enable-peer-exchange=false");
    process.env.MAAVERGE_TEST_ARIA2_VERSION = "minimal";
    expect(await aria2FeatureArguments(fakeExecutable, { aria2Path: fakeExecutable }, "linux")).toEqual([]);
    process.env.MAAVERGE_TEST_ARIA2_VERSION = "invalid";
    await expect(aria2FeatureArguments(fakeExecutable, { aria2Path: fakeExecutable }, "linux")).rejects.toThrow("无法识别自定义 aria2");
  } finally {
    if (previous === undefined) delete process.env.MAAVERGE_TEST_ARIA2_VERSION; else process.env.MAAVERGE_TEST_ARIA2_VERSION = previous;
  }
});

test("cancelling POSIX custom aria2 capability detection terminates its child", async () => {
  const marker = path.join(path.dirname(await temp()), "version.pid"), controller = new AbortController();
  const previous = { MAAVERGE_TEST_ARIA2_VERSION: process.env.MAAVERGE_TEST_ARIA2_VERSION, MAAVERGE_TEST_ARIA2_VERSION_PID: process.env.MAAVERGE_TEST_ARIA2_VERSION_PID };
  try {
    process.env.MAAVERGE_TEST_ARIA2_VERSION = "wait"; process.env.MAAVERGE_TEST_ARIA2_VERSION_PID = marker;
    const pending = aria2FeatureArguments(fakeExecutable, { aria2Path: fakeExecutable, signal: controller.signal }, "linux");
    const failure = pending.catch(() => {});
    for (let index = 0; index < 100 && !await Bun.file(marker).exists(); index++) await Bun.sleep(10);
    expect(await Bun.file(marker).exists()).toBe(true);
    const pid = Number(await readFile(marker, "utf8"));
    controller.abort(new Error("关闭服务")); await expect(pending).rejects.toThrow("关闭服务"); await failure;
    let exited = false;
    for (let index = 0; index < 100; index++) {
      try { process.kill(pid, 0); } catch (error: any) { if (error.code === "ESRCH") { exited = true; break; } throw error; }
      await Bun.sleep(10);
    }
    expect(exited).toBe(true);
  } finally {
    controller.abort();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("aria2 is the default and receives fixed arguments with executable/output spaces and atomically validated output", async () => {
  const destination = path.join(path.dirname(await temp()), "output with spaces", "archive name.zip"), progress: number[] = [];
  await downloadArchive(ariaMetadata(), destination, (value) => progress.push(value), { aria2Path: fakeExecutable, fetcher: probe });
  const args: string[] = JSON.parse(await readFile(destination + ".partial.args", "utf8"));
  expect(args).toContain("--no-conf=true"); expect(args).toContain("--continue=true"); expect(args).toContain("--enable-rpc=false");
  expect(args).toContain("--no-netrc=true"); expect(args).toContain("--split=1"); expect(args).toContain("--max-connection-per-server=1");
  expect(args).toContain("--follow-torrent=false"); expect(args).toContain("--follow-metalink=false");
  expect(args).toContain("--out=archive name.zip.partial"); expect(args).toContain(`--dir=${path.dirname(destination)}`);
  expect(args).toContain('--header=If-Range: "v1"'); expect(args.at(-1)).toBe(ariaMetadata().url);
  expect(await readFile(destination, "utf8")).toBe("data"); expect(await Bun.file(destination + ".partial.aria2").exists()).toBe(false);
  expect(progress.at(-1)).toBe(90);
});

test("aria2 missing executable fails clearly without silently using builtin downloader", async () => {
  const destination = await temp(); let requests = 0;
  await expect(downloadArchive(ariaMetadata(), destination, () => {}, { engine: "aria2", aria2Path: path.join(path.dirname(destination), "missing aria2"),
    fetcher: mocked((url, options) => { requests++; return probe(url, options); }),
  })).rejects.toThrow("无法启动 aria2");
  expect(requests).toBe(0); expect(await Bun.file(destination).exists()).toBe(false);
});

test("an empty aria2 path uses the checkout bundle regardless of PATH and custom executables strip runtime injection variables", async () => {
  const destination = await temp(), bin = path.join(path.dirname(destination), "bin with spaces"); await mkdir(bin);
  const executable = path.join(bin, process.platform === "win32" ? "aria2c.exe" : "aria2c");
  await copyFile(fakeExecutable, executable); if (process.platform !== "win32") await chmod(executable, 0o755);
  const previous = { PATH: process.env.PATH, NODE_OPTIONS: process.env.NODE_OPTIONS, BUN_OPTIONS: process.env.BUN_OPTIONS };
  try {
    process.env.PATH = bin + path.delimiter + (previous.PATH ?? "");
    process.env.NODE_OPTIONS = "--require=synthetic-injection"; process.env.BUN_OPTIONS = "--preload=synthetic-injection";
    expect(aria2ExecutablePath("")).toBe(path.resolve(import.meta.dir, "../../../.tools/aria2", path.basename(executable)));
    expect(aria2ExecutablePath("  " + executable + "  ")).toBe(executable);
    expect(() => aria2ExecutablePath("aria2c")).toThrow("绝对路径");
    expect(() => aria2ExecutablePath(path.join(bin, "aria2c.cmd"))).toThrow("脚本");
    await downloadArchive(ariaMetadata(), destination, () => {}, { engine: "aria2", aria2Path: executable, fetcher: probe });
    expect(JSON.parse(await readFile(destination + ".partial.env", "utf8"))).toEqual({});
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  expect(await readFile(destination, "utf8")).toBe("data");
});

test("aria2 interrupted state survives failure and is reused on retry", async () => {
  const destination = await temp(), metadata = ariaMetadata("interrupt");
  await expect(downloadArchive(metadata, destination, () => {}, { engine: "aria2", aria2Path: fakeExecutable, fetcher: probe })).rejects.toThrow("aria2 下载失败");
  expect(await readFile(destination + ".partial", "utf8")).toBe("da");
  expect(await Bun.file(destination + ".partial.aria2").exists()).toBe(true);
  await downloadArchive(metadata, destination, () => {}, { engine: "aria2", aria2Path: fakeExecutable, fetcher: probe });
  expect(await readFile(destination, "utf8")).toBe("data");
});

test("aria2 restarts when the server ignores its Range probe", async () => {
  const destination = await temp(), metadata = ariaMetadata("ignore-range");
  await expect(downloadArchive(metadata, destination, () => {}, { engine: "aria2", aria2Path: fakeExecutable, fetcher: probe })).rejects.toThrow("aria2 下载失败");
  await downloadArchive(metadata, destination, () => {}, { engine: "aria2", aria2Path: fakeExecutable, fetcher: mocked(() => full(Buffer.from("data"))) });
  expect(await readFile(destination, "utf8")).toBe("data");
});

test("aria2 sparse final-size files report completed bytes and remain active while written", async () => {
  const destination = await temp(), progress: number[] = [];
  await downloadArchive(ariaMetadata("sparse"), destination, (value) => progress.push(value), {
    engine: "aria2", aria2Path: fakeExecutable, fetcher: probe, idleTimeoutMs: 400,
  });
  expect(progress[0]).toBe(22); expect(progress.at(-1)).toBe(90);
  expect(progress.filter((value) => value === 90)).toHaveLength(1);
  expect(await readFile(destination, "utf8")).toBe("data");
});

test("switching from aria2 to builtin discards sparse/aria2 state", async () => {
  const destination = await temp(), metadata = ariaMetadata("interrupt");
  await expect(downloadArchive(metadata, destination, () => {}, { engine: "aria2", aria2Path: fakeExecutable, fetcher: probe })).rejects.toThrow();
  await downloadArchive(metadata, destination, () => {}, { engine: "builtin", fetcher: mocked((_url, options) => {
    expect(new Headers(options.headers).has("range")).toBe(false); return full(Buffer.from("data"));
  }) });
  expect(await Bun.file(destination + ".partial.aria2").exists()).toBe(false);
});

test("aria2 checksum failure purges corrupt bytes", async () => {
  const destination = await temp();
  await expect(downloadArchive(ariaMetadata("checksum"), destination, () => {}, { engine: "aria2", aria2Path: fakeExecutable, fetcher: probe })).rejects.toThrow("校验失败");
  expect(await Bun.file(destination + ".partial").exists()).toBe(false);
});

test("aria2 abort kills the child and preserves its control file", async () => {
  const destination = await temp(), controller = new AbortController();
  const pending = downloadArchive(ariaMetadata("wait"), destination, () => {}, { engine: "aria2", aria2Path: fakeExecutable, fetcher: probe, signal: controller.signal });
  const failure = pending.catch(() => {});
  for (let index = 0; index < 100 && !await Bun.file(destination + ".partial.aria2").exists(); index++) await Bun.sleep(10);
  expect(await Bun.file(destination + ".partial.aria2").exists()).toBe(true);
  const started = performance.now(); controller.abort(new Error("关闭服务"));
  await expect(pending).rejects.toThrow("关闭服务"); await failure;
  expect(performance.now() - started).toBeLessThan(3000); expect(await Bun.file(destination).exists()).toBe(false);
  expect(await Bun.file(destination + ".partial.aria2").exists()).toBe(true);
});
