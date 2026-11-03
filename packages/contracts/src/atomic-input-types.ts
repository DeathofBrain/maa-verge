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
  referenceSize?: number[];
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
export type InfrastPrepareInput = {
  [k: string]: unknown;
} & {
  target: AtomicRoomTargetInput;
  route: 'overview' | 'room';
  role: 'normal' | 'trainee' | 'assistant';
  /**
   * @maxItems 5
   */
  operators?: string[];
  name?: string;
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
    'game.infrast.read_room': InfrastReadRoomInput;
    'game.infrast.set_room': AtomicRoomShiftInput;
    'workflow.infrast.queue_rotate': AtomicQueueRotateInput;
    'workflow.infrast.overview_shift': AtomicBatchShiftInput;
    'workflow.infrast.room_shift': AtomicBatchShiftInput;
    'workflow.infrast.trim': AtomicEmptyInput;
    'composite.match': CompositeMatchInput;
    'composite.texts': CompositeTextsInput;
    'composite.click_box': CompositeClickBoxInput;
    'composite.swipe': CompositeSwipeInput;
    'composite.press_key': CompositePressKeyInput;
    'composite.click_rule': CompositeClickRuleInput;
    'composite.click_first': CompositeClickFirstInput;
    'composite.action': CompositeActionInput;
    'composite.delay': CompositeDelayInput;
    'composite.assert_hit': CompositeassertHitInput;
    'composite.assert_missing': CompositeassertMissingInput;
    'composite.wait_until': CompositeWaitUntilInput;
    'observation.startup': AtomicEmptyInput;
    'game.startup.login_step': AtomicEmptyInput;
    'workflow.startup.login': AtomicEmptyInput;
    'observation.fight': AtomicEmptyInput;
    'game.fight.enable_agent': AtomicEmptyInput;
    'game.fight.prepare': FightPrepareInput;
    'game.fight.start': AtomicEmptyInput;
    'game.fight.read_result': FightReadResultInput;
    'game.fight.dismiss_result': AtomicEmptyInput;
    'observation.recruit': AtomicEmptyInput;
    'game.recruit.enter': AtomicEmptyInput;
    'game.recruit.collect_finished': AtomicEmptyInput;
    'game.recruit.skip_reveal': AtomicEmptyInput;
    'game.recruit.read_result': AtomicEmptyInput;
    'workflow.recruit.collect_one': AtomicEmptyInput;
    'observation.mall': AtomicEmptyInput;
    'game.mall.enter': AtomicEmptyInput;
    'game.mall.collect_credit': AtomicEmptyInput;
    'workflow.mall.collect_credit': AtomicEmptyInput;
    'observation.award': AtomicEmptyInput;
    'game.award.enter': AtomicEmptyInput;
    'game.award.select_daily': AtomicEmptyInput;
    'game.award.select_weekly': AtomicEmptyInput;
    'game.award.claim_current': AtomicEmptyInput;
    'game.award.close_reward': AtomicEmptyInput;
    'workflow.award.daily_weekly': AtomicEmptyInput;
    'observation.inventory.depot': AtomicEmptyInput;
    'observation.inventory.operators': AtomicEmptyInput;
    'game.inventory.enter_depot': AtomicEmptyInput;
    'game.inventory.enter_operators': AtomicEmptyInput;
    'game.fight.wait_result': FightWaitResultInput;
    'workflow.fight.current_stage': FightCurrentStageInput;
    'game.mall.buy_current': MallBuyCurrentInput;
    'game.infrast.prepare_roster': InfrastPrepareInput;
    'game.infrast.confirm': InfrastConfirmInput;
    'game.infrast.verify_room': InfrastVerifyRoomInput;
    'game.infrast.open_room': InfrastOpenRoomInput;
    'game.infrast.open_roster': InfrastOpenRosterInput;
    'game.infrast.read_roster': InfrastReadRosterInput;
    'game.infrast.rotate_queue': AtomicEmptyInput;
    'game.infrast.enter_trim': AtomicEmptyInput;
    'game.infrast.trim': AtomicEmptyInput;
    'observation.trim': AtomicEmptyInput;
    'game.mall.open_credit_store': AtomicEmptyInput;
    'game.inventory.select_materials': AtomicEmptyInput;
    'workflow.inventory.read_depot': AtomicEmptyInput;
    'workflow.inventory.read_operators': AtomicEmptyInput;
    'game.infrast.reset_filter': InfrastResetFilterInput;
    'game.infrast.page_roster': InfrastPageRosterInput;
    'game.infrast.select_operator': InfrastSelectOperatorInput;
    'game.infrast.clear_roster': InfrastClearRosterInput;
    'operation.start_app': AtomicStartAppInput;
    'operation.stop_app': AtomicStopAppInput;
    'game.startup.launch': GameStartupInput;
    'game.startup.close': GameClientInput;
    'workflow.startup.start': GameStartupInput;
    'workflow.startup.close': GameClientInput;
    'game.award.mail_enter': AtomicEmptyInput;
    'game.award.mail_claim': AtomicEmptyInput;
    'game.award.mail_close': AtomicEmptyInput;
    'workflow.award.mail': AtomicEmptyInput;
    'game.startup.return_home': AtomicEmptyInput;
    'game.fight.open_terminal': AtomicEmptyInput;
    'game.fight.open_episode': FightStageInput;
    'game.fight.select_stage': FightStageInput;
    'workflow.fight.navigate': FightStageInput;
    'game.fight.replenish': FightConsumableInput;
    'workflow.fight.single_battle': FightSingleBattleInput;
    'game.infrast.resolve_rooms': AtomicBatchShiftInput;
    'workflow.infrast.custom_shift': InfrastCustomShiftInput;
    'game.recruit.read_slots': AtomicEmptyInput;
    'game.recruit.refresh': AtomicEmptyInput;
    'game.recruit.leave': AtomicEmptyInput;
    'game.recruit.dismiss_result': AtomicEmptyInput;
    'game.recruit.open_slot': GameRecruitOpenSlotInput;
    'game.recruit.read_plan': GameRecruitReadPlanInput;
    'game.recruit.prepare': GameRecruitPrepareInput;
    'game.recruit.confirm': GameRecruitConfirmInput;
    'workflow.recruit.daily': WorkflowRecruitDailyInput;
    'game.fight.set_series': FightSetSeriesInput;
    'game.fight.read_drops': FightReadDropsInput;
    'workflow.fight.legacy_batch': FightLegacyBatchInput;
    'game.mall.choose_product': MallChooseProductInput;
    'game.mall.open_product': AtomicEmptyInput;
    'game.mall.close_reward': AtomicEmptyInput;
    'game.mall.enter_friends': AtomicEmptyInput;
    'game.mall.open_friend_list': AtomicEmptyInput;
    'game.mall.visit_first': AtomicEmptyInput;
    'game.mall.visit_next': AtomicEmptyInput;
    'game.mall.read_visit': AtomicEmptyInput;
    'game.mall.purchase_selected': MallPurchaseSelectedInput;
    'workflow.mall.shopping': MallShoppingInput;
    'workflow.mall.visit_friends': MallVisitFriendsInput;
    'game.infrast.prepare_auto_roster': InfrastAutoRoomInput;
    'workflow.infrast.auto_room_shift': InfrastAutoRoomInput;
    'game.infrast.enumerate_rooms': InfrastEnumerateRoomsInput;
    'workflow.infrast.daily': InfrastDailyInput;
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
export interface InfrastReadRoomInput {
  facility:
    'Mfg' | 'Trade' | 'Power' | 'Control' | 'Reception' | 'Office' | 'Dorm' | 'Processing' | 'Training' | 'Recycle';
  room: number;
  position?: string;
  route?: 'overview' | 'room';
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
export interface CompositeMatchInput {
  profile?: string;
  /**
   * 使用 current 在本次根 Pipeline 内截图，或传入同根且未过期的帧引用；显式引用不会自动刷新。
   */
  frame?:
    | 'current'
    | {
        frameId: string;
        width: number;
        height: number;
        data?: string;
        capturedAt?: string;
        deviceId?: string;
        mimeType?: 'image/png';
        canControl?: boolean;
        /**
         * Application-service duration of the native frame request, including image retrieval and transport.
         */
        latencyMs?: number;
        engine?: 'maafw';
        sessionId?: string;
        resourceGeneration?: string;
        coordinateSpace?: 'frame';
        fresh?: boolean;
      };
  /**
   * @minItems 4
   * @maxItems 4
   */
  roi?: number[];
  rule: string;
}
export interface CompositeTextsInput {
  profile?: string;
  /**
   * 使用 current 在本次根 Pipeline 内截图，或传入同根且未过期的帧引用；显式引用不会自动刷新。
   */
  frame?:
    | 'current'
    | {
        frameId: string;
        width: number;
        height: number;
        data?: string;
        capturedAt?: string;
        deviceId?: string;
        mimeType?: 'image/png';
        canControl?: boolean;
        /**
         * Application-service duration of the native frame request, including image retrieval and transport.
         */
        latencyMs?: number;
        engine?: 'maafw';
        sessionId?: string;
        resourceGeneration?: string;
        coordinateSpace?: 'frame';
        fresh?: boolean;
      };
  /**
   * @minItems 4
   * @maxItems 4
   */
  roi?: number[];
}
export interface CompositeClickBoxInput {
  profile?: string;
  /**
   * 使用 current 在本次根 Pipeline 内截图，或传入同根且未过期的帧引用；显式引用不会自动刷新。
   */
  frame:
    | 'current'
    | {
        frameId: string;
        width: number;
        height: number;
        data?: string;
        capturedAt?: string;
        deviceId?: string;
        mimeType?: 'image/png';
        canControl?: boolean;
        /**
         * Application-service duration of the native frame request, including image retrieval and transport.
         */
        latencyMs?: number;
        engine?: 'maafw';
        sessionId?: string;
        resourceGeneration?: string;
        coordinateSpace?: 'frame';
        fresh?: boolean;
      };
  /**
   * @minItems 4
   * @maxItems 4
   */
  roi?: number[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  box: number[];
}
export interface CompositeSwipeInput {
  profile?: string;
  /**
   * 使用 current 在本次根 Pipeline 内截图，或传入同根且未过期的帧引用；显式引用不会自动刷新。
   */
  frame:
    | 'current'
    | {
        frameId: string;
        width: number;
        height: number;
        data?: string;
        capturedAt?: string;
        deviceId?: string;
        mimeType?: 'image/png';
        canControl?: boolean;
        /**
         * Application-service duration of the native frame request, including image retrieval and transport.
         */
        latencyMs?: number;
        engine?: 'maafw';
        sessionId?: string;
        resourceGeneration?: string;
        coordinateSpace?: 'frame';
        fresh?: boolean;
      };
  /**
   * @minItems 4
   * @maxItems 4
   */
  roi?: number[];
  /**
   * @minItems 2
   * @maxItems 2
   */
  from: number[];
  /**
   * @minItems 2
   * @maxItems 2
   */
  to: number[];
  durationMs?: number;
}
export interface CompositePressKeyInput {
  profile?: string;
  key: 'back' | 'escape';
}
export interface CompositeClickRuleInput {
  profile?: string;
  rule: string;
  optional?: boolean;
}
export interface CompositeClickFirstInput {
  profile?: string;
  /**
   * @minItems 1
   * @maxItems 32
   */
  rules: string[];
  fallbackAction?: string;
}
export interface CompositeActionInput {
  profile?: string;
  action: string;
}
export interface CompositeDelayInput {
  profile?: string;
  ms: number;
}
export interface CompositeassertHitInput {
  profile?: string;
  rule: string;
  message?: string;
  unknown?: boolean;
}
export interface CompositeassertMissingInput {
  profile?: string;
  rule: string;
  message?: string;
  unknown?: boolean;
}
export interface CompositeWaitUntilInput {
  profile?: string;
  rule: string;
  expected?: boolean;
  timeoutMs: number;
  pollMs?: number;
}
export interface FightPrepareInput {
  allowSanityDialog?: boolean;
  reusePrepared?: boolean;
  series?: number;
}
export interface FightReadResultInput {
  series?: number;
}
export interface FightWaitResultInput {
  timeoutMs?: number;
  pollMs?: number;
  allowPending?: boolean;
  series?: number;
}
export interface FightCurrentStageInput {
  times?: number;
  timeoutMs?: number;
}
export interface MallBuyCurrentInput {
  maxCredit: number;
}
export interface AtomicRoomTargetInput {
  facility:
    'Mfg' | 'Trade' | 'Power' | 'Control' | 'Reception' | 'Office' | 'Dorm' | 'Processing' | 'Training' | 'Recycle';
  room: number;
  position?: string;
}
export interface InfrastConfirmInput {
  prepared: {
    target: AtomicRoomTargetInput;
    route: 'overview' | 'room';
    role: 'normal' | 'trainee' | 'assistant';
    before?: {
      [k: string]: unknown;
    };
    selected: {
      [k: string]: unknown;
    };
    selectionAttempt?: {
      [k: string]: unknown;
    };
  };
}
export interface InfrastVerifyRoomInput {
  request: {
    [k: string]: unknown;
  };
  prepared: {
    target: AtomicRoomTargetInput;
    route: 'overview' | 'room';
    role: 'normal' | 'trainee' | 'assistant';
    before?: {
      [k: string]: unknown;
    };
    selected: {
      [k: string]: unknown;
    };
    selectionAttempt?: {
      [k: string]: unknown;
    };
  };
  before?: {
    [k: string]: unknown;
  };
}
export interface InfrastOpenRoomInput {
  facility:
    'Mfg' | 'Trade' | 'Power' | 'Control' | 'Reception' | 'Office' | 'Dorm' | 'Processing' | 'Training' | 'Recycle';
  room: number;
  position?: string;
  route?: 'overview' | 'room';
}
export interface InfrastOpenRosterInput {
  target: AtomicRoomTargetInput;
  role?: 'trainee' | 'assistant';
}
export interface InfrastReadRosterInput {
  maxCapacity?: number;
}
export interface InfrastResetFilterInput {}
export interface InfrastPageRosterInput {
  direction: 'left' | 'right';
}
export interface InfrastSelectOperatorInput {
  name: string;
  selected?: boolean;
}
export interface InfrastClearRosterInput {}
export interface AtomicStartAppInput {
  appId: string;
  /**
   * Explicit Android component in the same appId; native validates package equality. No shell or am flags.
   */
  intent?: string;
}
export interface AtomicStopAppInput {
  appId: string;
}
export interface GameStartupInput {
  clientType: 'Official' | 'Bilibili';
  startGame: boolean;
}
export interface GameClientInput {
  clientType: 'Official' | 'Bilibili';
}
export interface FightStageInput {
  stage: string;
}
export interface FightConsumableInput {
  medicine?: number;
  stone?: number;
}
export interface FightSingleBattleInput {
  medicine?: number;
  stone?: number;
  series?: number;
  drops?: {
    [k: string]: number;
  };
}
export interface InfrastCustomShiftInput {
  plan: {};
  planIndex?: number;
  sourceSha256?: string;
  /**
   * @minItems 1
   * @maxItems 10
   */
  facilities?: (
    'Mfg' | 'Trade' | 'Power' | 'Control' | 'Reception' | 'Office' | 'Dorm' | 'Processing' | 'Training' | 'Recycle'
  )[];
  threshold?: number;
}
export interface GameRecruitOpenSlotInput {
  slot: number;
}
export interface GameRecruitReadPlanInput {
  /**
   * @maxItems 6
   */
  select?: number[];
  /**
   * @maxItems 6
   */
  confirm?: number[];
  setTime?: boolean;
  recruitmentTime?: {
    '3'?: number;
    '4'?: number;
    '5'?: number;
    '6'?: number;
  };
  extraTagsMode?: 0 | 1 | 2;
  /**
   * @maxItems 50
   */
  preserveTags?: string[];
  /**
   * @maxItems 50
   */
  firstTags?: string[];
  skipRobot?: boolean;
}
export interface GameRecruitPrepareInput {
  /**
   * @maxItems 6
   */
  select?: number[];
  /**
   * @maxItems 6
   */
  confirm?: number[];
  setTime?: boolean;
  recruitmentTime?: {
    '3'?: number;
    '4'?: number;
    '5'?: number;
    '6'?: number;
  };
  extraTagsMode?: 0 | 1 | 2;
  /**
   * @maxItems 50
   */
  preserveTags?: string[];
  /**
   * @maxItems 50
   */
  firstTags?: string[];
  skipRobot?: boolean;
}
export interface GameRecruitConfirmInput {
  maxPermits?: number;
  reservePermits?: number;
}
export interface WorkflowRecruitDailyInput {
  /**
   * @maxItems 6
   */
  select?: number[];
  /**
   * @maxItems 6
   */
  confirm?: number[];
  setTime?: boolean;
  recruitmentTime?: {
    '3'?: number;
    '4'?: number;
    '5'?: number;
    '6'?: number;
  };
  extraTagsMode?: 0 | 1 | 2;
  /**
   * @maxItems 50
   */
  preserveTags?: string[];
  /**
   * @maxItems 50
   */
  firstTags?: string[];
  skipRobot?: boolean;
  times?: number;
  maxPermits?: number;
  refresh?: boolean;
  forceRefresh?: boolean;
  reservePermits?: number;
}
export interface FightSetSeriesInput {
  series: number;
}
export interface FightReadDropsInput {
  /**
   * @minItems 1
   * @maxItems 100
   */
  itemIds: string[];
}
export interface FightLegacyBatchInput {
  medicine?: number;
  stone?: number;
  series?: number;
  drops?: {
    [k: string]: number;
  };
  times: number;
}
export interface MallChooseProductInput {
  /**
   * @maxItems 100
   */
  buyFirst?: string[];
  /**
   * @maxItems 100
   */
  blacklist?: string[];
  onlyDiscount?: boolean;
  reserveMaxCredit?: boolean;
  phase?: 'priority' | 'general' | 'overflow';
}
export interface MallPurchaseSelectedInput {
  maxCredit?: number;
}
export interface MallShoppingInput {
  /**
   * @maxItems 100
   */
  buyFirst?: string[];
  /**
   * @maxItems 100
   */
  blacklist?: string[];
  onlyDiscount?: boolean;
  reserveMaxCredit?: boolean;
  forceShoppingIfCreditFull?: boolean;
  maxCredit?: number;
}
export interface MallVisitFriendsInput {
  oncePerDay?: boolean;
}
export interface InfrastAutoRoomInput {
  target: AtomicRoomTargetInput;
  route?: 'room' | 'overview';
  threshold?: number;
  /**
   * @maxItems 500
   */
  excludedNames?: string[];
  /**
   * @maxItems 5
   */
  requiredNames?: string[];
}
export interface InfrastEnumerateRoomsInput {
  /**
   * @minItems 1
   * @maxItems 7
   */
  facilities: ('Mfg' | 'Trade' | 'Power' | 'Control' | 'Reception' | 'Office' | 'Dorm')[];
}
export interface InfrastDailyInput {
  /**
   * @minItems 1
   * @maxItems 7
   */
  facilities?: ('Mfg' | 'Trade' | 'Power' | 'Control' | 'Reception' | 'Office' | 'Dorm')[];
  threshold?: number;
}
