/** 复用同帧观察、一次点击与提交后复读；具体页面、预算和业务含义由功能 provider 登记。 */
import { atomicInputSchemas, atomicCapabilityResultSchema } from '@contracts/atomic-input-schemas';
import { atomicInputValidators } from '@contracts/validators.js';
import type {
  AtomicCapabilityResult,
  AtomicExecutionContext,
  AtomicExecutionPort,
  AtomicFrame,
  AtomicRecognition,
  AtomicOperation,
} from '../core/types';
import { AtomicFailure, checkCancelled } from '../core/errors';
import type { CapabilityRegistration } from '../registry/types';
import type { RegisteredPipeline } from '../pipeline/definitions';
import type { ReviewedResourceProfile } from '../resources/maacore-adapter';
import { Vision } from './vision';

export const observedEvent = (data: unknown): AtomicCapabilityResult => ({
  status: 'completed',
  verified: true,
  data,
});

/** 不缓存可点击帧；提交后每轮只读新帧，确认丢失或超时均不再次执行输入。 */
export class ReviewedEventVision extends Vision<ReviewedResourceProfile> {
  async matches(
    id: string,
    frame?: AtomicFrame,
  ): Promise<AtomicRecognition & { frame: AtomicFrame }> {
    const image = frame ?? (await this.frame());
    const variants = this.profile.alternatives[id] ?? (this.profile.rules[id] ? [id] : []);
    if (!variants.length) throw new AtomicFailure(`缺少已审阅证据：${id}`, 'unavailable');
    for (const variant of variants) {
      const result = await this.match(variant, image);
      if (result.hit) return result;
    }
    return {
      frame: image,
      hit: false,
      matches: [],
      coordinateSize: [...this.options.referenceSize],
    };
  }

  /** 一个屏幕状态只读取一张帧，多项识别彼此不引入截屏时间差。 */
  async observe(ids: readonly string[]) {
    const frame = await this.frame();
    const evidence: Record<string, AtomicRecognition> = {};
    // 多个识别共享一张图，业务证据只保存 frameId；不能在每项证据中重复序列化 PNG。
    for (const id of ids) {
      const { frame: _frame, ...recognition } = await this.matches(id, frame);
      evidence[id] = recognition;
    }
    return { frameId: frame.frameId, evidence };
  }

  /** 仅接受已登记目标；缺失前置证据时拒绝，点击后只轮询证据，不重放。 */
  async clickOnce(
    trigger: string,
    confirmations: readonly string[],
    options: { optional?: boolean; timeoutMs?: number; pollMs?: number } = {},
  ) {
    const before = await this.matches(trigger);
    if (!before.hit) {
      if (options.optional) return { changed: false, frameId: before.frame.frameId };
      throw new AtomicFailure(`当前页面未命中操作前置证据：${trigger}`);
    }
    // 操作前已存在的终态不能归因于这次点击；同帧核对，避免把旧弹窗当新完成。
    for (const id of confirmations)
      if ((await this.matches(id, before.frame)).hit)
        throw new AtomicFailure(`操作前已存在后置证据：${id}；未执行输入`);
    const match = [...before.matches].sort((a, b) => b.score - a.score)[0]!;
    await this.click(before.frame, match.box);
    const after = await this.waitFor(
      confirmations,
      options.timeoutMs ?? 5000,
      options.pollMs ?? 250,
    );
    return { changed: true, trigger, ...after };
  }

  /** deadline 约束实际总等待；返回的是识别证据，原生完成消息不参与成功判定。 */
  async waitFor(
    ids: readonly string[],
    timeoutMs: number,
    pollMs = 250,
    absent: readonly string[] = [],
  ) {
    const deadline = Math.min(Date.now() + timeoutMs, this.context.deadline ?? Infinity);
    do {
      const observation = await this.observe([...new Set([...ids, ...absent])]);
      const matched = ids.find((id) => observation.evidence[id].hit);
      // 页面可透过遮罩继续被识别，必须在同帧确认旧覆盖层已经消失。
      if (matched && absent.every((id) => !observation.evidence[id].hit))
        return { ...observation, matched };
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await this.wait(Math.min(pollMs, remaining));
    } while (Date.now() <= deadline);
    throw new AtomicFailure('等待明确页面证据超时；结果未知，必须重新观察', 'unknown');
  }
}

