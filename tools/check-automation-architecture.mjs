/**
 * 自动化库的目录与依赖门禁：通用执行能力留在 src，游戏功能维护独立的 JSON 和 Custom。
 * 同时检查布局与源码引用，避免目录迁移后只改路径、实际依赖仍混入宿主或游戏语义。
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
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

const defaultSourceRoot = path.join(root, 'services/automation/src');
// L1 不反向依赖通用组合；L2 可使用原语和纯定义类型，执行编排仍交给 Pipeline。
// 精确文件特例只共享登记/资源类型，不能借此引入跨层运行器。
const dependencies = new Map([
  ['core', new Set(['core'])],
  ['resources', new Set(['core', 'resources'])],
  ['primitives', new Set(['core', 'resources', 'primitives'])],
  ['composites', new Set(['core', 'resources', 'primitives', 'composites'])],
  ['pipeline', new Set(['core', 'resources', 'primitives', 'composites', 'pipeline'])],
  ['registry', new Set(['core', 'registry'])],
]);
const exactDependencies = new Map([
  ['primitives', new Set(['registry/types.ts'])],
  ['composites', new Set(['registry/types.ts', 'pipeline/definitions.ts'])],
  ['registry', new Set(['pipeline/definitions.ts', 'pipeline/invocation.ts'])],
]);
const directories = new Set(dependencies.keys());
// 游戏名和功能名不混进通用层；功能在 custom 下建一级目录，节点层级留在 JSON 名称中。
const gameDirectories = new Set(['pipeline', 'custom']);
const entries = new Set(['index.ts', 'registry.ts']);
const inside = (relative) =>
  relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative);

/** 按解析后的真实文件归属判断边界，别名、包名和符号链接不能改变目标所在层。 */
function boundaryViolation(from, target, sourceRoot, gameRoot, commonRoot) {
  const workspaceRoot = identity(path.resolve(sourceRoot, '../../..'));
  const location = normalized(path.relative(workspaceRoot, identity(target)));
  if (
    inside(location) &&
    (/^(?:apps\/|tools\/|services\/(?:backend|native)\/)/iu.test(location) ||
      /(?:^|\/)(?:tests?|__tests__|fixtures?|__fixtures__)\//iu.test(location))
  )
    return `自动化库不得依赖后端、桌面、原生进程、开发工具或测试源码：${location}`;
  const commonRelative = normalized(path.relative(commonRoot, identity(target)));
  const relative = normalized(path.relative(sourceRoot, identity(target)));
  const gameRelative = normalized(path.relative(gameRoot, identity(target)));
  const sourceRelative = normalized(path.relative(sourceRoot, identity(from)));
  const gameSource = normalized(path.relative(gameRoot, identity(from)));
  const fromGame = inside(gameSource);
  const layer = fromGame ? 'arknights' : sourceRelative.split('/')[0];
  // 先识别兄弟游戏目录，再处理外部依赖；否则游戏源码容易被误当成通用包放行。
  if (inside(gameRelative)) {
    if (dependencies.has(layer)) return `${layer} 不得依赖游戏语义：../arknights/${gameRelative}`;
    if (
      fromGame &&
      (!['custom', 'pipeline'].includes(gameRelative.split('/')[0]) ||
        gameSource.split('/')[1] !== gameRelative.split('/')[1])
    )
      return `游戏功能只允许依赖本功能的 custom、pipeline 与通用模块：${gameRelative}`;
    return;
  }
  // 通用 JSON 与通用源码并列归档，L1 只读自己的资源；别名仍以真实目标判定。
  if (inside(commonRelative)) {
    const destination = commonRelative.split('/')[0];
    const allowed =
      layer === 'primitives'
        ? ['primitives']
        : layer === 'composites'
          ? ['primitives', 'composites']
          : fromGame || !dependencies.has(layer) || ['pipeline', 'registry'].includes(layer)
            ? ['primitives', 'composites']
            : [];
    if (!allowed.includes(destination))
      return `${layer} 不得依赖该通用 Pipeline 资源：${commonRelative}`;
    return;
  }
  if (!inside(relative)) {
    if (
      !/(?:^|\/)node_modules\//iu.test(normalized(identity(target))) &&
      !(inside(location) && location.startsWith('packages/contracts/'))
    )
      return `自动化库只能依赖 contracts 与已声明的外部包：${location}`;
    return;
  }
  if (
    layer === 'primitives' &&
    relative === 'primitives/vision.ts' &&
    sourceRelative !== 'primitives/vision.ts'
  )
    return 'primitives 不得通过旧 vision 兼容出口反向依赖 L2';
  const destination = relative.split('/')[0];
  // 根入口允许组装模块，通用层和游戏实现都不能反向依赖这些组装入口。
  if (layer === 'core' && destination !== 'core')
    return `core 不得依赖游戏语义、资源适配或注册表：${relative}`;
  if (fromGame && !directories.has(destination))
    return `游戏功能不得依赖公共组装入口，只允许依赖通用模块：${relative}`;
  if (
    dependencies.has(layer) &&
    !dependencies.get(layer).has(destination) &&
    !exactDependencies.get(layer)?.has(relative) &&
    !(sourceRelative === 'primitives/vision.ts' && relative === 'composites/vision.ts')
  )
    return `${layer} 只允许依赖 ${[...dependencies.get(layer)].join('、')}${exactDependencies.has(layer) ? ` 与 ${[...exactDependencies.get(layer)].join('、')}` : ''}：${relative}`;
}

/** 检查游戏资源分类与浅层功能布局，不维护具体功能名单，新增功能仍受同一套规则约束。 */
function inspectGameDirectories(gameRoot, violations) {
  if (!existsSync(gameRoot)) return [];
  if (!lstatSync(gameRoot).isDirectory()) {
    violations.push('../arknights:1 游戏资源必须是独立目录');
    return [];
  }
  for (const entry of readdirSync(gameRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !gameDirectories.has(entry.name)) {
      violations.push(`../arknights/${entry.name}:1 arknights 根目录只允许 pipeline、custom`);
      continue;
    }
    const directory = path.join(gameRoot, entry.name);
    if (entry.name === 'custom') {
      for (const feature of readdirSync(directory, { withFileTypes: true })) {
        const featurePath = `../arknights/custom/${feature.name}`;
        if (!feature.isDirectory()) {
          violations.push(`${featurePath}:1 custom 只允许按游戏功能建立目录`);
          continue;
        }
        for (const file of readdirSync(path.join(directory, feature.name), {
          withFileTypes: true,
        }))
          if (!file.isFile() || !file.name.endsWith('.ts'))
            violations.push(`${featurePath}/${file.name}:1 游戏功能内只允许平放 TypeScript 文件`);
      }
      continue;
    }
    const checkPipeline = (folder) => {
      for (const file of readdirSync(folder, { withFileTypes: true })) {
        const target = path.join(folder, file.name);
        if (file.isDirectory()) checkPipeline(target);
        else if (!file.isFile() || !file.name.endsWith('.json'))
          violations.push(
            `../arknights/${normalized(path.relative(gameRoot, target))}:1 pipeline 只允许 JSON 资源`,
          );
      }
    };
    checkPipeline(directory);
  }
  return sourceFiles(gameRoot);
}

/** 通用流程资源独立扫描；不能混入 TS、链接、未知层级或未被导入的游戏调用。 */
function inspectCommonPipelines(commonRoot, violations) {
  if (!existsSync(commonRoot)) return;
  if (!lstatSync(commonRoot).isDirectory()) {
    violations.push('../pipeline:1 通用 Pipeline 必须是独立目录');
    return;
  }
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const relative = normalized(path.relative(commonRoot, file));
      const label = `../pipeline/${relative}:1`;
      const level = relative.split('/')[0];
      if (!['primitives', 'composites'].includes(level)) {
        violations.push(`${label} 通用 Pipeline 只允许 primitives、composites 分类`);
        continue;
      }
      if (entry.isDirectory()) {
        visit(file);
        continue;
      }
      if (!entry.isFile() || !file.endsWith('.json')) {
        violations.push(`${label} 通用 Pipeline 只允许普通 JSON 文件`);
        continue;
      }
      try {
        const nodes = JSON.parse(readFileSync(file, 'utf8'));
        if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes))
          throw new Error('节点表无效');
        for (const node of Object.values(nodes)) {
          const params = node?.custom_action_param;
          if (params?.handler !== 'call') continue;
          // L1 没有可继续下探的层；L2 的声明式调用必须指向最小原语。
          if (
            level === 'primitives' ||
            typeof params.primitive !== 'string' ||
            !params.primitive.startsWith('operation.')
          )
            violations.push(`${label} 通用 Pipeline 调用只能从 composites 指向 operation 原语`);
        }
      } catch (error) {
        violations.push(`${label} 通用 Pipeline JSON 无效：${error.message}`);
      }
    }
  };
  visit(commonRoot);
}

