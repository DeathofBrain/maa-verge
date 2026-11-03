import { AtomicFailure, checkCancelled } from '../core/errors';
import type {
  AtomicBox,
  AtomicExecutionContext,
  AtomicExecutionPort,
  AtomicFrame,
  AtomicMatch,
  AtomicRecognition,
  AtomicOperation,
} from '../core/types';
import type { AtomicRule, VisionResourceProfile } from '../resources/types';
import { waitForDuration } from './wait';

export type VisionOptions = {
  /** 规则、ROI 和点击目标共同使用的参考画布，不假定具体游戏分辨率。 */
  referenceSize: [number, number];
  /** 命中点击或返回后的页面稳定等待；功能按自身页面设置，通用层默认不等待。 */
  settleMs?: number;
};

/** 同根调用只传宿主签发的帧身份与尺寸；PNG 保留在宿主缓存，不参与坐标输入。 */
export type VisionFrameReference = Pick<AtomicFrame, 'frameId' | 'width' | 'height'>;
/** current 明确要求在当前调用内截图；已有引用不会因失效而自动刷新或重放。 */
export type VisionFrameInput = VisionFrameReference | 'current';

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** 通用视觉原语；参考尺寸和页面等待由调用功能明确提供。 */
export class Vision<Profile extends VisionResourceProfile = VisionResourceProfile> {
  readonly options: VisionOptions;

  constructor(
    readonly port: AtomicExecutionPort,
    readonly profile: Profile,
    options: VisionOptions,
    readonly context: AtomicExecutionContext = {},
  ) {
    // 在任何设备调用前验证坐标约定，并复制配置，避免调用方改写后影响运行中的实例。
    if (
      options.referenceSize.length !== 2 ||
      !options.referenceSize.every((size) => Number.isSafeInteger(size) && size > 0) ||
      (options.settleMs !== undefined &&
        (!Number.isFinite(options.settleMs) || options.settleMs < 0))
    )
      throw new AtomicFailure('视觉参考尺寸或页面等待配置无效');
    this.options = structuredClone(options);
  }

  /** 已登记调用走 L1 的同一契约；独立注入端口的 TS 使用者也保留原入口。 */
  private async execute(operation: AtomicOperation, input: Record<string, unknown>) {
    if (!this.context.invoke) return this.port.execute(operation, input, this.context);
    const result = await this.context.invoke(`operation.${operation}`, input);
    if (result.status !== 'completed')
      throw new AtomicFailure(
        result.message ?? '最小原语未完成',
        result.status === 'failed' || result.status === 'unavailable' ? result.status : 'unknown',
      );
    return result.data;
  }

  /** 取得带宿主帧身份的画面；只检查结构和坐标比例，授权及有效期仍由宿主判定。 */
  async frame(): Promise<AtomicFrame> {
    checkCancelled(this.context);
    const frame = (await this.execute('frame', {})) as AtomicFrame;
    if (!frame || typeof frame.data !== 'string')
      throw new AtomicFailure('设备未返回可绑定识别结果的有效画面', 'unknown');
    this.validateFrame(frame);
    return frame;
  }

  /** 引用只用于坐标换算；真实性、租约、输入代际和 TTL 仍由有限宿主端口验证。 */
  private validateFrame(frame: VisionFrameReference): void {
    if (
      !frame ||
      typeof frame.frameId !== 'string' ||
      !frame.frameId.length ||
      frame.frameId.length > 200 ||
      !Number.isInteger(frame.width) ||
      !Number.isInteger(frame.height) ||
      frame.width < 1 ||
      frame.height < 1 ||
      frame.width > 8192 ||
      frame.height > 8192
    )
      throw new AtomicFailure('帧引用的身份或尺寸无效');
    // 允许等比例缩放；拒绝通过拉伸猜测操作坐标，具体功能自行选择参考画布。
    const [width, height] = this.options.referenceSize;
    if (frame.width * height !== frame.height * width) {
      const divisor = gcd(width, height);
      throw new AtomicFailure(
        `当前画面不符合 ${width / divisor}:${height / divisor} 参考比例；未对非标准画面猜测坐标`,
        'unavailable',
      );
    }
  }

  /** 根图建立后才解析 current；显式旧引用保持原身份，绝不静默改取新帧。 */
  async resolveFrame(frame?: VisionFrameInput): Promise<VisionFrameReference> {
    checkCancelled(this.context);
    if (frame === undefined || frame === 'current') return this.frame();
    this.validateFrame(frame);
    return frame;
  }

