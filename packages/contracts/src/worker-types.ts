/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */

export type WorkerCommand =
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'connect' | 'stop';
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'task';
      task: {
        type: string;
        params: {
          [k: string]: unknown;
        };
      };
    };
export type WorkerEvent =
  | {
      protocolVersion: 1;
      type: 'ready';
      mode?: 'lease-only';
    }
  | {
      protocolVersion: 1;
      type: 'response';
      id: string | number | null;
      result: {
        [k: string]: unknown;
      };
    }
  | {
      protocolVersion: 1;
      type: 'response';
      id: string | number | null;
      error: string;
    }
  | {
      protocolVersion: 1;
      type: 'callback';
      message: number;
      details: {
        [k: string]: unknown;
      };
    }
  | {
      protocolVersion: 1;
      type: 'status';
      running: boolean;
      pendingAsync: number[];
    };

export interface WorkerProtocol {
  configuration: WorkerConfiguration;
  leaseConfiguration: WorkerLeaseConfiguration;
  validationConfiguration: WorkerValidationConfiguration;
  command: WorkerCommand;
  event: WorkerEvent;
  validation: WorkerValidation;
}
export interface WorkerConfiguration {
  protocolVersion: 1;
  core: string;
  resource: string;
  adb: string;
  address: string;
  userDir: string;
  lockPath: string;
  lockTimeoutMs?: number;
  startupTimeoutMs?: number;
  nativeCallTimeoutMs?: number;
  asyncTimeoutMs?: number;
  shutdownTimeoutMs?: number;
}
export interface WorkerLeaseConfiguration {
  protocolVersion: 1;
  lockPath: string;
  lockTimeoutMs?: number;
}
export interface WorkerValidationConfiguration {
  protocolVersion: 1;
  core: string;
  resource: string;
  version: string;
  nativeCallTimeoutMs?: number;
}
export interface WorkerValidation {
  protocolVersion: 1;
  version: string;
  resourceLoaded: true;
}
