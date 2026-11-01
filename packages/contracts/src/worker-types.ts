/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */

export type WorkerCaptureConfiguration =
  | {
      method: 'adb';
    }
  | {
      method: 'mumu';
      emulatorPath: string;
      instanceIndex: number;
      mumuTouch?: boolean;
      mumuBridge?: boolean;
    }
  | {
      method: 'ldplayer';
      emulatorPath: string;
      instanceIndex: number;
      pid?: number;
    };
export type WorkerCommand =
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'connect' | 'stop' | 'screencap' | 'frame';
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'click';
      x: number;
      y: number;
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
export type FrameworkWorkerCommand =
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'connect' | 'frame' | 'stop';
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'click';
      x: number;
      y: number;
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
    }
  | {
      protocolVersion: 1;
      id: string | number;
      operation: 'press_key';
      key: 'back' | 'escape';
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
    };

export interface WorkerProtocol {
  configuration: WorkerConfiguration;
  leaseConfiguration: WorkerLeaseConfiguration;
  validationConfiguration: WorkerValidationConfiguration;
  command: WorkerCommand;
  event: WorkerEvent;
  validation: WorkerValidation;
  frameworkConfiguration: FrameworkWorkerConfiguration;
  frameworkCommand: FrameworkWorkerCommand;
  frameworkEvent: FrameworkWorkerEvent;
  frameworkValidation: FrameworkWorkerValidation;
}
export interface WorkerConfiguration {
  protocolVersion: 1;
  core: string;
  resource: string;
  adb: string;
  address: string;
  userDir: string;
  lockPath: string;
  capture?: WorkerCaptureConfiguration;
  connection?: WorkerConnectionConfiguration;
  lockTimeoutMs?: number;
  startupTimeoutMs?: number;
  nativeCallTimeoutMs?: number;
  asyncTimeoutMs?: number;
  shutdownTimeoutMs?: number;
}
export interface WorkerConnectionConfiguration {
  config:
    | 'General'
    | 'BlueStacks'
    | 'MuMuEmulator12'
    | 'MuMuArm'
    | 'LDPlayer'
    | 'Nox'
    | 'XYAZ'
    | 'Compatible'
    | 'SecondResolution'
    | 'CompatMac'
    | 'CompatPOSIXShell'
    | 'Waydroid'
    | 'AVD'
    | 'Androws'
    | 'WSA';
  touchMode: 'minitouch' | 'maatouch' | 'adb' | 'MaaFwAdb';
  adbLite: boolean;
  clientType: 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
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
