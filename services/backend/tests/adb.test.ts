import { afterEach, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { adbCandidates, adbPath, adbServerIdentity, deviceLockAddress, emulatorAddresses, isLocalEmulator, parseAdbDevices, validateAddress } from "../src/adb.ts";

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
