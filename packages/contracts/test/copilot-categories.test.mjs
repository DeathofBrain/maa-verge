import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Ajv from 'ajv';
import { validateCopilotCategoryAssignParams, validateCopilotCategorySaveParams, validateCopilotListParams } from '../src/validators.js';

test('local category requests bound names and atomically identify up to 100 distinct records', () => {
  assert.equal(validateCopilotCategorySaveParams({ name: '活动作业集' }), true);
  assert.equal(validateCopilotCategorySaveParams({ id: 'category-1', name: '重命名' }), true);
  for (const params of [{ name: '' }, { name: ' ' }, { name: 'x'.repeat(301) }, { name: '分类', categoryId: 'unknown-field' }]) assert.equal(validateCopilotCategorySaveParams(params), false);
  assert.equal(validateCopilotCategoryAssignParams({ ids: ['record-1', 'record-2'], categoryId: 'category-1' }), true);
  assert.equal(validateCopilotCategoryAssignParams({ ids: ['record-1'], categoryId: null }), true);
  for (const params of [{ ids: [], categoryId: null }, { ids: ['same', 'same'], categoryId: null }, { ids: ['record-1'] }, { ids: ['record-1'], categoryId: '' }, { ids: Array.from({ length: 101 }, (_, i) => String(i)), categoryId: null }]) assert.equal(validateCopilotCategoryAssignParams(params), false);
  for (const categoryId of [undefined, null, 'category-1']) assert.equal(validateCopilotListParams({ page: 2, categoryId }), true);
  assert.equal(validateCopilotListParams({ categoryId: '' }), false);
});

test('category metadata is optional on legacy records and explicitly nullable after removal', () => {
  const rpc = JSON.parse(readFileSync(new URL('../schemas/rpc.schema.json', import.meta.url)));
  const runtime = JSON.parse(readFileSync(new URL('../schemas/runtime.schema.json', import.meta.url)));
  const ajv = new Ajv({ strict: true, allowUnionTypes: true }); ajv.addSchema(runtime); ajv.addSchema(rpc);
  const validateRecord = ajv.getSchema(`${rpc.$id}#/$defs/CopilotRecord`);
  const record = { id: 'record-1', versionId: 'a'.repeat(64), kind: 'Copilot', title: '合成作业', stageName: '1-7', author: '', description: '', minimumCoreVersion: '', operators: [], videos: [], source: { kind: 'local', name: 'fixture', url: '' }, createdAt: '2026-10-25T00:00:00Z', compatibility: { status: 'ready', reasons: [] } };
  for (const categoryId of [undefined, null, 'category-1']) assert.equal(validateRecord({ ...record, categoryId }), true);
  assert.equal(validateRecord({ ...record, categoryId: '' }), false);
  const validateCategory = ajv.getSchema(`${rpc.$id}#/$defs/CopilotCategory`);
  assert.equal(validateCategory({ id: 'category-1', name: '分类', createdAt: '2026-10-25T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z' }), true);
  assert.equal(validateCategory({ id: 'category-1', name: '分类' }), false);
});
