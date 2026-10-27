import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { devEnvironment, executable, root } from './project.mjs';
import { aria2Executable, readAria2BuildInfo } from './setup-aria2.mjs';

const noticeName = /^(?:licen[sc]e|copying|notice|copyright)(?:[._-]|$)/iu;
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function licenseFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && noticeName.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

function writeNotice(output, filename, heading, files) {
  writeFileSync(
    path.join(output, filename),
    `${heading}\n\n${files.map((file) => `${path.basename(file)}\n\n${readFileSync(file, 'utf8')}`).join('\n\n')}`,
  );
}

export function writeJavaScriptNotices(output, { projectRoot = root } = {}) {
  mkdirSync(output, { recursive: true });
  const overridesFile = path.join(projectRoot, 'tools/licenses/javascript-overrides.json');
  const overrides = existsSync(overridesFile) ? readJson(overridesFile) : {};
  // Resolve workspace packages from this checkout even when node_modules is shared
  // with another checkout. They still contribute their production dependencies.
  const workspaces = new Map();
  for (const parent of ['apps', 'packages', 'services']) {
    const directory = path.join(projectRoot, parent);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const workspace = path.join(directory, entry.name),
        manifest = path.join(workspace, 'package.json');
      if (entry.isDirectory() && existsSync(manifest))
        workspaces.set(readJson(manifest).name, workspace);
    }
  }
  const visited = new Set(),
    written = new Set();
  function visit(name, context, optional = false) {
    let directory = workspaces.get(name);
    if (!directory) {
      const require = createRequire(path.join(context, 'package.json'));
      directory = (require.resolve.paths(name) || [])
        .map((base) => path.join(base, name))
        .find((candidate) => existsSync(path.join(candidate, 'package.json')));
      if (!directory) {
        if (optional) return;
        throw new Error(`Cannot locate dependency notice: ${name} (from ${context})`);
      }
      directory = realpathSync(directory);
    }
    if (visited.has(directory)) return;
    visited.add(directory);
    const info = readJson(path.join(directory, 'package.json'));
    const id = `${info.name}@${info.version}`;
    if (!workspaces.has(info.name) && !written.has(id)) {
      const files = licenseFiles(directory);
      let provenance = '';
      if (!files.length) {
        const override = Object.hasOwn(overrides, id) ? overrides[id] : null;
        if (!override || override.selectedLicense !== info.license)
          throw new Error(`Missing JavaScript dependency license: ${id}`);
        if (typeof override.file !== 'string' || path.basename(override.file) !== override.file)
          throw new Error(`Invalid JavaScript license override path: ${id}`);
        const file = path.join(projectRoot, 'tools/licenses', override.file);
        if (createHash('sha256').update(readFileSync(file)).digest('hex') !== override.sha256)
          throw new Error(`JavaScript license override checksum mismatch: ${id}`);
        files.push(file);
        provenance = `\nUpstream commit: ${override.commit}\nLicense declaration: ${override.evidence}\nSelected license: ${override.selectedLicense}\nLicense source: ${override.source}\nSHA-256: ${override.sha256}\n`;
      }
      writeNotice(output, id.replaceAll('/', '_') + '.txt', id + provenance, files);
      written.add(id);
    }
    for (const dependency of Object.keys(info.dependencies || {})) {
      visit(dependency, directory, Object.hasOwn(info.optionalDependencies || {}, dependency));
    }
    for (const dependency of Object.keys(info.optionalDependencies || {}))
      visit(dependency, directory, true);
  }
  for (const workspace of ['services/backend', 'apps/desktop']) {
    const directory = path.join(projectRoot, workspace),
      info = readJson(path.join(directory, 'package.json'));
    for (const name of Object.keys(info.dependencies || {})) visit(name, directory);
    for (const name of Object.keys(info.optionalDependencies || {})) visit(name, directory, true);
  }
  return written.size;
}

function runTool(name, args, { projectRoot, environment, execute }) {
  const result = execute(
    name === 'rustc' && environment.RUSTC ? environment.RUSTC : executable(name),
    args,
    {
      cwd: projectRoot,
      env: environment,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 180000,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `Cannot collect Rust runtime licenses (${name} ${args.join(' ')}): ${result.error?.message || result.stderr || `exit ${result.status}`}`,
    );
  }
  return result.stdout;
}

export function loadRustNoticeMetadata({
  projectRoot = root,
  environment = devEnvironment(),
  execute = spawnSync,
} = {}) {
  const options = { projectRoot, environment, execute };
  const version = runTool('rustc', ['-vV'], options);
  const target = environment.CARGO_BUILD_TARGET || /^host: (.+)$/mu.exec(version)?.[1].trim();
  if (!target) throw new Error('Cannot determine Rust build target for runtime licenses');
  const metadata = JSON.parse(
    runTool(
      'cargo',
      [
        'metadata',
        '--format-version',
        '1',
        '--locked',
        '--filter-platform',
        target,
        '--manifest-path',
        path.join(projectRoot, 'apps/desktop/src-tauri/Cargo.toml'),
      ],
      options,
    ),
  );
  const sysroot = runTool('rustc', ['--print', 'sysroot'], options).trim();
  return { metadata, target, version, sysroot };
}

