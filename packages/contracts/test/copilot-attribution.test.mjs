import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Ajv from 'ajv';
import { validateCopilotExportParams } from '../src/validators.js';

const runtime = JSON.parse(readFileSync(new URL('../schemas/runtime.schema.json', import.meta.url), 'utf8'));
const rpc = JSON.parse(readFileSync(new URL('../schemas/rpc.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: true, allowUnionTypes: true });
ajv.addSchema(runtime); ajv.addSchema(rpc);
const versionId = 'a'.repeat(64);

test('copilot export preserves old version-only requests and validates optional source-record identity', () => {
  assert.equal(validateCopilotExportParams({ versionId }), true);
  assert.equal(validateCopilotExportParams({ versionId, id: 'selected-source' }), true);
  for (const id of ['', 42, 'x'.repeat(201)]) assert.equal(validateCopilotExportParams({ versionId, id }), false);
  assert.equal(validateCopilotExportParams({ id: 'selected-source' }), false);
});

test('uploader metadata is optional for old records and bounded separately from content author', () => {
  const validateRecord = ajv.getSchema(`${rpc.$id}#/$defs/CopilotRecord`);
  const validateSearch = ajv.getSchema(`${rpc.$id}#/$defs/CopilotSearchItem`);
  const record = { id: 'record', versionId, kind: 'Copilot', title: '作业', stageName: '1-7', author: '', description: '', minimumCoreVersion: '', operators: [], videos: [], source: { kind: 'community', name: 'PRTS Plus', url: 'https://prts.plus/copilot/1', communityId: '1' }, createdAt: '2026-10-24T00:00:00Z', compatibility: { status: 'unverified', reasons: [] } };
  const search = { id: '1', title: '作业', description: '', author: '', url: 'https://prts.plus/copilot/1' };
  for (const [validate, value] of [[validateRecord, record], [validateSearch, search]]) {
    assert.equal(validate(value), true);
    assert.equal(validate({ ...value, author: '原 JSON 署名', uploader: '社区上传者' }), true);
    assert.equal(validate({ ...value, uploader: 42 }), false);
    assert.equal(validate({ ...value, uploader: 'x'.repeat(301) }), false);
  }
});

test('copilot export returns separate bounded files for original JSON and source attribution', () => {
  const validate = ajv.getSchema(`${rpc.$id}#/properties/results/properties/copilot.export`);
  const result = { filename: '作业.json', content: '\ufeff {"doc":{"details":"版权原文"}}\n', attribution: { filename: '作业.attribution.json', content: '{"licenseStatus":"unverified"}\n' } };
  assert.equal(validate(result), true);
  assert.equal(validate({ ...result, attribution: undefined }), false);
  assert.equal(validate({ ...result, attribution: { ...result.attribution, content: 'x'.repeat(16001) } }), false);
});
