import { BaseChatModel, type BindToolsInput } from '@langchain/core/language_models/chat_models';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';

export const syntheticProposal = {
  reply: '已生成待审阅的作战草稿，请确认后保存。',
  plan: { name: '材料补给', tasks: [{ type: 'Fight', params: { stage: '2-8', times: 3 }, enabled: true }] },
};

export interface SyntheticModelCall {
  messages: BaseMessage[];
  signal?: AbortSignal;
  call: number;
  toolNames: string[];
}

type ResponseFactory = (input: SyntheticModelCall) => AIMessage | Promise<AIMessage>;

/** Runs the real agent loop with an in-memory model and no provider integration. */
export class SyntheticChatModel extends BaseChatModel {
  calls: SyntheticModelCall[] = [];
  boundTools: BindToolsInput[] = [];

  constructor(private readonly respond: ResponseFactory = ({ toolNames, call }) => new AIMessage({
    content: '',
    tool_calls: [{ name: toolNames[0]!, id: `synthetic-${call}`, type: 'tool_call', args: structuredClone(syntheticProposal) }],
  })) {
    super({ maxRetries: 0, callbacks: [] });
  }

  _llmType() { return 'maaverge-synthetic-offline'; }

  bindTools(tools: BindToolsInput[]) {
    this.boundTools = tools;
    return this;
  }

  async _generate(messages: BaseMessage[], options: this['ParsedCallOptions']): Promise<ChatResult> {
    const toolNames = this.boundTools.map(tool => {
      const definition = tool as { name?: string; function?: { name?: string } };
      return definition.function?.name ?? definition.name ?? '';
    });
    const invocation = { messages, signal: options.signal, call: this.calls.length + 1, toolNames };
    this.calls.push(invocation);
    const message = await this.respond(invocation);
    return { generations: [{ text: typeof message.content === 'string' ? message.content : '', message }] };
  }
}
