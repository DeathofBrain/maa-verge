import { Annotation, StateGraph, START, END, Command, interrupt } from '@langchain/langgraph';
import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph-checkpoint';
import { ensureConfig } from '@langchain/core/runnables';
import { assertAgentCallbacksLocal } from './tracing';
import { responseCalls, responseText, type ResponseItem, type ResponseUsage } from './responses';

export class AgentWait extends Error {
  constructor(public readonly interactionId: string) {
    super('等待用户回答');
    this.name = 'AgentWait';
  }
}
const State = Annotation.Root({
  items: Annotation<ResponseItem[]>(),
  output: Annotation<ResponseItem[]>(),
  calls: Annotation<number>(),
  reply: Annotation<string>(),
});

/** 串行推进模型与工具节点；interrupt 恢复会重入节点，宿主必须用持久账本保护副作用。 */
export function createResponseGraph(options: {
  checkpointer: BaseCheckpointSaver;
  store?: BaseStore;
  model(input: ResponseItem[]): Promise<{ output: ResponseItem[]; usage: ResponseUsage }>;
  tool(name: string, input: unknown, callId: string): Promise<unknown>;
  output(items: ResponseItem[]): void;
  toolOutput(callId: string, result: unknown): void;
  maxCalls?: number;
}) {
  const graph = new StateGraph(State)
    .addNode('model', async (state) => {
      if (state.calls >= (options.maxCalls ?? 12))
        throw new Error('本轮模型调用达到安全上限，请新建一轮继续');
      const result = await options.model(state.items);
      options.output(result.output);
      return {
        output: result.output,
        items: [...state.items, ...result.output],
        calls: state.calls + 1,
        reply: responseText(result.output),
      };
    })
    .addNode('tools', async (state) => {
      const items = [...state.items];
      for (const call of responseCalls(state.output)) {
        let result: unknown;
        // 中断载荷只携带持久交互 ID；凭据与权限留在宿主闭包中，恢复时重新校验。
        while (true) {
          try {
            result = await options.tool(call.name, call.input, call.id);
            break;
          } catch (error) {
            if (!(error instanceof AgentWait)) throw error;
            interrupt({ interactionId: error.interactionId });
          }
        }
        options.toolOutput(call.id, result);
        items.push({
          type: 'function_call_output',
          call_id: call.id,
          output: JSON.stringify(result),
        });
      }
      return { items };
    })
    .addEdge(START, 'model')
    .addConditionalEdges('model', (state) => (responseCalls(state.output).length ? 'tools' : END))
    .addEdge('tools', 'model')
    .compile({ checkpointer: options.checkpointer, store: options.store });
  return {
    async invoke(threadId: string, items: ResponseItem[], signal: AbortSignal, resume = false) {
      assertAgentCallbacksLocal(ensureConfig().callbacks);
      return graph.invoke(
        resume ? new Command({ resume: true }) : { items, output: [], calls: 0, reply: '' },
        { configurable: { thread_id: threadId }, signal, recursionLimit: 60 },
      );
    },
  };
}
