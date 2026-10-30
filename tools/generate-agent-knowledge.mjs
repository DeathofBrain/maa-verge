import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputFile = 'services/backend/src/modules/knowledge/product-knowledge.generated.json';
const rpcFile = 'packages/contracts/schemas/rpc.schema.json';
const runtimeFile = 'packages/contracts/schemas/runtime.schema.json';
const taskFile = 'packages/contracts/src/tasks.ts';
const documentFiles = [
  'docs/maa-task-settings.md',
  'docs/maa-compatibility.md',
  'docs/toolbox-schedules.md',
  'docs/task-device-bindings.md',
  'docs/connection-settings.md',
  'docs/multi-instance.md',
  'docs/game-reminders.md',
  'docs/logging.md',
  'docs/app-updates.md',
  'docs/maacore-runtime.md',
];
const maxTextLength = 6000;
const maxDocumentLength = 2400;
const schemaWarning =
  'JSON Schema 定义接口与参数，不代表该能力已通过真实设备或各平台验收；执行仍须业务权限和参数校验。';
const taskWarning =
  '这是任务目录与新建默认参数；登记和可提交不代表真实设备验收，也不授权执行或消耗。';
const documentWarning =
  '文档片段保留原始描述和缺口；可能与更新的专项文档存在差异，不能据此推断真实设备已验收。';
const sources = new Map();
const records = new Map();
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const escapePointer = (value) => value.replaceAll('~', '~0').replaceAll('/', '~1');
const schemaId = (file, pointer) => `${file}${pointer}`;
const schemaKey = (file, pointer) => `product:schema:${schemaId(file, pointer)}`;

function source(file) {
  if (!sources.has(file)) {
    const bytes = readFileSync(path.join(root, file));
    sources.set(file, { text: bytes.toString('utf8'), sha256: sha256(bytes) });
  }
  return sources.get(file);
}

function add(record) {
  if (records.has(record.key)) throw new Error(`Duplicate knowledge key: ${record.key}`);
  if (!record.text || record.text.length > maxTextLength)
    throw new Error(`Unbounded knowledge text: ${record.key}`);
  records.set(record.key, record);
}

const schemas = new Map(
  [rpcFile, runtimeFile].map((file) => [file, JSON.parse(source(file).text)]),
);
function resolve(file, pointer) {
  if (!schemas.has(file) || !pointer.startsWith('#'))
    throw new Error(`Unsupported local schema: ${file}${pointer}`);
  let node = schemas.get(file);
  for (const part of pointer
    .slice(1)
    .split('/')
    .filter((_, index) => index > 0)) {
    const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!Object.hasOwn(node, key)) throw new Error(`Missing schema pointer: ${file}${pointer}`);
    node = node[key];
  }
  return node;
}

function reference(file, ref) {
  const hash = ref.indexOf('#');
  const relative = hash === -1 ? ref : ref.slice(0, hash);
  const pointer = hash === -1 ? '#' : ref.slice(hash);
  const targetFile = relative
    ? path.posix.normalize(path.posix.join(path.posix.dirname(file), relative))
    : file;
  resolve(targetFile, pointer);
  return { file: targetFile, pointer };
}

// Definitions are emitted independently, so the root runtime schema does not
// duplicate its entire $defs tree in every snapshot-related knowledge record.
function projectedSchema(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
  const { $defs, ...value } = node;
  return value;
}

function referencesIn(file, node) {
  const result = new Map();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') {
      const ref = reference(file, value.$ref);
      result.set(schemaId(ref.file, ref.pointer), ref);
    }
    for (const [key, child] of Object.entries(value)) if (key !== '$defs') visit(child);
  }
  visit(node);
  return [...result.values()].sort((a, b) =>
    compare(schemaId(a.file, a.pointer), schemaId(b.file, b.pointer)),
  );
}

function emitSchema(file, pointer) {
  const key = schemaKey(file, pointer);
  if (records.has(key)) return;
  const original = resolve(file, pointer);
  const node = projectedSchema(original);
  const refs = referencesIn(file, node);
  const name = pointer.split('/').at(-1) || schemas.get(file).title || file;
  const json = JSON.stringify(node);
  if (json.length > maxTextLength - 500)
    throw new Error(`Split the oversized schema fragment: ${file}${pointer}`);
  add({
    key,
    kind: 'document',
    id: schemaId(file, pointer),
    name: `接口定义 ${name}`,
    aliases: [name, 'JSON Schema', '参数约束'],
    text: `${name}\n${schemaWarning}\n${json}`,
    data: {
      category: 'schema',
      schema: node,
      definitionsStoredSeparately: Object.hasOwn(original, '$defs'),
      verification: 'schema-only',
    },
    relations: refs.map((ref) => ({
      predicate: 'references',
      targetKind: 'document',
      targetId: schemaId(ref.file, ref.pointer),
    })),
    source: { file, pointer, sha256: source(file).sha256 },
  });
  for (const ref of refs) emitSchema(ref.file, ref.pointer);
}

