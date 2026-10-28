import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, fail } from './project.mjs';

const rustupVersion = '1.28.2';
const targets = {
  'win32/x64': 'x86_64-pc-windows-msvc',
  'linux/x64': 'x86_64-unknown-linux-gnu',
  'darwin/arm64': 'aarch64-apple-darwin',
  'darwin/x64': 'x86_64-apple-darwin',
};

async function downloadBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Rust installer download failed: HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 40 * 1024 * 1024) throw new Error('Rust installer download exceeds 40 MiB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function ensureRust({
  projectRoot = root,
  platform = process.platform,
  architecture = process.arch,
  environment = process.env,
  execute = spawnSync,
  download = downloadBytes,
  report = console.log,
} = {}) {
  const target = targets[`${platform}/${architecture}`];
  if (!target) throw new Error(`Unsupported Rust bootstrap target: ${platform}/${architecture}`);
  const configuration = readFileSync(path.join(projectRoot, 'rust-toolchain.toml'), 'utf8');
  const version = configuration.match(/^channel\s*=\s*"(\d+\.\d+\.\d+)"\s*$/mu)?.[1];
  const profile = configuration.match(/^profile\s*=\s*"(minimal|default|complete)"\s*$/mu)?.[1];
  const componentList = configuration.match(/^components\s*=\s*\[([^\]]*)\]/mu)?.[1];
  const components = [...(componentList || '').matchAll(/"([a-z][a-z0-9-]*)"/gu)].map(
    (match) => match[1],
  );
  if (!version || !profile || !components.length)
    throw new Error('rust-toolchain.toml must pin a Rust version, profile and components');

  const toolRoot = path.join(projectRoot, '.tools');
  const cargoHome = path.join(toolRoot, 'cargo');
  const rustupHome = path.join(toolRoot, 'rustup');
  const pinnedToolchain = `${version}-${target}`;
  const pinnedDirectory = path.join(rustupHome, 'toolchains', pinnedToolchain);
  const bin = path.join(cargoHome, 'bin');
  const suffix = platform === 'win32' ? '.exe' : '';
  const localExecutable = (name) => path.join(bin, `${name}${suffix}`);
  const localEnvironment = { ...environment };
  // Windows treats environment variable names without regard to case.
  for (const key of Object.keys(localEnvironment)) {
    if (
      ['PATH', 'CARGO_HOME', 'RUSTUP_HOME', 'RUSTUP_TOOLCHAIN', 'RUSTUP_AUTO_INSTALL'].includes(
        key.toUpperCase(),
      )
    )
      delete localEnvironment[key];
  }
  Object.assign(localEnvironment, {
    PATH: [bin, environment.PATH || environment.Path || ''].join(platform === 'win32' ? ';' : ':'),
    CARGO_HOME: cargoHome,
    RUSTUP_HOME: rustupHome,
    RUSTUP_TOOLCHAIN: pinnedToolchain,
    RUSTUP_AUTO_INSTALL: '0',
  });
  const options = (env) => ({ cwd: projectRoot, env, encoding: 'utf8', windowsHide: true });
  const inspect = (local) => {
    const env = local
      ? localEnvironment
      : { ...environment, RUSTUP_AUTO_INSTALL: '0', RUSTUP_TOOLCHAIN: pinnedToolchain };
    const executable = local ? localExecutable : (name) => name;
    const checks = [
      ['rustc', ['--version'], `rustc ${version} `],
      ['cargo', ['--version'], `cargo ${version} `],
      ...components.map((component) =>
        component === 'rustfmt'
          ? ['cargo', ['fmt', '--version'], 'rustfmt ']
          : component === 'clippy'
            ? ['cargo', ['clippy', '--version'], 'clippy ']
            : [component, ['--version'], `${component} `],
      ),
    ];
    const versions = [];
    for (const [name, args, prefix] of checks) {
      const result = execute(executable(name), args, { ...options(env), timeout: 15000 });
      if (result.status !== 0 || !result.stdout?.trim().startsWith(prefix)) return null;
      versions.push(result.stdout.trim());
    }
    return { rustc: executable('rustc'), cargo: executable('cargo'), versions, local };
  };
  const localExists = existsSync(cargoHome) || existsSync(rustupHome);
  let installed = inspect(true) || (!localExists && inspect(false));
  if (installed) return installed;

  const componentArgs = components.flatMap((component) => ['--component', component]);
  const install = (program, args) => {
    const removing = args[0] === 'toolchain' && args[1] === 'uninstall';
    report(
      `${removing ? 'Removing incomplete' : 'Installing'} Rust ${version} in .tools (no user PATH changes)`,
    );
    const result = execute(program, args, { ...options(localEnvironment), stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `Rust ${removing ? 'toolchain removal' : 'installation'} failed (exit ${result.status ?? result.signal}).`,
      );
  };
  const installToolchain = () =>
    install(localExecutable('rustup'), [
      'toolchain',
      'install',
      pinnedToolchain,
      '--profile',
      profile,
      ...componentArgs,
      '--no-self-update',
    ]);
  let reinstalled = false;
  const reinstallToolchain = () => {
    reinstalled = true;
    // rustup trusts component metadata, so --force cannot restore deleted files.
    // Remove only the unhealthy pinned toolchain; keep other versions and caches.
    install(localExecutable('rustup'), ['toolchain', 'uninstall', pinnedToolchain]);
    installToolchain();
  };
  if (existsSync(localExecutable('rustup'))) {
    if (existsSync(pinnedDirectory)) reinstallToolchain();
    else installToolchain();
  } else {
    const installerName = `rustup-init${suffix}`;
    const url = `https://static.rust-lang.org/rustup/archive/${rustupVersion}/${target}/${installerName}`;
    const bytes = Buffer.from(await download(url));
    const checksum = Buffer.from(await download(`${url}.sha256`))
      .toString('utf8')
      .trim();
    const expected = checksum.match(/^([a-f0-9]{64})(?:\s|$)/iu)?.[1].toLowerCase();
    if (!expected || createHash('sha256').update(bytes).digest('hex') !== expected)
      throw new Error('Official rustup installer SHA-256 mismatch');
    mkdirSync(toolRoot, { recursive: true });
    const staging = mkdtempSync(path.join(toolRoot, 'rust-install-'));
    try {
      const installer = path.join(staging, installerName);
      writeFileSync(installer, bytes, { flag: 'wx', mode: 0o755 });
      install(installer, [
        '-y',
        '--no-modify-path',
        '--profile',
        profile,
        '--default-toolchain',
        version,
        ...componentArgs,
        '--default-host',
        target,
      ]);
    } finally {
      rmSync(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
  installed = inspect(true);
  if (
    !installed &&
    !reinstalled &&
    existsSync(localExecutable('rustup')) &&
    existsSync(pinnedDirectory)
  ) {
    reinstallToolchain();
    installed = inspect(true);
  }
  if (!installed) throw new Error(`Rust ${version} validation failed after installation`);
  return installed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const installed = await ensureRust();
    console.log(`${installed.versions[0]}: ${installed.rustc}`);
    console.log(`${installed.versions[1]}: ${installed.cargo}`);
  } catch (error) {
    fail(error);
  }
}
