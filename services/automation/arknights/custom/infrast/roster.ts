/** 名单语义组件：提供独立名单事件和完整扫描算法，所有修改只影响待选状态，不提交进驻。 */
import { AtomicFailure, checkCancelled } from '#automation/core/errors';
import type { AtomicCapabilityResult, AtomicExecutionContext } from '#automation/core/types';
import type { AtomicOperatorObservation, InfrastDriver, RosterEvidence } from './types';
import { normalize, sameNames } from './validation';

/** 名单组件只依赖当前页观察与待选动作，不能借用房间导航、确认或训练启动能力。 */
export type InfrastRosterDriver = Pick<
  InfrastDriver,
  'operators' | 'resetFilter' | 'page' | 'clickOperator' | 'clear'
>;
type CountedObservation = AtomicOperatorObservation & { capacity: number; selectedCount: number };

/** driver 须已进入目标名单页；扫描与选择都保持当前容量和人数的一致性。 */
export class InfrastRoster {
  constructor(
    readonly driver: InfrastRosterDriver,
    readonly context: AtomicExecutionContext = {},
  ) {}

  private progress(message: string, data?: unknown) {
    checkCancelled(this.context);
    this.context.onProgress?.({ capabilityId: 'game.infrast.prepare_roster', message, data });
  }

  /** 当前页须有完整卡片身份；可选计数存在时核对一致性，但不把缺失计数解释为零。 */
  private requireCurrent(observation: AtomicOperatorObservation) {
    if (
      (observation.capacity !== undefined &&
        (!Number.isInteger(observation.capacity) ||
          observation.capacity < 1 ||
          observation.capacity > 5)) ||
      (observation.selectedCount !== undefined &&
        (!Number.isInteger(observation.selectedCount) ||
          observation.selectedCount < 0 ||
          observation.selectedCount > (observation.capacity ?? 5) ||
          observation.cards.filter((card) => card.selected).length > observation.selectedCount)) ||
      observation.cards.length === 0 ||
      !observation.pageIdentity ||
      observation.cards.some((card) => !normalize(card.name)) ||
      new Set(observation.cards.map((card) => normalize(card.name))).size !==
        observation.cards.length
    )
      throw new AtomicFailure('当前名单容量、已选计数或可见选中状态不一致');
  }

  /** 容量必须有明确来源；真实驱动携带本次入房面板，旧的完整计数适配仍可作为显式来源。 */
  private requireCapacity(observation: AtomicOperatorObservation): number {
    this.requireCurrent(observation);
    const room = observation.room;
    if (
      room &&
      (room.source !== 'room_panel' ||
        !room.frameId ||
        !Number.isInteger(room.capacity) ||
        room.capacity < 1 ||
        room.capacity > 5 ||
        !Number.isInteger(room.occupied) ||
        room.occupied < 0 ||
        room.occupied > room.capacity ||
        (observation.capacity !== undefined && observation.capacity !== room.capacity))
    )
      throw new AtomicFailure('当前名单绑定的房间实际容量证据无效');
    const capacity = room?.capacity ?? observation.capacity;
    if (capacity === undefined)
      throw new AtomicFailure('缺少当前房间实际容量证据，未修改名单', 'unavailable');
    return capacity;
  }

  /** 修改待选状态和证明完整名单前，必须另有实际容量与总人数；单页卡片不提供这种证据。 */
  private requireLimits(
    observation: AtomicOperatorObservation,
  ): asserts observation is CountedObservation {
    this.requireCurrent(observation);
    if (observation.capacity === undefined || observation.selectedCount === undefined)
      throw new AtomicFailure('缺少当前房间实际容量与完整已选人数证据', 'unavailable');
    if (observation.cards.some((card) => card.selected && card.nameVerified !== true))
      throw new AtomicFailure('当前已选姓名未与官方字典精确匹配，未修改名单', 'unavailable');
  }

