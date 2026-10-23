import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { assertPackageTagAbsent, installerKind, parseChecksums, prepareReleasePackage, releaseVersion, updaterAssetKind, validateRelease, verifyExtractedPackage, verifyPackageFiles } from "../github-package.mjs";

const names = [
  "Maa-Verge_0.1.0_x64-setup.exe",
  "Maa-Verge_0.1.0_x64_zh-CN.msi",
  "Maa-Verge_0.1.0_aarch64.dmg",
  "Maa-Verge_0.1.0_x64.dmg",
  "Maa-Verge_0.1.0_amd64.AppImage",
  "maa-verge_0.1.0_amd64.deb",
  "maa-verge-0.1.0-1.x86_64.rpm",
];
const installers = names.map((name, index) => ({ name, id: index + 1, size: 4, state: "uploaded" }));
const release = { tag_name: "v0.1.0", draft: false, published_at: "2026-10-23T00:00:00Z", assets: [...installers, { name: "SHA256SUMS.txt", id: 8, size: 750, state: "uploaded" }] };
const digest = createHash("sha256").update("test").digest("hex");
const manifest = names.map((name) => `${digest}  ${name}`).join("\n") + "\n";

test("release tags accept stable and prerelease versions without refs, paths or output injection", () => {
  assert.equal(releaseVersion("v0.1.0"), "0.1.0");
  assert.equal(releaseVersion("v12.34.56"), "12.34.56");
  assert.equal(releaseVersion('v0.2.0-rc.1'), '0.2.0-rc.1');
  for (const tag of [undefined, "0.1.0", "v01.1.0", "v0.1.0/latest", "v0.1.0\nimage=evil", "v0.1.0\n", "v0.1.0;echo hello", "v0.1.0+build", "v0.1.0-rc.01", "v0.1.0-01", "v0.1.0-", "v0.1.0-a..b"]) {
    assert.throws(() => releaseVersion(tag), /Release tag/);
  }
});

const updaterNames = [
  'latest.json', ...names.filter(name => !name.endsWith('.dmg')).map(name => `${name}.sig`),
  'Maa-Verge_0.1.0_aarch64.app.tar.gz', 'Maa-Verge_0.1.0_x64.app.tar.gz',
  'Maa-Verge_0.1.0_aarch64.app.tar.gz.sig', 'Maa-Verge_0.1.0_x64.app.tar.gz.sig',
];
const extendedAssets = [...release.assets, ...updaterNames.map((name, index) => ({ name, id: index + 9, size: 4, state: 'uploaded' }))];

test('signed updater releases retain seven installers and require the complete recognized updater extension', () => {
  assert.equal(validateRelease({ ...release, assets: extendedAssets }, 'v0.1.0').length, 18);
  assert.equal(new Set(updaterNames.map(name => updaterAssetKind(name, '0.1.0'))).size, 10);
  for (const name of ['preview.json', 'Maa-Verge_0.1.0_aarch64.dmg.sig', 'Maa-Verge_0.1.1_x64.app.tar.gz', 'Maa Verge.app.tar.gz', '../latest.json']) assert.equal(updaterAssetKind(name, '0.1.0'), undefined);
  for (const assets of [extendedAssets.slice(1), [...release.assets, extendedAssets[8]], extendedAssets.map(asset => asset.name === 'latest.json' ? { ...asset, name: 'unknown.json' } : asset), extendedAssets.map(asset => asset.name.endsWith('_x64.app.tar.gz.sig') ? { ...asset, name: 'Maa-Verge_0.1.0_aarch64.app.tar.gz.sig' } : asset)]) {
    assert.throws(() => validateRelease({ ...release, assets }, 'v0.1.0'));
  }
  assert.equal(installerKind('Maa-Verge_0.2.0-rc.1_x64-setup.exe', '0.2.0-rc.1'), 'windows-exe-x64');
});

test("published release accepts one installer for each supported OS, format and architecture", () => {
  assert.equal(validateRelease(release, "v0.1.0").length, 8);
  assert.equal(new Set(names.map((name) => installerKind(name, "0.1.0"))).size, 7);
  assert.equal(installerKind("Maa-Verge_0.1.0_x64_en-US.msi", "0.1.0"), "windows-msi-x64");
});

test("drafts, different versions, incomplete uploads and missing or extra assets are rejected", () => {
  for (const patch of [{ draft: true }, { published_at: null }, { tag_name: "v0.2.0" }, { assets: release.assets.slice(1) }, { assets: [...release.assets, installers[0]] }]) {
    assert.throws(() => validateRelease({ ...release, ...patch }, "v0.1.0"));
  }
  for (const patch of [{ state: "new" }, { size: 0 }, { id: 0 }]) {
    assert.throws(() => validateRelease({ ...release, assets: [{ ...installers[0], ...patch }, ...release.assets.slice(1)] }, "v0.1.0"));
  }
});

test("release installer set rejects duplicate architectures, wrong versions and unsafe filenames", () => {
  for (const name of [names[1], "Maa-Verge_0.1.0_arm64-setup.exe", "Maa-Verge_0.2.0_x64-setup.exe", "../Maa-Verge_0.1.0_x64-setup.exe", "Maa Verge_0.1.0_x64-setup.exe"]) {
    assert.throws(() => validateRelease({ ...release, assets: [{ ...installers[0], name }, ...release.assets.slice(1)] }, "v0.1.0"));
  }
  assert.throws(() => validateRelease({ ...release, assets: [...installers, { ...release.assets[7], name: "sha256sums.txt" }] }, "v0.1.0"));
});

test("checksum manifest accepts GNU text or binary markers and Windows line endings", () => {
  assert.equal(parseChecksums(manifest, installers).size, 7);
  assert.equal(parseChecksums(manifest.replaceAll("  ", " *").replaceAll("\n", "\r\n"), installers).get(names[0]), digest);
});