export function writeRustNotices(
  output,
  { metadata, target, version, sysroot, projectRoot = root },
) {
  mkdirSync(output, { recursive: true });
  if (!metadata.resolve?.root) throw new Error('Missing Cargo resolve root for runtime licenses');
  const packages = new Map(metadata.packages.map((info) => [info.id, info]));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const overrides = readJson(path.join(projectRoot, 'tools/licenses/rust-overrides.json'));
  const visited = new Set();
  let written = 0;
  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const info = packages.get(id),
      node = nodes.get(id);
    if (!info || !node) throw new Error(`Missing Cargo runtime dependency metadata: ${id}`);
    // Proc macros execute at build time, including their normal dependencies.
    if (info.targets.some((entry) => entry.kind.includes('proc-macro'))) return;
    if (id !== metadata.resolve.root) {
      const identity = `${info.name}@${info.version}`;
      const directory = path.dirname(info.manifest_path),
        files = licenseFiles(directory);
      if (info.license_file) {
        const file = path.resolve(directory, info.license_file);
        if (!existsSync(file))
          throw new Error(`Missing declared Rust dependency license: ${identity}: ${file}`);
        if (!files.includes(file)) files.push(file);
      }
      let provenance = '';
      if (!files.length) {
        const override = overrides[identity];
        if (!override) throw new Error(`Missing Rust dependency license: ${identity}`);
        provenance = `\nUpstream commit: ${override.commit}\n${override.evidence ? `License declaration: ${override.evidence}\n` : ''}`;
        if (override.selectedLicense)
          provenance += `Selected license: ${override.selectedLicense}\n`;
        for (const notice of override.files || [override]) {
          const file = path.join(projectRoot, 'tools/licenses', notice.file);
          if (createHash('sha256').update(readFileSync(file)).digest('hex') !== notice.sha256) {
            throw new Error(`Rust dependency license checksum mismatch: ${identity}`);
          }
          files.push(file);
          provenance += `License source: ${notice.source}\nSHA-256: ${notice.sha256}\n`;
        }
      }
      writeNotice(
        output,
        `rust-${identity}.txt`,
        `${identity}\nAuthors: ${(info.authors || []).join(', ')}\nSPDX: ${info.license || 'see included license'}\nBuild target: ${target}${provenance}`,
        files,
      );
      written++;
    }
    for (const dependency of node.deps) {
      if (dependency.dep_kinds.some((kind) => kind.kind === null)) visit(dependency.pkg);
    }
  }
  visit(metadata.resolve.root);
  // rustc ships these documents even with the minimal toolchain profile. Cargo
  // metadata excludes the statically linked standard library and its notices.
  const documentation = path.join(sysroot, 'share/doc/rust');
  const copyright = path.join(documentation, 'COPYRIGHT-library.html');
  const licenses = path.join(documentation, 'licenses');
  if (
    !existsSync(copyright) ||
    !existsSync(path.join(licenses, 'MIT.txt')) ||
    !existsSync(path.join(licenses, 'Apache-2.0.txt'))
  ) {
    throw new Error(`Missing Rust standard library licenses in ${documentation}`);
  }
  const standardLibraryOutput = path.join(output, 'rust-standard-library');
  mkdirSync(standardLibraryOutput, { recursive: true });
  copyFileSync(copyright, path.join(standardLibraryOutput, 'COPYRIGHT-library.html'));
  for (const entry of readdirSync(licenses, { withFileTypes: true })) {
    if (entry.isFile())
      copyFileSync(path.join(licenses, entry.name), path.join(standardLibraryOutput, entry.name));
  }
  writeFileSync(
    path.join(standardLibraryOutput, 'toolchain.txt'),
    `${version.trim()}\nBuild target: ${target}\n`,
  );
  return written;
}

export function writeAria2Notices(output, { aria2Directory = path.dirname(aria2Executable) } = {}) {
  const info = readAria2BuildInfo(aria2Directory);
  const target = path.join(output, 'aria2');
  mkdirSync(target, { recursive: true });
  for (const notice of info.notices) {
    const file = path.join(target, notice.name);
    mkdirSync(path.dirname(file), { recursive: true });
    copyFileSync(path.join(aria2Directory, 'licenses', notice.name), file);
  }
  copyFileSync(
    path.join(aria2Directory, 'build-info.json'),
    path.join(output, 'aria2-build-info.json'),
  );
  return info;
}

export function writeApplicationNotices(output, { projectRoot = root } = {}) {
  mkdirSync(output, { recursive: true });
  for (const [source, target] of [
    ['LICENSE', 'MAAVERGE-LICENSE'],
    ['NOTICE.md', 'NOTICE.md'],
    ['docs/copilot-attribution.md', 'docs/copilot-attribution.md'],
    ['services/native/THIRD_PARTY_NOTICES.md', 'native-worker-notices.md'],
    ['services/backend/UNICODE-LICENSE.txt', 'UNICODE-LICENSE.txt'],
    ['services/backend/BUN-LICENSE.md', 'BUN-LICENSE.md'],
  ]) {
    mkdirSync(path.dirname(path.join(output, target)), { recursive: true });
    copyFileSync(path.join(projectRoot, source), path.join(output, target));
  }
}

export function writeRuntimeNotices(destination, options = {}) {
  const projectRoot = options.projectRoot || root;
  const output = path.join(destination, 'licenses');
  writeApplicationNotices(output, { projectRoot });
  const javascript = writeJavaScriptNotices(output, { projectRoot });
  const rust = loadRustNoticeMetadata({ ...options, projectRoot });
  const crates = writeRustNotices(output, { ...rust, projectRoot });
  writeAria2Notices(output, options);
  console.log(
    `Runtime licenses: ${javascript} JavaScript dependencies, ${crates} Rust dependencies (${rust.target}), Rust standard library`,
  );
}
