import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const checksumName = "SHA256SUMS.txt";
const repository = "DeathofBrain/maa-verge";
const checksumLimit = 16 * 1024;

export function releaseVersion(tag) {
  if (typeof tag !== "string" || tag.length > 128 || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
    throw new Error("Release tag must be a stable vMAJOR.MINOR.PATCH tag.");
  }
  return tag.slice(1);
}

export function installerKind(name, version) {
  if (typeof name !== "string" || !/^[A-Za-z0-9._-]+$/.test(name)) return undefined;
  const prefix = new RegExp(`^maa[-_]verge[_-]${version.replaceAll(".", "\\.")}`, "i");
  if (!prefix.test(name)) return undefined;
  const suffix = name.replace(prefix, "");
  if (/^[_-]x64(?:[_-]setup)?\.exe$/i.test(suffix)) return "windows-exe-x64";
  if (/^[_-]x64(?:[_-][a-z]{2}(?:-[a-z0-9]+)*)?\.msi$/i.test(suffix)) return "windows-msi-x64";
  if (/^[_-](?:aarch64|arm64)\.dmg$/i.test(suffix)) return "macos-dmg-arm64";
  if (/^[_-](?:x64|x86_64)\.dmg$/i.test(suffix)) return "macos-dmg-x64";
  if (/^[_-](?:amd64|x86_64|x64)\.appimage$/i.test(suffix)) return "linux-appimage-x64";
  if (/^[_-]amd64\.deb$/i.test(suffix)) return "linux-deb-x64";
  if (/^-[1-9]\d*\.x86_64\.rpm$/i.test(suffix)) return "linux-rpm-x64";
  return undefined;
}

export function validateRelease(release, tag) {
  const version = releaseVersion(tag);
  if (release?.tag_name !== tag || release.draft !== false || !release.published_at) {
    throw new Error("The requested release must already be published with the exact tag.");
  }
  if (!Array.isArray(release.assets) || release.assets.length !== 8) {
    throw new Error("Release must contain exactly seven installers and SHA256SUMS.txt.");
  }
  const kinds = new Set();
  const names = new Set();
  for (const asset of release.assets) {
    if (!asset || !Number.isSafeInteger(asset.id) || asset.id <= 0 || asset.state !== "uploaded" || !Number.isSafeInteger(asset.size) || asset.size <= 0) {
      throw new Error("Every release asset must be a completed, nonempty upload.");
    }
    if (typeof asset.name !== "string" || names.has(asset.name.toLowerCase())) throw new Error("Release contains duplicate asset names.");
    names.add(asset.name.toLowerCase());
    if (asset.name === checksumName) {
      if (asset.size > checksumLimit) throw new Error("Checksum manifest is too large.");
      continue;
    }
    const kind = installerKind(asset.name, version);
    if (!kind || kinds.has(kind)) throw new Error(`Unexpected or duplicate installer kind: ${asset.name}`);
    kinds.add(kind);
  }
  if (!names.has(checksumName.toLowerCase()) || !release.assets.some((asset) => asset.name === checksumName) || kinds.size !== 7) {
    throw new Error("Release must contain all seven supported installer kinds and SHA256SUMS.txt.");
  }
  return release.assets;
}

export function parseChecksums(text, installers) {
  if (Buffer.byteLength(text) > checksumLimit) throw new Error("Checksum manifest is too large.");
  const expectedNames = new Set(installers.map((asset) => asset.name));
  const sums = new Map();
  const lines = text.replaceAll("\r\n", "\n").replace(/\n$/, "").split("\n");
  for (const line of lines) {
    const match = /^([a-fA-F0-9]{64}) [ *]([A-Za-z0-9._-]+)$/.exec(line);
    if (!match || !expectedNames.has(match[2]) || sums.has(match[2])) throw new Error("Checksum manifest must list each installer exactly once using safe filenames.");
    sums.set(match[2], match[1].toLowerCase());
  }
  if (sums.size !== expectedNames.size) throw new Error("Checksum manifest is missing installers.");
  return sums;
}

export function assertPackageTagAbsent(versions, version) {
  if (!Array.isArray(versions)) throw new Error("Package version response is invalid.");
  for (const entry of versions) {
    const tags = entry?.metadata?.container?.tags;
    if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) throw new Error("Cannot inspect existing package tags safely.");
    if (tags.includes(version)) throw new Error(`Package tag ${version} already exists; refusing to overwrite it.`);
  }
}

export async function verifyPackageFiles(directory, assets, checksums) {
  const actualNames = await readdir(directory);
  const expectedNames = assets.map((asset) => asset.name);
  if (actualNames.length !== expectedNames.length || actualNames.some((name) => !expectedNames.includes(name))) {
    throw new Error("Downloaded file set differs from the published release.");
  }
  for (const asset of assets) {
    const filename = path.join(directory, asset.name);
    const info = await stat(filename);
    if (!info.isFile() || info.size !== asset.size) throw new Error(`Asset size mismatch: ${asset.name}`);
    if (asset.name === checksumName && !checksums.has(checksumName)) continue;
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(filename)) hash.update(chunk);
    if (hash.digest("hex") !== checksums.get(asset.name)) throw new Error(`SHA-256 mismatch: ${asset.name}`);
  }
}

