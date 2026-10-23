import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { compile, compileFromFile } from 'json-schema-to-typescript';
import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { build } from 'esbuild';
import { root } from './project.mjs';

const source = path.join(root, 'packages/contracts/schemas/runtime.schema.json');
const schema = JSON.parse(readFileSync(source, 'utf8'));
const rpcSource = path.join(root, 'packages/contracts/schemas/rpc.schema.json');
const workerSource = path.join(root, 'packages/contracts/schemas/worker.schema.json');
const rpcSchema = JSON.parse(readFileSync(rpcSource, 'utf8'));
const workerSchema = JSON.parse(readFileSync(workerSource, 'utf8'));
const bannerComment = '/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */';
const typeOptions = {
  bannerComment,
  additionalProperties: false,
  style: { singleQuote: true, semi: true, tabWidth: 2 },
};
const types = await compile(schema, 'Snapshot', typeOptions);
const rpcTypes = await compileFromFile(rpcSource, { ...typeOptions, unreachableDefinitions: true });
const workerTypes = await compile(workerSchema, 'WorkerProtocol', typeOptions);

// Build validators once, including Ajv's small runtime helpers. The application
// ships neither Ajv's schema compiler nor dynamically evaluated validation code.
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true, code: { source: true, esm: true }, useDefaults: false, coerceTypes: false });
ajv.addSchema(schema);
ajv.addSchema(rpcSchema);
ajv.addSchema(workerSchema);
const validators = {
  validateSnapshot: schema.$id,
  validatePlan: `${schema.$id}#/$defs/Plan`,
  validateSettings: `${schema.$id}#/$defs/Settings`,
  validateRpcRequest: `${rpcSchema.$id}#/$defs/RpcRequest`,
  validateRpcEvent: `${rpcSchema.$id}#/$defs/RpcEvent`,
  validateDeviceFrameParams: `${rpcSchema.$id}#/$defs/DeviceFrameParams`,
  validateDeviceClickParams: `${rpcSchema.$id}#/$defs/DeviceClickParams`,
  validateRunArtifactParams: `${rpcSchema.$id}#/$defs/RunArtifactParams`,
  validateStageListParams: `${rpcSchema.$id}#/$defs/StageListParams`,
  validateStageListResult: `${rpcSchema.$id}#/$defs/StageListResult`,
  validateRecognitionParams: `${rpcSchema.$id}#/$defs/RecognitionParams`,
  validateRecognitionResult: `${rpcSchema.$id}#/$defs/RecognitionResult`,
  validateItemResourceParams: `${rpcSchema.$id}#/$defs/ItemResourceParams`,
  validateItemResourceResult: `${rpcSchema.$id}#/$defs/ItemResourceResult`,
  validateScreenFrame: `${rpcSchema.$id}#/$defs/ScreenFrame`,
  validateWorkerFrame: `${workerSchema.$id}#/$defs/WorkerFrame`,
  validateWorkerConfiguration: `${workerSchema.$id}#/$defs/WorkerConfiguration`,
  validateWorkerLeaseConfiguration: `${workerSchema.$id}#/$defs/WorkerLeaseConfiguration`,
  validateWorkerValidationConfiguration: `${workerSchema.$id}#/$defs/WorkerValidationConfiguration`,
  validateWorkerCommand: `${workerSchema.$id}#/$defs/WorkerCommand`,
  validateWorkerEvent: `${workerSchema.$id}#/$defs/WorkerEvent`,
  validateWorkerValidation: `${workerSchema.$id}#/$defs/WorkerValidation`,
};
const standalone = standaloneCode(ajv, validators);
const require = createRequire(import.meta.url);
const bundled = await build({
  stdin: { contents: standalone, resolveDir: root, sourcefile: 'validators.generated.js', loader: 'js' },
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', legalComments: 'none',
  plugins: [{
    name: 'stable-ajv-runtime-paths',
    setup(builder) {
      builder.onResolve({ filter: /^ajv\/dist\/runtime\// }, ({ path: runtimePath }) => ({ path: runtimePath, namespace: 'ajv-runtime' }));
      builder.onLoad({ filter: /.*/, namespace: 'ajv-runtime' }, ({ path: runtimePath }) => ({ contents: readFileSync(require.resolve(runtimePath), 'utf8'), loader: 'js' }));
    },
  }],
  banner: { js: bannerComment },
});
const declaration = `${bannerComment}
import type { Plan, Settings, Snapshot } from './types';
import type { RpcContract, RpcRequest, RpcEvent, ScreenFrame } from './rpc-types';
import type { WorkerProtocol } from './worker-types';
export interface ValidationError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
}
export interface Validator<T> {
  (data: unknown): data is T;
  errors: ValidationError[] | null;
}
export const validateSnapshot: Validator<Snapshot>;
export const validatePlan: Validator<Plan>;
export const validateSettings: Validator<Settings>;
export const validateRpcRequest: Validator<RpcRequest>;
export const validateRpcEvent: Validator<RpcEvent>;
export const validateDeviceFrameParams: Validator<RpcContract['params']['device.frame']>;
export const validateDeviceClickParams: Validator<RpcContract['params']['device.click']>;
export const validateRunArtifactParams: Validator<RpcContract['params']['run.artifact']>;
export const validateStageListParams: Validator<RpcContract['params']['stages.list']>;
export const validateStageListResult: Validator<RpcContract['results']['stages.list']>;
export const validateRecognitionParams: Validator<RpcContract['params']['recognition.get']>;
export const validateRecognitionResult: Validator<RpcContract['results']['recognition.get']>;
export const validateItemResourceParams: Validator<RpcContract['params']['resources.item']>;
export const validateItemResourceResult: Validator<RpcContract['results']['resources.item']>;
export const validateScreenFrame: Validator<ScreenFrame>;
export const validateWorkerFrame: Validator<Pick<ScreenFrame, 'width' | 'height' | 'mimeType' | 'data' | 'canControl'>>;
export const validateWorkerConfiguration: Validator<WorkerProtocol['configuration']>;
export const validateWorkerLeaseConfiguration: Validator<WorkerProtocol['leaseConfiguration']>;
export const validateWorkerValidationConfiguration: Validator<WorkerProtocol['validationConfiguration']>;
export const validateWorkerCommand: Validator<WorkerProtocol['command']>;
export const validateWorkerEvent: Validator<WorkerProtocol['event']>;
export const validateWorkerValidation: Validator<WorkerProtocol['validation']>;
`;
const files = new Map([
  ['packages/contracts/schema.json', JSON.stringify(schema, null, 2) + '\n'],
  ['packages/contracts/src/types.ts', types],
  ['packages/contracts/src/rpc-types.ts', rpcTypes],
  ['packages/contracts/src/worker-types.ts', workerTypes],
  ['packages/contracts/src/validators.js', bundled.outputFiles[0].text],
  ['packages/contracts/src/validators.d.ts', declaration],
]);
for (const [relative, content] of files) {
  const filename = path.join(root, relative);
  if (process.argv.includes('--check')) {
    if (readFileSync(filename, 'utf8') !== content) throw new Error(relative + ' is stale. Run pnpm contracts:generate.');
  } else { mkdirSync(path.dirname(filename), { recursive: true }); writeFileSync(filename, content); }
}
console.log('JSON Schema, TypeScript types and standalone validators are synchronized.');
