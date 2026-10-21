/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */
import type { Plan, Settings, Snapshot } from './types';
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