  /** 单次事件留存前后证据；一旦尝试输入，未能复核的结果保持未知，绝不自动补点或重放。 */
  private async event(
    evidence: Record<string, unknown>,
    execute: (markInput: () => void) => Promise<void>,
  ): Promise<AtomicCapabilityResult> {
    let inputAttempted = false;
    try {
      checkCancelled(this.context);
      await execute(() => {
        checkCancelled(this.context);
        inputAttempted = true;
        evidence.inputAttempted = true;
      });
      checkCancelled(this.context);
      return {
        status: 'completed',
        data: evidence,
        verified: true,
        ...(inputAttempted ? { nativeSuccess: true } : {}),
      };
    } catch (error) {
      return {
        status: this.context.signal?.aborted
          ? 'cancelled'
          : inputAttempted
            ? 'unknown'
            : error instanceof AtomicFailure
              ? error.status
              : 'unknown',
        data: evidence,
        verified: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** 重置筛选由已审阅页面链完成，链末观察只证明返回可读名单，不代表完整名单已收齐。 */
  async resetFilter(): Promise<AtomicCapabilityResult> {
    const evidence: Record<string, unknown> = {};
    return this.event(evidence, async (markInput) => {
      markInput();
      await this.driver.resetFilter();
      const after = await this.driver.operators();
      evidence.after = after;
      this.requireCurrent(after);
    });
  }

  /** 先确认当前名单页，再滑动一次并复读；姓名集合未变也可能位于边缘，不擅自补滑。 */
  async page(direction: 'left' | 'right'): Promise<AtomicCapabilityResult> {
    const evidence: Record<string, unknown> = { direction };
    return this.event(evidence, async (markInput) => {
      const before = await this.driver.operators();
      evidence.before = before;
      this.requireCurrent(before);
      markInput();
      await this.driver.page(direction);
      const after = await this.driver.operators();
      evidence.after = after;
      this.requireCurrent(after);
      if (after.capacity !== before.capacity || after.selectedCount !== before.selectedCount)
        throw new AtomicFailure('翻页后名单容量或已选人数变化，页面状态未确认');
      evidence.pageChanged = after.pageIdentity !== before.pageIdentity;
    });
  }

  /** 只处理当前可见页的唯一完整姓名；状态已满足时不点击，否则仅切换一次并核对人数变化。 */
  async selectOperator(name: string, selected = true): Promise<AtomicCapabilityResult> {
    const evidence: Record<string, unknown> = { name, selected };
    return this.event(evidence, async (markInput) => {
      if (!normalize(name)) throw new AtomicFailure('干员姓名不能为空');
      const before = await this.driver.operators();
      evidence.before = before;
      this.requireLimits(before);
      const matches = before.cards.filter((card) => normalize(card.name) === normalize(name));
      if (matches.length !== 1)
        throw new AtomicFailure('当前可见页没有唯一的完整干员姓名，不翻页猜测或选择近似姓名');
      const card = matches[0]!;
      if (card.nameVerified !== true)
        throw new AtomicFailure('目标干员姓名未与官方字典精确匹配，未点击', 'unavailable');
      if (card.selected === selected) {
        evidence.noop = true;
        evidence.after = before;
        return;
      }
      const expectedCount = before.selectedCount + (selected ? 1 : -1);
      if (expectedCount < 0 || expectedCount > before.capacity)
        throw new AtomicFailure('切换该干员后人数将超出当前名单容量，未点击');
      // 驱动还会在点击前的新帧复核同位置姓名；本事件从不复用旧卡片连续点击。
      evidence.noop = false;
      evidence.expectedCount = expectedCount;
      markInput();
      await this.driver.clickOperator(card);
      const after = await this.driver.operators();
      evidence.after = after;
      this.requireLimits(after);
      const actual = after.cards.filter((item) => normalize(item.name) === normalize(name));
      if (
        after.capacity !== before.capacity ||
        after.selectedCount !== expectedCount ||
        actual.length !== 1 ||
        actual[0]!.selected !== selected
      )
        throw new AtomicFailure('单次点击后的干员选中状态或人数未能复核，不重放');
    });
  }

  /** 清空只尝试一次；容量和人数通过当前页门禁，复读零人数及可见选中条后才确认待选已清空。 */
  async clear(): Promise<AtomicCapabilityResult> {
    const evidence: Record<string, unknown> = {};
    return this.event(evidence, async (markInput) => {
      const before = await this.driver.operators();
      evidence.before = before;
      this.requireLimits(before);
      markInput();
      await this.driver.clear();
      const after = await this.driver.operators();
      evidence.after = after;
      this.requireLimits(after);
      if (after.capacity !== before.capacity || after.selectedCount !== 0)
        throw new AtomicFailure('清空后容量或零人数未能复核，不重复清空');
    });
  }

  /** 按明确总人数收齐；满员模式以同次实际容量为独立上界，不能用于部分或空名单。 */
  async roster(maxCapacity = 5, fullCapacity = false): Promise<RosterEvidence> {
    let current = await this.driver.operators();
    // 未修改的新入房观察可借同次实际进驻数作目标；筛选和翻页不改变待选集合，修改选择才会取消来源。
    const roomEntry = current.selectionOrigin === 'room_entry' && current.room;
    const capacityBound =
      fullCapacity && current.room?.source === 'room_panel'
        ? this.requireCapacity(current)
        : undefined;
    const selectedCount =
      current.selectedCount ?? (roomEntry ? current.room!.occupied : capacityBound);
    if (selectedCount === undefined)
      throw new AtomicFailure('缺少完整已选人数证据，页面不动不能证明名单完整', 'unavailable');
    if (!roomEntry) {
      await this.driver.resetFilter();
      current = await this.driver.operators();
    }
    const capacity = this.requireCapacity(current),
      countOrigin = current.selectedCount;
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > maxCapacity)
      throw new AtomicFailure(
        `当前页面容量 ${capacity} 超出该设施上限 ${maxCapacity}，拒绝使用异常识别结果`,
      );
    const room = current.room ? structuredClone(current.room) : undefined;
    const roomIdentity = JSON.stringify(room);
    const nameSource = current.nameSource ? structuredClone(current.nameSource) : undefined;
    const selected = new Set<string>();
    const states = new Map<string, boolean>();
    const pages = new Set<string>();
    const result = (): RosterEvidence => ({
      operators: [...selected],
      capacity,
      frameId: current.frameId,
      ...(room ? { room } : {}),
      ...(nameSource ? { nameSource } : {}),
    });
    // 整次扫描只接纳同一目标证据和稳定的选中状态；跨页出现相反状态说明画面已混合。
    const collect = (observation: AtomicOperatorObservation) => {
      if (
        this.requireCapacity(observation) !== capacity ||
        observation.selectedCount !== countOrigin ||
        (roomEntry && observation.selectionOrigin !== 'room_entry') ||
        JSON.stringify(observation.room) !== roomIdentity ||
        JSON.stringify(observation.nameSource) !== JSON.stringify(nameSource)
      )
        throw new AtomicFailure('扫描过程中进驻计数发生变化，拒绝使用混合画面确认名单');
      for (const card of observation.cards) {
        if (states.has(card.name) && states.get(card.name) !== card.selected)
          throw new AtomicFailure('扫描过程中同一干员选中状态变化，拒绝混合页面');
        states.set(card.name, card.selected);
        if (card.selected) {
          if (card.nameVerified !== true)
            throw new AtomicFailure(
              '已选干员含未匹配官方字典的原始姓名，名单不完整',
              'unavailable',
            );
          selected.add(card.name);
        }
      }
      if (selected.size > selectedCount)
        throw new AtomicFailure('选中姓名与实际人数或房间容量不一致');
    };
    collect(current);
    if (selectedCount === 0) return result();
    // 不假设调用前的横向位置；先有限回到左边界，途中若已收齐也可提前返回。
    for (let index = 0; index < 100; index++) {
      collect(current);
      if (selected.size === selectedCount) return result();
      const identity = current.pageIdentity;
      await this.driver.page('left');
      current = await this.driver.operators();
      if (current.pageIdentity === identity) break;
      if (index === 99) throw new AtomicFailure('干员列表回到起点超出 100 页界限');
    }
    // 向右仅将相邻相同页面作为终点；非相邻回环或超过上限都不能证明完整遍历。
    for (let index = 0; index < 100; index++) {
      collect(current);
      if (selected.size === selectedCount) return result();
      if (pages.has(current.pageIdentity))
        throw new AtomicFailure('干员列表出现非相邻重复页面，完整边界未确认');
      pages.add(current.pageIdentity);
      const identity = current.pageIdentity;
      await this.driver.page('right');
      current = await this.driver.operators();
      if (current.pageIdentity === identity) {
        collect(current);
        break;
      }
    }
    throw new AtomicFailure(`只识别到 ${selected.size}/${selectedCount} 位已选干员，名单不完整`);
  }
  /** 清空、逐名选择、复核完整名单；这里只准备选择，提交由 setRoom/setTraining 决定。 */
  async selectExact(
    requested: string[],
    maxCapacity: number,
    attempt: Record<string, unknown>,
  ): Promise<RosterEvidence> {
    await this.driver.resetFilter();
    const initial = await this.driver.operators();
    const capacity = this.requireCapacity(initial);
    const capacityBound =
      initial.selectedCount === undefined &&
      initial.room?.source === 'room_panel' &&
      requested.length === capacity;
    if (initial.selectedCount === undefined && !capacityBound)
      throw new AtomicFailure(
        '当前适配无法独立核验清空与修改后的完整人数，未修改名单',
        'unavailable',
      );
    attempt.capacity = capacity;
    const clicked: string[] = [];
    attempt.clicked = clicked;
    if (capacity > maxCapacity) throw new AtomicFailure('实际容量超出当前设施的硬性上限');
    if (requested.length > capacity)
      throw new AtomicFailure(
        `当前房间实际开放 ${capacity} 个位置，不能安排 ${requested.length} 人`,
      );
    // 有独立计数时核对清空后的零人数；满员分支只将清空视为输入尝试，
    // 最终必须重读 capacity 个唯一已选姓名，利用真实容量上界排除隐藏的额外已选者。
    await this.driver.clear();
    let current = await this.driver.operators();
    if (!capacityBound) {
      const cleared = await this.roster(maxCapacity);
      if (cleared.operators.length !== 0)
        throw new AtomicFailure('清空后完整待选名单未归零，已停止');
      if (!requested.length) return cleared;
    }
    // 完整复核可能已滚到右边界，接下来的回左必须以当前实际页为起点，不能使用扫描前的页身份。
    current = await this.driver.operators();
    this.requireCapacity(current);
    for (let index = 0; index < 100; index++) {
      const identity = current.pageIdentity;
      await this.driver.page('left');
      current = await this.driver.operators();
      this.requireCapacity(current);
      if (current.pageIdentity === identity) break;
      if (index === 99) throw new AtomicFailure('干员列表无法确定第一页');
    }
    // 一次只选择当前新帧能证明的姓名；记录已点击目标，出错时保留部分操作证据。
    const selected = new Set<string>(),
      pages = new Set<string>();
    for (let index = 0; index < 100; index++) {
      checkCancelled(this.context);
      if (this.requireCapacity(current) !== capacity)
        throw new AtomicFailure('选人过程中实际容量发生变化');
      const candidates = requested.filter(
        (name) => !selected.has(name) && current.cards.some((card) => card.name === name),
      );
      for (const target of candidates) {
        // 每次修改后重新观察；驱动还会在点击前的新帧复核姓名，不能连续使用旧卡片位置。
        current = await this.driver.operators();
        this.requireCapacity(current);
        const card = current.cards.find((card) => card.name === target);
        if (!card) throw new AtomicFailure(`干员 ${target} 在操作前消失，选人已停止`);
        if (card.nameVerified !== true)
          throw new AtomicFailure('目标姓名未与官方字典精确匹配，未点击', 'unavailable');
        if (card.selected) {
          if (!capacityBound) throw new AtomicFailure('选中状态与本次已确认动作不一致');
          // 清空未获零人数证明时，已满足的目标不再切换；最终满员复读才决定准备成功。
          selected.add(target);
          continue;
        }
        await this.driver.clickOperator(card);
        clicked.push(target);
        this.progress('已点击明确干员，等待重读选中状态', { name: target });
        selected.add(target);
        current = await this.driver.operators();
        this.requireCapacity(current);
        const reread = current.cards.filter((item) => item.name === target);
        if (
          reread.length !== 1 ||
          !reread[0]!.selected ||
          (current.selectedCount !== undefined && current.selectedCount !== selected.size)
        )
          throw new AtomicFailure('点击后干员选中状态或明确计数与请求不一致');
      }
      // 点击次数不是结果证据；确认前再次扫描全部已选姓名，并与请求名单逐项比较。
      if (selected.size === requested.length) {
        const verified = await this.roster(maxCapacity, capacityBound);
        if (!sameNames(verified.operators, requested))
          throw new AtomicFailure('确认前的选中名单与请求不一致');
        return verified;
      }
      if (pages.has(current.pageIdentity)) break;
      pages.add(current.pageIdentity);
      await this.driver.page('right');
      current = await this.driver.operators();
    }
    throw new AtomicFailure(
      `未在完整可读列表中找到：${requested.filter((name) => !selected.has(name)).join('、')}`,
    );
  }
}
