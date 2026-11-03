import { AtomicFailure, checkCancelled } from '../core/errors';
import type { AtomicCapabilityResult, AtomicExecutionContext } from '../core/types';
import type { AtomicExecutionPort } from '../core/types';
import type { CapabilityRegistration } from './types';
import { validateAtomicCapabilityResult } from '@contracts/validators.js';
import { pipelineSubgraph } from '../pipeline/definitions';
import { invokePipeline, pipelineCalls } from '../pipeline/invocation';

/** 不绑定游戏或设备；调用方显式组合所需的能力模块。 */
export function createCapabilityRegistry(
  registrations: readonly CapabilityRegistration[],
  options?: { port: AtomicExecutionPort },
) {
  const entries = new Map<string, CapabilityRegistration>();
  // 在接入阶段拒绝相互覆盖的功能，并冻结登记时的描述快照；创建目录不操作设备。
  for (const registration of registrations) {
    const id = registration.descriptor.id;
    if (entries.has(id)) throw new AtomicFailure(`能力重复登记：${id}`);
    entries.set(id, {
      ...registration,
      ...(registration.pipeline ? { pipeline: { ...registration.pipeline } } : {}),
      descriptor: {
        ...structuredClone(registration.descriptor),
        requiredResources: [...(registration.descriptor.requiredResources ?? [])],
      },
    });
  }
  // 调用依赖在接入阶段统一解析，缺失项与逆向层级不能等到游戏执行中途才暴露。
  const graphs = new Map<string, Record<string, Record<string, unknown>>>();
  const dependencies = new Map<string, Set<string>>();
  for (const [id, registration] of entries) {
    const graph = registration.pipeline
      ? pipelineSubgraph(registration.pipeline.definitions, registration.pipeline.entry)
      : undefined;
    if (graph) graphs.set(id, graph);
    const targets = new Set([
      ...(registration.dependencies ?? registration.descriptor.dependencies ?? []),
      ...(graph ? pipelineCalls(graph) : []),
    ]);
    dependencies.set(id, targets);
    registration.descriptor.dependencies = [...targets];
    for (const target of targets) {
      const destination = entries.get(target);
      if (!destination) throw new AtomicFailure(`能力 ${id} 依赖未登记项：${target}`);
      const sourceLevel = registration.descriptor.primitiveLevel;
      const targetLevel = destination.descriptor.primitiveLevel;
      if (sourceLevel !== undefined && (targetLevel === undefined || targetLevel >= sourceLevel))
        throw new AtomicFailure(`原语层级只能向下调用：${id} → ${target}`);
      if (sourceLevel === undefined && targetLevel !== 3)
        throw new AtomicFailure(`完整流程只能组合 L3 游戏事件：${id} → ${target}`);
    }
  }
  const failure = (error: unknown, context: AtomicExecutionContext): AtomicCapabilityResult => ({
    status: context.signal?.aborted
      ? 'cancelled'
      : error instanceof AtomicFailure
        ? error.status
        : 'unknown',
    data: {},
    verified: false,
    message: error instanceof Error ? error.message : String(error),
  });
  const dispatch = async (
    id: string,
    input: Record<string, unknown>,
    context: AtomicExecutionContext,
    depth: number,
    forceJson: boolean,
  ): Promise<AtomicCapabilityResult> => {
    try {
      checkCancelled(context);
      if (depth > 8) throw new AtomicFailure('原语调用深度超过 8 层');
      const registration = entries.get(id);
      if (!registration) throw new AtomicFailure('原语未注册', 'unavailable');
      if (!registration.descriptor.available)
        throw new AtomicFailure(
          registration.descriptor.unavailableReason ?? '原语当前不可用',
          'unavailable',
        );
      const validateInput = (value: unknown) => {
        if (
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value) ||
          !registration.validate(value)
        )
          throw new AtomicFailure('原语输入不符合已登记的 JSON Schema');
      };
      validateInput(input);
      const graph = graphs.get(id);
      const usesJson = !!graph && (forceJson || registration.descriptor.primitiveLevel !== 1);
      // TS 批次自身不占一个原生根任务时限，每次房间/战斗根图独立计时；子图继承现有期限。
      const deadline = context.deadline ?? (usesJson ? Date.now() + 120_000 : undefined);
      if (deadline !== undefined && Date.now() >= deadline)
        throw new AtomicFailure('根流程期限已耗尽', 'unknown');
      const ownContext: AtomicExecutionContext = { ...context, deadline };
      const invoke = async (
        target: string,
        childInput: Record<string, unknown>,
        childContext = ownContext,
      ) => {
        if (!dependencies.get(id)?.has(target))
          throw new AtomicFailure(`能力 ${id} 未声明调用依赖：${target}`);
        return dispatch(target, childInput, childContext, depth + 1, true);
      };
      ownContext.invoke = (target, childInput) => invoke(target, childInput);
      const runWorkflow = (
        executionContext: AtomicExecutionContext,
        entry: string,
        definitions: Record<string, Record<string, unknown>>,
        workflowInput: Record<string, unknown>,
        handlers?: Record<string, (params: Record<string, unknown>) => Promise<void>>,
      ) => {
        if (registration.descriptor.primitiveLevel !== undefined)
          throw new AtomicFailure('游戏原语不能重新编排完整业务流程');
        const graph = pipelineSubgraph(definitions, entry);
        for (const target of pipelineCalls(graph)) {
          if (entries.get(target)?.descriptor.primitiveLevel !== 3)
            throw new AtomicFailure(`完整流程只能组合 L3 游戏事件：${target}`);
          if (!dependencies.get(id)?.has(target))
            throw new AtomicFailure(`业务流程未声明调用依赖：${target}`);
        }
        if (!options) throw new AtomicFailure('尚未绑定 Pipeline 执行端口', 'unavailable');
        return invokePipeline({
          id,
          entry,
          definitions: graph,
          input: workflowInput,
          context: executionContext,
          port: options.port,
          invoke,
          handlers,
        });
      };
      ownContext.runWorkflow = (entry, definitions, workflowInput, handlers) =>
        runWorkflow(ownContext, entry, definitions, workflowInput, handlers);
      const raw = async (rawInput: Record<string, unknown>, rawContext: AtomicExecutionContext) => {
        validateInput(rawInput);
        const handlerContext: AtomicExecutionContext = {
          ...ownContext,
          ...rawContext,
          invoke: (target, childInput) =>
            invoke(target, childInput, { ...ownContext, ...rawContext }),
        };
        // 原生 Custom 回调开始后，业务链也必须使用同一个当前 Context。
        handlerContext.runWorkflow = (entry, definitions, workflowInput, handlers) =>
          runWorkflow(handlerContext, entry, definitions, workflowInput, handlers);
        const output = await registration.handler(rawInput, handlerContext);
        if (
          !validateAtomicCapabilityResult(output) ||
          (registration.validateResult && !registration.validateResult(output))
        )
          throw new AtomicFailure(`能力结果不符合已登记 Schema：${id}`, 'unknown');
        return output;
      };
      let result: AtomicCapabilityResult;
      if (graph && usesJson) {
        if (!options) throw new AtomicFailure('尚未绑定 Pipeline 执行端口', 'unavailable');
        result = await invokePipeline({
          id,
          entry: registration.pipeline!.entry,
          definitions: structuredClone(graph),
          input,
          context: ownContext,
          port: options.port,
          invoke,
          execute: raw,
        });
      } else result = await raw(input, ownContext);
      if (
        !validateAtomicCapabilityResult(result) ||
        (registration.validateResult && !registration.validateResult(result))
      )
        throw new AtomicFailure(`能力结果不符合已登记 Schema：${id}`, 'unknown');
      // 原生或 TS handler 收尾期间仍可能取消；保留已有步骤证据，同时撤销成功判定。
      if (context.signal?.aborted)
        return {
          ...result,
          status: 'cancelled',
          verified: false,
          message: '能力结束前已取消；保留已执行步骤供重新观察',
        };
      if (deadline !== undefined && Date.now() >= deadline)
        return {
          ...result,
          status: 'unknown',
          verified: false,
          message: '能力结束前根流程期限已耗尽；不能自动重放',
        };
      return result;
    } catch (error) {
      return failure(error, context);
    }
  };
  return {
    // 描述向外返回副本，UI 或其他消费者修改目录不会改变后续分派依据。
    list: () => [...entries.values()].map(({ descriptor }) => structuredClone(descriptor)),
    get: (id: string) => {
      const descriptor = entries.get(id)?.descriptor;
      return descriptor ? structuredClone(descriptor) : undefined;
    },
    async execute(
      id: string,
      input: Record<string, unknown>,
      context: AtomicExecutionContext = {},
    ): Promise<AtomicCapabilityResult> {
      // 顶层总是替换外部身份；只读稳定证据可在同根子调用复用，不能跨独立执行续期。
      return dispatch(id, input, { ...context, rootIdentity: Object.freeze({}) }, 1, false);
    },
    /** 维护工具可显式验证某个最小原语的 JSON 入口；产品 UI 不接受任意图。 */
    executeJson: (
      id: string,
      input: Record<string, unknown>,
      context: AtomicExecutionContext = {},
    ) => dispatch(id, input, { ...context, rootIdentity: Object.freeze({}) }, 1, true),
  };
}
