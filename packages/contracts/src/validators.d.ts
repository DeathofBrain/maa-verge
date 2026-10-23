/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */
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
export const validateScreenFrame: Validator<ScreenFrame>;
export const validateWorkerFrame: Validator<Pick<ScreenFrame, 'width' | 'height' | 'mimeType' | 'data' | 'canControl'>>;
export const validateWorkerConfiguration: Validator<WorkerProtocol['configuration']>;
export const validateWorkerLeaseConfiguration: Validator<WorkerProtocol['leaseConfiguration']>;
export const validateWorkerValidationConfiguration: Validator<WorkerProtocol['validationConfiguration']>;
export const validateWorkerCommand: Validator<WorkerProtocol['command']>;
export const validateWorkerEvent: Validator<WorkerProtocol['event']>;
export const validateWorkerValidation: Validator<WorkerProtocol['validation']>;
