/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */

export type FrameworkWorkerCommand =
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'connect' | 'stop';
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'frame';
      callbackId?: string;
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'click';
      x: number;
      y: number;
      callbackId?: string;
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'swipe';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      durationMs?: number;
      profile?: 'drag' | 'navigation';
      compensationDirection?: 'none' | 'up' | 'down' | 'left' | 'right';
      callbackId?: string;
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'press_key';
      key: 'back' | 'escape';
      callbackId?: string;
    }
  | {
      [k: string]: unknown;
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'long_press';
      x: number;
      y: number;
      durationMs: number;
      callbackId?: string;
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'drag';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      durationMs: number;
      callbackId?: string;
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'pipeline';
      entry: string;
      /**
       * Host-owned MaaFramework Pipeline nodes. The worker also enforces a 512 KiB serialized payload limit; this command is not a product RPC or model tool.
       */
      pipeline: {
        [k: string]: {
          [k: string]: unknown;
        };
      };
      contextId?: string;
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'context_pipeline';
      entry: string;
      /**
       * Host-owned MaaFramework Pipeline nodes. The worker also enforces a 512 KiB serialized payload limit; this command is not a product RPC or model tool.
       */
      pipeline: {
        [k: string]: {
          [k: string]: unknown;
        };
      };
      contextId: string;
      callbackId: string;
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'custom_result';
      callbackId: string;
      success: boolean;
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'start_app';
      appId: string;
      callbackId?: string;
      /**
       * Explicit Android component in the same appId; native validates package equality. No shell or am flags.
       */
      intent?: string;
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'stop_app';
      appId: string;
      callbackId?: string;
    };
export type FrameworkWorkerEvent =
  | {
      protocolVersion: 1;
      type: 'ready';
      engine: 'maafw';
      mode: 'recognition' | 'control';
      version: 'v5.14.3';
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
      type: 'framework_custom';
      callbackId: string;
      node: string;
      /**
       * Parameters of the registered MaaVerge.Custom action. The worker also enforces a 64 KiB serialized payload limit.
       */
      params: {
        [k: string]: unknown;
      };
      contextId: string;
      parentCallbackId: string | null;
      depth: number;
      inputEpoch: number;
    }
  | {
      protocolVersion: 1;
      type: 'framework_input_epoch';
      inputEpoch: number;
    };

export interface WorkerProtocol {
  leaseConfiguration: WorkerLeaseConfiguration;
  frameworkConfiguration: FrameworkWorkerConfiguration;
  frameworkCommand: FrameworkWorkerCommand;
  frameworkEvent: FrameworkWorkerEvent;
  frameworkValidation: FrameworkWorkerValidation;
}
export interface WorkerLeaseConfiguration {
  protocolVersion: 1;
  lockPath: string;
  lockTimeoutMs?: number;
}
export interface FrameworkWorkerConfiguration {
  protocolVersion: 1;
  framework: string;
  resource: string;
  userDir: string;
  mode: 'recognition' | 'control';
  adb?: string;
  address?: string;
  lockPath?: string;
  avd?: boolean;
  /**
   * Verified local AVD console identity used only for fixed enhanced screenshot start/stop commands; the controller address and shared lease stay unchanged.
   */
  avdSerial?: string;
  touchMode?: 'maatouch' | 'minitouch' | 'adb' | 'emulator-extras';
  capture?: {
    method: 'auto' | 'adb' | 'mumu' | 'ldplayer' | 'avd';
    emulatorPath: string;
    instanceIndex: number;
    pid?: number;
  };
  touchExtras?: {
    emulatorPath: string;
    instanceIndex: number;
  };
  lockTimeoutMs?: number;
  startupTimeoutMs?: number;
  nativeCallTimeoutMs?: number;
  asyncTimeoutMs?: number;
  shutdownTimeoutMs?: number;
}
export interface FrameworkWorkerValidation {
  protocolVersion: 1;
  engine: 'maafw';
  version: 'v5.14.3';
  resourceLoaded: true;
  ocrAvailable: boolean;
  diagnostic?: string;
}
