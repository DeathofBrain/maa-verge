import { AtomicFailure } from '../core/errors';

export type PipelineDefinitions = Record<string, Record<string, unknown>>;

type NodeNames<Sources extends Record<string, PipelineDefinitions>> = {
  [Source in keyof Sources]: keyof Sources[Source];
}[keyof Sources] &
  string;

/** 已登记的流程资源；definitions 为读取副本，subgraph 只复制指定入口的可达节点。 */
export type RegisteredPipeline<Definitions extends PipelineDefinitions = PipelineDefinitions> = {
  readonly definitions: Definitions;
  subgraph(entry: keyof Definitions & string): PipelineDefinitions;
};

/** 功能内统一登记静态导入的 JSON，支持跨文件引用；登记本身不操作设备。 */
export function registerPipeline<const Sources extends Record<string, PipelineDefinitions>>(
  sources: Sources,
): RegisteredPipeline<Record<NodeNames<Sources>, Record<string, unknown>>> {
  // 校验后隔离登记基准，调用方随后修改源 JSON 也不能改变已登记的流程。
  const definitions = structuredClone(mergePipelineDefinitions(sources));
  return {
    get definitions() {
      return structuredClone(definitions);
    },
    // 每次调用均重新复制可达节点，资源绑定及调用者修改不会影响下一次执行。
    subgraph: (entry) => pipelineSubgraph(definitions, entry),
  };
}

/** 只收集可达边；候选优先级、识别和错误路径的实际语义由官方 Tasker 执行。 */
function successors(name: string, node: Record<string, unknown>): string[] {
  return ['next', 'on_error'].flatMap((field) => {
    const targets = node[field];
    if (targets === undefined) return [];
    if (!Array.isArray(targets) || !targets.every((target) => typeof target === 'string'))
      throw new AtomicFailure(`Pipeline 节点 ${name} 的 ${field} 无效`);
    return targets;
  });
}

/** 合并应用静态导入的资源；只核对节点和引用，不执行 Pipeline。 */
export function mergePipelineDefinitions<const Sources extends Record<string, PipelineDefinitions>>(
  sources: Sources,
): Record<NodeNames<Sources>, Record<string, unknown>> {
  const definitions: PipelineDefinitions = {};
  const owners = new Map<string, string>();
  // 先完整合并再检查引用，允许不同 JSON 文件共享节点；重名必须显示两个来源供维护者排查。
  for (const [source, nodes] of Object.entries(sources)) {
    for (const [name, node] of Object.entries(nodes)) {
      if (owners.has(name))
        throw new AtomicFailure(`Pipeline 节点重复：${name}（${owners.get(name)}、${source}）`);
      if (!node || typeof node !== 'object' || Array.isArray(node))
        throw new AtomicFailure(`Pipeline 节点 ${name} 无效（${source}）`);
      owners.set(name, source);
      Object.defineProperty(definitions, name, {
        value: node,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  // 包括错误分支在内的断链都在准备资源时拒绝，不等到设备已执行一半才发现遗漏。
  for (const [name, node] of Object.entries(definitions))
    for (const target of successors(name, node))
      if (!Object.hasOwn(definitions, target))
        throw new AtomicFailure(`Pipeline 节点 ${name} 引用了未登记节点：${target}`);
  return definitions as Record<NodeNames<Sources>, Record<string, unknown>>;
}

/** 每次提交独立的入口可达副本，资源绑定不会改写共享定义。 */
export function pipelineSubgraph(
  definitions: PipelineDefinitions,
  entry: string,
): PipelineDefinitions {
  const pipeline: PipelineDefinitions = {};
  const pending = [entry];
  // 用访问集合处理合法的回边，每个节点仅复制一次；后续资源绑定只改本次提交的副本。
  while (pending.length) {
    const name = pending.pop()!;
    if (Object.hasOwn(pipeline, name)) continue;
    if (!Object.hasOwn(definitions, name))
      throw new AtomicFailure(`Pipeline 引用了未登记节点：${name}`);
    const node = definitions[name];
    Object.defineProperty(pipeline, name, {
      value: structuredClone(node),
      enumerable: true,
      configurable: true,
      writable: true,
    });
    pending.push(...successors(name, node));
  }
  return pipeline;
}
