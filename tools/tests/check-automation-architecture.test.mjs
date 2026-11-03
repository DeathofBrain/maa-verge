import assert from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { inspectAutomationArchitecture } from '../check-automation-architecture.mjs';
import { makeTemporaryDirectorySync } from '../test-support/temporary-directory.mjs';

function fixture(t, files, config) {
  const project = makeTemporaryDirectorySync(
    path.join(tmpdir(), 'maaverge-automation-architecture-'),
  );
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const source = path.join(project, 'services/automation/src');
  mkdirSync(source, { recursive: true });
  for (const [name, text] of Object.entries({ 'index.ts': '', ...files })) {
    if (text === null) continue;
    const file = path.resolve(source, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  if (config) writeFileSync(path.join(source, '../tsconfig.json'), JSON.stringify(config));
  return source;
}

test('公共出口组装资源与游戏能力，core 只依赖内部类型和 contracts', (t) => {
  const source = fixture(
    t,
    {
      'index.ts': "export * from './registry'; export * from './resources/profile';",
      'registry.ts': "import './core/port'; import '../arknights/custom/infrast/workflows';",
      'core/port.ts': "import type { Input } from '@contracts/types'; import './errors';",
      'core/errors.ts': 'export class Failure extends Error {}',
      '../arknights/custom/infrast/types.ts': 'export const facilities = [];',
      '../arknights/custom/infrast/workflows.ts':
        "import '../../../src/core/port'; import './types'; import '../../pipeline/infrast/base.json';",
      '../arknights/pipeline/infrast/base.json': '{}',
      'resources/profile.ts': "import 'node:fs/promises'; import './types'; import '../core/port';",
      'resources/types.ts': 'export type Rule = {};',
      '../../../packages/contracts/src/types.ts': 'export type Input = {};',
      '../tests/fixture.ts': "import '../../backend/src/app/runtime';",
    },
    { compilerOptions: { paths: { '@contracts/*': ['../../packages/contracts/src/*'] } } },
  );
  assert.deepEqual(inspectAutomationArchitecture(source), []);
});

test('目录只允许已登记能力层和公共出口', (t) => {
  const source = fixture(t, {
    'index.ts': null,
    'entry.ts': '',
    'backend/runtime.ts': '',
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 3);
  assert.ok(violations.some((message) => message.includes('根目录只允许')));
  assert.ok(violations.some((message) => message.includes('顶层目录只允许')));
  assert.ok(violations.some((message) => message.includes('index.ts 缺失')));
});

test('游戏根目录按 pipeline、custom 分类，Custom 功能目录不继续嵌套', (t) => {
  const source = fixture(t, {
    'arknights/legacy.ts': '',
    '../arknights/index.ts': '',
    '../arknights/domain/flow.ts': '',
    '../arknights/pipeline/infrast/helper.ts': '',
    '../arknights/custom/infrast/nested/workflows.ts': '',
    '../arknights/custom/infrast-workflows.ts': '',
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 6);
  assert.equal(violations.filter((message) => message.includes('arknights 根目录')).length, 2);
  assert.ok(violations.some((message) => message.includes('pipeline 只允许 JSON')));
  assert.ok(violations.some((message) => message.includes('custom 只允许按游戏功能')));
  assert.ok(violations.some((message) => message.includes('游戏功能内只允许平放 TypeScript')));
  assert.ok(violations.some((message) => message.includes('自动化库顶层目录只允许')));
});

test('通用能力分层可组合多个独立游戏功能而无需登记功能名单', (t) => {
  const source = fixture(t, {
    'registry.ts':
      "import './primitives/capabilities'; import '../arknights/custom/infrast/capabilities'; import '../arknights/custom/recruit/capabilities';",
    'core/types.ts': 'export type Context = {};',
    'core/errors.ts': '',
    'resources/types.ts': "import type { Context } from '../core/types';",
    'primitives/vision.ts': "import '../core/errors'; import '../resources/types';",
    'primitives/capabilities.ts': "import type { Entry } from '../registry/types';",
    'pipeline/definitions.ts': "import '../core/errors';",
    'pipeline/runtime.ts': "import '../primitives/vision'; import '../resources/types';",
    'registry/types.ts': 'export type Entry = {};',
    'registry/catalog.ts': "import './types'; import '../core/errors';",
    '../arknights/custom/infrast/capabilities.ts':
      "import '../../../src/pipeline/runtime'; import '../../../src/resources/types'; import '../../../src/registry/types';",
    '../arknights/custom/recruit/capabilities.ts':
      "import '../../../src/primitives/vision'; import '../../pipeline/recruit/main.json';",
    '../arknights/pipeline/recruit/main.json': '{}',
  });
  assert.deepEqual(inspectAutomationArchitecture(source), []);
});

test('所有通用层均禁止反向依赖任何游戏类型或 JSON 资源', (t) => {
  const files = {
    '../arknights/custom/recruit/types.ts': 'export type Target = {};',
    '../arknights/pipeline/recruit/main.json': '{}',
  };
  for (const layer of ['core', 'resources', 'primitives', 'pipeline', 'registry'])
    files[`${layer}/module.ts`] =
      "import type { Target } from '../../arknights/custom/recruit/types'; import '../../arknights/pipeline/recruit/main.json';";
  const violations = inspectAutomationArchitecture(fixture(t, files));
  assert.equal(violations.length, 10);
  assert.ok(violations.every((message) => message.includes('不得依赖游戏语义')));
});

test('未被公共出口导入的兄弟游戏目录仍扫描其依赖', (t) => {
  const source = fixture(t, {
    '../arknights/custom/infrast/workflows.ts': "import '../../../../backend/src/app/runtime';",
    '../../../services/backend/src/app/runtime.ts': 'export const runtime = 1;',
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /arknights\/custom\/infrast\/workflows\.ts:1/u);
  assert.match(violations[0], /不得依赖后端/u);
});

test('core 无法通过静态、动态、类型或再导出反向依赖游戏、资源和注册表', (t) => {
  const source = fixture(t, {
    'core/port.ts': [
      "import '../../arknights/custom/infrast/types';",
      "export * from '../resources/profile';",
      "const registry = require('../registry');",
      "const load = () => import('../index');",
      "export type Flow = typeof import('../../arknights/custom/infrast/workflows');",
      "import Legacy = require('../../arknights/custom/infrast/workflows');",
    ].join('\n'),
    '../arknights/custom/infrast/types.ts': 'export type Target = {};',
    '../arknights/custom/infrast/workflows.ts': '',
    'resources/profile.ts': '',
    'registry.ts': '',
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 6);
  assert.ok(violations.every((message) => message.includes('core 不得依赖')));
});

test('游戏可依赖通用资源而不得依赖组装入口，通用资源不再共享游戏类型', (t) => {
  const source = fixture(t, {
    '../arknights/custom/infrast/workflows.ts':
      "import '../../../src/resources/profile'; import '../../../src/registry';",
    'resources/profile.ts': [
      "import '../../arknights/custom/infrast/types';",
      "import '../../arknights/custom/infrast/workflows';",
      "export * from '../registry';",
    ].join('\n'),
    '../arknights/custom/infrast/types.ts': 'export const facilities = [];',
    'registry.ts': '',
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 4);
  assert.equal(violations.filter((message) => message.includes('不得依赖公共组装入口')).length, 1);
  assert.equal(
    violations.filter((message) => message.includes('resources 不得依赖游戏')).length,
    2,
  );
  assert.equal(violations.filter((message) => message.includes('resources 只允许依赖')).length, 1);
});

test('通用层依赖不跨越约定方向，原语只共享注册表类型而不依赖其运行目录', (t) => {
  const source = fixture(t, {
    'resources/types.ts': "import '../primitives/vision';",
    'primitives/vision.ts': "import '../registry/catalog';",
    'pipeline/runtime.ts': "import '../registry/catalog';",
    'registry/catalog.ts': "import '../pipeline/runtime';",
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 4);
  for (const layer of ['resources', 'primitives', 'pipeline', 'registry'])
    assert.ok(violations.some((message) => message.includes(`${layer} 只允许依赖`)));
});

test('游戏功能不得深导入另一功能的 Custom 或 Pipeline', (t) => {
  const source = fixture(t, {
    '../arknights/custom/infrast/workflows.ts':
      "import '../recruit/workflows'; import '../../pipeline/recruit/main.json';",
    '../arknights/custom/recruit/workflows.ts': '',
    '../arknights/pipeline/recruit/main.json': '{}',
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 2);
  assert.ok(violations.every((message) => message.includes('只允许依赖本功能')));
});

test('真实解析 tsconfig aliases、js 扩展名和任意伪装包名均不能绕过 backend 边界', (t) => {
  const source = fixture(
    t,
    {
      'registry.ts': [
        "import { Runtime } from '@host/runtime.js';",
        "export type Host = typeof import('@safe-looking-package');",
        "export { Runtime } from '../../backend/src/app/runtime';",
      ].join('\n'),
      '../../../services/backend/src/app/runtime.ts': 'export const Runtime = 1;',
    },
    {
      compilerOptions: {
        paths: {
          '@host/*': ['../backend/src/app/*'],
          '@safe-looking-package': ['../backend/src/app/runtime.ts'],
        },
      },
    },
  );
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 3);
  assert.ok(violations.every((message) => message.includes('services/backend/src/app/runtime')));
});

test('别名解析不能绕过 core、游戏与资源的兄弟目录边界', (t) => {
  const source = fixture(
    t,
    {
      'core/port.ts': "import '@game/workflows.js';",
      'resources/profile.ts': "import '@game/workflows';",
      '../arknights/custom/infrast/workflows.ts': "import '@resources/profile'; import '@compose';",
      'registry.ts': '',
    },
    {
      compilerOptions: {
        paths: {
          '@game/*': ['arknights/custom/infrast/*'],
          '@resources/*': ['src/resources/*'],
          '@compose': ['src/registry.ts'],
        },
      },
    },
  );
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 3);
  assert.ok(violations.some((message) => message.includes('core 不得依赖')));
  assert.ok(violations.some((message) => message.includes('resources 不得依赖游戏')));
  assert.ok(violations.some((message) => message.includes('不得依赖公共组装入口')));
});

test('package imports 与 exports 通配符真实解析通用类型、组件与 JSON，无需重复 paths', (t) => {
  const source = fixture(
    t,
    {
      '../package.json': JSON.stringify({
        name: '@maaverge/automation',
        type: 'module',
        exports: {
          './core/*': './src/core/*.ts',
          './components/*': './arknights/custom/*/index.ts',
        },
        imports: {
          '#automation/*': './src/*.ts',
          '#components/*': './arknights/custom/*/index.ts',
          '#custom/*': './arknights/custom/*.ts',
          '#pipeline/*': './arknights/pipeline/*.json',
        },
      }),
      'registry.ts':
        "import '#components/infrast'; import '#automation/registry/components'; import '@maaverge/automation/components/infrast';",
      'core/types.ts': 'export type Context = {};',
      'registry/types.ts': 'export type Registration = {};',
      'registry/components.ts':
        "import type { PipelineDefinitions } from '#automation/pipeline/definitions';",
      'pipeline/definitions.ts': 'export type PipelineDefinitions = {};',
      'primitives/capabilities.ts':
        "import type { Registration } from '#automation/registry/types';",
      '../arknights/custom/infrast/index.ts': "import '#custom/infrast/definitions';",
      '../arknights/custom/infrast/definitions.ts':
        "import '@maaverge/automation/core/types'; import '#pipeline/infrast/base';",
      '../arknights/pipeline/infrast/base.json': '{}',
    },
    { compilerOptions: { moduleResolution: 'Bundler', module: 'ESNext', resolveJsonModule: true } },
  );
  assert.deepEqual(inspectAutomationArchitecture(source), []);
});

test('package imports 不能绕过通用层、跨功能边界或引入 Pipeline runtime', (t) => {
  const source = fixture(
    t,
    {
      '../package.json': JSON.stringify({
        name: '@maaverge/automation',
        type: 'module',
        exports: { './components/*': './arknights/custom/*/index.ts' },
        imports: {
          '#automation/*': './src/*.ts',
          '#components/*': './arknights/custom/*/index.ts',
          '#custom/*': './arknights/custom/*.ts',
        },
      }),
      'core/port.ts': [
        "import '#components/infrast';",
        "import '@maaverge/automation/components/infrast';",
      ].join('\n'),
      'resources/types.ts': "import type { Target } from '#custom/infrast/types';",
      'registry.ts': '',
      'registry/components.ts': "import '#automation/pipeline/runtime';",
      'pipeline/runtime.ts': '',
      '../arknights/custom/infrast/index.ts': "import '#components/recruit';",
      '../arknights/custom/infrast/types.ts': 'export type Target = {};',
      '../arknights/custom/recruit/index.ts': "import '#automation/registry';",
    },
    { compilerOptions: { moduleResolution: 'Bundler', module: 'ESNext' } },
  );
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 6);
  assert.ok(violations.some((message) => message.includes('core 不得依赖游戏')));
  assert.ok(violations.some((message) => message.includes('resources 不得依赖游戏')));
  assert.ok(violations.some((message) => message.includes('只允许依赖本功能')));
  assert.ok(violations.some((message) => message.includes('不得依赖公共组装入口')));
  assert.ok(violations.some((message) => /registry 只允许依赖.*pipeline\/runtime/u.test(message)));
});

test('游戏代码不能将任意本地兄弟目录当作允许的外部包', (t) => {
  const source = fixture(t, {
    '../arknights/custom/infrast/workflows.ts':
      "import '../../../helper'; import '../../../another-game/custom/workflows';",
    '../helper.ts': '',
    '../another-game/custom/workflows.ts': '',
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 2);
  assert.ok(violations.every((message) => message.includes('只能依赖 contracts')));
});

test('真实文件链接也不能将后端伪装成 core 内部模块', (t) => {
  const source = fixture(t, {
    'core/port.ts': "import './host/runtime';",
    '../../../services/backend/src/app/runtime.ts': 'export const runtime = 1;',
  });
  symlinkSync(
    path.resolve(source, '../../backend/src/app'),
    path.join(source, 'core/host'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 1);
  assert.ok(violations[0].includes('services/backend/src/app/runtime.ts'));
});

test('真实文件链接不能把兄弟游戏实现伪装成 core 内部模块', (t) => {
  const source = fixture(t, {
    'core/port.ts': "import './game/workflows';",
    '../arknights/custom/infrast/workflows.ts': '',
  });
  symlinkSync(
    path.resolve(source, '../arknights/custom/infrast'),
    path.join(source, 'core/game'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /core 不得依赖/u);
  assert.match(violations[0], /arknights\/custom\/infrast\/workflows\.ts/u);
});

test('UI、原生进程、开发工具与任意工作区的测试源码均不属于自动化库依赖', (t) => {
  const source = fixture(t, {
    'registry.ts': [
      "import '../../../apps/desktop/src/Page';",
      "import '../../native/config.json';",
      "import '../../../tools/helper';",
      "const fixture = require('../tests/fixture');",
      "export type Fixture = typeof import('../../../packages/contracts/tests/fixture');",
      "import '../../../packages/agent/src/index';",
    ].join('\n'),
    '../../../apps/desktop/src/Page.tsx': '',
    '../../../services/native/config.json': '{}',
    '../../../tools/helper.ts': '',
    '../tests/fixture.ts': 'export const fixture = 1;',
    '../../../packages/contracts/tests/fixture.ts': 'export type Fixture = {};',
    '../../../packages/agent/src/index.ts': '',
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 6);
  assert.equal(violations.filter((message) => message.includes('不得依赖后端')).length, 5);
  assert.ok(violations.some((message) => message.includes('只能依赖 contracts')));
});

test('未解析相对依赖和声明路径仍受边界约束，注释与普通字符串不产生依赖', (t) => {
  const source = fixture(t, {
    'core/port.ts': [
      "// import '../registry';",
      'const example = "import(\'../resources/profile\')";',
      "import type { Missing } from '../resources/missing';",
      "export type Type = typeof import('./types.d.ts');",
    ].join('\n'),
    'core/types.d.ts': 'export type Type = {};',
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 2);
  assert.ok(violations.some((message) => message.includes('core/port.ts:3')));
  assert.ok(violations.some((message) => message.includes('不得显式导入声明路径')));
});

test('CLI 可扫描隔离目录并报告错误退出码', (t) => {
  const script = fileURLToPath(new URL('../check-automation-architecture.mjs', import.meta.url));
  const invoke = (...args) =>
    spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', windowsHide: true });
  assert.equal(invoke('--source-root', fixture(t, {})).status, 0);
  const rejected = invoke('--source-root', fixture(t, { 'entry.ts': '' }));
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /自动化库目录与依赖边界检查未通过/u);
  assert.equal(invoke('--unknown').status, 1);
});

// 三层共用实现和资源都参加门禁，兼容出口只能供旧调用方使用。
test('L1 cannot depend on L2 directly or through its old compatibility barrel', (t) => {
  const source = fixture(t, {
    'primitives/vision.ts': "export * from '../composites/vision';",
    'primitives/operations.ts': "import '../composites/vision'; import './vision';",
    'composites/vision.ts':
      "import '../primitives/geometry'; import type { Entry } from '../registry/types';",
    'primitives/geometry.ts': '',
    'registry/types.ts': 'export type Entry = {};',
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 2);
  assert.ok(violations.some((message) => message.includes('primitives 只允许依赖')));
  assert.ok(violations.some((message) => message.includes('旧 vision 兼容出口')));
});

test('L2 and registry share exact Pipeline definition interfaces without gaining runtime dependencies', (t) => {
  const source = fixture(t, {
    'composites/vision.ts':
      "import '../primitives/geometry'; import '../resources/types'; import '../core/types'; import '../registry/types'; import '../pipeline/definitions';",
    'composites/invalid.ts': "import '../pipeline/runtime'; import '../registry/catalog';",
    'pipeline/runtime.ts': "import '../composites/vision';",
    'pipeline/invocation.ts': "import '../composites/vision';",
    'pipeline/definitions.ts': '',
    'primitives/geometry.ts': '',
    'registry/types.ts': '',
    'registry/catalog.ts': "import '../pipeline/invocation'; import '../pipeline/definitions';",
    'resources/types.ts': '',
    'core/types.ts': '',
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 2);
  assert.ok(violations.every((message) => message.includes('composites 只允许依赖')));
});

test('common JSON resources resolve through package imports and retain their L1 L2 boundaries', (t) => {
  const source = fixture(t, {
    '../package.json': JSON.stringify({
      type: 'module',
      imports: { '#common-pipeline/*': './pipeline/*.json' },
    }),
    'primitives/capabilities.ts':
      "import '#common-pipeline/primitives/operations'; import '#common-pipeline/composites/vision';",
    'composites/capabilities.ts':
      "import '#common-pipeline/primitives/operations'; import '#common-pipeline/composites/vision';",
    'core/types.ts': "import '#common-pipeline/primitives/operations';",
    '../arknights/custom/newfeature/capabilities.ts':
      "import '#common-pipeline/composites/vision';",
    '../pipeline/primitives/operations.json': '{}',
    '../pipeline/composites/vision.json': '{}',
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 2);
  assert.ok(violations.every((message) => message.includes('不得依赖该通用 Pipeline')));
});

test('common JSON scanning includes unimported files and rejects upward declarative calls', (t) => {
  const node = (handler, primitive) =>
    JSON.stringify({ Entry: { custom_action_param: { handler, primitive } } });
  const source = fixture(t, {
    '../pipeline/primitives/invalid.json': node('call', 'operation.click'),
    '../pipeline/composites/invalid.json': node('call', 'game.infrast.set_room'),
    '../pipeline/composites/valid.json': node('call', 'operation.click'),
    '../pipeline/composites/helper.ts': '',
    '../pipeline/game/flow.json': '{}',
    '../pipeline/composites/malformed.json': 'invalid JSON',
    '../pipeline/composites/state.json': '[]',
  });
  const violations = inspectAutomationArchitecture(source);
  assert.equal(violations.length, 6);
  assert.equal(violations.filter((message) => message.includes('调用只能从 composites')).length, 2);
  assert.ok(violations.some((message) => message.includes('只允许普通 JSON')));
  assert.ok(violations.some((message) => message.includes('只允许 primitives、composites')));
});
