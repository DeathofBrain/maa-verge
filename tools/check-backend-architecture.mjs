import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { root, fail } from './project.mjs';
import {
  compilerOptions,
  identity,
  moduleReferences,
  normalized,
  referenceTarget,
  sourceFiles,
} from './architecture-support.mjs';

const defaultSourceRoot = path.join(root, 'services', 'backend', 'src');
const layers = new Set(['app', 'transport', 'modules', 'infrastructure', 'shared']);
const modules = new Set([
  'settings',
  'devices',
  'plans',
  'execution',
  'agent',
  'framework',
  'debug',
  'copilot',
  'schedules',
  'tools',
  'home',
  'resources',
  'recognition',
  'knowledge',
  'updates',
]);
function boundaryViolation(from, target, sourceRoot, specifier) {
  const location = normalized(identity(target));
  if (/(?:^|\/)apps\/desktop\//iu.test(location)) return `后端不得依赖桌面产品 UI：${location}`;
  const workspaceRoot = path.resolve(sourceRoot, '../../..');
  const workspacePath = normalized(path.relative(identity(workspaceRoot), identity(target)));
  const automationRoot = identity(path.join(workspaceRoot, 'services/automation'));
  const automationPath = normalized(path.relative(automationRoot, identity(target)));
  const automationImport =
    specifier === '@maaverge/automation' || specifier.startsWith('@maaverge/automation/');
  const insideAutomation =
    automationPath !== '..' &&
    !automationPath.startsWith('../') &&
    !path.isAbsolute(automationPath);
  if (
    (automationImport || insideAutomation) &&
    (specifier !== '@maaverge/automation' || automationPath !== 'src/index.ts')
  )
    return `后端只能通过 @maaverge/automation 公共出口依赖自动化库：${location}`;
  if (
    !workspacePath.startsWith('../') &&
    !path.isAbsolute(workspacePath) &&
    (workspacePath.startsWith('tools/') ||
      /(?:^|\/)(?:tests?|__tests__|fixtures?|__fixtures__)\//u.test(workspacePath))
  )
    return `产品源码不得依赖测试夹具或开发工具：${workspacePath}`;
  const relative = normalized(path.relative(identity(sourceRoot), identity(target)));
  const external = relative === '..' || relative.startsWith('../') || path.isAbsolute(relative);
  const layer = from.split('/')[0];
  if (external) {
    if (
      ['shared', 'infrastructure', 'transport'].includes(layer) &&
      identity(target) !== identity(path.join(workspaceRoot, 'package.json')) &&
      !/(?:^|\/)(?:node_modules|packages\/contracts)\//iu.test(location)
    )
      return `${layer} 不得依赖 contracts 之外的外部源码：${location}`;
    return;
  }
  if (relative === 'entry.ts') return `不得导入启动入口 ${relative}`;
  const destination = relative.split('/')[0];
  if (layer === 'shared' && destination !== 'shared')
    return `shared 只允许依赖 shared 与 contracts：${relative}`;
  if (layer === 'infrastructure' && !['infrastructure', 'shared'].includes(destination))
    return `infrastructure 不得依赖业务或应用编排：${relative}`;
  if (layer === 'modules' && ['app', 'transport'].includes(destination))
    return `modules 不得反向依赖 app 或 transport：${relative}`;
  if (layer === 'transport' && !['infrastructure', 'shared'].includes(destination))
    return `transport 只允许依赖 infrastructure、shared 与 contracts，请使用小结构端口：${relative}`;
}

// 仅检查产品 src；测试可通过 --source-root 提供隔离的目录。
export function inspectBackendArchitecture(directory = defaultSourceRoot) {
  const sourceRoot = path.resolve(directory);
  const relative = (file) => normalized(path.relative(sourceRoot, file));
  const files = sourceFiles(sourceRoot);
  const violations = [];
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !layers.has(entry.name))
      violations.push(
        `${entry.name}/:1 src 顶层目录只允许 app、transport、modules、infrastructure、shared`,
      );
    if (entry.isDirectory() && entry.name === 'modules')
      for (const module of readdirSync(path.join(sourceRoot, 'modules'), { withFileTypes: true }))
        if (!module.isDirectory() || !modules.has(module.name))
          violations.push(`modules/${module.name}:1 modules 只允许已登记的业务目录`);
  }
  if (!files.some((file) => relative(file) === 'entry.ts'))
    violations.push('entry.ts 缺失：src 根目录必须保留产品启动入口');
  for (const file of files) {
    const name = relative(file);
    if (!name.includes('/') && name !== 'entry.ts')
      violations.push(`${name}:1 src 根目录只允许 entry.ts，请将文件归入对应层级`);
  }

  const options = compilerOptions(sourceRoot);
  const cache = ts.createModuleResolutionCache(sourceRoot, identity, options);
  for (const file of files.filter((file) => /\.[cm]?[jt]sx?$/u.test(file))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const reference of moduleReferences(source)) {
      if (/\.d\.[cm]?[jt]s(?:[?#].*)?$/iu.test(reference.specifier))
        violations.push(
          `${relative(file)}:${reference.line} 不得显式导入声明路径 ${reference.specifier}，请引用源模块`,
        );
      const target = referenceTarget(reference.specifier, file, options, cache);
      if (!target) continue;
      const message = boundaryViolation(relative(file), target, sourceRoot, reference.specifier);
      if (message) violations.push(`${relative(file)}:${reference.line} ${message}`);
    }
  }
  return [...new Set(violations)];
}

export function main(args = process.argv.slice(2)) {
  if (args.length && (args.length !== 2 || args[0] !== '--source-root'))
    throw new Error('用法：node tools/check-backend-architecture.mjs [--source-root <src目录>]');
  const violations = inspectBackendArchitecture(args[1] || defaultSourceRoot);
  if (!violations.length) return;
  console.error('后端目录与依赖边界检查未通过：');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    fail(error);
  }
}
