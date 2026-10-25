import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { taskDefaults, taskLabels, defaultDailyTaskTypes } from '../../../packages/contracts/src/tasks';
import { productKnowledge, productKnowledgeDigest, productKnowledgeSources, productKnowledgeVersion } from '../src/product-knowledge';
import generated from '../src/product-knowledge.generated.json';

const repo = fileURLToPath(new URL('../../..', import.meta.url));
const rpcFile = 'packages/contracts/schemas/rpc.schema.json';
const records = productKnowledge();
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function json(file: string): any { return JSON.parse(readFileSync(path.join(repo, file), 'utf8')); }
function atPointer(file: string, pointer: string): any {
  return pointer.slice(1).split('/').slice(1).reduce((node, key) => node[key.replaceAll('~1', '/').replaceAll('~0', '~')], json(file));
}

test('product records have bounded content, stable unique keys, and verifiable source locations', () => {
  expect(productKnowledgeVersion).toBe(1);
  expect(productKnowledgeDigest).toMatch(/^[0-9a-f]{64}$/);
  expect(new Set(records.map(record => record.key)).size).toBe(records.length);
  expect(records.map(record => record.key)).toEqual(records.map(record => record.key).sort());
  const sourceHashes = new Map(productKnowledgeSources.map(source => [source.file, source.sha256]));
  for (const record of records) {
    expect(record.text.length).toBeGreaterThan(0);
    expect(record.text.length).toBeLessThanOrEqual(generated.maxTextLength);
    expect(record.source.file).not.toMatch(/^(?:[A-Za-z]:|\/)|\.\./);
    const bytes = readFileSync(path.join(repo, record.source.file));
    expect(record.source.sha256).toBe(sha256(bytes));
    expect(record.source.sha256).toBe(sourceHashes.get(record.source.file)!);
    if (record.source.pointer.startsWith('#')) {
      const original = atPointer(record.source.file, record.source.pointer);
      expect(original).toBeDefined();
      if (record.data.category === 'schema') {
        const { $defs, ...projected } = original;
        expect(record.data.schema).toEqual(projected);
        expect(record.data.definitionsStoredSeparately).toBe($defs !== undefined);
      }
    } else {
      const match = record.source.pointer.match(/^L(\d+)-L(\d+)$/);
      expect(match).not.toBeNull();
      const [, first, last] = match!;
      const lines = bytes.toString('utf8').split('\n');
      expect(Number(first)).toBeGreaterThan(0);
      expect(Number(last)).toBeGreaterThanOrEqual(Number(first));
      expect(Number(last)).toBeLessThanOrEqual(lines.length);
      if (record.data.category === 'documentation') {
        expect(record.data.content).toBe(lines.slice(Number(first) - 1, Number(last)).join('\n').trimEnd());
        expect((record.data.content as string).length).toBeLessThanOrEqual(2400);
      }
    }
  }
  const { digest, ...payload } = generated;
  expect(digest).toBe(sha256(JSON.stringify(payload)));
  expect(productKnowledgeSources.map(source => source.file)).not.toContain('PLAN.md');
  expect(productKnowledgeSources.map(source => source.file)).not.toContain('docs/STATUS.md');
});

test('every RPC method includes both endpoints and all transitively reachable local definitions', () => {
  const rpc = json(rpcFile);
  const methods = records.filter(record => record.data.category === 'rpc');
  expect(methods.map(record => record.data.method).sort()).toEqual(Object.keys(rpc.properties.params.properties).sort());
  const schemaIds = new Set(records.filter(record => record.data.category === 'schema').map(record => record.id));
  for (const method of methods) {
    const seen = new Set<string>();
    function follow(file: string, pointer: string) {
      const id = file + pointer;
      if (seen.has(id)) return;
      seen.add(id);
      expect(schemaIds.has(id)).toBe(true);
      const visit = (value: any) => {
        if (!value || typeof value !== 'object') return;
        if (typeof value.$ref === 'string') {
          const [relative, fragment] = value.$ref.split('#');
          follow(relative ? path.posix.normalize(path.posix.join(path.posix.dirname(file), relative)) : file, fragment === undefined ? '#' : '#' + fragment);
        }
        for (const [key, child] of Object.entries(value)) if (key !== '$defs') visit(child);
      };
      visit(atPointer(file, pointer));
    }
    follow(rpcFile, `#/properties/params/properties/${method.data.method}`);
    follow(rpcFile, `#/properties/results/properties/${method.data.method}`);
    const emitted = method.data.reachableSchemas as { file: string; pointer: string }[];
    expect(emitted.map(value => value.file + value.pointer).sort()).toEqual([...seen].sort());
    expect(method.data.verification).toBe('schema-only');
    expect(method.text).toContain('不代表该能力已通过真实设备');
  }
  expect(records.find(record => record.id === 'packages/contracts/schemas/rpc.schema.json#/$defs/ToolConfig')?.text).toContain('maxItems');
});