/** 保留 src 作为可替换的扫描入口，同时纳入其兄弟游戏目录，便于隔离夹具与 CLI 共用。 */
export function inspectAutomationArchitecture(directory = defaultSourceRoot) {
  const sourceRoot = identity(directory);
  const gameRoot = path.resolve(sourceRoot, '../arknights');
  const commonRoot = path.resolve(sourceRoot, '../pipeline');
  const relative = (file) => normalized(path.relative(sourceRoot, file));
  const violations = [];
  inspectCommonPipelines(commonRoot, violations);
  // 完整枚举两个源码根，不只追踪公共出口的导入图；尚未接入的功能也不能绕过门禁。
  const files = [...sourceFiles(sourceRoot), ...inspectGameDirectories(gameRoot, violations)];
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !directories.has(entry.name))
      violations.push(`${entry.name}/:1 自动化库顶层目录只允许 ${[...directories].join('、')}`);
    if (entry.isFile() && !entries.has(entry.name))
      violations.push(`${entry.name}:1 自动化库根目录只允许 index.ts 与 registry.ts`);
  }
  if (!files.some((file) => relative(file) === 'index.ts'))
    violations.push('index.ts 缺失：自动化库必须提供公共出口');
  // 使用项目自身的 TypeScript 解析规则定位 aliases、JS 扩展名与类型引用；AST 提取引用，
  // 不把注释或普通字符串当成依赖。未解析的相对路径仍参加边界检查，缺失文件交给 tsc。
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
      const message = boundaryViolation(file, target, sourceRoot, gameRoot, commonRoot);
      if (message) violations.push(`${relative(file)}:${reference.line} ${message}`);
    }
  }
  // 一次报告所有布局和依赖问题，并保留调用位置，避免修复一个问题后才暴露下一个。
  return [...new Set(violations)];
}

export function main(args = process.argv.slice(2)) {
  if (args.length && (args.length !== 2 || args[0] !== '--source-root'))
    throw new Error('用法：node tools/check-automation-architecture.mjs [--source-root <src目录>]');
  const violations = inspectAutomationArchitecture(args[1] || defaultSourceRoot);
  if (!violations.length) return;
  console.error('自动化库目录与依赖边界检查未通过：');
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