async function apiRequest(endpoint, { binary = false, optional = false } = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: binary ? "application/octet-stream" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "maa-verge-package-release",
    },
    signal: AbortSignal.timeout(binary ? 15 * 60 * 1000 : 60 * 1000),
  });
  if (optional && response.status === 404) return undefined;
  if (!response.ok) throw new Error(`GitHub API request failed (${response.status}) for ${endpoint}.`);
  return binary ? response : response.json();
}

async function checkTag(version) {
  const repo = await apiRequest(`/repos/${repository}`);
  if (repo.full_name?.toLowerCase() !== repository.toLowerCase() || !["User", "Organization"].includes(repo.owner?.type)) throw new Error("Unexpected source repository.");
  const ownerPath = repo.owner.type === "Organization" ? "orgs" : "users";
  for (let page = 1; page <= 100; page++) {
    const versions = await apiRequest(`/${ownerPath}/${repo.owner.login}/packages/container/maa-verge/versions?per_page=100&page=${page}`, { optional: true });
    if (versions === undefined) {
      if (page !== 1) throw new Error("Package disappeared while checking existing tags.");
      return;
    }
    assertPackageTagAbsent(versions, version);
    if (versions.length < 100) return;
  }
  throw new Error("Package version list exceeds the safe pagination limit.");
}

async function tagRevision(tag) {
  let object = (await apiRequest(`/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`)).object;
  for (let depth = 0; depth < 10; depth++) {
    if (!/^[a-f0-9]{40}$/.test(object?.sha)) throw new Error("Tag has an invalid Git object.");
    if (object.type === "commit") return object.sha;
    if (object.type !== "tag") throw new Error("Release tag does not resolve to a commit.");
    object = (await apiRequest(`/repos/${repository}/git/tags/${object.sha}`)).object;
  }
  throw new Error("Release tag annotation depth exceeds the safe limit.");
}

export async function prepareReleasePackage(release, tag, context, downloadAsset) {
  const assets = validateRelease(release, tag);
  const destination = path.join(context, "packages");
  // A fresh directory prevents stale local files from entering the published image.
  await mkdir(context, { recursive: true });
  await mkdir(destination, { recursive: false });
  const manifest = assets.find((asset) => asset.name === checksumName);
  const ordered = [manifest, ...assets.filter((asset) => asset !== manifest)];
  let checksums;
  for (const asset of ordered) {
    const response = await downloadAsset(asset.id);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(path.join(destination, asset.name), { flags: "wx" }));
    if (asset === manifest) {
      const info = await stat(path.join(destination, asset.name));
      if (info.size !== manifest.size || info.size > checksumLimit) throw new Error("Checksum manifest size mismatch.");
      checksums = parseChecksums(await readFile(path.join(destination, asset.name), "utf8"), assets.filter((candidate) => candidate !== manifest));
    }
  }
  await verifyPackageFiles(destination, assets, checksums);
  await copyFile(path.join(root, ".github", "package", ".dockerignore"), path.join(context, ".dockerignore"));
  await writeFile(path.join(context, "release.json"), JSON.stringify({ tag_name: release.tag_name, draft: release.draft, published_at: release.published_at, assets }, null, 2));
}

export async function verifyExtractedPackage(directory, context, tag) {
  const release = JSON.parse(await readFile(path.join(context, "release.json"), "utf8"));
  const assets = validateRelease(release, tag);
  const original = await readFile(path.join(context, "packages", checksumName));
  const checksums = parseChecksums(original.toString("utf8"), assets.filter((asset) => asset.name !== checksumName));
  checksums.set(checksumName, createHash("sha256").update(original).digest("hex"));
  await verifyPackageFiles(directory, assets, checksums);
}

async function main() {
  const command = process.argv[2];
  if (!["prepare", "check-tag", "verify-image"].includes(command)) throw new Error("Usage: node tools/github-package.mjs prepare|check-tag|verify-image <directory>");
  if (process.env.GITHUB_REPOSITORY !== repository || !process.env.GH_TOKEN) throw new Error("Run this workflow in DeathofBrain/maa-verge with GITHUB_TOKEN.");
  const tag = process.env.RELEASE_TAG;
  const version = releaseVersion(tag);
  const context = path.join(root, "dist", "github-package");
  if (command === "verify-image") {
    if (!process.argv[3]) throw new Error("Extracted image directory is required.");
    await verifyExtractedPackage(path.resolve(process.argv[3]), context, tag);
    console.log(`Verified extracted package file set and all SHA-256 hashes for ${tag}.`);
    return;
  }
  await checkTag(version);
  if (command === "check-tag") return;
  const release = await apiRequest(`/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`);
  const revision = await tagRevision(tag);
  await prepareReleasePackage(release, tag, context, (id) => apiRequest(`/repos/${repository}/releases/assets/${id}`, { binary: true }));
  const outputs = { image: "ghcr.io/deathofbrain/maa-verge", version, revision, source: `https://github.com/${repository}` };
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT must be set by GitHub Actions.");
  await appendFile(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(""));
  console.log(`Verified seven installers for ${tag} (${revision}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
