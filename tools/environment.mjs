import { makeTemporaryDirectorySync } from './test-support/temporary-directory.mjs';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, devEnvironment } from './project.mjs';

export function bootstrapHint(platform = process.platform) {
  return platform === 'win32'
    ? 'powershell -ExecutionPolicy Bypass -File tools/bootstrap.ps1'
    : 'bash tools/bootstrap.sh';
}

export function nativeHint(platform = process.platform) {
  return (
    {
      win32:
        'Install Visual Studio 2022 Desktop development with C++ (MSVC, Windows SDK, CMake), WebView2 and Rust MSVC.',
      darwin: 'Run xcode-select --install; install CMake >=3.25 and the pinned Rust toolchain.',
      linux:
        'Install CMake >=3.25, a C++20 compiler, pkg-config and the GTK/WebKit system packages in docs/development.md.',
    }[platform] || 'See supported native targets in docs/development.md.'
  );
}

// Inspect direct links in every JS workspace: a successful frontend build alone
// does not prove that a newly added backend workspace has been installed.
export function missingWorkspaceDependencies(projectRoot = root) {
  const workspaces = [projectRoot];
  for (const directory of ['apps', 'packages', 'services']) {
    const parent = path.join(projectRoot, directory);
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(path.join(parent, entry.name, 'package.json')))
        workspaces.push(path.join(parent, entry.name));
    }
  }
  const missing = [];
  for (const workspace of workspaces) {
    const manifest = JSON.parse(readFileSync(path.join(workspace, 'package.json'), 'utf8'));
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
      if (!existsSync(path.join(workspace, 'node_modules', name, 'package.json'))) {
        missing.push(`${path.relative(projectRoot, workspace) || '.'}: ${name}`);
      }
    }
  }
  return missing;
}

export function assertWorkspaceDependencies() {
  const missing = missingWorkspaceDependencies();
  if (missing.length)
    throw new Error(
      `Workspace dependencies are missing (${missing.join(', ')}). Run pnpm install --frozen-lockfile, or ${bootstrapHint()}.`,
    );
}

export function resolveCmake({
  platform = process.platform,
  environment = devEnvironment(),
  execute = spawnSync,
  projectRoot = root,
} = {}) {
  const local = path.join(
    projectRoot,
    '.tools/cmake/bin',
    platform === 'win32' ? 'cmake.exe' : 'cmake',
  );
  // Resolve PATH entries now so an outdated local tool cannot shadow the system
  // fallback again when the selected command is used later by the builder.
  const name = platform === 'win32' ? 'cmake.exe' : 'cmake';
  const fromPath = (environment.PATH || environment.Path || '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.resolve(directory, name))
    .filter(existsSync);
  const candidates = [...new Set([...(existsSync(local) ? [local] : []), ...fromPath])];
  if (!candidates.length) candidates.push('cmake');
  if (platform === 'win32') {
    const vswhere = path.join(
      environment['ProgramFiles(x86)'] || 'C:/Program Files (x86)',
      'Microsoft Visual Studio/Installer/vswhere.exe',
    );
    if (existsSync(vswhere)) {
      const found = execute(
        vswhere,
        [
          '-latest',
          '-products',
          '*',
          '-requires',
          'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
          '-property',
          'installationPath',
        ],
        {
          env: environment,
          encoding: 'utf8',
          windowsHide: true,
          timeout: 15000,
        },
      );
      if (found.status === 0 && found.stdout?.trim())
        candidates.push(
          path.join(
            found.stdout.trim(),
            'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe',
          ),
        );
    }
  }
  const failures = [];
  for (const executable of candidates) {
    const result = execute(executable, ['--version'], {
      env: environment,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
    const version = result.stdout?.match(/^cmake version (\d+)\.(\d+)\.(\d+)/mu);
    if (
      result.status === 0 &&
      version &&
      (Number(version[1]) > 3 || (Number(version[1]) === 3 && Number(version[2]) >= 25))
    ) {
      return { executable, version: version[0].slice('cmake version '.length) };
    }
    failures.push(
      `${executable}: ${version?.[0] || result.error?.message || result.stderr?.trim() || 'not available'}`,
    );
  }
  throw new Error(`CMake >=3.25 is required (${failures.join('; ')}). ${nativeHint(platform)}`);
}

export function probeCppToolchain(cmake) {
  const directory = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-toolchain-'));
  try {
    writeFileSync(
      path.join(directory, 'CMakeLists.txt'),
      'cmake_minimum_required(VERSION 3.25)\nproject(maaverge_toolchain LANGUAGES CXX)\nset(CMAKE_CXX_STANDARD 20)\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\nset(CMAKE_CXX_EXTENSIONS OFF)\nadd_executable(probe main.cpp)\n',
    );
    writeFileSync(
      path.join(directory, 'main.cpp'),
      '#include <span>\nint main() { int values[]{0}; return std::span<int>(values).front(); }\n',
    );
    for (const args of [
      [
        '-S',
        directory,
        '-B',
        path.join(directory, 'build'),
        '-DCMAKE_BUILD_TYPE=Release',
        ...(process.platform === 'darwin' ? ['-DCMAKE_OSX_DEPLOYMENT_TARGET=15.0'] : []),
      ],
      ['--build', path.join(directory, 'build'), '--config', 'Release', '--parallel', '2'],
    ]) {
      const result = spawnSync(cmake, args, {
        env: devEnvironment(),
        encoding: 'utf8',
        windowsHide: true,
        timeout: 60000,
      });
      if (result.status !== 0)
        return {
          ok: false,
          output:
            `${result.error?.message || ''}\n${result.stdout || ''}\n${result.stderr || ''}`.trim(),
        };
    }
    return {
      ok: true,
      output: 'C++20 compile and link succeeded (temporary fixture; no device access)',
    };
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
