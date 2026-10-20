import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { compile } from 'json-schema-to-typescript';
import { root, devEnvironment } from './project.mjs';

const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const code = 'import json;from maaverge_runtime.models import Snapshot;print(json.dumps(Snapshot.model_json_schema(mode="serialization"),ensure_ascii=False))';
const result = spawnSync(python, ['-c', code], { cwd: root, env: { ...devEnvironment(), PYTHONPATH: path.join(root, 'services/runtime') }, encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'Run uv sync before generating contracts');
const schema = JSON.parse(result.stdout);
const types = await compile(schema, 'Snapshot', {
  bannerComment: '/* Generated from Python Pydantic models. Run pnpm contracts:generate. Do not edit. */',
  additionalProperties: false,
  style: { singleQuote: true, semi: true, tabWidth: 2 },
});
const files = new Map([
  ['packages/contracts/schema.json', JSON.stringify(schema, null, 2) + '\n'],
  ['packages/contracts/src/types.ts', types],
]);
for (const [relative, content] of files) {
  const filename = path.join(root, relative);
  if (process.argv.includes('--check')) {
    if (readFileSync(filename, 'utf8') !== content) throw new Error(relative + ' is stale. Run pnpm contracts:generate.');
  } else { mkdirSync(path.dirname(filename), { recursive: true }); writeFileSync(filename, content); }
}
console.log('Python ↔ TypeScript contracts are synchronized.');
