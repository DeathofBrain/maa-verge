import { cleanRuntimeEnvironment } from '../setup-bun.mjs';

/** Offline fixtures must not inherit a developer's remote tracing settings. */
export function offlineAgentEnvironment(environment = process.env) {
  const result = cleanRuntimeEnvironment(environment);
  for (const key of Object.keys(result))
    if (/^(?:LANGCHAIN|LANGSMITH)_/iu.test(key)) delete result[key];
  return result;
}
