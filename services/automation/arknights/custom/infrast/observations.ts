/** 在通用视觉原语上提供基建设施、干员卡片与列表的观察和固定动作。 */
import { AtomicFailure } from '#automation/core/errors';
import type {
  AtomicBox,
  AtomicExecutionContext,
  AtomicExecutionPort,
  AtomicFrame,
  AtomicMatch,
} from '#automation/core/types';
import { moveBox, orderMatches } from '#automation/primitives/geometry';
import { Vision } from '#automation/primitives/vision';
import {
  atomicFacilities,
  type OverviewObservation,
  type OverviewRow,
  type TrainingObservation,
  type TrimObservation,
  type AtomicFacility,
  type AtomicOperatorCard,
  type AtomicOperatorObservation,
  type AtomicResourceProfile,
  type AtomicRoomTarget,
  type RoomCapacityEvidence,
} from './types';
import { capacityCeilings, normalize, validateRoomIdentity } from './validation';
import { resolveOperatorName } from './names';
import { decodeFramePixels, type FramePixels } from '#automation/primitives/image';
import { moodProgress, skillBrightness } from './pixels';

type OperatorAnchor = AtomicMatch & { smiley?: 'rest' | 'work' | 'distract' };

// 总览按行、同行按列排序；20 像素容差属于当前游戏布局。
export const roomRowOrder = (a: AtomicMatch, b: AtomicMatch) =>
  Math.abs(a.box[1] - b.box[1]) < 20 ? a.box[0] - b.box[0] : a.box[1] - b.box[1];

// 名单按列、列内按行遍历；保留旧 API 的 5 像素列容差。
export const ordered = (matches: AtomicMatch[]) => orderMatches(matches, 5);

/** 适配当前游戏的 1280×720 参考坐标；通用识别与输入仍经宿主端口执行。 */
export class AtomicVision extends Vision<AtomicResourceProfile> {
  constructor(
    port: AtomicExecutionPort,
    profile: AtomicResourceProfile,
    context: AtomicExecutionContext = {},
  ) {
    super(port, profile, { referenceSize: [1280, 720], settleMs: 300 }, context);
  }

