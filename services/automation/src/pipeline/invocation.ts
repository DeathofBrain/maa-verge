/** 官方 Pipeline 的调用适配：仅绑定已登记步骤与结果，节点流转全部交给 Tasker/Context。 */
import { isDeepStrictEqual } from 'node:util';
import { validateAtomicCapabilityResult } from '@contracts/validators.js';
import { AtomicFailure, checkCancelled } from '../core/errors';
import type {
  AtomicCapabilityResult,
  AtomicExecutionContext,
  AtomicExecutionPort,
} from '../core/types';
import type { PipelineDefinitions } from './definitions';
import { pipelineString } from './runtime';
import { assertPipelineDataSize, resolvePipelineValue, type PipelineScope } from './bindings';

type InvocationOptions = {
  id: string;
  entry: string;
  definitions: PipelineDefinitions;
  input: Record<string, unknown>;
  context: AtomicExecutionContext;
  port: AtomicExecutionPort;
  invoke: (
    id: string,
    input: Record<string, unknown>,
    context: AtomicExecutionContext,
  ) => Promise<AtomicCapabilityResult>;
  execute?: (
    input: Record<string, unknown>,
    context: AtomicExecutionContext,
  ) => Promise<AtomicCapabilityResult>;
  handlers?: Record<string, (params: Record<string, unknown>) => Promise<void>>;
};

/** 调用前核对适配器字段与结果别名，跨节点复用同名结果会被明确拒绝。 */
export function pipelineCalls(definitions: PipelineDefinitions): string[] {
  const calls = new Set<string>();
  const aliases = new Map<string, string>();
  for (const [node, definition] of Object.entries(definitions)) {
    const params = definition.custom_action_param;
    if (!params || typeof params !== 'object' || Array.isArray(params)) continue;
    const fields = params as Record<string, unknown>;
    if (fields.handler === 'call') calls.add(pipelineString(fields, 'primitive'));
    if (fields.saveAs !== undefined) {
      const alias = pipelineString(fields, 'saveAs');
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(alias))
        throw new AtomicFailure(`Pipeline 结果别名无效：${alias}`);
      if (aliases.has(alias))
        throw new AtomicFailure(
          `Pipeline 结果别名重复：${alias}（${aliases.get(alias)}、${node}）`,
        );
      aliases.set(alias, node);
    }
  }
  return [...calls];
}

/** 根/子调用各自持有 input、steps 和返回值；异常不会使父作用域误读半完成结果。 */
export async function invokePipeline(options: InvocationOptions): Promise<AtomicCapabilityResult> {
  const { entry, definitions, port } = options;
  const context = {
    ...options.context,
    deadline: options.context.deadline ?? Date.now() + 120_000,
  };
  pipelineCalls(definitions);
  const scope: PipelineScope = { input: structuredClone(options.input), steps: {} };
  let returned: AtomicCapabilityResult | undefined;
  let rejected: AtomicCapabilityResult | undefined;
  const submit = context.pipelineActive
    ? port.runContextPipeline?.bind(port)
    : port.runPipeline.bind(port);
  if (!submit) throw new AtomicFailure('当前执行端口不支持上下文子流程', 'unavailable');
  const nested: AtomicExecutionContext = { ...context, pipelineActive: true };
  try {
    checkCancelled(context);
    assertPipelineDataSize(scope);
    await submit(
      entry,
      definitions,
      async (node, params) => {
        checkCancelled(context);
        if (context.deadline !== undefined && Date.now() >= context.deadline)
          throw new AtomicFailure('Pipeline 已超过根调用期限', 'unknown');
        const expected = definitions[node]?.custom_action_param;
        if (!expected || !isDeepStrictEqual(params, expected))
          throw new AtomicFailure('Pipeline Custom 回调与已提交节点不一致');
        if (returned) throw new AtomicFailure('Pipeline 已返回结果，不能继续执行节点');
        context.onProgress?.({ capabilityId: options.id, message: `执行流程节点：${node}` });
        checkCancelled(context);
        const handler = pipelineString(params, 'handler');
        if (handler === 'return') {
          const value = resolvePipelineValue(params.value, scope);
          assertPipelineDataSize(value);
          if (!validateAtomicCapabilityResult(value))
            throw new AtomicFailure('Pipeline 返回值不符合结果 Schema');
          returned = value as AtomicCapabilityResult;
          return;
        }
        if (handler !== 'call' && handler !== 'execute') {
          const custom =
            options.handlers && Object.hasOwn(options.handlers, handler)
              ? options.handlers[handler]
              : undefined;
          if (!custom) throw new AtomicFailure(`Pipeline Custom 未登记：${handler}`, 'unavailable');
          const resolved = resolvePipelineValue(params, scope) as Record<string, unknown>;
          assertPipelineDataSize(resolved);
          await custom(resolved);
          return;
        }
        const input = resolvePipelineValue(params.input ?? { $ref: '#/input' }, scope);
        if (!input || typeof input !== 'object' || Array.isArray(input))
          throw new AtomicFailure('Pipeline 调用输入必须为对象');
        assertPipelineDataSize(input);
        const target = handler === 'call' ? pipelineString(params, 'primitive') : options.id;
        if (
          handler === 'execute' &&
          params.primitive !== undefined &&
          params.primitive !== options.id
        )
          throw new AtomicFailure('execute 只能执行当前登记项，跨层调用必须使用 call');
        const result =
          handler === 'call'
            ? await options.invoke(target, input as Record<string, unknown>, nested)
            : options.execute
              ? await options.execute(input as Record<string, unknown>, nested)
              : (() => {
                  throw new AtomicFailure('业务链未登记 execute 实现');
                })();
        if (!validateAtomicCapabilityResult(result))
          throw new AtomicFailure('原语返回值不符合结果 Schema');
        if (params.saveAs !== undefined)
          Object.defineProperty(scope.steps, pipelineString(params, 'saveAs'), {
            value: structuredClone(result),
            enumerable: true,
            configurable: true,
            writable: true,
          });
        assertPipelineDataSize(scope);
        if (result.status !== 'completed') {
          rejected = result;
          throw new AtomicFailure(
            result.message ?? '子原语未完成',
            result.status === 'failed' || result.status === 'unavailable'
              ? result.status
              : 'unknown',
          );
        }
        checkCancelled(context);
      },
      context,
    );
    // return 回调之后仍有原生收尾；此间取消或到期不能被旧的成功证据覆盖。
    checkCancelled(context);
    if (context.deadline !== undefined && Date.now() >= context.deadline)
      throw new AtomicFailure('Pipeline 已超过根调用期限', 'unknown');
    if (!returned) throw new AtomicFailure('Pipeline 结束但未显式返回业务结果', 'unknown');
    return returned;
  } catch (error) {
    const failed = rejected ?? {
      status: context.signal?.aborted
        ? ('cancelled' as const)
        : error instanceof AtomicFailure
          ? error.status
          : ('unknown' as const),
      data: {},
      verified: false,
      message: error instanceof Error ? error.message : String(error),
    };
    return {
      ...failed,
      ...(context.signal?.aborted ? { status: 'cancelled' as const, verified: false } : {}),
      data: {
        ...(failed.data && typeof failed.data === 'object' && !Array.isArray(failed.data)
          ? failed.data
          : { value: failed.data }),
        pipelineSteps: scope.steps,
      },
    };
  }
}