export type ReviewedEvent = {
  id: string;
  label: string;
  description: string;
  effect: 'observe' | 'input' | 'commit';
  rules: readonly string[];
  /** 额外的有限原语必须显式声明，不能由游戏事件绕过目录的向下调用检查。 */
  operations?: readonly AtomicOperation[];
  run: (
    vision: ReviewedEventVision,
    input: Record<string, unknown>,
    context: AtomicExecutionContext,
  ) => Promise<AtomicCapabilityResult>;
};

/** 统一装配单事件的资源门禁与契约；handler 保留为被审核 JSON execute 节点调用的本体。 */
export function registerReviewedEvents(
  port: AtomicExecutionPort,
  profile: ReviewedResourceProfile,
  events: readonly ReviewedEvent[],
  pipeline: RegisteredPipeline,
  entries: Readonly<Record<string, string>>,
  referenceSize: [number, number],
): CapabilityRegistration[] {
  return events.map((event) => {
    const dependencies = [
      ...new Set([
        'operation.frame',
        'operation.recognize',
        ...(event.effect === 'observe' ? [] : ['operation.click']),
        ...(event.operations ?? []).map((operation) => `operation.${operation}`),
      ]),
    ];
    const available = event.rules.every((id) => !!profile.rules[id] || !!profile.actions[id]);
    const schema = (atomicInputSchemas as Record<string, Record<string, unknown>>)[event.id];
    const validator = (atomicInputValidators as Record<string, (input: unknown) => boolean>)[
      event.id
    ];
    if (!schema || !validator)
      throw new AtomicFailure(`能力缺少权威 Schema 或生成校验器：${event.id}`);
    return {
      descriptor: {
        id: event.id,
        label: event.label,
        description: event.description,
        layer: event.effect === 'observe' ? 'observation' : 'game',
        primitiveLevel: 3,
        effect: event.effect,
        pipelineEntry: entries[event.id],
        requiredResources: event.rules.map((id) => `${profile.id}:${id}`),
        dependencies,
        inputSchema: schema,
        resultSchema: atomicCapabilityResultSchema,
        requiredCapabilities: [
          'frame',
          'recognize',
          ...(event.effect === 'observe' ? [] : ['click']),
        ],
        available,
        ...(!available
          ? {
              unavailableReason: `当前资源缺少：${event.rules.filter((id) => !profile.rules[id] && !profile.actions[id]).join('、')}`,
            }
          : {}),
      },
      pipeline: { definitions: pipeline.definitions, entry: entries[event.id] },
      dependencies,
      validate: validator,
      async handler(input, context) {
        checkCancelled(context);
        return event.run(
          new ReviewedEventVision(port, profile, { referenceSize }, context),
          input,
          context,
        );
      },
    };
  });
}

/** workflow 调用 JSON 中登记的 L3；最终结果必须由图显式 return 证据。 */
export function reviewedWorkflow(
  id: string,
  label: string,
  description: string,
  pipeline: RegisteredPipeline,
  entry: string,
  dependencies: readonly string[],
  registrations: readonly CapabilityRegistration[],
  options: {
    effect?: 'observe' | 'input' | 'commit';
    run?: (
      input: Record<string, unknown>,
      context: AtomicExecutionContext,
    ) => Promise<AtomicCapabilityResult>;
  } = {},
): CapabilityRegistration {
  const available = dependencies.every(
    (id) => registrations.find((item) => item.descriptor.id === id)?.descriptor.available,
  );
  const schemas = atomicInputSchemas as Record<string, Record<string, unknown>>;
  const validators = atomicInputValidators as Record<string, (input: unknown) => boolean>;
  if (!schemas[id] || !validators[id])
    throw new AtomicFailure(`流程缺少权威 Schema 或生成校验器：${id}`);
  return {
    descriptor: {
      id,
      label,
      description,
      layer: 'workflow',
      effect: options.effect ?? 'commit',
      pipelineEntry: entry,
      dependencies: [...dependencies],
      inputSchema: schemas[id],
      resultSchema: atomicCapabilityResultSchema,
      available,
      ...(!available ? { unavailableReason: '当前资源不能满足完整流程的全部前置证据' } : {}),
    },
    ...(options.run ? {} : { pipeline: { definitions: pipeline.definitions, entry } }),
    dependencies: [...dependencies],
    validate: validators[id],
    async handler(input, context) {
      if (options.run) return options.run(input, context);
      if (!context.runWorkflow)
        throw new AtomicFailure('宿主尚未提供登记流程运行器', 'unavailable');
      return context.runWorkflow(entry, pipeline.definitions, input);
    },
  };
}
