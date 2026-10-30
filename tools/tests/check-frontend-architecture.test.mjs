import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { inspectFrontendArchitecture } from '../check-frontend-architecture.mjs';

function fixture(t, files, config) {
  const project = mkdtempSync(path.join(tmpdir(), 'maaverge-frontend-architecture-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const source = path.join(project, 'src');
  for (const [name, text] of Object.entries({ 'main.tsx': '', ...files })) {
    const file = path.join(source, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  if (config) writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify(config));
  return source;
}

test('应用组合业务模块、业务间公开依赖和共享 UI 依赖通过', (t) => {
  const source = fixture(t, {
    'main.tsx': "import './kit/kit.css'; import './app/App';",
    'app/App.tsx': "import { Plan } from '../features/plans/Plan'; export const App = Plan;",
    'features/plans/Plan.tsx':
      "import { Device } from '../devices/Device'; import { Button } from '../../kit/Button'; export const Plan = [Device, Button];",
    'features/devices/Device.tsx':
      "import { Label } from '../../shared/ui/Label'; export const Device = Label;",
    'kit/Button.tsx': "import { cx } from '../shared/lib/cx'; export const Button = cx;",
    'kit/kit.css': '',
    'shared/ui/Label.tsx': 'export const Label = 1;',
    'shared/lib/cx.ts': 'export const cx = 2;',
  });
  assert.deepEqual(inspectFrontendArchitecture(source), []);
});

test('根目录新增业务文件或样式被拒绝', (t) => {
  const source = fixture(t, {
    'StrayPage.tsx': 'export default 1;',
    'stray.css': '.page {}',
    'features/home/home.css': '.home {}',
  });
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 2);
  assert.ok(violations.every((message) => message.includes('src 根目录只允许 main.tsx')));
});

test('不能通过新增未登记的顶层目录绕过应用层边界', (t) => {
  const source = fixture(t, {
    'app/model.ts': 'export const value = 1;',
    'other/escape.ts': "export { value } from '../app/model';",
  });
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /other\/.*顶层目录只允许 app、features、kit、shared/u);
});

test('业务、kit 和 shared 都不得通过值或类型依赖 app', (t) => {
  const source = fixture(t, {
    'app/model.ts': 'export type AppState = {}; export const state = 1;',
    'features/home/Page.ts':
      "import type { AppState } from '../../app/model'; export type State = AppState;",
    'kit/Button.ts': "export { state } from '../app/model';",
    'shared/lib/state.ts': "export async function read() { return import('../../app/model'); }",
  });
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 3);
  assert.ok(violations.every((message) => message.includes('不得反向依赖应用编排')));
});

test('kit 与 shared 不得依赖 feature，包括资源导入', (t) => {
  const source = fixture(t, {
    'features/home/model.ts': 'export type Home = {};',
    'features/home/home.css': '.home {}',
    'kit/Button.ts': "export type { Home } from '../features/home/model';",
    'shared/ui/Home.ts': "import '../../features/home/home.css';",
  });
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 2);
  assert.ok(violations.every((message) => message.includes('不得依赖业务模块')));
});

test('纯类型循环及编译时删除的普通导入不产生运行时循环', (t) => {
  const source = fixture(t, {
    'features/example/a.ts':
      "import { B } from './b'; export type A = { b?: B }; export type { C } from './c'; export const a = 1;",
    'features/example/b.ts': "import { type A } from './a'; export type B = { a?: A };",
    'features/example/c.ts':
      "export type { A as C } from './a'; export const read = () => import('./a');",
  });
  assert.deepEqual(inspectFrontendArchitecture(source), []);
});

test('运行时导入与再导出的闭环报告真实文件路径', (t) => {
  const source = fixture(t, {
    'features/example/a.ts': "import { b } from './b'; export const a = b;",
    'features/example/b.ts': "export { c as b } from './c';",
    'features/example/c.ts': "import { a } from './a'; export const c = () => a;",
  });
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 1);
  assert.match(
    violations[0],
    /a\.ts → features\/example\/b\.ts → features\/example\/c\.ts → features\/example\/a\.ts/u,
  );
});

