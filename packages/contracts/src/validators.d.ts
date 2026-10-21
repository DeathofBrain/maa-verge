/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */
import type { Plan, Settings, Snapshot } from './types';
import type { RpcRequest, RpcEvent } from './rpc-types';
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
export const validateWorkerConfiguration: Validator<WorkerProtocol['configuration']>;
export const validateWorkerLeaseConfiguration: Validator<WorkerProtocol['leaseConfiguration']>;
export const validateWorkerValidationConfiguration: Validator<WorkerProtocol['validationConfiguration']>;
export const validateWorkerCommand: Validator<WorkerProtocol['command']>;
export const validateWorkerEvent: Validator<WorkerProtocol['event']>;
export const validateWorkerValidation: Validator<WorkerProtocol['validation']>;