  /** 只读当前总览的完整物理行；章节标题不是房间，屏幕顺序也不产生房间序号。 */
  async overview(): Promise<OverviewObservation> {
    const frame = await this.frame();
    if (!(await this.recognize(frame, this.rule('queue.rotate'))).hit)
      throw new AtomicFailure('当前画面未确认游戏总览的队列轮换入口');
    // 总览的实际房间行有「编辑队列」入口；限定右侧列表区域，排除左侧全局人数与账户信息。
    const region: AtomicBox = [420, 70, 820, 650];
    const texts = (await this.texts(frame, region)).matches;
    const anchors: AtomicMatch[] = [];
    for (const text of texts.filter((item) => /编辑队列/.test(normalize(item.text ?? '')))) {
      if (
        text.box[0] >= 420 &&
        text.box[0] < 700 &&
        !anchors.some((old) => Math.abs(old.box[1] - text.box[1]) < 20)
      )
        anchors.push(text);
    }
    if (!anchors.length)
      throw new AtomicFailure('未确认无遮挡的总览房间行；标题、教程和空列表不能证明房间');
    // 同一物理行只接纳一个设施身份。顶部标题比实际行标题高约一行，不能落入此有界标题带。
    const candidates: { facility: AtomicFacility; label: AtomicMatch; anchor: AtomicMatch }[] = [];
    for (const facility of atomicFacilities) {
      const labels = (
        await this.recognize(frame, this.rule(`facility.label.${facility}`), region)
      ).matches.sort(roomRowOrder);
      for (const label of labels) {
        const owners = anchors.filter(
          (anchor) =>
            label.box[0] >= 420 &&
            label.box[0] < 700 &&
            label.box[1] >= anchor.box[1] - 100 &&
            label.box[1] + label.box[3] <= anchor.box[1] - 15 &&
            anchor.box[1] - 110 >= region[1] &&
            anchor.box[1] + anchor.box[3] + 15 <= 720,
        );
        if (owners.length > 1) throw new AtomicFailure('总览标题同时对应多行，不能证明房间身份');
        if (owners[0]) candidates.push({ facility, label, anchor: owners[0] });
      }
    }
    // 有行锚点却不能唯一识别设施，不能把模糊或遮挡结果当作已验证的部分成功。
    const rows: OverviewRow[] = [];
    const identities = new Set<string>();
    for (const anchor of anchors.sort(roomRowOrder)) {
      const labels = candidates.filter((item) => item.anchor === anchor);
      const facilities = [...new Set(labels.map((item) => item.facility))];
      if (facilities.length !== 1) throw new AtomicFailure('总览房间行的设施身份缺失或冲突');
      const facility = facilities[0]!;
      const label = [...labels].sort((a, b) => b.label.score - a.label.score)[0]!.label;
      const rowTexts = texts.filter(
        (item) =>
          item.box[1] >= anchor.box[1] - 100 && item.box[1] + item.box[3] <= anchor.box[1] - 15,
      );
      const positions = [
        ...new Set(
          rowTexts.flatMap(
            (item) =>
              normalize(item.text ?? '')
                .toUpperCase()
                .match(
                  /(?<![A-Z0-9])(?:B[1-4][0-9]{2}|[1-4]F[0-9]{2}|(?:B[1-4]|[1-4]F)-[1-9])(?![A-Z0-9])/g,
                ) ?? [],
          ),
        ),
      ];
      if (positions.length > 1) throw new AtomicFailure('总览同一行出现冲突的完整房间位置');
      const repeated = ['Mfg', 'Trade', 'Power', 'Dorm'].includes(facility);
      const pattern = this.rule(`facility.label.${facility}`).expected?.join('|');
      const ordinals = [
        ...new Set(
          labels.flatMap(({ label }) => {
            const match = pattern
              ? normalize(label.text ?? '').match(
                  new RegExp(`^(?:${pattern})([1-9])(?:$|[^0-9])`, 'u'),
                )
              : null;
            return match ? [Number(match[1])] : [];
          }),
        ),
      ];
      if (repeated && ordinals.length !== 1)
        throw new AtomicFailure('总览重复设施缺少明确的房间编号，不按 OCR 顺序补造序号');
      const room = repeated ? ordinals[0]! : 1;
      const identity = `${facility}:${positions[0] ?? room}`;
      if (identities.has(identity)) throw new AtomicFailure('不同总览物理行声称同一房间身份');
      identities.add(identity);
      rows.push({
        facility,
        room,
        ...(positions[0] ? { position: positions[0] } : {}),
        box: label.box,
        identity,
      });
    }
    if (!rows.length) throw new AtomicFailure('总览没有完整且身份明确的房间行');
    return { frameId: frame.frameId, rows, texts: texts.map((item) => item.text ?? '') };
  }

