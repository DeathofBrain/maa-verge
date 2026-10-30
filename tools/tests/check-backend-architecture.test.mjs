import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';
import { inspectBackendArchitecture } from '../check-backend-architecture.mjs';

function fixture(t, files, config) {
  const project = mkdtempSync(path.join(tmpdir(), 'maaverge-backend-architecture-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const source = path.join(project, 'services/backend/src');
  mkdirSync(source, { recursive: true });
  for (const [name, text] of Object.entries({ 'entry.ts': '', ...files })) {
    if (text === null) continue;
    const file = path.resolve(source, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  if (config) writeFileSync(path.join(source, '../tsconfig.json'), JSON.stringify(config));
  return source;
}

test('入口组合、跨业务协作、基础设施与 contracts 依赖通过', (t) => {
  const source = fixture(t, {
    'entry.ts': "import './app/runtime'; import './transport/json-rpc';",
    'app/runtime.ts': "import '../modules/plans/plans'; import '../infrastructure/storage/store';",
    'transport/json-rpc.ts':
      "import '../shared/errors'; export const dispatch = (port) => port.handle();",
    'modules/plans/plans.ts':
      "import '../devices/devices'; import '../../infrastructure/storage/store';",
    'modules/devices/devices.ts': "import '../../shared/errors';",
    'infrastructure/storage/store.ts': "import '../config'; import '../../shared/wire-json';",
    'infrastructure/config.ts': "import path from 'node:path';",
    'shared/wire-json.ts':
      "import type { Request } from '../../../../packages/contracts/src/types';",
    'shared/errors.ts': "import './error-data.json';",
    'shared/error-data.json': '{}',
    '../../../packages/contracts/src/types.ts': 'export type Request = {};',
    // 测试可以复用现有桌面纯函数，不进入产品 src 的架构扫描。
    '../tests/helpers.ts': "import '../../../../apps/desktop/src/shared/format';",
  });
  assert.deepEqual(inspectBackendArchitecture(source), []);
});

test('根目录散落文件、未登记顶层目录和缺失入口被拒绝', (t) => {
  const source = fixture(t, {
    'entry.ts': null,
    'runtime.ts': '',
    'legacy/helper.ts': '',
  });
  const violations = inspectBackendArchitecture(source);
  assert.equal(violations.length, 3);
  assert.ok(violations.some((message) => message.includes('src 根目录只允许 entry.ts')));
  assert.ok(violations.some((message) => message.includes('src 顶层目录只允许')));
  assert.ok(violations.some((message) => message.includes('entry.ts 缺失')));
});

test('modules 不允许散落文件或未登记业务目录', (t) => {
  const source = fixture(t, {
    'modules/common.ts': '',
    'modules/unknown/data.ts': '',
    'modules/recognition/results.ts': '',
  });
  const violations = inspectBackendArchitecture(source);
  assert.equal(violations.length, 2);
  assert.ok(violations.every((message) => message.includes('modules 只允许已登记的业务目录')));
});

test('shared 不能依赖基础设施、业务、传输或应用，包括类型依赖', (t) => {
  const source = fixture(t, {
    'shared/model.ts': [
      "import type { Config } from '../infrastructure/config';",
      "export type Plan = import('../modules/plans/plans').Plan;",
      "export { dispatch } from '../transport/json-rpc';",
      "export const load = () => import('../app/runtime');",
    ].join('\n'),
    'infrastructure/config.ts': 'export type Config = {};',
    'modules/plans/plans.ts': 'export type Plan = {};',
    'transport/json-rpc.ts': 'export const dispatch = 1;',
    'app/runtime.ts': '',
  });
  const violations = inspectBackendArchitecture(source);
  assert.equal(violations.length, 4);
  assert.ok(
    violations.every((message) => message.includes('shared 只允许依赖 shared 与 contracts')),
  );
  assert.ok(violations[0].startsWith('shared/model.ts:1 '));
});

test('基础设施不得依赖业务、应用或传输', (t) => {
  const source = fixture(t, {
    'infrastructure/native/worker.ts': [
      "import '../../modules/execution/run';",
      "export * from '../../app/runtime';",
      "const rpc = require('../../transport/json-rpc');",
    ].join('\n'),
    'modules/execution/run.ts': '',
    'app/runtime.ts': '',
    'transport/json-rpc.ts': '',
  });
  const violations = inspectBackendArchitecture(source);
  assert.equal(violations.length, 3);
  assert.ok(
    violations.every((message) => message.includes('infrastructure 不得依赖业务或应用编排')),
  );
});

test('业务模块与传输层不能反向依赖应用编排', (t) => {
  const source = fixture(t, {
    'modules/home/home.ts': [
      "import type { Runtime } from '../../app/runtime';",
      "export { dispatch } from '../../transport/json-rpc';",
      "import RuntimeModule = require('../../app/runtime');",
    ].join('\n'),
    'transport/json-rpc.ts': "export type Runtime = typeof import('../app/runtime');",
    'app/runtime.ts': 'export type Runtime = {};',
  });
  const violations = inspectBackendArchitecture(source);
  assert.equal(violations.length, 4);
  assert.equal(violations.filter((message) => message.includes('modules 不得反向依赖')).length, 3);
  assert.equal(violations.filter((message) => message.includes('请使用小结构端口')).length, 1);
});

test('所有 src 下层都不能导入 entry 启动入口', (t) => {
  const source = fixture(t, {
    'app/runtime.ts': "import '../entry';",
    'transport/json-rpc.ts': "export * from '../entry';",
    'modules/home/home.ts': "const load = () => import('../../entry');",
    'infrastructure/config.ts': "export type Entry = typeof import('../entry');",
    'shared/types.ts': "import entry = require('../entry');",
  });
  const violations = inspectBackendArchitecture(source);
  assert.equal(violations.length, 5);
  assert.ok(violations.every((message) => message.includes('不得导入启动入口 entry.ts')));
});

test('tsconfig paths 与 js 扩展名不能绕过边界，支持未设置 baseUrl', (t) => {
  for (const withBaseUrl of [false, true]) {
    const source = fixture(
      t,
      {
        'app/runtime.ts': 'export const runtime = 1;',
        'shared/model.ts': "export { runtime } from '@/app/runtime.js';",
        'modules/home/home.ts': "const load = () => import('@/app/runtime');",
      },
      {
        compilerOptions: {
          ...(withBaseUrl ? { baseUrl: '.' } : {}),
          paths: { '@/*': ['./src/*'] },
        },
      },
    );
    const violations = inspectBackendArchitecture(source);
    assert.equal(violations.length, 2);
    assert.ok(violations.every((message) => message.includes('app/runtime.ts')));
  }
});

test('产品源码不能显式导入声明路径，包括错误的 d.js 和纯类型导入', (t) => {
  const source = fixture(t, {
    'entry.ts': "import './shared/validators.d.js';",
    'shared/model.ts': [
      "import type { Type } from './types.d.ts';",
      "export * from './validators.d.js';",
      "const load = () => import('./types.d.mts');",
      "const cjs = require('./types.d.cts');",
      "import legacy = require('./types.d.cjs');",
      "export type Module = typeof import('./types.d.mjs');",
    ].join('\n'),
    'shared/types.d.ts': 'export type Type = {};',
    'shared/validators.d.ts': 'export declare const validate: () => boolean;',
  });
  const violations = inspectBackendArchitecture(source);
  assert.equal(violations.length, 7);
  assert.ok(violations.every((message) => message.includes('不得显式导入声明路径')));
  assert.ok(violations.some((message) => message.startsWith('entry.ts:1 ')));
  assert.ok(violations.some((message) => message.includes('validators.d.js')));
});

test('合法 js 模块解析到同名 d.ts 时仍允许运行时和类型导入', (t) => {
  const specifier = '../../../../packages/contracts/src/validators.js';
  const source = fixture(t, {
    '../../../packages/contracts/src/validators.js': 'export const validate = () => true;',
    '../../../packages/contracts/src/validators.d.ts':
      'export declare const validate: () => boolean; export type Validation = boolean;',
    'shared/validation.ts': [
      `import { validate } from '${specifier}';`,
      `export { validate } from '${specifier}';`,
      `const load = () => import('${specifier}');`,
      `const validators = require('${specifier}');`,
      `import type { Validation } from '${specifier}';`,
    ].join('\n'),
  });
  const resolved = ts.resolveModuleName(
    specifier,
    path.join(source, 'shared/validation.ts'),
    { moduleResolution: ts.ModuleResolutionKind.Bundler },
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  assert.match(resolved ?? '', /validators\.d\.ts$/u);
  assert.deepEqual(inspectBackendArchitecture(source), []);
});

test('后端的静态、动态、类型和再导出均不能依赖桌面 UI', (t) => {
  const source = fixture(
    t,
    {
      '../../../apps/desktop/src/Page.tsx': 'export const Page = 1;',
      'app/runtime.ts': [
        "import { Page } from '../../../../apps/desktop/src/Page';",
        "export { Page } from '@desktop/Page';",
        "const load = () => import('@desktop/Page');",
        "export type PageType = typeof import('@desktop/Page');",
        "const page = require('@desktop/Page');",
      ].join('\n'),
    },
    { compilerOptions: { paths: { '@desktop/*': ['../../apps/desktop/src/*'] } } },
  );
  const violations = inspectBackendArchitecture(source);
  assert.equal(violations.length, 5);
  assert.ok(violations.every((message) => message.includes('后端不得依赖桌面产品 UI')));
});

test('下层不能借用其他业务包，仅允许 contracts 与工作区根构建元数据', (t) => {
  const source = fixture(t, {
    '../../../packages/agent/src/index.ts': 'export const agent = 1;',
    '../../../packages/contracts/src/types.ts': 'export type Request = {};',
    '../../../package.json': '{"version":"0.0.0-fixture"}',
    '../../../assets/config.json': '{}',
    'shared/types.ts': "export { agent } from '../../../../packages/agent/src';",
    'infrastructure/config.ts': "import '../../../../packages/agent/src';",
    'modules/agent/proposals.ts': "import '../../../../../packages/agent/src';",
    'shared/request.ts': "export type { Request } from '../../../../packages/contracts/src/types';",
    'infrastructure/logging/logs.ts': "import { version } from '../../../../../package.json';",
    'shared/metadata.ts': "export { version } from '../../../../package.json';",
    'transport/json-rpc.ts': "import '../../../../packages/agent/src';",
    'infrastructure/data.ts': "import '../../../../assets/config.json';",
  });
  const violations = inspectBackendArchitecture(source);
  assert.equal(violations.length, 4);
  assert.ok(violations.every((message) => message.includes('contracts 之外的外部源码')));
});

test('协议不能依赖业务模块，基础设施不能依赖未登记层级', (t) => {
  const source = fixture(t, {
    'modules/execution/run.ts': 'export type Run = {};',
    'transport/json-rpc.ts': "export type { Run } from '../modules/execution/run';",
    'infrastructure/config.ts': "import '../assets/missing.json';",
  });
  const violations = inspectBackendArchitecture(source);
  assert.equal(violations.length, 2);
  assert.ok(violations.some((message) => message.includes('transport 只允许依赖')));
  assert.ok(violations.some((message) => message.includes('infrastructure 不得依赖')));
});

test('入口与应用编排也不能导入 backend、其他包的测试夹具或开发工具', (t) => {
  const source = fixture(t, {
    'entry.ts': "import '../tests/synthetic';",
    'app/runtime.ts': [
      "const load = () => import('../../tests/synthetic');",
      "export type Fixture = typeof import('../../../../packages/agent/tests/fixture');",
      "const fixture = require('../../../../tools/test-support/fixture');",
      "import '../../../../tools/build-helper';",
    ].join('\n'),
    '../tests/synthetic.ts': 'export const synthetic = true;',
    '../../../packages/agent/tests/fixture.ts': 'export type Fixture = {};',
    '../../../tools/test-support/fixture.ts': 'export const fixture = true;',
    '../../../tools/build-helper.ts': '',
  });
  const violations = inspectBackendArchitecture(source);
  assert.equal(violations.length, 5);
  assert.ok(violations.every((message) => message.includes('产品源码不得依赖测试夹具或开发工具')));
  assert.ok(violations.some((message) => message.startsWith('entry.ts:1 ')));
  assert.ok(violations.some((message) => message.includes('packages/agent/tests/fixture.ts')));
});

test('Windows 路径大小写不能绕过入口和应用层边界', { skip: process.platform !== 'win32' }, (t) => {
  const source = fixture(t, {
    'app/runtime.ts': 'export const runtime = 1;',
    'shared/model.ts': "import '../APP/runtime'; import '../ENTRY';",
  });
  const violations = inspectBackendArchitecture(source);
  assert.equal(violations.length, 2);
  assert.ok(violations.some((message) => message.includes('shared 只允许依赖')));
  assert.ok(violations.some((message) => message.includes('不得导入启动入口 entry.ts')));
});

test('注释和普通字符串不产生依赖，缺失相对源码也不能绕过层级', (t) => {
  const source = fixture(t, {
    'shared/errors.ts': [
      "// import '../app/runtime';",
      'export const example = "import(\'../app/runtime\')";',
      "import type { Missing } from '../app/missing';",
    ].join('\n'),
  });
  const violations = inspectBackendArchitecture(source);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /shared\/errors\.ts:3.*app\/missing/u);
});

test('CLI 可扫描隔离目录并用退出码报告检查或参数失败', (t) => {
  const script = fileURLToPath(new URL('../check-backend-architecture.mjs', import.meta.url));
  const invoke = (...args) =>
    spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      windowsHide: true,
    });
  assert.equal(invoke('--source-root', fixture(t, {})).status, 0);
  const rejected = invoke('--source-root', fixture(t, { 'runtime.ts': '' }));
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /后端目录与依赖边界检查未通过/u);
  assert.match(rejected.stderr, /runtime\.ts:1/u);
  const invalid = invoke('--unknown');
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /用法/u);
});
