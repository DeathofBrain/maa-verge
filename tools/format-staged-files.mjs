import path from 'node:path';
import { getFileInfo } from 'prettier';
import { root, run, fail } from './project.mjs';

async function main() {
  const groups = { prettier: [], cpp: [], rust: [], python: [] };
  for (const file of process.argv.slice(2)) {
    // Share the repository exclusions across languages, including generated files.
    const info = await getFileInfo(file, {
      ignorePath: [path.join(root, '.gitignore'), path.join(root, '.prettierignore')],
    });
    if (info.ignored) continue;
    const extension = path.extname(file).toLowerCase();
    if (
      ['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx', '.ipp', '.inl'].includes(extension)
    ) {
      groups.cpp.push(file);
    } else if (extension === '.rs') {
      groups.rust.push(file);
    } else if (['.py', '.pyi'].includes(extension)) {
      groups.python.push(file);
    } else if (info.inferredParser) {
      groups.prettier.push(file);
    }
  }

  if (groups.prettier.length) {
    await run('node', [
      path.join(root, 'node_modules/prettier/bin/prettier.cjs'),
      '--write',
      '--',
      ...groups.prettier,
    ]);
  }
  if (groups.cpp.length) await run('clang-format', ['-i', '--', ...groups.cpp]);
  if (groups.rust.length) {
    // cargo fmt and recursive rustfmt would also rewrite unstaged child modules.
    await run('rustfmt', [
      '--config-path',
      path.join(root, 'rustfmt.toml'),
      '--config',
      'skip_children=true',
      ...groups.rust,
    ]);
  }
  if (groups.python.length) {
    // A commit must not download tools or synchronize the Python environment.
    await run('uv', [
      'run',
      '--offline',
      '--frozen',
      '--no-sync',
      'ruff',
      'format',
      '--',
      ...groups.python,
    ]);
  }
}

main().catch(fail);