  /** 只解析功能已登记的规则 ID，不接收模型给出的文件路径。 */
  rule(id: string): AtomicRule {
    const rule = this.profile.rules[id];
    if (!rule) throw new AtomicFailure(`当前资源缺少已登记规则：${id}`, 'unavailable');
    return rule;
  }

  /** 识别给定帧中的参考坐标区域，返回该帧证据；不会隐式截图或执行输入。 */
  async recognize(
    frame: VisionFrameReference,
    rule: AtomicRule,
    roi = rule.roi,
  ): Promise<AtomicRecognition> {
    checkCancelled(this.context);
    this.validateFrame(frame);
    const [width, height] = this.options.referenceSize;
    // 先限制请求 ROI，再携带原帧 ID 交给宿主，保持多条识别消费同一画面的语义。
    if (
      roi &&
      (roi[0] < 0 ||
        roi[1] < 0 ||
        roi[2] <= 0 ||
        roi[3] <= 0 ||
        roi[0] + roi[2] > width ||
        roi[1] + roi[3] > height)
    )
      throw new AtomicFailure('相对识别区域超出参考画面');
    const { source: _source, id: _id, expected, ...params } = rule;
    const result = (await this.execute('recognize', {
      ...params,
      frameId: frame.frameId,
      roi,
      referenceSize: [width, height],
    })) as AtomicRecognition;
    // 只有原生明确确认了参考坐标空间，位置结果才可供上层后续操作使用。
    if (
      !result ||
      !Array.isArray(result.matches) ||
      result.matches.length > 256 ||
      result.coordinateSize?.[0] !== width ||
      result.coordinateSize?.[1] !== height
    )
      throw new AtomicFailure('识别器没有确认参考坐标空间', 'unknown');
    for (const match of result.matches) {
      if (
        !Array.isArray(match.box) ||
        match.box.length !== 4 ||
        !match.box.every(Number.isFinite) ||
        match.box[0] < 0 ||
        match.box[1] < 0 ||
        match.box[2] <= 0 ||
        match.box[3] <= 0 ||
        match.box[0] + match.box[2] > width ||
        match.box[1] + match.box[3] > height ||
        !Number.isFinite(match.score)
      )
        throw new AtomicFailure('识别器返回无效位置', 'unknown');
    }
    // OCR 的 expected 是已登记的文本模式；原生返回不等于已经满足功能的命中条件。
    const matches = expected?.length
      ? result.matches.filter(
          (match) =>
            typeof match.text === 'string' &&
            expected.some((pattern) => new RegExp(pattern, 'u').test(match.text!)),
        )
      : result.matches;
    return { ...result, matches, hit: matches.length > 0 };
  }

  /** 在可选指定帧上匹配规则；省略帧时先取得一张新画面，并一同返回。 */
  match(id: string, frame?: AtomicFrame): Promise<{ frame: AtomicFrame } & AtomicRecognition>;
  match(
    id: string,
    frame: VisionFrameInput,
  ): Promise<{ frame: VisionFrameReference } & AtomicRecognition>;
  async match(id: string, frame?: VisionFrameInput) {
    const image = await this.resolveFrame(frame);
    return { frame: image, ...(await this.recognize(image, this.rule(id))) };
  }