test('同一强连通组列出全部成员，独立闭环与自身导入分别报告', (t) => {
  const source = fixture(t, {
    'features/example/a.ts': "export * from './b'; export * from './c';",
    'features/example/b.ts': "import './a'; export const b = 1;",
    'features/example/c.ts': "import './b'; export const c = 1;",
    'features/other/self.ts': "import './self';",
  });
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 2);
  assert.match(
    violations[0],
    /循环组：features\/example\/a\.ts、features\/example\/b\.ts、features\/example\/c\.ts/u,
  );
  assert.match(violations[1], /features\/other\/self\.ts → features\/other\/self\.ts/u);
});

test('动态 import 与 require 的静态目标也参与运行时闭环检查', (t) => {
  const source = fixture(t, {
    'features/example/a.ts': "export const read = () => import('./b');",
    'features/example/b.ts': "export const read = () => require('./a');",
  });
  assert.match(inspectFrontendArchitecture(source).join('\n'), /运行时循环依赖/u);
});

test('Tauri 导入在各种语法中被拒绝，注释与普通字符串不误报', (t) => {
  const source = fixture(t, {
    'features/example/api.ts': [
      "import type { Window } from '@tauri-apps/api/window';",
      "export { invoke } from '@tauri-apps/api/core';",
      "export const load = () => import('@tauri-apps/api/event');",
      "export const cjs = require('@tauri-apps/plugin-dialog');",
      "export type Core = typeof import('@tauri-apps/api/core');",
      "// import '@tauri-apps/api/window';",
      "export const documentation = '@tauri-apps/api/window';",
      "import type { Snapshot } from '@maaverge/contracts';",
      'export type State = Snapshot;',
    ].join('\n'),
  });
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 5);
  assert.ok(violations.every((message) => message.includes('请使用 @maaverge/contracts')));
  assert.ok(violations[0].startsWith('features/example/api.ts:1 '));
});

test('路径别名不能绕过目录边界，且 js 扩展名能解析对应 ts 源码', (t) => {
  const source = fixture(
    t,
    {
      'app/model.ts': 'export const app = 1;',
      'features/example/a.ts': "export { app } from '@/app/model'; export { b } from './b.js';",
      'features/example/b.ts': "export { b } from './a.js';",
    },
    { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } },
  );
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 2);
  assert.match(violations[0], /不得反向依赖应用编排 app\/model\.ts/u);
  assert.match(violations[1], /运行时循环依赖/u);
});

test('别名 CSS 导入按 paths 与 baseUrl 解析后执行层级检查', (t) => {
  const source = fixture(
    t,
    {
      'app/styles.css': '.app {}',
      'features/home/home.css': '.home {}',
      'shared/style.ts': "import '@/app/styles.css';",
      'kit/style.ts': "import 'home-theme';",
      'shared/base.ts': "import 'src/app/styles.css';",
    },
    {
      compilerOptions: {
        baseUrl: '.',
        paths: { '@/*': ['src/*'], 'home-theme': ['src/features/home/home.css'] },
      },
    },
  );
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 3);
  assert.ok(
    violations.some((message) => message.includes('shared/style.ts:1 shared 不得反向依赖')),
  );
  assert.ok(violations.some((message) => message.includes('kit/style.ts:1 kit 不得依赖业务模块')));
  assert.ok(violations.some((message) => message.includes('shared/base.ts:1 shared 不得反向依赖')));
});

test('Vite 根绝对路径的源码与 CSS 导入同样执行目录边界', (t) => {
  const source = fixture(t, {
    'app/global.css': '.app {}',
    'shared/style.ts': "import '/src/app/global.css';",
    'shared/ui.css': "@import '/src/app/global.css';",
  });
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 2);
  assert.ok(violations.some((message) => message.startsWith('shared/style.ts:1 ')));
  assert.ok(violations.some((message) => message.startsWith('shared/ui.css:1 ')));
  assert.ok(violations.every((message) => message.includes('不得反向依赖应用编排 app/global.css')));
});

test('Vite raw 和 url 导入保留边界检查但不构成源码执行循环', (t) => {
  for (const query of ['raw', 'url', 'other&raw&more', 'other&url']) {
    const source = fixture(t, {
      'features/example/a.ts': `import value from './b.ts?${query}'; export const a = value;`,
      'features/example/b.ts': "import { a } from './a'; export const b = a;",
      'app/model.ts': 'export const state = 1;',
      'shared/model.ts': `import value from '../app/model.ts?${query}'; export const state = value;`,
    });
    const violations = inspectFrontendArchitecture(source);
    assert.equal(violations.length, 1, query);
    assert.match(violations[0], /shared\/model\.ts:1 shared 不得反向依赖应用编排 app\/model\.ts/u);
  }
});

