/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */

export type AtomicRecognizeInput = {
  [k: string]: unknown;
} & {
  kind: 'ocr' | 'template' | 'color';
  /**
   * @minItems 4
   * @maxItems 4
   */
  roi?: [number, number, number, number];
  threshold?: number;
  method?: 5 | 40 | 'RGBCount';
  onlyRec?: boolean;
  /**
   * @maxItems 256
   */
  replace?: string[][];
  /**
   * @minItems 3
   * @maxItems 3
   */
  lower?: [number, number, number];
  /**
   * @minItems 3
   * @maxItems 3
   */
  upper?: [number, number, number];
  count?: number;
  connected?: boolean;
  greenMask?: boolean;
  /**
   * @minItems 2
   * @maxItems 2
   */
  referenceSize?: [1280, 720];
  /**
   * @minItems 2
   * @maxItems 2
   */
  maskRange?: number[];
  frameId: string;
  templateId?: string;
  pureColor?: true;
  /**
   * @minItems 1
   * @maxItems 16
   */
  colorScales?: number[][][];
  colorWithClose?: boolean;
  nmsDistance?: number;
};

export interface AtomicInputContract {
  inputs: {
    'operation.frame': AtomicEmptyInput;
    'operation.click': AtomicClickInput;
    'operation.swipe': AtomicSwipeInput;
    'operation.press_key': AtomicPressKeyInput;
    'operation.long_press': AtomicLongPressInput;
    'operation.drag': AtomicDragInput;
    'operation.recognize': AtomicRecognizeInput;
    'observation.frame': AtomicEmptyInput;
    'observation.base': AtomicEmptyInput;
    'observation.operators': AtomicEmptyInput;
    'observation.overview': AtomicEmptyInput;
    'observation.training': AtomicEmptyInput;
    'game.infrast.enter_overview': AtomicEmptyInput;
    'game.infrast.read_room': AtomicRoomTargetInput;
    'game.infrast.set_room': AtomicRoomShiftInput;
    'workflow.infrast.queue_rotate': AtomicQueueRotateInput;
    'workflow.infrast.overview_shift': AtomicBatchShiftInput;
    'workflow.infrast.room_shift': AtomicBatchShiftInput;
    'workflow.infrast.trim': AtomicEmptyInput;
  };
}
export interface AtomicEmptyInput {}
export interface AtomicClickInput {
  frameId: string;
  x: number;
  y: number;
}
export interface AtomicSwipeInput {
  frameId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  durationMs?: number;
  profile?: 'drag' | 'navigation';
  compensationDirection?: 'none' | 'up' | 'down' | 'left' | 'right';
}
export interface AtomicPressKeyInput {
  frameId: string;
  key: 'back' | 'escape';
}
export interface AtomicLongPressInput {
  frameId: string;
  x: number;
  y: number;
  durationMs: number;
}
export interface AtomicDragInput {
  frameId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  durationMs: number;
}
export interface AtomicRoomTargetInput {
  facility:
    'Mfg' | 'Trade' | 'Power' | 'Control' | 'Reception' | 'Office' | 'Dorm' | 'Processing' | 'Training' | 'Recycle';
  room: number;
  position?: string;
}
export interface AtomicRoomShiftInput {
  facility:
    'Mfg' | 'Trade' | 'Power' | 'Control' | 'Reception' | 'Office' | 'Dorm' | 'Processing' | 'Training' | 'Recycle';
  room: number;
  position?: string;
  /**
   * @maxItems 5
   */
  operators?: string[];
  trainee?: string;
  assistant?: string;
}
export interface AtomicQueueRotateInput {
  /**
   * @minItems 1
   * @maxItems 32
   */
  expectedRooms?: {
    facility:
      'Mfg' | 'Trade' | 'Power' | 'Control' | 'Reception' | 'Office' | 'Dorm' | 'Processing' | 'Training' | 'Recycle';
    room: number;
    position?: string;
    /**
     * @maxItems 5
     */
    operators?: string[];
    trainee?: string;
    assistant?: string;
  }[];
}
export interface AtomicBatchShiftInput {
  /**
   * @minItems 1
   * @maxItems 32
   */
  rooms: {
    facility:
      'Mfg' | 'Trade' | 'Power' | 'Control' | 'Reception' | 'Office' | 'Dorm' | 'Processing' | 'Training' | 'Recycle';
    room: number;
    position?: string;
    /**
     * @maxItems 5
     */
    operators?: string[];
    trainee?: string;
    assistant?: string;
  }[];
}