  /** 完整大图的独立上界沿用官方 v6.21.2 InfrastInfoTask.cpp 的
   * MiniStationRow/ColumnCount、is_usable_layout 与 is_complete_layout：
   * 生产区是 3×3 格点、宿舍最多四间，单例设施最多一间。
   * 仅全部上界槽位都被实际图标覆盖时证明全集；未解锁、裁切或 Mini 页面保留不可用。 */
  async roomCounts(facilities: AtomicFacility[]) {
    const frame = await this.frame();
    if (!(await this.recognize(frame, this.rule('base.entered'))).hit)
      throw new AtomicFailure('房间全集读取帧没有完整基建主页门禁', 'unavailable');
    const counts: Partial<Record<AtomicFacility, number>> = {};
    const fingerprint: string[] = [];
    if (facilities.some((facility) => ['Mfg', 'Trade', 'Power'].includes(facility))) {
      const rooms: { facility: AtomicFacility; box: AtomicBox }[] = [];
      for (const facility of ['Mfg', 'Trade', 'Power'] as const) {
        const found = (await this.recognize(frame, this.rule(`facility.icon.${facility}`))).matches;
        counts[facility] = found.length;
        rooms.push(...found.map(({ box }) => ({ facility, box })));
      }
      if (rooms.length !== 9)
        throw new AtomicFailure(
          '生产区未观察到全部九个实际房间，不推算隐藏或未解锁房间',
          'unavailable',
        );
      // 官方完整布局还要求三种生产设施均存在；九次同类命中不能单独证明分类完整。
      if (['Mfg', 'Trade', 'Power'].some((facility) => !counts[facility as AtomicFacility]))
        throw new AtomicFailure(
          '生产区未同时观察到制造、贸易与发电设施，未确认全集',
          'unavailable',
        );
      // 坐标只验证完整 3×3 几何覆盖；各位置的设施种类仍来自同帧图标识别。
      const clusters = (values: number[]) =>
        values
          .sort((a, b) => a - b)
          .reduce<number[]>((result, value) => {
            if (!result.some((old) => Math.abs(old - value) < 20)) result.push(value);
            return result;
          }, []);
      const xs = clusters(rooms.map(({ box }) => box[0])),
        ys = clusters(rooms.map(({ box }) => box[1]));
      if (xs.length !== 3 || ys.length !== 3)
        throw new AtomicFailure('生产区图标不构成完整三行三列，未确认可观察全集', 'unavailable');
      const occupied = new Set<string>();
      for (const room of rooms) {
        const x = xs.findIndex((value) => Math.abs(value - room.box[0]) < 20),
          y = ys.findIndex((value) => Math.abs(value - room.box[1]) < 20);
        const cell = `${x}:${y}`;
        if (occupied.has(cell))
          throw new AtomicFailure('生产格点出现重叠或设施身份冲突，未确认全集');
        occupied.add(cell);
        fingerprint.push(`${cell}:${room.facility}`);
      }
    }
    for (const facility of facilities.filter(
      (facility) => !['Mfg', 'Trade', 'Power'].includes(facility),
    )) {
      const result = await this.recognize(frame, this.rule(`facility.icon.${facility}`));
      const expected = facility === 'Dorm' ? 4 : 1;
      if (result.matches.length !== expected)
        throw new AtomicFailure(
          `${facility} 未观察到全部 ${expected} 个独立设施槽位，未确认全集`,
          'unavailable',
        );
      const distinct = result.matches.every((match, index, array) =>
        array
          .slice(0, index)
          .every(
            (old) =>
              Math.abs(match.box[0] - old.box[0]) > 20 || Math.abs(match.box[1] - old.box[1]) > 20,
          ),
      );
      if (!distinct) throw new AtomicFailure('设施槽位图标重叠，未确认房间全集');
      counts[facility] = result.matches.length;
      fingerprint.push(
        `${facility}:${result.matches
          .map(({ box }) => box.slice(0, 2).join(','))
          .sort()
          .join(';')}`,
      );
    }
    return {
      frameId: frame.frameId,
      counts,
      fingerprint: fingerprint.sort().join('|'),
      source: 'base_fixed_slots' as const,
      layoutSource: {
        repository: 'https://github.com/MaaAssistantArknights/MaaAssistantArknights',
        ref: 'v6.21.2',
        path: 'src/MaaCore/Task/Infrast/InfrastInfoTask.cpp',
        node: 'is_complete_layout',
      },
    };
  }

  /** 同帧核对目标和进驻面板状态；面板未开只返回 false，不能因底层房间标题仍可见而假定已开。 */
  async roomPanel(target: AtomicRoomTarget, image?: AtomicFrame) {
    validateRoomIdentity(target);
    const frame = image ?? (await this.frame());
    const title = await this.recognize(
      frame,
      this.rule(`facility.label.${target.facility}`),
      [360, 0, 460, 100],
    );
    if (!title.hit) throw new AtomicFailure('人数读取帧的设施标题与目标不符');
    if (target.position) {
      const header = (await this.texts(frame, [360, 0, 460, 100])).matches;
      const position = normalize(target.position).toUpperCase();
      if (
        !header.some((item) =>
          new RegExp(`(?:^|[^A-Z0-9])${position}(?:$|[^A-Z0-9])`, 'u').test(
            normalize(item.text ?? '').toUpperCase(),
          ),
        )
      )
        throw new AtomicFailure('人数读取帧无法核对完整房间位置');
    }
    const panel = (await this.texts(frame, [820, 0, 460, 80])).matches;
    return {
      frame,
      present: panel.some((item) => /当前房间(?:入住|进驻)信息/.test(normalize(item.text ?? ''))),
    };
  }