test('task and independent tool capabilities remain distinct and preserve their authoritative defaults', () => {
  const tasks = records.filter(record => record.data.category === 'task');
  const tools = records.filter(record => record.data.category === 'tool');
  expect(tasks.length).toBe(Object.keys(taskLabels).length);
  expect(tools.map(record => record.data.toolKind).sort()).toEqual([...json(rpcFile).$defs.ToolKind.enum].sort());
  for (const task of tasks) {
    const type = task.data.taskType as keyof typeof taskDefaults;
    expect(task.name).toBe(taskLabels[type]);
    expect(task.data.defaults as unknown).toEqual(taskDefaults[type]);
    const daily = defaultDailyTaskTypes.indexOf(type as typeof defaultDailyTaskTypes[number]);
    expect(task.data.dailyOrder).toBe(daily < 0 ? null : daily);
    expect(task.text).toContain('不授权执行或消耗');
  }
  const fight = tasks.find(record => record.data.taskType === 'Fight')!;
  expect(fight.data.defaults).toMatchObject({ medicine: 0, stone: 0, times: 2147483647, stage: '' });
  expect(tasks.find(record => record.data.taskType === 'Recruit')!.data.defaults).toMatchObject({ expedite: false, expedite_times: 0 });
  expect(tasks.find(record => record.data.taskType === 'UserDataUpdate')!.text).toContain('不直接提交 MaaCore');
  for (const tool of tools) expect(tool.text).toContain('不创建任务表');
});

test('current product limitations and usage details remain searchable as attributed document text', () => {
  const documents = records.filter(record => record.data.category === 'documentation');
  const find = (query: string) => documents.filter(record => record.text.includes(query));
  expect(find('公招加急尚未开放').length).toBeGreaterThan(0);
  expect(find('独立离线识别流程').some(record => record.source.file === 'docs/maa-compatibility.md')).toBe(true);
  expect(find('macOS/Linux 仅支持应用运行期间调度').some(record => record.source.file === 'docs/toolbox-schedules.md')).toBe(true);
  expect(find('设备租约位于共享用户目录').some(record => record.source.file === 'docs/connection-settings.md')).toBe(true);
  expect(find('不会确认招募、刷新或加急').length).toBeGreaterThan(0);
  for (const document of documents) expect(document.data.verification).toBe('documented-only');
});

test('callers cannot mutate the static catalogue and manifest', () => {
  const copy = productKnowledge();
  copy[0].name = 'changed';
  copy[0].aliases.push('changed');
  copy[0].data.changed = true;
  expect(productKnowledge()[0]).toEqual(records[0]);
  expect(Object.isFrozen(productKnowledgeSources)).toBe(true);
  expect(Object.isFrozen(productKnowledgeSources[0])).toBe(true);
});

test('offline generator is deterministic and check detects source drift without changing output', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'maaverge-product-knowledge-'));
  const output = 'services/backend/src/product-knowledge.generated.json';
  try {
    for (const file of [...productKnowledgeSources.map(source => source.file), 'tools/generate-agent-knowledge.mjs', output]) {
      const target = path.join(temporary, file);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(path.join(repo, file), target);
    }
    symlinkSync(path.join(repo, 'node_modules'), path.join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const run = (...args: string[]) => spawnSync(process.execPath, ['tools/generate-agent-knowledge.mjs', ...args], {
      cwd: temporary, encoding: 'utf8', windowsHide: true, timeout: 20000,
    });
    const current = readFileSync(path.join(temporary, output), 'utf8');
    for (let iteration = 0; iteration < 2; iteration++) {
      const generated = run();
      expect(generated.error).toBeUndefined();
      expect(generated.status, generated.stderr).toBe(0);
      expect(readFileSync(path.join(temporary, output), 'utf8')).toBe(current);
    }
    expect(run('--check').status).toBe(0);
    const source = path.join(temporary, 'docs/toolbox-schedules.md');
    writeFileSync(source, readFileSync(source, 'utf8') + '\n## 测试缺口\n\n离线来源发生变化。\n');
    const stale = run('--check');
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('产品知识未同步');
    expect(readFileSync(path.join(temporary, output), 'utf8')).toBe(current);
    expect(run().status).toBe(0);
    expect(run('--check').status).toBe(0);
    const updated = JSON.parse(readFileSync(path.join(temporary, output), 'utf8'));
    expect(updated.digest).not.toBe(productKnowledgeDigest);
    expect(updated.records.some((record: { text: string }) => record.text.includes('离线来源发生变化'))).toBe(true);
  } finally {
    const absolute = path.resolve(temporary);
    if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith('maaverge-product-knowledge-')) throw new Error('Unexpected temporary test path');
    rmSync(absolute, { recursive: true, force: true });
  }
});
