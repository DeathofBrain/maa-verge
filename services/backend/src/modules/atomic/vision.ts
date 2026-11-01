import type {
  AtomicBox,
  AtomicExecutionContext,
  AtomicExecutionPort,
  AtomicFrame,
  AtomicMatch,
  AtomicOperatorCard,
  AtomicOperatorObservation,
  AtomicRecognition,
  AtomicResourceProfile,
  AtomicRule,
} from './types';

export class AtomicFailure extends Error {
  constructor(
    message: string,
    readonly status: 'failed' | 'unavailable' | 'unknown' = 'failed',
  ) {
    super(message);
  }
}
export const checkCancelled = (context: AtomicExecutionContext) => context.signal?.throwIfAborted();
export const moveBox = (anchor: AtomicBox, offset: AtomicBox): AtomicBox => [
  anchor[0] + offset[0],
  anchor[1] + offset[1],
  offset[2],
  offset[3],
];
export const ordered = (matches: AtomicMatch[]) =>
  [...matches].sort((a, b) =>
    Math.abs(a.box[0] - b.box[0]) < 5 ? a.box[1] - b.box[1] : a.box[0] - b.box[0],
  );

/** All semantic observations below are composed from real, frame-bound recognitions. */
export class AtomicVision {
  constructor(
    readonly port: AtomicExecutionPort,
    readonly profile: AtomicResourceProfile,
    readonly context: AtomicExecutionContext = {},
  ) {}

  async frame(): Promise<AtomicFrame> {
    checkCancelled(this.context);
    const frame = (await this.port.execute('frame', {}, this.context)) as AtomicFrame;
    if (
      !frame ||
      typeof frame.frameId !== 'string' ||
      typeof frame.data !== 'string' ||
      !Number.isInteger(frame.width) ||
      !Number.isInteger(frame.height) ||
      frame.width < 1 ||
      frame.height < 1
    )
      throw new AtomicFailure('设备未返回可绑定识别结果的有效画面', 'unknown');
    if (frame.width * 720 !== frame.height * 1280)
      throw new AtomicFailure(
        '当前基建适配仅支持游戏的 16:9 画面；未对非标准画面猜测坐标',
        'unavailable',
      );
    return frame;
  }

  rule(id: string): AtomicRule {
    const rule = this.profile.rules[id];
    if (!rule) throw new AtomicFailure(`当前资源缺少已登记规则：${id}`, 'unavailable');
    return rule;
  }

  async recognize(
    frame: AtomicFrame,
    rule: AtomicRule,
    roi = rule.roi,
  ): Promise<AtomicRecognition> {
    checkCancelled(this.context);
    if (
      roi &&
      (roi[0] < 0 ||
        roi[1] < 0 ||
        roi[2] <= 0 ||
        roi[3] <= 0 ||
        roi[0] + roi[2] > 1280 ||
        roi[1] + roi[3] > 720)
    )
      throw new AtomicFailure('相对识别区域超出画面；当前卡片布局未适配');
    const { source: _source, id: _id, expected, ...params } = rule;
    const result = (await this.port.execute(
      'recognize',
      {
        ...params,
        frameId: frame.frameId,
        roi,
        referenceSize: [1280, 720],
      },
      this.context,
    )) as AtomicRecognition;
    if (
      !result ||
      !Array.isArray(result.matches) ||
      result.matches.length > 256 ||
      result.coordinateSize?.[0] !== 1280 ||
      result.coordinateSize?.[1] !== 720
    )
      throw new AtomicFailure('识别器没有确认基建参考坐标空间', 'unknown');
    for (const match of result.matches) {
      if (
        !Array.isArray(match.box) ||
        match.box.length !== 4 ||
        !match.box.every(Number.isFinite) ||
        match.box[0] < 0 ||
        match.box[1] < 0 ||
        match.box[2] <= 0 ||
        match.box[3] <= 0 ||
        match.box[0] + match.box[2] > 1280 ||
        match.box[1] + match.box[3] > 720 ||
        !Number.isFinite(match.score)
      )
        throw new AtomicFailure('识别器返回无效位置', 'unknown');
    }
    const matches = expected?.length
      ? result.matches.filter(
          (match) =>
            typeof match.text === 'string' &&
            expected.some((pattern) => new RegExp(pattern, 'u').test(match.text!)),
        )
      : result.matches;
    return { ...result, matches, hit: matches.length > 0 };
  }

  async match(id: string, frame?: AtomicFrame) {
    const image = frame ?? (await this.frame());
    return { frame: image, ...(await this.recognize(image, this.rule(id))) };
  }

  async texts(
    frame?: AtomicFrame,
    roi?: AtomicBox,
  ): Promise<{ frame: AtomicFrame; matches: AtomicMatch[] }> {
    const image = frame ?? (await this.frame());
    const result = await this.recognize(
      image,
      {
        id: 'text',
        kind: 'ocr',
        source: {
          repository: 'https://github.com/MaaXYZ/MaaFramework',
          ref: 'v5.14.3',
          path: 'docs/zh_cn/3.1-任务流水线协议.md',
        },
      },
      roi,
    );
    return { frame: image, matches: result.matches };
  }

  async click(frame: AtomicFrame, box: AtomicBox) {
    checkCancelled(this.context);
    const x = Math.floor(((box[0] + box[2] / 2) * frame.width) / 1280);
    const y = Math.floor(((box[1] + box[3] / 2) * frame.height) / 720);
    const response = (await this.port.execute(
      'click',
      { frameId: frame.frameId, x, y },
      this.context,
    )) as { accepted?: boolean };
    if (response?.accepted !== true)
      throw new AtomicFailure('点击未获原生确认；必须重新观察，不能重放', 'unknown');
  }

