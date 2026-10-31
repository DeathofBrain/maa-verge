import { readdirSync } from 'node:fs';
import path from 'node:path';

// These suites assert portable domain behavior. Files/Store used only to prepare
// ordinary fixtures do not make a suite platform-specific. Keep process/env,
// links, atomic publication, SQLite ownership/recovery and native integration in
// the platform group. New tests stay in that group until explicitly reviewed.
export const portableRuntimeTests = Object.freeze([
  'packages/agent/tests/deterministic.test.ts',
  'packages/agent/tests/langchain.test.ts',
  'packages/agent/tests/maa-tools.test.ts',
  'packages/agent/tests/proposal-policy.test.ts',
  'services/backend/tests/agent-module.test.ts',
  'services/backend/tests/agent-parity.test.ts',
  'services/backend/tests/connection-errors.test.ts',
  'services/backend/tests/copilot-sort.test.ts',
  'services/backend/tests/copilot-stages.test.ts',
  'services/backend/tests/default-plan.test.ts',
  'services/backend/tests/home-info.test.ts',
  'services/backend/tests/policy-parity.test.ts',
  'services/backend/tests/rpc-transport.test.ts',
  'services/backend/tests/stages.test.ts',
  'services/backend/tests/system-errors.test.ts',
  'services/backend/tests/tool-exports.test.ts',
]);

const portable = new Set(portableRuntimeTests);
export const runtimeTestDirectories = ['packages/agent/tests', 'services/backend/tests'];

export function discoverRuntimeTests(root) {
  const files = [];
  function visit(relative) {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (
        entry.isFile() &&
        /(?:\.test|_test|\.spec)\.(?:[cm]?[jt]s|[jt]sx)$/u.test(entry.name)
      )
        files.push(file);
    }
  }
  for (const directory of runtimeTestDirectories) visit(directory);
  return files.sort();
}

export function partitionRuntimeTests(files) {
  const groups = { portable: [], platform: [] };
  for (const file of files) groups[portable.has(file) ? 'portable' : 'platform'].push(file);
  return groups;
}

export function parseRuntimeArguments(args) {
  if (args.length === 0) return { platformOnly: false };
  if (args.length === 1 && args[0] === '--platform') return { platformOnly: true };
  throw new Error('Usage: node tools/test-runtime.mjs [--platform]');
}

export function selectRuntimeTests(
  files,
  { platformOnly = false, platform = process.platform } = {},
) {
  return platformOnly && platform !== 'linux' ? partitionRuntimeTests(files).platform : [...files];
}