test('普通查询参数不能被当作 raw 或 url 资源而跳过执行循环', (t) => {
  for (const query of ['raw=false', 'url=false', 'rawValue', 'other=raw']) {
    const source = fixture(t, {
      'features/example/a.ts': `import { b } from './b.ts?${query}'; export const a = b;`,
      'features/example/b.ts': "import { a } from './a'; export const b = a;",
    });
    const violations = inspectFrontendArchitecture(source);
    assert.equal(violations.length, 1, query);
    assert.match(violations[0], /运行时循环依赖/u);
  }
});

test('CSS @import 的相对路径、url 与别名也执行目录边界，忽略注释及内容字符串', (t) => {
  const source = fixture(
    t,
    {
      'app/styles.css': '.app {}',
      'features/home/home.css': '.home {}',
      'shared/ui.css': [
        "/* @import '../app/styles.css'; */",
        '.example { content: "@import \'../app/styles.css\';"; }',
        "@import '../app/styles.css';",
        "@import url( '~/features/home/home.css' ) layer(theme);",
      ].join('\n'),
      'kit/ui.css': '@import url(../app/styles.css) screen;',
    },
    { compilerOptions: { baseUrl: '.', paths: { '~/*': ['src/*'] } } },
  );
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 3);
  assert.ok(violations.some((message) => message.startsWith('shared/ui.css:3 ')));
  assert.ok(violations.some((message) => message.startsWith('shared/ui.css:4 ')));
  assert.ok(violations.some((message) => message.startsWith('kit/ui.css:1 ')));
});

test('CSS @import 与引号之间没有空白时仍检查边界并保留行号', (t) => {
  const source = fixture(t, {
    'app/global.css': '.app {}',
    'shared/ui.css': ['@import"../app/global.css";', "@import'../app/global.css';"].join('\n'),
  });
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 2);
  assert.ok(violations[0].startsWith('shared/ui.css:1 '));
  assert.ok(violations[1].startsWith('shared/ui.css:2 '));
  assert.ok(violations.every((message) => message.includes('不得反向依赖应用编排 app/global.css')));
});

test('未设置 baseUrl 时 CSS 别名相对 tsconfig 解析', (t) => {
  const source = fixture(
    t,
    {
      'app/styles.css': '.app {}',
      'shared/style.ts': "import '~/app/styles.css';",
    },
    { compilerOptions: { paths: { '~/*': ['./src/*'] } } },
  );
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /shared\/style\.ts:1 shared 不得反向依赖应用编排 app\/styles\.css/u);
});

test('合法 CSS 共享依赖及外部地址通过，注释可以出现在 import 目标前', (t) => {
  const source = fixture(t, {
    'features/home/home.css': [
      "@import /* shared styles */ '../../shared/styles/base.css';",
      '@import url("https://example.com/theme.css") layer(external);',
    ].join('\n'),
    'shared/styles/base.css': "@import './colors.css';",
    'shared/styles/colors.css': ':root {}',
  });
  assert.deepEqual(inspectFrontendArchitecture(source), []);
});

test('CSS import 闭环参与文件依赖循环检查', (t) => {
  const source = fixture(t, {
    'features/home/a.css': "@import /* dependency */ './b.css';",
    'features/home/b.css': '@import url(./a.css);',
  });
  const violations = inspectFrontendArchitecture(source);
  assert.equal(violations.length, 1);
  assert.match(
    violations[0],
    /features\/home\/a\.css → features\/home\/b\.css → features\/home\/a\.css/u,
  );
});

test('CLI 可检查隔离目录并通过退出码报告失败', (t) => {
  const source = fixture(t, { 'BadPage.tsx': '' });
  const script = fileURLToPath(new URL('../check-frontend-architecture.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--source-root', source], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /前端目录与依赖边界检查未通过/u);
  assert.match(result.stderr, /BadPage\.tsx:1/u);
});