  async clickRule(id: string, optional = false) {
    const result = await this.match(id);
    if (!result.hit) {
      if (optional) return false;
      throw new AtomicFailure(`当前画面未命中：${id}`);
    }
    const sorted = [...result.matches].sort((a, b) => b.score - a.score);
    await this.click(result.frame, sorted[0]!.box);
    await this.wait(300);
    return true;
  }

  async action(id: string) {
    const action = this.profile.actions[id];
    if (!action?.box) throw new AtomicFailure(`当前资源缺少动作参数：${id}`, 'unavailable');
    await this.click(await this.frame(), action.box);
    await this.wait(action.delayMs);
  }

  async wait(ms: number) {
    checkCancelled(this.context);
    if (ms <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const signal = this.context.signal;
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, ms);
      const abort = () => {
        clearTimeout(timer);
        reject(signal?.reason ?? new Error('已取消'));
      };
      signal?.addEventListener('abort', abort, { once: true });
    });
    checkCancelled(this.context);
  }

  async back() {
    const frame = await this.frame();
    const result = (await this.port.execute(
      'press_key',
      { frameId: frame.frameId, key: 'back' },
      this.context,
    )) as { accepted?: boolean };
    if (result?.accepted !== true) throw new AtomicFailure('返回动作未获确认', 'unknown');
    await this.wait(300);
  }

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

  async clickCard(card: AtomicOperatorCard) {
    const config = this.profile.card;
    if (!config) throw new AtomicFailure('当前资源没有卡片位置适配', 'unavailable');
    // Observing a whole page can take longer than an action token's validity window.
    // Bind the mutation to a new frame and re-read the precise card name, not its old token.
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
      .map((match) => match.text?.trim())
      .filter(Boolean);
    if (names.length !== 1 || names[0] !== card.name)
      throw new AtomicFailure('操作前干员姓名与原观察不一致，未点击');
    await this.click(frame, card.box);
    await this.wait(300);
  }

  async operators(): Promise<AtomicOperatorObservation> {
    const config = this.profile.card;
    if (!config) throw new AtomicFailure('当前资源的干员卡片参数未适配', 'unavailable');
    const frame = await this.frame();
    const anchors: AtomicMatch[] = [];
    for (const region of config.regions)
      for (let index = 0; index < 3; index++) {
        const rule = this.rule(`operators.anchor.${index}`);
        for (const match of (await this.recognize(frame, rule, region)).matches)
          if (
            !anchors.some(
              (old) =>
                Math.abs(old.box[0] - match.box[0]) < 10 &&
                Math.abs(old.box[1] - match.box[1]) < 10,
            )
          )
            anchors.push(match);
      }
    const completeAnchors = anchors.filter((anchor) => {
      const region = config.regions.find(
        (region) => anchor.box[1] >= region[1] && anchor.box[1] < region[1] + region[3],
      );
      if (!region) return false;
      const boxes = [
        moveBox(anchor.box, config.nameOffset),
        moveBox(anchor.box, config.facilityOffset),
        moveBox(anchor.box, config.selectedOffset),
        moveBox(moveBox(anchor.box, config.selectedOffset), config.clickOffset),
      ];
      // Upstream ignores partial cards at the scroll edges. Their truncated name must not
      // make the whole page unreadable or become an actionable identity.
      return boxes.every(
        (box) =>
          box[0] >= region[0] &&
          box[0] + box[2] <= region[0] + region[2] &&
          box[1] >= 0 &&
          box[1] + box[3] <= 720,
      );
    });
    if (!completeAnchors.length)
      throw new AtomicFailure('未识别到完整基建干员卡片；不会在未知页面选人');
    const cards = [];
    for (const anchor of ordered(completeAnchors)) {
      const nameResult = await this.recognize(
        frame,
        this.rule('operators.name'),
        moveBox(anchor.box, config.nameOffset),
      );
      const names = nameResult.matches
        .map((match) => match.text?.trim())
        .filter((name): name is string => Boolean(name));
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
      cards.push({
        name: names[0]!,
        selected: selected.matches.some(
          (match) => typeof match.count === 'number' && match.count >= config.selectedCount,
        ),
        box: moveBox(moveBox(anchor.box, config.selectedOffset), config.clickOffset),
        stationedIn:
          stationed.matches
            .map((match) => match.text ?? '')
            .join('')
            .replace(/[^BF0-9]/g, '') || undefined,
      });
    }
    if (new Set(cards.map((card) => card.name)).size !== cards.length)
      throw new AtomicFailure('同页出现重复姓名，无法确定干员身份');
    const counters = (await this.texts(frame, [0, 0, 1280, 120])).matches
      .flatMap((match) => [...(match.text ?? '').matchAll(/([0-5])\s*[/／]\s*([1-5])/g)])
      .map((match) => `${match[1]}/${match[2]}`);
    const unique = [...new Set(counters)];
    if (unique.length !== 1) throw new AtomicFailure('无法从当前游戏页面确定已选人数与实际容量');
    const [selectedCount, capacity] = unique[0]!.split('/').map(Number);
    if (selectedCount! > capacity!) throw new AtomicFailure('当前进驻计数无效');
    return {
      frameId: frame.frameId,
      cards,
      selectedCount: selectedCount!,
      capacity: capacity!,
      pageIdentity: cards.map((card) => card.name).join('\u0000'),
    };
  }
}
