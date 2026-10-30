import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { root, fail } from './project.mjs';

const defaultSourceRoot = path.join(root, 'apps', 'desktop', 'src');
const codeExtension = /\.(?:[cm]?[jt]sx?)$/u;
const declarationFile = /\.d\.[cm]?ts$/u;
const resourceQuery = /[?&](?:raw|url)(?:&|$)/u;
const allowedLayers = new Set(['app', 'features', 'kit', 'shared']);
const normalized = (file) => file.split(path.sep).join('/');
const identity = (file) =>
  ts.sys.useCaseSensitiveFileNames ? path.resolve(file) : path.resolve(file).toLowerCase();

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(file);
      return entry.isFile() ? [file] : [];
    });
}

function moduleReferences(source) {
  const references = [];
  const add = (literal) => {
    if (literal && ts.isStringLiteralLike(literal))
      references.push({
        specifier: literal.text,
        line: source.getLineAndCharacterOfPosition(literal.getStart(source)).line + 1,
      });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      add(node.moduleReference.expression);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      add(node.argument.literal);
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return references;
}

function stylesheetReferences(text) {
  const references = [];
  const trivia = (start) => {
    let cursor = start;
    while (cursor < text.length) {
      if (/\s/u.test(text[cursor])) cursor++;
      else if (text.startsWith('/*', cursor)) {
        const end = text.indexOf('*/', cursor + 2);
        cursor = end < 0 ? text.length : end + 2;
      } else break;
    }
    return cursor;
  };
  const quoted = (start) => {
    const quote = text[start];
    if (quote !== '"' && quote !== "'") return;
    let value = '';
    let cursor = start + 1;
    while (cursor < text.length) {
      if (text[cursor] === quote) return { value, end: cursor + 1 };
      if (text[cursor] === '\\') cursor++;
      value += text[cursor++] ?? '';
    }
  };
  let cursor = 0;
  while (cursor < text.length) {
    cursor = trivia(cursor);
    const string = quoted(cursor);
    if (string) {
      cursor = string.end;
      continue;
    }
    if (/^@import(?:\s|\/\*|["'])/iu.test(text.slice(cursor))) {
      let target = trivia(cursor + '@import'.length);
      const url = /^url\s*\(/iu.exec(text.slice(target));
      if (url) target = trivia(target + url[0].length);
      const literal = quoted(target);
      const bare = url && /^[^\s)]+/u.exec(text.slice(target));
      const specifier = literal?.value ?? (bare ? bare[0] : undefined);
      if (specifier !== undefined)
        references.push({
          specifier,
          line: text.slice(0, cursor).split('\n').length,
        });
      cursor = literal?.end ?? target + (bare ? bare[0].length : 0);
    } else cursor++;
  }
  return references;
}

function assetCandidates(specifier, importer, options, sourceRoot) {
  const request = specifier.split('?')[0];
  const fragment = request.indexOf('#', 1);
  const target = fragment < 0 ? request : request.slice(0, fragment);
  if (target.startsWith('.')) return [path.resolve(path.dirname(importer), target)];
  if (target.startsWith('/src/')) return [path.resolve(sourceRoot, target.slice('/src/'.length))];
  const matches = [];
  for (const [pattern, replacements] of Object.entries(options.paths ?? {})) {
    const wildcard = pattern.indexOf('*');
    if (wildcard < 0) {
      if (pattern === target) matches.push({ prefix: Infinity, replacements, capture: '' });
      continue;
    }
    const prefix = pattern.slice(0, wildcard);
    const suffix = pattern.slice(wildcard + 1);
    if (
      target.startsWith(prefix) &&
      target.endsWith(suffix) &&
      target.length >= prefix.length + suffix.length
    )
      matches.push({
        prefix: prefix.length,
        replacements,
        capture: target.slice(prefix.length, target.length - suffix.length),
      });
  }
  const match = matches.sort((a, b) => b.prefix - a.prefix)[0];
  const base = options.baseUrl ?? options.pathsBasePath ?? sourceRoot;
  return [
    ...(match?.replacements.map((replacement) =>
      path.resolve(base, replacement.replace('*', match.capture)),
    ) ?? []),
    ...(options.baseUrl ? [path.resolve(options.baseUrl, target)] : []),
  ];
}

function compilerOptions(directory) {
  const defaults = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    allowJs: true,
    resolveJsonModule: true,
  };
  const configFile = ts.findConfigFile(path.dirname(directory), ts.sys.fileExists, 'tsconfig.json');
  if (!configFile) return defaults;
  const config = ts.readConfigFile(configFile, ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  return {
    ...defaults,
    ...ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configFile)).options,
  };
}

function boundaryViolation(from, to) {
  const layer = from.split('/')[0];
  if (['features', 'kit', 'shared'].includes(layer) && to.startsWith('app/'))
    return `${layer} 不得反向依赖应用编排 ${to}`;
  if (['kit', 'shared'].includes(layer) && to.startsWith('features/'))
    return `${layer} 不得依赖业务模块 ${to}`;
}

function runtimeCycles(graph) {
  const numbers = new Map();
  const lowest = new Map();
  const active = new Set();
  const stack = [];
  const groups = [];
  let next = 0;
  const visit = (file) => {
    numbers.set(file, next);
    lowest.set(file, next++);
    stack.push(file);
    active.add(file);
    for (const target of [...graph.get(file)].sort()) {
      if (!numbers.has(target)) {
        visit(target);
        lowest.set(file, Math.min(lowest.get(file), lowest.get(target)));
      } else if (active.has(target))
        lowest.set(file, Math.min(lowest.get(file), numbers.get(target)));
    }
    if (lowest.get(file) !== numbers.get(file)) return;
    const group = [];
    let member;
    do {
      member = stack.pop();
      active.delete(member);
      group.push(member);
    } while (member !== file);
    if (group.length > 1 || graph.get(file).has(file)) groups.push(group.sort());
  };
  for (const file of [...graph.keys()].sort()) if (!numbers.has(file)) visit(file);

  return groups.map((group) => {
    const members = new Set(group);
    const route = [];
    const visited = new Set();
    let cycle;
    const find = (file) => {
      const index = route.indexOf(file);
      if (index >= 0) {
        cycle = [...route.slice(index), file];
        return true;
      }
      if (visited.has(file)) return false;
      visited.add(file);
      route.push(file);
      for (const target of [...graph.get(file)].sort())
        if (members.has(target) && find(target)) return true;
      route.pop();
      return false;
    };
    find(group[0]);
    return `运行时循环依赖：${cycle.join(' → ')}；循环组：${group.join('、')}`;
  });
}

// directory 指向 src；测试可以传入隔离的临时源码目录。
export function inspectFrontendArchitecture(directory = defaultSourceRoot) {
  const sourceRoot = path.resolve(directory);
  const relative = (file) => normalized(path.relative(sourceRoot, file));
  const files = sourceFiles(sourceRoot);
  const violations = [];
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true }))
    if (entry.isDirectory() && !allowedLayers.has(entry.name))
      violations.push(`${entry.name}/:1 src 顶层目录只允许 app、features、kit、shared`);
  if (!files.some((file) => relative(file) === 'main.tsx'))
    violations.push('main.tsx 缺失：src 根目录必须保留唯一启动入口');
  for (const file of files) {
    const name = relative(file);
    if (!name.includes('/') && name !== 'main.tsx')
      violations.push(
        `${name}:1 src 根目录只允许 main.tsx，请将文件归入 app、features、kit 或 shared`,
      );
  }

  const modules = files.filter((file) => codeExtension.test(file));
  const stylesheets = files.filter((file) => file.endsWith('.css'));
  const known = new Map(files.map((file) => [identity(file), file]));
  const graph = new Map([...modules, ...stylesheets].map((file) => [relative(file), new Set()]));
  const options = compilerOptions(sourceRoot);
  const resolutionCache = ts.createModuleResolutionCache(sourceRoot, identity, options);
  const resolve = (specifier, importer) => {
    const resolved = ts.resolveModuleName(specifier, importer, options, ts.sys, resolutionCache)
      .resolvedModule?.resolvedFileName;
    if (resolved) return known.get(identity(resolved));
    // TypeScript 不解析 CSS 等资源，但这些导入仍需遵守目录边界。
    for (const asset of assetCandidates(specifier, importer, options, sourceRoot))
      if (known.has(identity(asset))) return known.get(identity(asset));
  };

  for (const file of modules) {
    const name = relative(file);
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    for (const reference of moduleReferences(source)) {
      if (reference.specifier.startsWith('@tauri-apps/'))
        violations.push(
          `${name}:${reference.line} 禁止直接导入 ${reference.specifier}，请使用 @maaverge/contracts 的类型化入口`,
        );
      const target = resolve(reference.specifier, file);
      if (!target) continue;
      const message = boundaryViolation(name, relative(target));
      if (message) violations.push(`${name}:${reference.line} ${message}`);
    }
    if (declarationFile.test(file)) continue;
    // 隔离编译与前端构建一致：显式 type 边及仅用于类型位置的普通导入都不会进入运行时图。
    const emitted = ts.transpileModule(text, {
      fileName: file,
      compilerOptions: { ...options, noEmit: false, declaration: false },
    }).outputText;
    const runtime = ts.createSourceFile(`${file}.jsx`, emitted, ts.ScriptTarget.Latest, true);
    for (const reference of moduleReferences(runtime)) {
      if (resourceQuery.test(reference.specifier)) continue;
      const target = resolve(reference.specifier, file);
      if (target && graph.has(relative(target))) graph.get(name).add(relative(target));
    }
  }
  for (const file of stylesheets) {
    const name = relative(file);
    for (const reference of stylesheetReferences(readFileSync(file, 'utf8'))) {
      const target = resolve(reference.specifier, file);
      if (!target) continue;
      const message = boundaryViolation(name, relative(target));
      if (message) violations.push(`${name}:${reference.line} ${message}`);
      if (graph.has(relative(target))) graph.get(name).add(relative(target));
    }
  }
  return [...new Set([...violations, ...runtimeCycles(graph)])];
}

export function main(args = process.argv.slice(2)) {
  if (args.length && (args.length !== 2 || args[0] !== '--source-root'))
    throw new Error('用法：node tools/check-frontend-architecture.mjs [--source-root <src目录>]');
  const violations = inspectFrontendArchitecture(args[1] || defaultSourceRoot);
  if (!violations.length) return;
  console.error('前端目录与依赖边界检查未通过：');
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