function reachable(file, pointer) {
  const found = new Map();
  function visit(currentFile, currentPointer) {
    const id = schemaId(currentFile, currentPointer);
    if (found.has(id)) return;
    found.set(id, { file: currentFile, pointer: currentPointer });
    for (const ref of referencesIn(
      currentFile,
      projectedSchema(resolve(currentFile, currentPointer)),
    ))
      visit(ref.file, ref.pointer);
  }
  visit(file, pointer);
  return [...found.values()].sort((a, b) =>
    compare(schemaId(a.file, a.pointer), schemaId(b.file, b.pointer)),
  );
}

function emitMethods() {
  const schema = schemas.get(rpcFile);
  const params = schema.properties.params.properties;
  const results = schema.properties.results.properties;
  if (JSON.stringify(Object.keys(params).sort()) !== JSON.stringify(Object.keys(results).sort()))
    throw new Error('RPC parameter/result methods differ');
  for (const method of Object.keys(params).sort(compare)) {
    const paramsPointer = `#/properties/params/properties/${escapePointer(method)}`;
    const resultsPointer = `#/properties/results/properties/${escapePointer(method)}`;
    const refs = new Map(
      [...reachable(rpcFile, paramsPointer), ...reachable(rpcFile, resultsPointer)].map((ref) => [
        schemaId(ref.file, ref.pointer),
        ref,
      ]),
    );
    const sorted = [...refs.values()].sort((a, b) =>
      compare(schemaId(a.file, a.pointer), schemaId(b.file, b.pointer)),
    );
    add({
      key: `product:rpc:${method}`,
      kind: 'capability',
      id: `rpc:${method}`,
      name: method,
      aliases: [method.split('.')[0], '接口', '参数', '返回结果'],
      text: `${method}\n${schemaWarning}\n参数：${JSON.stringify(params[method])}\n返回结果：${JSON.stringify(results[method])}`,
      data: {
        category: 'rpc',
        method,
        params: { file: rpcFile, pointer: paramsPointer },
        results: { file: rpcFile, pointer: resultsPointer },
        reachableSchemas: sorted,
        verification: 'schema-only',
      },
      relations: sorted.map((ref) => ({
        predicate: 'defined-by',
        targetKind: 'document',
        targetId: schemaId(ref.file, ref.pointer),
      })),
      source: { file: rpcFile, pointer: paramsPointer, sha256: source(rpcFile).sha256 },
    });
    for (const ref of sorted) emitSchema(ref.file, ref.pointer);
  }
}

