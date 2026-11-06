import { tool, type ToolRunnableConfig } from '@langchain/core/tools';
import { parseCallbackConfigArg } from '@langchain/core/callbacks/manager';
import { ensureConfig, mergeConfigs } from '@langchain/core/runnables';
import type { JSONSchema } from '@langchain/core/utils/json_schema';
import { assertAgentCallbacksLocal } from '../src/tracing';
import type { MaaToolSet } from './types';

/** 仅适配 LangChain 工具格式；实际范围、参数和授权仍由中立工具集检查。 */
export function createLangChainMaaTools(set: MaaToolSet) {
  return set.definitions.map((definition) => {
    const sdkTool = tool(
      async (input: unknown, config: ToolRunnableConfig) => {
        const hostCallId: unknown = config.configurable?.maaToolCallId;
        const callId =
          config.toolCall?.id ??
          (typeof hostCallId === 'string' ? hostCallId : crypto.randomUUID());
        const result = await set.invoke(definition.name, input, { callId, signal: config.signal });
        return [JSON.stringify(result.content), result.artifact] as [string, unknown];
      },
      {
        name: definition.name,
        description: definition.description,
        // The SDK validator annotates its schema. Keep the policy-owned source
        // immutable while supplying an equivalent mutable SDK copy.
        schema: structuredClone(definition.schema) as JSONSchema,
        responseFormat: 'content_and_artifact',
      },
    );

    // StructuredTool starts SDK callbacks before entering the handler. Guard
    // both public entry points so ambient tracing cannot receive tool inputs.
    const invoke = sdkTool.invoke.bind(sdkTool);
    sdkTool.invoke = (input, config) => {
      const effective = ensureConfig(mergeConfigs(sdkTool.defaultConfig, config));
      assertAgentCallbacksLocal(effective.callbacks, sdkTool.callbacks);
      return invoke(input, config);
    };
    const call = sdkTool.call.bind(sdkTool);
    sdkTool.call = (input, config, tags) => {
      assertAgentCallbacksLocal(
        ensureConfig(parseCallbackConfigArg(config)).callbacks,
        sdkTool.callbacks,
      );
      return call(input, config, tags);
    };
    return sdkTool;
  });
}
