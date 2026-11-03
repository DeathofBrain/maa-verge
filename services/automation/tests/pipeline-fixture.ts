import {
  InfrastRoomPrimitives,
  infrastCapabilityEntries,
  infrastPipeline,
  invokePipeline,
  parsePreparedRoster,
  parsePrepareRoster,
  parseRoute,
  parseTarget,
  type AtomicCapabilityResult,
  type AtomicExecutionContext,
  type AtomicExecutionPort,
  type InfrastDriver,
} from '@maaverge/automation';

export const unexpectedPipeline: AtomicExecutionPort['runPipeline'] = async () => {
  throw new Error('this isolated fixture must not execute a Pipeline');
};

type Node = {
  recognition: string;
  action: string;
  custom_action_param?: Record<string, unknown>;
  next: string[];
  [key: string]: unknown;
};

/** Test-only graph fixture; production always calls the native MaaFramework Tasker. */
export function syntheticPipeline(
  options: {
    recognize?: (name: string, node: Node) => boolean;
    action?: (name: string, node: Node) => void;
    entered?: (name: string, node: Node) => void;
  } = {},
): AtomicExecutionPort['runPipeline'] {
  return async (entry, definitions, custom, context) => {
    const graph = definitions as Record<string, Node>;
    let current = entry;
    for (let steps = 0; steps < 128; steps++) {
      context.signal?.throwIfAborted();
      const node = graph[current];
      if (!node) throw new Error(`unknown synthetic node: ${current}`);
      options.entered?.(current, node);
      if (node.action === 'Custom')
        await custom(current, structuredClone(node.custom_action_param!));
      else if (node.action !== 'DoNothing') options.action?.(current, node);
      if (!node.next.length) return;
      const next = node.next.find(
        (name) =>
          graph[name]?.recognition === undefined ||
          graph[name]?.recognition === 'DirectHit' ||
          options.recognize?.(name, graph[name]),
      );
      if (!next) throw new Error('synthetic Pipeline has no matching successor');
      current = next;
    }
    throw new Error('synthetic Pipeline exceeded its fixture limit');
  };
}

/** 显式为合成游戏驱动安装 Tasker；产品参数绑定与 L3 wrapper 完全复用，只有页面流转是夹具。 */
export function attachInfrastWorkflowFixture(
  driver: InfrastDriver,
  options: {
    signal?: AbortSignal;
    entered?: (node: string) => void;
    handlers?: Record<string, (input: Record<string, unknown>) => Promise<AtomicCapabilityResult>>;
  } = {},
) {
  const context: AtomicExecutionContext = { signal: options.signal };
  const room = new InfrastRoomPrimitives(driver, context);
  const raw: Record<string, (input: Record<string, unknown>) => Promise<AtomicCapabilityResult>> = {
    'game.infrast.read_room': (input) =>
      room.readRoom(parseTarget(input), parseRoute(input.route ?? 'room')),
    'game.infrast.prepare_roster': (input) => room.prepareRoster(parsePrepareRoster(input)),
    'game.infrast.confirm': (input) => room.confirm(parsePreparedRoster(input.prepared)),
    'game.infrast.verify_room': (input) =>
      room.verifyRoom(
        parsePrepareRoster(input.request),
        parsePreparedRoster(input.prepared),
        input.before,
      ),
    ...options.handlers,
  };
  const port: AtomicExecutionPort = {
    async execute() {
      throw new Error('this fixture injects game observations and never calls a native primitive');
    },
    runPipeline: syntheticPipeline({ entered: (node) => options.entered?.(node) }),
    runContextPipeline: syntheticPipeline({ entered: (node) => options.entered?.(node) }),
  };
  const invoke = async (
    id: string,
    input: Record<string, unknown>,
    nested: AtomicExecutionContext,
  ): Promise<AtomicCapabilityResult> => {
    const entry = infrastCapabilityEntries[id as keyof typeof infrastCapabilityEntries];
    if (!raw[id] || !entry) throw new Error(`unregistered synthetic L3 primitive: ${id}`);
    return invokePipeline({
      id,
      entry,
      definitions: infrastPipeline.subgraph(entry),
      input,
      context: nested,
      port,
      invoke,
      execute: raw[id],
    });
  };
  driver.runWorkflow = (entry, definitions, input) =>
    invokePipeline({
      id: 'workflow.infrast.fixture',
      entry,
      definitions,
      input,
      context,
      port,
      invoke,
    });
  return driver;
}
