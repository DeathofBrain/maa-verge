import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Ajv from 'ajv';

const runtime = JSON.parse(readFileSync(new URL('../schemas/runtime.schema.json', import.meta.url), 'utf8'));
const rpc = JSON.parse(readFileSync(new URL('../schemas/rpc.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: true, allowUnionTypes: true });
ajv.addSchema(runtime); ajv.addSchema(rpc);
const validate = ajv.getSchema(`${rpc.$id}#/$defs/CopilotSearchItem`);
const item = { id: '1', title: '社区作业', description: '', author: '', url: 'https://prts.plus/copilot/1' };

test('difficulty metadata preserves unset support and only accepts the four declared protocol values', () => {
  assert.equal(validate(item), true);
  for (const difficulty of [0, 1, 2, 3]) assert.equal(validate({ ...item, difficulty }), true);
  for (const difficulty of [null, -1, 4, '3', true, 1.5]) assert.equal(validate({ ...item, difficulty }), false);
  const validateDifficulty = ajv.getSchema(`${rpc.$id}#/$defs/CopilotDifficulty`);
  for (const difficulty of [0, 1, 2, 3]) assert.equal(validateDifficulty(difficulty), true);
  for (const difficulty of [null, -1, 4, '3']) assert.equal(validateDifficulty(difficulty), false);
});

test('search operator metadata preserves old summaries and bounds individual and grouped requirements', () => {
  assert.equal(validate(item), true);
  const operator = { name: '合成干员', skill: 3, requirements: { elite: 2, level: 80, skill_level: 10, module: 2 } };
  assert.equal(validate({ ...item, operators: [operator, { ...operator, group: '输出任选' }] }), true);
  assert.equal(validate({ ...item, operators: [] }), true);
  assert.equal(validate({ ...item, operators: Array.from({ length: 104 }, () => operator) }), true);
  assert.equal(validate({ ...item, operators: Array.from({ length: 2000 }, () => operator) }), true);
  assert.equal(validate({ ...item, operators: Array.from({ length: 2001 }, () => operator) }), false);
  assert.equal(validate({ ...item, operators: [{ ...operator, skill: 4 }] }), false);
  assert.equal(validate({ ...item, operators: [{ ...operator, name: 'x'.repeat(101) }] }), false);
  assert.equal(validate({ ...item, operators: [{ ...operator, group: 'x'.repeat(101) }] }), false);
  assert.equal(validate({ ...item, operators: [{ ...operator, executable: 'shell' }] }), false);
});
