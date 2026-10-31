import { makeTemporaryDirectorySync } from '../test-support/temporary-directory.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { root } from '../project.mjs';

const windows = process.platform === 'win32';
const git = (process.env.PATH || process.env.Path || '')
  .split(path.delimiter)
  .map((directory) => path.join(directory, windows ? 'git.exe' : 'git'))
  .find(existsSync);
assert.ok(git, 'Git is required for the isolated commit-formatting tests');

function linkDirectory(source, destination) {
  mkdirSync(path.dirname(destination), { recursive: true });
  symlinkSync(source, destination, windows ? 'junction' : 'dir');
}

function fixture(t, files = {}) {
  const parent = path.join(root, '.tools');
  mkdirSync(parent, { recursive: true });
  const directory = makeTemporaryDirectorySync(path.join(parent, 'commit-formatting-test-'));
  t.after(() =>
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const write = (file, content) => {
    const destination = path.join(directory, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  };
  for (const file of [
    '.gitignore',
    '.prettierignore',
    '.prettierrc.json',
    '.node-version',
    'rustfmt.toml',
    'lint-staged.config.mjs',
    '.husky/pre-commit',
    'tools/project.mjs',
    'tools/setup-git-hooks.mjs',
    'tools/format-staged-files.mjs',
  ]) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    copyFileSync(path.join(root, file), path.join(directory, file));
  }
  write('package.json', '{"private":true,"type":"module"}\n');
  for (const [file, content] of Object.entries(files)) write(file, content);
  linkDirectory(path.join(root, 'node_modules'), path.join(directory, 'node_modules'));
  if (windows) {
    linkDirectory(path.dirname(process.execPath), path.join(directory, '.tools/node'));
  } else {
    const localNode = path.join(directory, '.tools/node/bin/node');
    mkdirSync(path.dirname(localNode), { recursive: true });
    symlinkSync(process.execPath, localNode);
  }

  // Never inherit a caller's index/worktree, signing configuration or hook startup file.
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/^GIT_/iu.test(key) || ['CI', 'HUSKY', 'NODE_ENV'].includes(key)) delete environment[key];
  }
  Object.assign(environment, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(directory, '.tools/global-git-config'),
    GIT_TERMINAL_PROMPT: '0',
    XDG_CONFIG_HOME: path.join(directory, '.tools/user-config'),
  });
  const execute = (program, args, extra = {}) => {
    const result = spawnSync(program, args, {
      cwd: directory,
      env: { ...environment, ...extra },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30000,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}${result.error?.message || ''}`;
    return { ...result, output };
  };
  const checked = (program, args, extra) => {
    const result = execute(program, args, extra);
    assert.equal(result.status, 0, `${program} ${args.join(' ')}\n${result.output}`);
    return result.stdout;
  };
  const gitRun = (...args) => checked(git, args);
  gitRun('init', '--quiet');
  gitRun('config', 'user.name', 'Formatting fixture');
  gitRun('config', 'user.email', 'fixture@example.invalid');
  gitRun('config', 'core.autocrlf', 'false');
  gitRun('config', 'core.eol', 'lf');
  gitRun('add', '--', '.');
  checked(git, ['commit', '--quiet', '-m', 'test: 初始化隔离仓库'], { HUSKY: '0' });
  checked(process.execPath, ['tools/setup-git-hooks.mjs']);
  assert.equal(gitRun('config', '--get', 'core.hooksPath').trim(), '.husky/_');
  return {
    directory,
    environment,
    write,
    git: gitRun,
    read: (file) => readFileSync(path.join(directory, file), 'utf8'),
    commit: (extra = {}, args = []) =>
      execute(git, ['commit', '--quiet', '-m', 'test: 提交格式化样例', ...args], extra),
  };
}

test('a real commit formats staged Chinese/space paths and includes the result', (t) => {
  const repo = fixture(t);
  const file = '中文 目录/自动 格式.ts';
  repo.write(file, 'export const greeting={text:"你好",items:[1,2]}\n');
  repo.git('add', '--', file);
  const result = repo.commit();
  assert.equal(result.status, 0, result.output);
  const expected = "export const greeting = { text: '你好', items: [1, 2] };\n";
  assert.equal(repo.git('show', `HEAD:${file}`), expected);
  assert.equal(repo.read(file), expected);
  assert.equal(repo.git('status', '--porcelain'), '');
});

test('a real commit preserves partial staging and unrelated unstaged/untracked edits', (t) => {
  const base =
    'export const staged = 0;\n\n' +
    'export function untouched() {\n  return 1;\n}\n\n' +
    'export const unstaged = 0;\n';
  const repo = fixture(t, { 'partial.ts': base, 'unrelated.ts': 'export const value = 0;\n' });
  const staged = base.replace('export const staged = 0;', 'export const staged={value:"staged"}');
  repo.write('partial.ts', staged);
  repo.git('add', '--', 'partial.ts');
  repo.write('partial.ts', staged.replace('unstaged = 0', 'unstaged = 99'));
  repo.write('unrelated.ts', 'export const value={untouched:true}\n');
  repo.write('untracked.ts', 'export const untracked={untouched:true}\n');

  const result = repo.commit();
  assert.equal(result.status, 0, result.output);
  const formatted = base.replace(
    'export const staged = 0;',
    "export const staged = { value: 'staged' };",
  );
  assert.equal(repo.git('show', 'HEAD:partial.ts'), formatted);
  assert.equal(repo.read('partial.ts'), formatted.replace('unstaged = 0', 'unstaged = 99'));
  assert.equal(repo.git('show', 'HEAD:unrelated.ts'), 'export const value = 0;\n');
  assert.equal(repo.read('unrelated.ts'), 'export const value={untouched:true}\n');
  assert.equal(repo.read('untracked.ts'), 'export const untracked={untouched:true}\n');
  assert.equal(repo.git('diff', '--cached'), '');
  assert.equal(repo.git('stash', 'list'), '');
});

test('line-ending-only dirty entries cannot pull real unstaged edits into a commit', (t) => {
  const baseline = 'export const value = 0;\n';
  const repo = fixture(t, {
    '.gitattributes': '* text=auto eol=lf\n',
    'a-crlf.ts': baseline,
    'b-unstaged.ts': baseline,
    'c-crlf.ts': baseline,
    'd-unstaged.ts': baseline,
    'z-staged.ts': baseline,
  });
  repo.git('config', 'core.autocrlf', 'true');
  // Keep stat-only entries visible instead of silently refreshing the index.
  repo.git('config', 'diff.autoRefreshIndex', 'false');
  const unstaged = 'export const value = 99;\n';
  repo.write('z-staged.ts', 'export const value={staged:true}\n');
  repo.git('add', '--', 'z-staged.ts');
  for (const file of ['a-crlf.ts', 'c-crlf.ts'])
    repo.write(file, baseline.replaceAll('\n', '\r\n'));
  for (const file of ['b-unstaged.ts', 'd-unstaged.ts']) repo.write(file, unstaged);

  // Git can report stat-dirty entries in --raw with no corresponding patch.
  // Interleave them with real edits to catch parsers which zip raw names to patches.
  const diff = repo.git('diff', '--raw', '--patch', '-z', '--no-renames');
  const [raw, patch] = diff.split('\0\0');
  for (const file of ['a-crlf.ts', 'b-unstaged.ts', 'c-crlf.ts', 'd-unstaged.ts']) {
    assert.ok(raw.includes(file), `expected a raw entry for ${file}`);
  }
  assert.ok(!patch.includes('a-crlf.ts') && !patch.includes('c-crlf.ts'));
  assert.ok(patch.includes('b-unstaged.ts') && patch.includes('d-unstaged.ts'));

  const result = repo.commit();
  assert.equal(result.status, 0, result.output);
  assert.equal(repo.git('show', '--format=', '--name-only', 'HEAD').trim(), 'z-staged.ts');
  assert.equal(
    repo.git('show', 'HEAD:z-staged.ts'),
    'export const value = { staged: true };\n',
    result.output,
  );
  for (const file of ['b-unstaged.ts', 'd-unstaged.ts']) {
    assert.equal(repo.git('show', `HEAD:${file}`), baseline);
    assert.equal(repo.read(file), unstaged);
  }
  for (const file of ['a-crlf.ts', 'c-crlf.ts']) {
    assert.equal(repo.git('show', `HEAD:${file}`), baseline);
    assert.equal(repo.read(file), baseline.replaceAll('\n', '\r\n'));
  }
  assert.equal(repo.git('diff', '--cached'), '');
  assert.equal(repo.git('stash', 'list'), '');
});

test('formatter failure blocks the commit and restores the index and working tree', (t) => {
  const repo = fixture(t, { 'valid.ts': 'export const value = 0;\n' });
  repo.write('valid.ts', 'export const value={staged:true}\n');
  repo.write('broken.ts', 'export const broken = ;\n');
  repo.git('add', '--', 'valid.ts', 'broken.ts');
  repo.write('valid.ts', 'export const value={staged:true}\n// unstaged note\n');
  const head = repo.git('rev-parse', 'HEAD');
  const index = repo.git('diff', '--cached', '--binary');
  const working = repo.read('valid.ts');

  const result = repo.commit();
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /SyntaxError|Unexpected token/u);
  assert.equal(repo.git('rev-parse', 'HEAD'), head);
  assert.equal(repo.git('diff', '--cached', '--binary'), index);
  assert.equal(repo.read('valid.ts'), working);
  assert.equal(repo.read('broken.ts'), 'export const broken = ;\n');
  assert.equal(repo.git('stash', 'list'), '');
});

test('generated, third-party and Git-ignored files commit without formatting', (t) => {
  const repo = fixture(t);
  const files = {
    'packages/contracts/src/types.ts': 'generated TypeScript: deliberately not parseable\n',
    '3rdparty/upstream.cpp': 'upstream C++: deliberately not parseable\n',
    'apps/desktop/src-tauri/gen/generated.rs': 'generated Rust: deliberately not parseable\n',
  };
  for (const [file, content] of Object.entries(files)) repo.write(file, content);
  repo.git('add', '--force', '--', ...Object.keys(files));
  const result = repo.commit();
  assert.equal(result.status, 0, result.output);
  for (const [file, content] of Object.entries(files)) {
    assert.equal(repo.git('show', `HEAD:${file}`), content);
    assert.equal(repo.read(file), content);
  }
});

test('deleted files, unknown formats and an empty commit do not require a formatter', (t) => {
  const repo = fixture(t, { 'removed.ts': 'export const removed = 1;\n' });
  repo.git('rm', '--', 'removed.ts');
  const file = '未知 格式.fixture';
  const contents = 'opaque content with  trailing spaces  \n';
  repo.write(file, contents);
  repo.git('add', '--', file);
  const result = repo.commit();
  assert.equal(result.status, 0, result.output);
  assert.equal(repo.git('show', `HEAD:${file}`), contents);
  assert.equal(repo.git('ls-files', '--', 'removed.ts'), '');
  const empty = repo.commit({}, ['--allow-empty']);
  assert.equal(empty.status, 0, empty.output);
  assert.equal(repo.git('status', '--porcelain'), '');
});

test('the hook uses checkout Node when global Node and pnpm are absent from PATH', (t) => {
  const repo = fixture(t);
  repo.write('local-node.ts', 'export const local={works:true}\n');
  repo.git('add', '--', 'local-node.ts');
  const originalPath = (repo.environment.PATH || repo.environment.Path || '').split(path.delimiter);
  let restrictedPath;
  if (windows) {
    const restricted = originalPath.filter(
      (directory) =>
        directory &&
        !['node.exe', 'pnpm.exe', 'pnpm.cmd'].some((name) =>
          existsSync(path.join(directory, name)),
        ),
    );
    assert.ok(restricted.includes(path.dirname(git)), 'the fixture must retain Git in PATH');
    restrictedPath = restricted.join(path.delimiter);
  } else {
    // /usr/bin may contain both Git and Node. Keep only the commands the hook needs.
    restrictedPath = path.join(repo.directory, '.tools/path-without-node');
    mkdirSync(restrictedPath, { recursive: true });
    for (const command of ['git', 'sh', 'dirname', 'basename']) {
      const source = originalPath
        .filter(Boolean)
        .map((directory) => path.resolve(directory, command))
        .find(existsSync);
      assert.ok(source, `${command} is required for the isolated hook PATH`);
      symlinkSync(source, path.join(restrictedPath, command));
    }
  }
  const result = repo.commit({ PATH: restrictedPath });
  assert.equal(result.status, 0, result.output);
  assert.equal(repo.git('show', 'HEAD:local-node.ts'), 'export const local = { works: true };\n');
});

function pinnedRustfmtDirectory() {
  const toolchains = path.join(root, '.tools/rustup/toolchains');
  if (!existsSync(toolchains)) return undefined;
  const channel = readFileSync(path.join(root, 'rust-toolchain.toml'), 'utf8').match(
    /^channel\s*=\s*"([^"]+)"/mu,
  )?.[1];
  return readdirSync(toolchains)
    .filter((name) => name.startsWith(`${channel}-`))
    .map((name) => path.join(toolchains, name, 'bin'))
    .find((directory) => existsSync(path.join(directory, windows ? 'rustfmt.exe' : 'rustfmt')));
}

test('formatting a staged Rust module preserves its unstaged child module', (t) => {
  const rustfmt = pinnedRustfmtDirectory();
  if (!rustfmt)
    return t.skip('the pinned local Rust toolchain is not installed; no download during tests');
  const repo = fixture(t, {
    'main.rs': 'mod child;\nfn main() {}\n',
    'child.rs': 'pub fn value() -> u8 {\n    1\n}\n',
  });
  // Link the installed rustfmt binary directly, avoiding rustup auto-install/update behavior.
  linkDirectory(rustfmt, path.join(repo.directory, '.tools/cargo/bin'));
  repo.write('main.rs', 'mod child;\nfn main(){println!("hello");}\n');
  repo.git('add', '--', 'main.rs');
  const child = 'pub fn value()->u8{2}\n';
  repo.write('child.rs', child);
  const result = repo.commit();
  assert.equal(result.status, 0, result.output);
  assert.match(repo.git('show', 'HEAD:main.rs'), /fn main\(\) \{\n {4}println!\("hello"\);\n\}/u);
  assert.equal(repo.read('child.rs'), child);
  assert.equal(repo.git('show', 'HEAD:child.rs'), 'pub fn value() -> u8 {\n    1\n}\n');
});
