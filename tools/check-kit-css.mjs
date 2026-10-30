import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, fail } from './project.mjs';

const sourceRoot = path.join(root, 'apps', 'desktop', 'src');
const kitStylesheet = 'kit/kit.css';

export const pseudoClasses = new Set([
  'active',
  'checked',
  'default',
  'disabled',
  'empty',
  'enabled',
  'first-child',
  'first-of-type',
  'focus',
  'focus-visible',
  'focus-within',
  'has',
  'hover',
  'indeterminate',
  'invalid',
  'is',
  'last-child',
  'last-of-type',
  'not',
  'only-child',
  'placeholder-shown',
  'read-only',
  'read-write',
  'target',
  'valid',
  'where',
]);

export const pseudoElements = new Set([
  'after',
  'before',
  'placeholder',
  'selection',
  'marker',
  // 原生 <progress> 的厂商槽位，只在 ProgressBar 上使用。
  '-webkit-progress-bar',
  '-webkit-progress-value',
  '-moz-progress-bar',
]);

// A compound is a kit class plus attribute/pseudo suffixes; anything else in a
// selector means a host page or a bare element is being styled from the kit.
const token = new RegExp(
  String.raw`\.mv-[a-z0-9-]+(?:\[[^\]]*\]|:{1,2}[a-z-]+(?:\([^()]*\))?)*|[>+~]`,
  'g',
);

export function stripComments(css) {
  // Keep newlines so reported line numbers still match the source file.
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

export function splitSelectorList(prelude) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const character of prelude) {
    if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

export function collectRules(css) {
  const rules = [];
  const frames = [];
  const openAtRules = [];
  let buffer = '';
  let bufferLine = 1;
  let line = 1;
  for (const character of css) {
    if (character === '{') {
      const prelude = buffer.trim();
      if (prelude.startsWith('@')) {
        openAtRules.push(prelude);
        frames.push(true);
      } else {
        if (prelude)
          rules.push({
            prelude,
            line: bufferLine,
            keyframes: openAtRules.some((at) => at.startsWith('@keyframes')),
          });
        frames.push(false);
      }
      buffer = '';
      continue;
    }
    if (character === '}') {
      if (frames.pop()) openAtRules.pop();
      buffer = '';
      continue;
    }
    if (character === '\n') line += 1;
    if (!buffer.trim() && character.trim()) bufferLine = line;
    buffer += character;
  }
  return rules;
}

export function inspectSelector(selector) {
  const violations = [];
  for (const complex of splitSelectorList(selector)) {
    const normalized = complex.replace(/\s*([>+~])\s*/g, '$1');
    if (normalized.split(/\s+/).filter(Boolean).length > 1) {
      violations.push(`「${complex}」使用后代组合器，组件套装只能用子组合器 >`);
      continue;
    }
    const tokens = normalized.match(token) ?? [];
    if (tokens.join('') !== normalized) {
      violations.push(`「${complex}」含 .mv- 之外的片段（禁止 ID、元素与页面选择器）`);
      continue;
    }
    const combinators = tokens.filter((entry) => entry.length === 1);
    if (combinators.some((entry) => entry !== '>'))
      violations.push(`「${complex}」只允许子组合器 >`);
    if (combinators.length > 1) violations.push(`「${complex}」最多允许一层子组合器`);
    for (const entry of tokens) {
      for (const [, colons, name] of entry.matchAll(/(:{1,2})([a-z-]+)/g)) {
        const allowed = colons === '::' ? pseudoElements : pseudoClasses;
        if (!allowed.has(name)) violations.push(`「${complex}」使用未登记的伪类 ${colons}${name}`);
      }
    }
  }
  return violations;
}

export function inspectKitStylesheet(css) {
  const violations = [];
  stripComments(css)
    .split('\n')
    .forEach((line, index) => {
      if (line.includes('!important')) violations.push(`${index + 1} 禁止使用 !important`);
      if (line.trimStart().startsWith('@import'))
        violations.push(`${index + 1} 禁止 @import，请把内容并入本文件`);
    });
  for (const rule of collectRules(stripComments(css))) {
    if (rule.keyframes) continue;
    for (const message of inspectSelector(rule.prelude)) violations.push(`${rule.line} ${message}`);
  }
  return violations.map((message) => `${kitStylesheet}:${message}`);
}

export function inspectHostStylesheets(entries) {
  const violations = [];
  for (const { file, css } of entries) {
    stripComments(css)
      .split('\n')
      .forEach((line, index) => {
        if (/\.mv-[a-z0-9-]/.test(line))
          violations.push(`${file}:${index + 1} 页面样式表不得重样式化组件套装内部类 .mv-`);
      });
  }
  return violations;
}

export function inspectSharedImports(entries) {
  const importers = new Map();
  for (const { file, css } of entries) {
    stripComments(css)
      .split('\n')
      .forEach((line, index) => {
        for (const [, target] of line.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
          const key = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
          const seen = importers.get(key) ?? [];
          seen.push(`${file}:${index + 1}`);
          importers.set(key, seen);
        }
      });
  }
  const violations = [];
  for (const [target, seen] of importers) {
    if (seen.length <= 1) continue;
    violations.push(
      `${target} 被 @import ${seen.length} 次（${seen.join('、')}），共享规则只允许保留一份`,
    );
  }
  return violations;
}

export function readStylesheets(directory) {
  const entries = [];
  for (const name of readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    if (statSync(absolute).isDirectory()) entries.push(...readStylesheets(absolute));
    else if (name.endsWith('.css'))
      entries.push({
        file: path.relative(sourceRoot, absolute).split(path.sep).join('/'),
        css: readFileSync(absolute, 'utf8'),
      });
  }
  return entries;
}

function main() {
  const entries = readStylesheets(sourceRoot);
  const kit = entries.find((entry) => entry.file === kitStylesheet);
  const violations = [
    ...(kit ? inspectKitStylesheet(kit.css) : [`${kitStylesheet} 缺失`]),
    ...inspectHostStylesheets(entries.filter((entry) => entry !== kit)),
    ...inspectSharedImports(entries),
  ];
  if (!violations.length) return;
  console.error('组件套装样式约定检查未通过：');
  for (const violation of violations) console.error(`  ${violation}`);
  console.error('规则见 docs/component-kit.md。');
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    fail(error);
  }
}
