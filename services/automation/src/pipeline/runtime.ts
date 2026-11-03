import { isDeepStrictEqual } from 'node:util';
import { AtomicFailure, checkCancelled } from '../core/errors';
import type { AtomicExecutionContext, AtomicExecutionPort } from '../core/types';
import type { PipelineDefinitions } from './definitions';

export type CustomHandler = (params: Record<string, unknown>) => Promise<void>;
export type CustomHandlers = Record<string, CustomHandler>;

/** 读取已提交 Custom 参数中的必填名称，避免处理器在缺失参数下猜测动作。 */
export function pipelineString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || !value) throw new AtomicFailure(`Pipeline 缺少 ${key}`);
  return value;
}

/** 官方 Tasker 负责流转；这里只校验宿主 Custom 回调及分派具名逻辑。 */
export async function runPipeline(
  port: AtomicExecutionPort,
  entry: string,
  pipeline: PipelineDefinitions,
  handlers: CustomHandlers,
  context: AtomicExecutionContext = {},
  capabilityId = 'pipeline',
): Promise<void> {
  checkCancelled(context);
  const submit = context.pipelineActive
    ? port.runContextPipeline?.bind(port)
    : port.runPipeline.bind(port);
  if (!submit) throw new AtomicFailure('当前执行端口不支持上下文子流程', 'unavailable');
  await submit(
    entry,
    pipeline,
    async (node, params) => {
      checkCancelled(context);
      // 回调只能代表本次提交图中的同一节点、同一参数，不允许借回调替换处理器或动作。
      const expected = pipeline[node]?.custom_action_param;
      if (
        !expected ||
        typeof expected !== 'object' ||
        Array.isArray(expected) ||
        !isDeepStrictEqual(params, expected)
      )
        throw new AtomicFailure('Pipeline Custom 回调与已提交节点不一致');
      const name = pipelineString(params, 'handler');
      // 仅显式登记项可调用，Object 原型链上的同名函数不属于能力。
      const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
      if (!handler) throw new AtomicFailure('Pipeline Custom 未登记', 'unavailable');
      context.onProgress?.({ capabilityId, message: `执行流程节点：${node}` });
      // 进度观察器也可能同步触发取消，必须在进入有副作用的处理器前再检查一次。
      checkCancelled(context);
      await handler(params);
      checkCancelled(context);
    },
    context,
  );
}
