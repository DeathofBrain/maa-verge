import { readdirSync } from 'node:fs';
import path from 'node:path';

// Linux runs every discovered suite. Other hosts exercise the OS boundaries;
// add new platform-specific regressions here instead of duplicating domain tests.
const backendTests = (...names) => names.map((name) => `services/backend/tests/${name}.test.ts`);
const common = backendTests(
  'runtime',
  'lifecycle',
  'config-location',
  'archives',
  'snapshot-integrity',
  'generation-retention',
  'updates',
  'update-activation',
  'bundled-components',
  'copilot-storage',
  'native-environment',
  'emulator-leases',
  'multi-instance',
  'download',
  'download-reconnect',
  'download-proxy-routing',
  'network-proxy',
  'app-update-http',
  'mirrorchyan',
);
export const platformRuntimeTests = Object.freeze({
  win32: Object.freeze([...common, ...backendTests('windows-adb', 'ld-discovery')]),
  darwin: Object.freeze([
    ...common,
    ...backendTests(
      'component-locations',
      'component-namespaces',
      'macos-components',
      'macos-core',
      'macos-mirror-capabilities',
    ),
  ]),
});
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

export function parseRuntimeArguments(args) {
  if (
    new Set(args).size !== args.length ||
    args.some((arg) => !['--platform', '--require-native'].includes(arg))
  )
    throw new Error('Usage: node tools/test-runtime.mjs [--platform] [--require-native]');
  return {
    platformOnly: args.includes('--platform'),
    requireNative: args.includes('--require-native'),
  };
}

export function selectRuntimeTests(
  files,
  { platformOnly = false, platform = process.platform } = {},
) {
  if (!platformOnly || platform === 'linux') return [...files];
  const selected = platformRuntimeTests[platform];
  if (!selected) throw new Error(`No runtime suite is defined for platform ${platform}`);
  const discovered = new Set(files);
  for (const file of selected)
    if (!discovered.has(file))
      throw new Error(`Required platform runtime suite is missing: ${file}`);
  return [...selected].sort();
}