  /** 使用框架 OCR 读取文本；坐标和结果仍经过相同参考画布检查。 */
  texts(
    frame?: AtomicFrame,
    roi?: AtomicBox,
  ): Promise<{ frame: AtomicFrame; matches: AtomicMatch[] }>;
  texts(
    frame: VisionFrameInput,
    roi?: AtomicBox,
  ): Promise<{ frame: VisionFrameReference; matches: AtomicMatch[] }>;
  async texts(frame?: VisionFrameInput, roi?: AtomicBox) {
    const image = await this.resolveFrame(frame);
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

  /** 将参考框中心映射到设备坐标并点击一次；接受回执不能证明业务目标已完成。 */
  async click(frame: VisionFrameReference, box: AtomicBox) {
    checkCancelled(this.context);
    this.validateFrame(frame);
    const [width, height] = this.options.referenceSize;
    if (
      box.length !== 4 ||
      !box.every(Number.isFinite) ||
      box[0] < 0 ||
      box[1] < 0 ||
      box[2] <= 0 ||
      box[3] <= 0 ||
      box[0] + box[2] > width ||
      box[1] + box[3] > height
    )
      throw new AtomicFailure('点击区域超出参考画布');
    const x = Math.floor(((box[0] + box[2] / 2) * frame.width) / width);
    const y = Math.floor(((box[1] + box[3] / 2) * frame.height) / height);
    const response = (await this.execute('click', { frameId: frame.frameId, x, y })) as {
      accepted?: boolean;
    };
    // 丢失确认时无法排除点击已经生效，直接报告未知，让上层重新观察而不是重放。
    if (response?.accepted !== true)
      throw new AtomicFailure('点击未获原生确认；必须重新观察，不能重放', 'unknown');
  }

  /** 新帧中选最高分命中点击；仅 optional 允许未命中后无操作返回 false。 */
  async clickRule(id: string, optional = false) {
    const result = await this.match(id);
    if (!result.hit) {
      if (optional) return false;
      throw new AtomicFailure(`当前画面未命中：${id}`);
    }
    const sorted = [...result.matches].sort((a, b) => b.score - a.score);
    await this.click(result.frame, sorted[0]!.box);
    await this.wait(this.options.settleMs ?? 0);
    return true;
  }

  /** 执行已适配的固定点击及该动作明确声明的等待，不解释业务页面。 */
  async action(id: string) {
    const action = this.profile.actions[id];
    if (!action?.box) throw new AtomicFailure(`当前资源缺少动作参数：${id}`, 'unavailable');
    await this.click(await this.frame(), action.box);
    await this.wait(action.delayMs);
  }

  /** 候选顺序是显式配置；只在全部未命中后执行配置中的固定兜底。 */
  async clickFirst(rules: string[], fallbackAction?: string) {
    for (const rule of rules)
      if (this.profile.rules[rule] && (await this.clickRule(rule, true))) return rule;
    if (fallbackAction) {
      await this.action(fallbackAction);
      return fallbackAction;
    }
    throw new AtomicFailure('当前画面未命中任何候选规则');
  }

  /** 单次断言只观察；调用方明确区分未满足与提交后无法确认。 */
  async assertRule(id: string, expected: boolean, message: string, unknown = false) {
    const observation = await this.match(id);
    if (observation.hit !== expected)
      throw new AtomicFailure(message, unknown ? 'unknown' : 'failed');
    return observation;
  }

  /** 有界重复观察不重复输入；同时服从当前根调用剩余期限。 */
  async waitUntil(id: string, expected: boolean, timeoutMs: number, pollMs = 250) {
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 90000 ||
      !Number.isInteger(pollMs) ||
      pollMs < 1 ||
      pollMs > 5000
    )
      throw new AtomicFailure('等待期限或观察间隔无效');
    const deadline = Math.min(Date.now() + timeoutMs, this.context.deadline ?? Infinity);
    while (true) {
      checkCancelled(this.context);
      const observation = await this.match(id);
      if (observation.hit === expected) return observation;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new AtomicFailure(`等待规则超时：${id}`, 'unknown');
      await this.wait(Math.min(pollMs, remaining));
    }
  }

  /** 显式参考坐标滑动，转换后交由最小原语校验帧与持续时间。 */
  async swipe(
    frame: VisionFrameReference,
    from: [number, number],
    to: [number, number],
    durationMs = 300,
  ) {
    checkCancelled(this.context);
    this.validateFrame(frame);
    const [width, height] = this.options.referenceSize;
    if (
      ![...from, ...to].every(Number.isFinite) ||
      [from, to].some(([x, y]) => x < 0 || y < 0 || x >= width || y >= height)
    )
      throw new AtomicFailure('滑动位置超出参考画布');
    const result = (await this.execute('swipe', {
      frameId: frame.frameId,
      x1: Math.floor((from[0] * frame.width) / width),
      y1: Math.floor((from[1] * frame.height) / height),
      x2: Math.floor((to[0] * frame.width) / width),
      y2: Math.floor((to[1] * frame.height) / height),
      durationMs,
    })) as { accepted?: boolean };
    if (result?.accepted !== true) throw new AtomicFailure('滑动未获原生确认；不会重放', 'unknown');
  }

  /** 可取消的页面等待；两条退出路径都清理另一条路径的定时器或监听器。 */
  async wait(ms: number) {
    await waitForDuration(ms, this.context);
  }

  /** 使用新帧发出一次返回按键，确认后按当前功能配置等待页面稳定。 */
  async back() {
    return this.pressKey('back');
  }

  /** 按键不引入额外导航策略，只发送明确支持的 back/escape 一次。 */
  async pressKey(key: 'back' | 'escape') {
    const frame = await this.frame();
    const result = (await this.execute('press_key', { frameId: frame.frameId, key })) as {
      accepted?: boolean;
    };
    if (result?.accepted !== true) throw new AtomicFailure('返回动作未获确认', 'unknown');
    await this.wait(this.options.settleMs ?? 0);
  }
}