test("checksum manifest rejects omissions, duplicates, unknown paths and malformed digests", () => {
  for (const text of [manifest.split("\n").slice(1).join("\n"), manifest + `${digest}  ${names[0]}\n`, manifest.replace(names[0], `../${names[0]}`), manifest.replace(names[0], "unrelated.exe"), manifest.replace(digest, "a".repeat(63)), manifest + "\n", "x".repeat(16385)]) {
    assert.throws(() => parseChecksums(text, installers));
  }
});

test("package publication refuses existing version tags and malformed registry metadata", () => {
  assertPackageTagAbsent([], "0.1.0");
  assertPackageTagAbsent([{ metadata: { container: { tags: ["0.0.9"] } } }], "0.1.0");
  assert.throws(() => assertPackageTagAbsent([{ metadata: { container: { tags: ["0.1.0", "latest"] } } }], "0.1.0"), /refusing to overwrite/);
  assert.throws(() => assertPackageTagAbsent([{}], "0.1.0"), /safely/);
});

test("download verification catches altered bytes, truncated files and unlisted files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maa-verge-package-"));
  const assets = [...installers, { ...release.assets[7], size: Buffer.byteLength(manifest) }];
  try {
    await Promise.all(names.map((name) => writeFile(path.join(directory, name), "test")));
    await writeFile(path.join(directory, "SHA256SUMS.txt"), manifest);
    const checksums = parseChecksums(manifest, installers);
    await verifyPackageFiles(directory, assets, checksums);
    await writeFile(path.join(directory, names[0]), "evil");
    await assert.rejects(verifyPackageFiles(directory, assets, checksums), /SHA-256 mismatch/);
    await writeFile(path.join(directory, names[0]), "tes");
    await assert.rejects(verifyPackageFiles(directory, assets, checksums), /size mismatch/);
    await writeFile(path.join(directory, names[0]), "test");
    await writeFile(path.join(directory, "unlisted.txt"), "extra");
    await assert.rejects(verifyPackageFiles(directory, assets, checksums), /file set/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI rejects invalid input before network access and does not log its token", () => {
  const script = fileURLToPath(new URL("../github-package.mjs", import.meta.url));
  const token = "test-token-do-not-log";
  try {
    execFileSync(process.execPath, [script, "prepare"], { env: { ...process.env, GITHUB_REPOSITORY: "DeathofBrain/maa-verge", GH_TOKEN: token, RELEASE_TAG: "v0.1.0\nimage=evil" }, stdio: "pipe" });
    assert.fail("CLI should reject the tag");
  } catch (error) {
    assert.equal(error.status, 1);
    assert.match(error.stderr.toString(), /Release tag/);
    assert.ok(!error.stderr.toString().includes(token));
    assert.equal(error.stdout.toString(), "");
  }
});

test("release context preparation and extracted image verification use the same exact installer bytes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maa-verge-package-context-"));
  const context = path.join(directory, "context");
  const actualRelease = { ...release, assets: [...installers, { ...release.assets[7], size: Buffer.byteLength(manifest) }] };
  const requested = [];
  const download = async (id) => {
    requested.push(id);
    return new Response(id === 8 ? manifest : "test");
  };
  try {
    await prepareReleasePackage(actualRelease, "v0.1.0", context, download);
    assert.equal(requested[0], 8, "manifest must be validated before any installer download");
    assert.equal(requested.length, 8);
    assert.match(await readFile(path.join(context, ".dockerignore"), "utf8"), /!packages/);
    const extracted = path.join(directory, "extracted");
    await cp(path.join(context, "packages"), extracted, { recursive: true });
    await verifyExtractedPackage(extracted, context, "v0.1.0");
    await writeFile(path.join(extracted, "SHA256SUMS.txt"), manifest.replaceAll(digest, "0".repeat(64)));
    await assert.rejects(verifyExtractedPackage(extracted, context, "v0.1.0"), /SHA-256 mismatch/);
    await assert.rejects(prepareReleasePackage(actualRelease, "v0.1.0", context, download), /EEXIST/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid checksum manifest stops preparation before installer downloads", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maa-verge-package-bad-manifest-"));
  const badManifest = "invalid\n";
  const actualRelease = { ...release, assets: [...installers, { ...release.assets[7], size: Buffer.byteLength(badManifest) }] };
  const requested = [];
  try {
    await assert.rejects(prepareReleasePackage(actualRelease, "v0.1.0", path.join(directory, "context"), async (id) => {
      requested.push(id);
      return new Response(badManifest);
    }), /Checksum manifest/);
    assert.deepEqual(requested, [8]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('signed updater assets are distributed and verified with the same checksum guarantees as installers', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'maa-verge-package-updater-'));
  const allNames = extendedAssets.filter(asset => asset.name !== 'SHA256SUMS.txt').map(asset => asset.name);
  const allManifest = allNames.map(name => `${digest}  ${name}`).join('\n') + '\n';
  const assets = extendedAssets.map(asset => asset.name === 'SHA256SUMS.txt' ? { ...asset, size: Buffer.byteLength(allManifest) } : asset);
  const requested = [];
  try {
    const context = path.join(directory, 'context');
    await prepareReleasePackage({ ...release, assets }, 'v0.1.0', context, async id => { requested.push(id); return new Response(id === 8 ? allManifest : 'test'); });
    assert.equal(requested.length, 18);
    await verifyExtractedPackage(path.join(context, 'packages'), context, 'v0.1.0');
    await writeFile(path.join(context, 'packages', 'latest.json'), 'evil');
    await assert.rejects(verifyExtractedPackage(path.join(context, 'packages'), context, 'v0.1.0'), /SHA-256 mismatch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
