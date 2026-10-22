import { afterEach, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { adbCandidates, adbPath, adbServerIdentity, autoDiscover, deviceLockAddress, emulatorAddresses, isLocalEmulator, parseAdbDevices, validateAddress } from "../src/adb.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
test("ADB server aliases share the same lock namespace without contacting a server", () => {
  for (const socket of [undefined, "tcp:5037", "tcp:localhost:05037", "tcp:LOCALHOST.:5037", "tcp:[::1]:5037", "tcp:127.0.0.1:5037"]) {
    expect(adbServerIdentity({ ADB_SERVER_SOCKET: socket })).toBe("tcp:127.0.0.1:5037");
  }
  expect(adbServerIdentity({ ANDROID_ADB_SERVER_ADDRESS: "HOST.", ANDROID_ADB_SERVER_PORT: "5038" })).toBe("tcp:host:5038");
  expect(adbServerIdentity({ ADB_SERVER_SOCKET: "tcp:[2001:db8::1]:5037" })).toBe("tcp:[2001:db8::1]:5037");
  expect(adbServerIdentity({ ADB_SERVER_SOCKET: "localabstract:adb" })).toBe("localabstract:adb");
  for (const socket of ["tcp:host", "tcp:host:0", "tcp:host:65536", "tcp:host:xyz"]) expect(() => adbServerIdentity({ ADB_SERVER_SOCKET: socket })).toThrow();
});
test("emulator aliases share the actual ADB port", () => {
  for (const address of ["emulator-5554", "localhost:05555", "127.0.0.1:5555", "[::1]:5555"]) expect(deviceLockAddress(address)).toBe("127.0.0.1:5555");
  expect(deviceLockAddress("physical-serial")).toBe("physical-serial");
  expect(isLocalEmulator("remote.test:5555")).toBe(false);
  expect(isLocalEmulator("127.0.0.1:0")).toBe(false);
  for (const address of ["-x", "a;b", "a b", "a\nb", "a".repeat(129), null]) expect(() => validateAddress(address)).toThrow();
});
test("fixed default ports and configured BlueStacks ports are bounded and deduplicated", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "maaverge-adb-")); roots.push(root);
  const config = path.join(root, "bluestacks.conf");
  await writeFile(config, 'bst.instance.Pie64.adb_port="12345"\nbst.instance.Rvc64.status.adb_port="54321"\nbst.instance.bad.adb_port="99999"');
  const addresses = emulatorAddresses({ MAAVERGE_BLUESTACKS_CONFIG: config, MAAVERGE_EMULATOR_ADDRESSES: "127.0.0.1:12345,localhost:5555" });
  expect(addresses.slice(0, 2)).toEqual(["127.0.0.1:12345", "localhost:5555"]);
  expect(addresses.filter((value) => value === "127.0.0.1:12345")).toHaveLength(1);
  expect(addresses).toContain("127.0.0.1:54321"); expect(addresses.length).toBeLessThanOrEqual(48);
  for (const address of ["remote:5555", "emulator-5554", "127.0.0.1:0"]) expect(() => emulatorAddresses({ MAAVERGE_EMULATOR_ADDRESSES: address })).toThrow();
  expect(() => emulatorAddresses({ MAAVERGE_EMULATOR_ADDRESSES: Array(17).fill("127.0.0.1:5555").join(",") })).toThrow("16");
});
test("discovery parses adb state and model without executing anything", () => {
  expect(parseAdbDevices("List of devices attached\nemulator-5554 device product:p model:Pixel_7 device:x\nserial unauthorized\n")).toEqual([
    { address: "emulator-5554", name: "Pixel_7", adbState: "device" }, { address: "serial", name: "serial", adbState: "unauthorized" },
  ]);
});
test("configured ADB path is validated before discovery; all platforms retain bundled candidates", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "maaverge-adb-")); roots.push(root);
  const adb = path.join(root, "adb-file"); await writeFile(adb, "synthetic");
  expect(adbPath({ MAAVERGE_ADB_PATH: adb })).toBe(realpathSync(adb));
  expect(() => adbPath({ MAAVERGE_ADB_PATH: path.join(root, "missing") })).toThrow("不存在");
  for (const platform of ["win32", "darwin", "linux"] as const) {
    const candidates = adbCandidates({ PATH: "", MAAVERGE_EMULATOR_DIRS: root }, platform);
    expect(candidates).toContain(path.join(root, "HD-Adb.exe"));
    expect(candidates).toContain(path.join(root, "Contents/MacOS/adb"));
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

test("automatic discovery bounds ADB clients and keeps diagnostics ordered without sockets or processes", async () => {
  const addresses = Array.from({ length: 8 }, (_, index) => `127.0.0.1:${6000 + index}`);
  const known = "127.0.0.1:6100", closed = "127.0.0.1:6200";
  const gates = addresses.map(() => deferred<void>()), firstBatch = deferred<void>();
  const calls: { args: string[]; timeout: number }[] = [], probes: string[] = [], completed: string[] = [];
  let active = 0, peak = 0, started = 0, lists = 0;
  const pending = autoDiscover("synthetic-adb", {
    addresses: () => [...addresses, known, closed],
    listening: async address => { probes.push(address); return address !== closed; },
    run: async (executable, args, timeout = 15_000) => {
      expect(executable).toBe("synthetic-adb"); calls.push({ args, timeout });
      if (args[0] === "devices") {
        lists++;
        return `List of devices attached\n${known} device model:Known\n${lists === 2 ? "127.0.0.1:6300 unauthorized\n" : ""}`;
      }
      const address = args[1], index = addresses.indexOf(address);
      expect(index).toBeGreaterThanOrEqual(0);
      active++; peak = Math.max(peak, active); if (++started === 4) firstBatch.resolve();
      await gates[index].promise;
      active--; completed.push(address);
      if (index === 2) throw new Error("synthetic permission denied");
      return `unable to connect ${address}`;
    },
  });
  await firstBatch.promise;
  expect(started).toBe(4); expect(peak).toBe(4);
  for (let index = gates.length - 1; index >= 0; index--) gates[index].resolve();
  const result = await pending;
  expect(peak).toBe(4); expect(active).toBe(0); expect(lists).toBe(2);
  expect(completed.slice(0, 4)).toEqual(addresses.slice(0, 4).reverse());
  expect(probes).not.toContain(known); expect(probes).toContain(closed);
  expect(result.diagnostics.slice(0, 8).map(message => message.split("：")[0])).toEqual(addresses);
  expect(result.diagnostics[2]).toContain("synthetic permission denied");
  expect(result.diagnostics.at(-1)).toContain("unauthorized");
  expect(result.devices).toHaveLength(2);
  for (const { args, timeout } of calls) {
    expect(args).toEqual(args[0] === "devices" ? ["devices", "-l"] : ["connect", args[1]]);
    expect(timeout).toBeGreaterThan(0); expect(timeout).toBeLessThanOrEqual(args[0] === "devices" ? 15_000 : 3000);
  }
});

test("automatic discovery stops new clients at its deadline and reserves a final device list", async () => {
  const addresses = Array.from({ length: 48 }, (_, index) => `127.0.0.1:${6000 + index}`);
  const firstBatch = deferred<void>(), finishBatch = deferred<void>();
  const probeTimeouts: number[] = [];
  let clock = 0, connects = 0, lists = 0, finalTimeout = 0, probes = 0;
  const pending = autoDiscover("synthetic-adb", {
    now: () => clock, addresses: () => addresses,
    listening: async (_address, timeout = 150) => { probeTimeouts.push(timeout); if (++probes > 4) clock = 45_000; return true; },
    run: async (_executable, args, timeout = 15_000) => {
      if (args[0] === "devices") {
        if (++lists === 2) finalTimeout = timeout;
        return "List of devices attached\n";
      }
      if (++connects === 4) firstBatch.resolve();
      await finishBatch.promise;
      return "connected to " + args[1];
    },
  });
  await firstBatch.promise;
  clock = 44_900; finishBatch.resolve();
  const result = await pending;
  expect(connects).toBe(4); expect(probes).toBe(5); expect(lists).toBe(2);
  expect(probeTimeouts.at(-1)).toBe(100);
  expect(finalTimeout).toBe(15_000);
  expect(result.diagnostics).toEqual(["自动发现扫描达到时限，部分候选地址尚未检查；请重试或手动填写地址"]);
});

test("automatic discovery shortens the last ADB client timeout to the scan budget", async () => {
  let clock = 0;
  const calls: { args: string[]; timeout: number }[] = [];
  await autoDiscover("synthetic-adb", {
    now: () => clock, addresses: () => ["127.0.0.1:6000"],
    listening: async () => { clock = 44_000; return true; },
    run: async (_executable, args, timeout = 15_000) => {
      calls.push({ args, timeout });
      if (args[0] === "connect") { clock = 45_000; return "connected to " + args[1]; }
      return "List of devices attached\n";
    },
  });
  expect(calls).toEqual([
    { args: ["devices", "-l"], timeout: 15_000 },
    { args: ["connect", "127.0.0.1:6000"], timeout: 1000 },
    { args: ["devices", "-l"], timeout: 15_000 },
  ]);
});