  /** 进驻标签是切换开关；已开时无输入，未开时只点击一次，之后只读等待，未知绝不补点。 */
  async ensureRoomPanel(target: AtomicRoomTarget): Promise<void> {
    const before = await this.roomPanel(target);
    if (before.present) return;
    const button = await this.recognize(before.frame, this.rule('room.stationed'));
    if (button.matches.length !== 1)
      throw new AtomicFailure('未唯一识别当前目标房间的进驻信息入口，未点击', 'unavailable');
    await this.click(before.frame, button.matches[0]!.box);
    // 输入一经接受只观察面板出现；即使界面迟缓或标题消失，也不能再次触发这个切换按钮。
    try {
      const deadline = Math.min(Date.now() + 5000, this.context.deadline ?? Infinity);
      while (true) {
        if ((await this.roomPanel(target)).present) return;
        const remaining = deadline - Date.now();
        if (remaining <= 0)
          throw new AtomicFailure('进驻信息入口已点击，但目标面板未能确认', 'unknown');
        await this.wait(Math.min(200, remaining));
      }
    } catch (error) {
      throw new AtomicFailure(error instanceof Error ? error.message : String(error), 'unknown');
    }
  }

  /** 从已打开的进驻信息面板取实际计数；标题、目标位置和人数必须来自同一帧。 */
  async roomCapacity(target: AtomicRoomTarget): Promise<RoomCapacityEvidence> {
    const { frame, present } = await this.roomPanel(target);
    if (!present) throw new AtomicFailure('当前画面未确认房间进驻信息面板', 'unavailable');
    // 只读底部明确标注的计数，避开干员心情、全局进驻上限和其他数字。
    const text = (await this.texts(frame, [1040, 650, 240, 70])).matches
      .sort((a, b) => a.box[0] - b.box[0])
      .map((item) => normalize(item.text ?? ''))
      .join('');
    const counters = [...text.matchAll(/进驻人数([0-5])[/／]([1-5])(?![0-9])/g)];
    if (counters.length !== 1)
      throw new AtomicFailure('未唯一读出房间面板明确标注的进驻人数与实际容量', 'unavailable');
    const occupied = Number(counters[0]![1]),
      capacity = Number(counters[0]![2]);
    if (occupied > capacity || capacity > capacityCeilings[target.facility])
      throw new AtomicFailure('房间面板人数或实际容量与设施硬性上限冲突');
    return {
      source: 'room_panel',
      frameId: frame.frameId,
      target: structuredClone(target),
      occupied,
      capacity,
    };
  }

  /** 确认专用鲜帧：位置只能来自目标房间标题带，不能借卡片的原进驻位置或缓存证明。 */
  async confirmTarget(target: AtomicRoomTarget, image?: AtomicFrame): Promise<AtomicFrame> {
    validateRoomIdentity(target);
    const frame = image ?? (await this.frame());
    const header: AtomicBox = target.facility === 'Training' ? [0, 0, 820, 150] : [0, 70, 400, 80];
    const inHeader = (item: AtomicMatch) =>
      item.box[0] >= header[0] &&
      item.box[1] >= header[1] &&
      item.box[0] + item.box[2] <= header[0] + header[2] &&
      item.box[1] + item.box[3] <= header[1] + header[3];
    const title = (
      await this.recognize(frame, this.rule(`facility.label.${target.facility}`), header)
    ).matches.filter(inHeader);
    if (!title.length)
      throw new AtomicFailure('确认新帧无法证明当前实际设施，未点击', 'unavailable');
    // 同帧标题带必须给出唯一身份；不能仅因混杂文字中包含目标设施或位置就接受。
    const labels = [...title, ...(await this.texts(frame, header)).matches.filter(inHeader)];
    const conflictingFacility = atomicFacilities.some(
      (facility) =>
        facility !== target.facility &&
        this.profile.rules[`facility.label.${facility}`]?.expected?.some((pattern) =>
          labels.some((item) => new RegExp(pattern, 'u').test(item.text ?? '')),
        ),
    );
    if (conflictingFacility)
      throw new AtomicFailure('确认新帧的房间标题存在设施身份冲突，未点击', 'unavailable');
    const positions = [
      ...new Set(
        labels.flatMap(
          (item) =>
            normalize(item.text ?? '')
              .toUpperCase()
              .match(
                /(?<![A-Z0-9])(?:B[1-4][0-9]{2}|[1-4]F[0-9]{2}|(?:B[1-4]|[1-4]F)-[1-9])(?![A-Z0-9])/g,
              ) ?? [],
        ),
      ),
    ];
    if (
      positions.length > 1 ||
      (target.position && positions[0] !== normalize(target.position).toUpperCase())
    )
      throw new AtomicFailure('确认新帧无法从房间标题唯一证明完整位置，未点击', 'unavailable');
    return frame;
  }

