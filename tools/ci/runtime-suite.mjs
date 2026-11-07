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
  'update-run-completion',
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
  const options = { platformOnly: false, requireNative: false, files: [] };
  const patternOption = '--test-name-pattern';
  const usage =
    'Usage: node tools/test-runtime.mjs [--platform | <test-file>...] [--require-native] [--test-name-pattern <regex>]';
  const fail = (message) => {
    throw new Error(`${message}\n${usage}`);
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--platform' || arg === '--require-native') {
      const key = arg === '--platform' ? 'platformOnly' : 'requireNative';
      if (options[key]) fail(`Duplicate runtime option: ${arg}`);
      options[key] = true;
    } else if (arg === patternOption || arg.startsWith(`${patternOption}=`)) {
      if (options.testNamePattern !== undefined) fail('Duplicate runtime test-name pattern');
      const pattern = arg === patternOption ? args[++index] : arg.slice(patternOption.length + 1);
      if (!pattern || (arg === patternOption && pattern.startsWith('--')))
        fail('A nonempty test-name pattern is required; use = for a pattern starting with --');
      try {
        new RegExp(pattern);
      } catch {
        fail(`Invalid runtime test-name pattern: ${pattern}`);
      }
      options.testNamePattern = pattern;
    } else {
      if (arg.startsWith('-')) fail(`Unknown runtime option: ${arg}`);
      const file = arg.replaceAll('\\', '/').replace(/^\.\//u, '');
      if (
        file.split('/').some((part) => part === '.' || part === '..') ||
        !runtimeTestDirectories.some((directory) => file.startsWith(`${directory}/`)) ||
        !/(?:\.test|_test|\.spec)\.(?:[cm]?[jt]s|[jt]sx)$/u.test(file)
      )
        fail(`Expected a repository-relative backend or Agent test file: ${arg}`);
      if (options.files.includes(file)) fail(`Duplicate runtime test file: ${file}`);
      options.files.push(file);
    }
  }
  if (options.platformOnly && (options.files.length || options.testNamePattern !== undefined))
    fail('--platform cannot be combined with test files or a test-name pattern');
  return options;
}

export function selectRuntimeTests(
  files,
  { platformOnly = false, platform = process.platform, files: requested = [] } = {},
) {
  if (requested.length) {
    if (platformOnly) throw new Error('--platform cannot be combined with test files');
    const discovered = new Set(files);
    for (const file of requested)
      if (!discovered.has(file)) throw new Error(`Runtime test file was not discovered: ${file}`);
    return [...requested];
  }
  if (!platformOnly || platform === 'linux') return [...files];
  const selected = platformRuntimeTests[platform];
  if (!selected) throw new Error(`No runtime suite is defined for platform ${platform}`);
  const discovered = new Set(files);
  for (const file of selected)
    if (!discovered.has(file))
      throw new Error(`Required platform runtime suite is missing: ${file}`);
  return [...selected].sort();
}