function declarationLocations(text, declarationName) {
  const ast = ts.createSourceFile(taskFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const locations = new Map();
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        declaration.name.getText(ast) !== declarationName ||
        !declaration.initializer ||
        !ts.isObjectLiteralExpression(declaration.initializer)
      )
        continue;
      for (const property of declaration.initializer.properties) {
        const start = ast.getLineAndCharacterOfPosition(property.getStart(ast)).line + 1;
        const end = ast.getLineAndCharacterOfPosition(property.getEnd()).line + 1;
        locations.set(property.name.getText(ast).replace(/^['"]|['"]$/g, ''), `L${start}-L${end}`);
      }
    }
  }
  return locations;
}

async function emitTasks() {
  const text = source(taskFile).text;
  const compiled = await transform(text, {
    loader: 'ts',
    format: 'esm',
    target: 'es2022',
    legalComments: 'none',
  });
  const { taskLabels, taskDefaults, defaultDailyTaskTypes } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`
  );
  const defaultsLocations = declarationLocations(text, 'taskDefaults');
  const labelLocations = declarationLocations(text, 'taskLabels');
  for (const type of Object.keys(taskLabels).sort(compare)) {
    if (
      !Object.hasOwn(taskDefaults, type) ||
      !defaultsLocations.has(type) ||
      !labelLocations.has(type)
    )
      throw new Error(`Incomplete task source: ${type}`);
    const defaults = taskDefaults[type];
    add({
      key: `product:task:${type}`,
      kind: 'capability',
      id: `task:${type}`,
      name: taskLabels[type],
      aliases: [type, taskLabels[type], '任务', '默认参数'],
      text: `${taskLabels[type]}（${type}）\n${taskWarning}\n新建默认参数：${JSON.stringify(defaults)}\n${type === 'UserDataUpdate' ? '应用组合任务，依次调用干员和仓库识别，不直接提交 MaaCore。' : '参数仍受应用业务策略、当前核心和资源支持限制。'}`,
      data: {
        category: 'task',
        taskType: type,
        defaults,
        dailyOrder: defaultDailyTaskTypes.includes(type)
          ? defaultDailyTaskTypes.indexOf(type)
          : null,
        labelPointer: labelLocations.get(type),
        verification: 'catalog-only',
      },
      relations: [
        { predicate: 'configured-via', targetKind: 'capability', targetId: 'rpc:plan.save' },
      ],
      source: {
        file: taskFile,
        pointer: defaultsLocations.get(type),
        sha256: source(taskFile).sha256,
      },
    });
  }
}

function emitTools() {
  const file = 'docs/toolbox-schedules.md';
  const lines = source(file).text.split('\n');
  const labels = {
    depot: '仓库',
    operators: '干员',
    recruit: '公招计算',
    inventory: '库存保持',
    data: '数据管理',
    games: '小游戏',
  };
  for (const kind of schemas.get(rpcFile).$defs.ToolKind.enum) {
    const label = labels[kind];
    const index = lines.findIndex(
      (line) => line.startsWith('|') && line.split('|')[1]?.trim() === label,
    );
    if (!label || index < 0) throw new Error(`Missing current tool documentation: ${kind}`);
    add({
      key: `product:tool:${kind}`,
      kind: 'capability',
      id: `tool:${kind}`,
      name: label,
      aliases: [kind, label, '工具箱', '独立工具'],
      text: `独立工具：${label}（${kind}）\n${lines[index]}\n工具记录不创建任务表，启动须检查设备独占。${documentWarning}`,
      data: {
        category: 'tool',
        toolKind: kind,
        config: { file: rpcFile, pointer: '#/$defs/ToolConfig' },
        verification: 'documented-only',
      },
      relations: [
        { predicate: 'started-via', targetKind: 'capability', targetId: 'rpc:tool.start' },
        { predicate: 'configured-via', targetKind: 'capability', targetId: 'rpc:tool.config.save' },
      ],
      source: { file, pointer: `L${index + 1}-L${index + 1}`, sha256: source(file).sha256 },
    });
  }
}

function emitDocument(file) {
  const lines = source(file).text.split('\n');
  const headingPath = [];
  const occurrences = new Map();
  let section = { title: file, headingPath: [], start: 0, occurrence: 0 };
  function flush(end) {
    let start = section.start;
    let part = 0;
    while (start < end) {
      while (start < end && !lines[start].trim()) start++;
      if (start >= end) break;
      let finish = start;
      let length = 0;
      while (finish < end && length + lines[finish].length + 1 <= maxDocumentLength)
        length += lines[finish++].length + 1;
      if (finish === start)
        throw new Error(`Document line exceeds chunk bound: ${file}:L${start + 1}`);
      // Prefer a paragraph boundary, while retaining complete source lines.
      if (finish < end) {
        for (let boundary = finish - 1; boundary > start; boundary--) {
          if (!lines[boundary].trim() && boundary - start >= (finish - start) / 2) {
            finish = boundary + 1;
            break;
          }
        }
      }
      const content = lines.slice(start, finish).join('\n').trimEnd();
      const headingId = sha256(section.headingPath.join('\n')).slice(0, 16);
      const id = `${file}:${headingId}:${section.occurrence}:${part++}`;
      add({
        key: `product:document:${id}`,
        kind: 'document',
        id,
        name: section.title,
        aliases: [...section.headingPath, path.posix.basename(file, '.md')],
        text: `${section.headingPath.join(' > ')}\n${documentWarning}\n${content}`,
        data: {
          category: 'documentation',
          headingPath: section.headingPath,
          content,
          verification: 'documented-only',
        },
        relations: [],
        source: { file, pointer: `L${start + 1}-L${finish}`, sha256: source(file).sha256 },
      });
      start = finish;
    }
  }
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const fenceMatch = lines[index].match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    flush(index);
    headingPath.length = match[1].length - 1;
    headingPath[match[1].length - 1] = match[2];
    const currentPath = headingPath.filter(Boolean);
    const key = currentPath.join('\n');
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    section = { title: match[2], headingPath: currentPath, start: index, occurrence };
  }
  flush(lines.length);
}

emitMethods();
await emitTasks();
emitTools();
for (const file of documentFiles) emitDocument(file);
const orderedRecords = [...records.values()].sort((a, b) => compare(a.key, b.key));
const manifest = [...sources]
  .sort(([a], [b]) => compare(a, b))
  .map(([file, value]) => ({ file, sha256: value.sha256 }));
const payload = { formatVersion: 1, maxTextLength, sources: manifest, records: orderedRecords };
const generated =
  JSON.stringify({ ...payload, digest: sha256(JSON.stringify(payload)) }, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(path.join(root, outputFile), 'utf8') !== generated) {
    console.error('Agent 产品知识未同步，请运行 node tools/generate-agent-knowledge.mjs。');
    process.exitCode = 1;
  }
} else {
  writeFileSync(path.join(root, outputFile), generated);
  console.log(
    `Generated ${orderedRecords.length} product knowledge records from ${manifest.length} local sources.`,
  );
}