  /** 只读受训者和锁定状态；无法确认空闲或有效倒计时时拒绝推断，也不领取奖励。 */
  async training(image?: AtomicFrame): Promise<TrainingObservation> {
    const frame = image ?? (await this.frame());
    const idle = await this.recognize(frame, this.rule('training.idle'));
    const clock = await this.recognize(frame, this.rule('training.processing'));
    const locked = clock.matches.some((item) => /\d{1,2}:\d{2}/.test(item.text ?? ''));
    if (!idle.hit && !locked)
      throw new AtomicFailure(
        '训练状态既非已确认空闲也非有效剩余时间；不领取完成奖励或猜测锁定状态',
      );
    // 上游规则返回“姓名＋技能”的多行文本；锁定状态必须能唯一读出受训者。
    const nameSkill = await this.recognize(frame, this.rule('training.operator'));
    const names = [
      ...new Set(
        nameSkill.matches
          .filter((item) => (item.text ?? '').includes('\n'))
          .map((item) => item.text?.split('\n')[0]?.replace(/^\[/, '').trim())
          .filter((item): item is string => Boolean(item)),
      ),
    ];
    if (names.length > 1 || (locked && names.length !== 1))
      throw new AtomicFailure('无法唯一重读受训者姓名');
    const name = names[0] ? resolveOperatorName(this.profile, names[0]) : undefined;
    if (name && name.nameVerified !== true)
      throw new AtomicFailure(
        '受训者姓名未与同代官方字典精确匹配，无法核验训练角色',
        'unavailable',
      );
    return { frameId: frame.frameId, locked, ...(name ? { trainee: name.name } : {}) };
  }

  /** 保留整顿页的原始文字证据；文字存在本身不能证明整顿已经完成。 */
  async trimObservation(): Promise<TrimObservation> {
    const frame = await this.frame();
    return {
      frameId: frame.frameId,
      texts: (await this.texts(frame)).matches.map((item) => item.text ?? ''),
    };
  }

  /** 用已适配的名单区域翻页；只报告输入被接受，是否到达边界由上层重读页面判断。 */
  async swipeOperators(direction: 'left' | 'right' = 'right') {
    const frame = await this.frame();
    const points = direction === 'right' ? [1000, 350, 400, 350] : [400, 350, 1150, 350];
    const result = (await this.port.execute(
      'swipe',
      {
        frameId: frame.frameId,
        x1: Math.round((points[0]! * frame.width) / 1280),
        y1: Math.round((points[1]! * frame.height) / 720),
        x2: Math.round((points[2]! * frame.width) / 1280),
        y2: Math.round((points[3]! * frame.height) / 720),
        durationMs: 500,
        profile: 'navigation',
        compensationDirection: 'none',
      },
      this.context,
    )) as { accepted?: boolean };
    if (result?.accepted !== true) throw new AtomicFailure('滑动结果未知，不自动重放', 'unknown');
    await this.wait(500);
  }

  /** 沿总览列表向下浏览一次；失去原生确认后交由上层返回未知，不能重复滑动。 */
  async swipeOverview() {
    const frame = await this.frame();
    const result = (await this.port.execute(
      'swipe',
      {
        frameId: frame.frameId,
        x1: Math.round((650 * frame.width) / 1280),
        y1: Math.round((560 * frame.height) / 720),
        x2: Math.round((650 * frame.width) / 1280),
        y2: Math.round((220 * frame.height) / 720),
        durationMs: 500,
        profile: 'navigation',
        compensationDirection: 'none',
      },
      this.context,
    )) as { accepted?: boolean };
    if (result?.accepted !== true)
      throw new AtomicFailure('总览滚动结果未知，不自动重放', 'unknown');
    await this.wait(500);
  }

  /** card 来自先前观察；点击前在新帧同位置复核完整姓名，避免旧坐标选中其他人。 */
  async clickCard(card: AtomicOperatorCard) {
    const config = this.profile.card;
    if (!config) throw new AtomicFailure('当前资源没有卡片位置适配', 'unavailable');
    if (
      card.nameVerified !== true ||
      resolveOperatorName(this.profile, card.name).nameVerified !== true
    )
      throw new AtomicFailure('干员姓名缺少当前官方字典的精确核验，未点击', 'unavailable');
    // 整页识别可能超过动作令牌时限；点击前取新帧，复核原卡片位置的姓名。
    const anchor: AtomicBox = [
      card.box[0] - config.selectedOffset[0] - config.clickOffset[0],
      card.box[1] - config.selectedOffset[1] - config.clickOffset[1],
      1,
      1,
    ];
    const frame = await this.frame();
    const names = (
      await this.recognize(frame, this.rule('operators.name'), moveBox(anchor, config.nameOffset))
    ).matches
      .filter((match) => typeof match.text === 'string' && Boolean(match.text.trim()))
      .map((match) => resolveOperatorName(this.profile, match.text!));
    if (names.length !== 1 || names[0]!.nameVerified !== true || names[0]!.name !== card.name)
      throw new AtomicFailure('操作前干员姓名与原观察不一致，未点击');
    await this.click(frame, card.box);
    await this.wait(300);
  }

  /** 只定位当前帧内完整卡片，不读取姓名或推断选中总人数；导航就绪与严格观察共用这一门禁。 */
  private async completeOperatorAnchors(frame: AtomicFrame): Promise<OperatorAnchor[]> {
    const config = this.profile.card;
    if (!config) throw new AtomicFailure('当前资源的干员卡片参数未适配', 'unavailable');
    // 三种心情锚点可能重复命中同一张卡，先按位置去重，再检查相对区域是否完整。
    const anchors: OperatorAnchor[] = [];
    for (const region of config.regions)
      for (let index = 0; index < 3; index++) {
        const rule = this.rule(`operators.anchor.${index}`);
        for (const match of (await this.recognize(frame, rule, region)).matches) {
          const old = anchors.find(
            (old) =>
              Math.abs(old.box[0] - match.box[0]) < 10 && Math.abs(old.box[1] - match.box[1]) < 10,
          );
          if (old) {
            // 同一卡片被多个心情模板命中时保留几何，但不能凭登记顺序指定满心情。
            old.smiley = undefined;
          } else
            anchors.push({
              ...match,
              smiley: rule.templateId?.endsWith('SmileyOnRest.png')
                ? 'rest'
                : rule.templateId?.endsWith('SmileyOnWork.png')
                  ? 'work'
                  : rule.templateId?.endsWith('SmileyOnDistract.png')
                    ? 'distract'
                    : undefined,
            });
        }
      }
    return anchors.filter((anchor) => {
      const region = config.regions.find(
        (region) => anchor.box[1] >= region[1] && anchor.box[1] < region[1] + region[3],
      );
      if (!region) return false;
      const boxes = [
        moveBox(anchor.box, config.nameOffset),
        moveBox(anchor.box, config.facilityOffset),
        moveBox(anchor.box, config.selectedOffset),
        moveBox(moveBox(anchor.box, config.selectedOffset), config.clickOffset),
        ...(config.moodOffset ? [moveBox(anchor.box, config.moodOffset)] : []),
        ...(config.skillOffset ? [moveBox(anchor.box, config.skillOffset)] : []),
      ];
      // 跳过滚动边缘的不完整卡片，避免截断姓名成为可操作的干员身份。
      return boxes.every(
        (box) =>
          box[0] >= region[0] &&
          box[0] + box[2] <= region[0] + region[2] &&
          box[1] >= 0 &&
          box[1] + box[3] <= 720,
      );
    });
  }

  /** 导航后的只读就绪标记；只证明完整卡片已出现，姓名和选中状态仍须由 operators 严格解析。 */
  async operatorsReady(): Promise<boolean> {
    return (await this.completeOperatorAnchors(await this.frame())).length > 0;
  }

  /** 从同一帧解析完整卡片和选中标记；不把单页卡片推算成完整名单或房间容量。 */
  async operators(facility?: AtomicFacility): Promise<AtomicOperatorObservation> {
    const config = this.profile.card;
    if (!config) throw new AtomicFailure('当前资源的干员卡片参数未适配', 'unavailable');
    if (
      !this.profile.operatorNames?.names.length ||
      !['Official', 'Bilibili'].includes(this.profile.clientType)
    )
      throw new AtomicFailure('当前客户端缺少同代官方干员姓名字典', 'unavailable');
    const frame = await this.frame();
    const completeAnchors = await this.completeOperatorAnchors(frame);
    if (!completeAnchors.length)
      throw new AtomicFailure('未识别到完整基建干员卡片；不会在未知页面选人');
    let pixels: FramePixels | undefined;
    if (config.moodOffset || config.skillOffset)
      try {
        pixels = decodeFramePixels(frame);
      } catch {
        /* 像素不可用只禁用自动策略；明确姓名和选中状态仍由 Framework 严格读取。 */
      }
    // 每张完整卡片分别读取姓名、选中条和进驻位置；姓名歧义会使整次观察失败。
    const cards = [];
    for (const anchor of ordered(completeAnchors) as OperatorAnchor[]) {
      const nameResult = await this.recognize(
        frame,
        this.rule('operators.name'),
        moveBox(anchor.box, config.nameOffset),
      );
      const names = nameResult.matches
        .map((match) => match.text)
        .filter((name): name is string => typeof name === 'string' && Boolean(name.trim()));
      if (new Set(names).size !== 1) throw new AtomicFailure('干员姓名缺失或有歧义，选人已停止');
      const selected = await this.recognize(
        frame,
        {
          id: 'selected',
          kind: 'color',
          method: 40,
          lower: config.selectedLower,
          upper: config.selectedUpper,
          count: config.selectedCount,
          source: this.rule('operators.name').source,
        },
        moveBox(anchor.box, config.selectedOffset),
      );
      const stationed = await this.texts(frame, moveBox(anchor.box, config.facilityOffset));
      const positions = [
        ...new Set(
          stationed.matches.flatMap(
            (match) =>
              normalize(match.text ?? '')
                .toUpperCase()
                .match(
                  /(?<![A-Z0-9])(?:B[1-4][0-9]{2}|[1-4]F[0-9]{2}|(?:B[1-4]|[1-4]F)-[1-9])(?![A-Z0-9])/g,
                ) ?? [],
          ),
        ),
      ];
      cards.push({
        ...resolveOperatorName(this.profile, names[0]!),
        selected: selected.matches.some(
          (match) => typeof match.count === 'number' && match.count >= config.selectedCount,
        ),
        box: moveBox(moveBox(anchor.box, config.selectedOffset), config.clickOffset),
        // 房间位置须完整且唯一；移除斜线会把心情 20/24 伪造成位置 2024。
        stationedIn: positions.length === 1 ? positions[0] : undefined,
        unassigned:
          positions.length === 0 &&
          stationed.matches.some((match) => normalize(match.text ?? '') === '未进驻'),
        ...(anchor.smiley === 'rest' || anchor.smiley === 'distract'
          ? { mood: { ratio: anchor.smiley === 'rest' ? 1 : 0, source: 'smiley' as const } }
          : pixels &&
              config.moodOffset &&
              config.moodLower !== undefined &&
              config.moodDifference !== undefined
            ? {
                mood: {
                  ratio: moodProgress(
                    pixels,
                    moveBox(anchor.box, config.moodOffset),
                    config.moodLower,
                    config.moodDifference,
                  ),
                  source: 'progress_bar' as const,
                },
              }
            : {}),
        ...(pixels && facility && config.skillOffset
          ? { skills: await this.operatorSkills(frame, pixels, anchor.box, facility) }
          : {}),
      });
    }
    if (new Set(cards.map((card) => card.name)).size !== cards.length)
      throw new AtomicFailure('同页出现重复姓名，无法确定干员身份');
    // 真实名单页没有统一人数栏，卡片的 20/24 是心情；此处保留容量与总人数未知。
    // pageIdentity 只识别重复页面，不能证明跨页名单完整；修改和提交由上层另行要求完整证据。
    return {
      frameId: frame.frameId,
      cards,
      nameSource: structuredClone(this.profile.operatorNames.source),
      pageIdentity: cards.map((card) => card.name).join('\u0000'),
    };
  }

  /** 每个亮起技能只接纳相同技能族的有限近似匹配；跨族歧义不参与自动候选评分。 */
  private async operatorSkills(
    frame: AtomicFrame,
    pixels: FramePixels,
    anchor: AtomicBox,
    facility: AtomicFacility,
  ): Promise<string[]> {
    const config = this.profile.card!,
      offset = config.skillOffset!;
    const catalog = this.profile.skills?.[facility] ?? [];
    const ids: string[] = [];
    for (let index = 0; index < 2; index++) {
      const roi = moveBox(anchor, [
        offset[0] + index * (offset[2] - offset[3]),
        offset[1],
        offset[3],
        offset[3],
      ]);
      if (skillBrightness(pixels, roi) < (config.skillBrightness ?? Infinity)) continue;
      const matches: { id: string; score: number }[] = [];
      for (const skill of catalog) {
        const result = await this.recognize(frame, skill.rule, roi);
        if (result.hit)
          matches.push({
            id: skill.id,
            score: Math.max(...result.matches.map((match) => match.score)),
          });
      }
      if (!matches.length) continue;
      matches.sort((a, b) => b.score - a.score);
      const best = matches[0]!,
        family = best.id.replace(/[0-9]+$/u, '');
      const near = matches.filter((match) => best.score - match.score <= 0.05);
      if (near.some((match) => match.id.replace(/[0-9]+$/u, '') !== family)) continue;
      near.sort(
        (a, b) => Number(b.id.slice(family.length) || 0) - Number(a.id.slice(family.length) || 0),
      );
      ids.push(near[0]!.id);
    }
    return [...new Set(ids)];
  }
}

/** 只读设施入口并返回视图证据；纯色 Mini 也会命中 Full 色条，不能独自证明缩略视图。 */
export async function observeFacility(vision: AtomicVision, facility: AtomicFacility) {
  const frame = await vision.frame();
  const full = vision.profile.rules[`facility.icon.${facility}`];
  const mini = vision.profile.rules[`facility.icon.${facility}.mini`];
  const normal = full ? await vision.recognize(frame, full) : { matches: [], hit: false };
  const pureColor = ['Mfg', 'Trade', 'Power'].includes(facility);
  if (pureColor && normal.hit)
    return { frame, matches: ordered(normal.matches), view: 'normal' as const };
  const small = mini ? await vision.recognize(frame, mini) : { matches: [], hit: false };
  if (pureColor && small.hit)
    return { frame, matches: ordered(small.matches), view: 'unknown' as const };
  const best = (matches: AtomicMatch[]) => Math.max(0, ...matches.map((match) => match.score));
  if (normal.hit || small.hit)
    return best(normal.matches) >= best(small.matches)
      ? { frame, matches: ordered(normal.matches), view: 'normal' as const }
      : { frame, matches: ordered(small.matches), view: 'mini' as const };
  // 图标未命中时仅提供文字候选，并保留视图未知，后续入房仍须核对设施与位置。
  const label = await vision.recognize(frame, vision.rule(`facility.label.${facility}`));
  return { frame, matches: ordered(label.matches), view: 'unknown' as const };
}
