import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const flags = ['LANGSMITH_TRACING', 'LANGSMITH_TRACING_V2', 'LANGCHAIN_TRACING', 'LANGCHAIN_TRACING_V2'] as const;
const fixture = fileURLToPath(new URL('./fixtures/tracing-boundary.ts', import.meta.url));

function probe(scenario: string, enabledFlag?: typeof flags[number], value = 'true') {
  const environment: NodeJS.ProcessEnv = { ...process.env,
    LANGSMITH_API_KEY: 'synthetic-offline-key', LANGSMITH_ENDPOINT: 'http://127.0.0.1:1',
  };
  for (const flag of flags) delete environment[flag];
  if (enabledFlag) environment[enabledFlag] = value;
  const child = spawnSync(process.execPath, [fixture, scenario], {
    env: environment, encoding: 'utf8', windowsHide: true, timeout: 10000,
  });
  expect(child.error).toBeUndefined();
  expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout);
}

test('every SDK tracing environment switch rejects before model, host or network activity', () => {
  for (const flag of flags) {
    expect(probe('environment', flag)).toEqual({ rejected: true, configurationError: true, fetches: 0, calls: 0, preparations: 0, environmentUnchanged: true });
  }
}, 30000);

test('nonempty legacy tracing values reject without relying on the SDK boolean parser', () => {
  for (const value of ['false', '1', '0']) {
    expect(probe('environment', 'LANGCHAIN_TRACING', value)).toEqual({ rejected: true, configurationError: true, fetches: 0, calls: 0, preparations: 0, environmentUnchanged: true });
  }
}, 30000);

test('an inherited tracing context rejects even with tracing environment switches disabled', () => {
  expect(probe('context-enabled')).toEqual({ rejected: true, configurationError: true, fetches: 0, calls: 0, preparations: 0, environmentUnchanged: true });
});

test('an explicitly disabled parent context permits the offline proposal without changing environment', () => {
  expect(probe('context-disabled')).toEqual({ rejected: false, configurationError: false, fetches: 0, calls: 1, preparations: 1, environmentUnchanged: true });
});
