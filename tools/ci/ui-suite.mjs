import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { root as repositoryRoot } from '../project.mjs';

const require = createRequire(import.meta.url);
const specs = (...names) => names.map((name) => `tests/ui/${name}.spec.ts`);
const domains = {
  agent: specs('workspace', 'autosave-context-menu'),
  copilot: specs(
    'copilot-attribution',
    'copilot-cache',
    'copilot-center',
    'copilot-details',
    'copilot-layout',
    'copilot-library-actions',
    'copilot-library',
    'copilot-operators',
    'copilot-selection',
    'copilot-set-operators',
    'copilot-sorting',
    'copilot-stage-autocomplete',
  ),
  devices: specs(
    'devices',
    'device-management',
    'device-selection',
    'preview',
    'connection-settings',
    'multi-instance',
    'task-center',
    'multi-run',
    'history-device-deletion',
  ),
  execution: specs(
    'execution',
    'execution-monitor',
    'multi-run',
    'history-device-deletion',
    'workspace',
    'preview',
    'copilot-center',
    'toolbox-scheduler',
  ),
  history: specs('history-device-deletion', 'execution-monitor', 'workspace'),
  home: specs('workspace', 'game-info', 'component-readiness', 'stages'),
  plans: specs(
    'autosave-context-menu',
    'plan-deletion',
    'task-batch-actions',
    'task-center',
    'workspace',
    'stages',
    'device-selection',
    'execution',
    'multi-run',
    'drawer-navigation',
    'select',
  ),
  schedules: specs('toolbox-scheduler', 'task-center'),
  settings: specs(
    'configuration-settings',
    'connection-settings',
    'download-proxy-settings',
    'log-settings',
    'mirrorchyan-settings',
    'notification-settings',
    'directory-picker',
    'multi-instance',
    'app-updates',
    'component-updates',
    'workspace',
    'select',
  ),
  tools: specs('recognition', 'toolbox-scheduler', 'workspace'),
  updates: specs('app-updates', 'component-updates', 'component-readiness', 'workspace'),
};
const knownSpecs = new Set([
  ...Object.values(domains).flat(),
  ...specs(
    'desktop-lifecycle',
    'external-links',
    'modal-effects',
    'sidebar-resize',
    'window-controls',
  ),
]);

// Titles are resolved against the current source, so unrelated edits cannot stale line selectors.
export const smokeTests = [
  ['workspace', 'home shows runtime information and task tables have their own navigation entry'],
  [
    'autosave-context-menu',
    'valid parameters and metadata automatically persist without manual saving',
  ],
  [
    'autosave-context-menu',
    'failed and invalid saves retain drafts and can be corrected or retried',
  ],
  [
    'workspace',
    'unsaved task drafts survive navigation and page reloads without corrupting saved data',
  ],
  ['workspace', 'the persistent run dock reports progress and stop preserves the plan and history'],
  [
    'plan-deletion',
    'task arrangement exposes deletion, cancel preserves the draft, and deletion keeps history after reload',
  ],
  [
    'devices',
    'an asynchronous connection that stays offline reports pending readiness without claiming success',
  ],
  ['devices', 'an explicit asynchronous connection failure finishes promptly and permits retry'],
  ['workspace', 'Fight consumption limits save directly and all-disabled execution is rejected'],
  [
    'copilot-center',
    'local preview, duplicate queue entries and ordered edits persist without creating task tables',
  ],
  [
    'copilot-center',
    'independent execution stays in the center, fixes its queue snapshot and supports source navigation and stop',
  ],
  [
    'app-updates',
    'app download survives navigation and installation requires explicit confirmation',
  ],
  [
    'connection-settings',
    'shared connection settings persist native profile, ADB, touch and bridge preferences',
  ],
  [
    'configuration-settings',
    'configuration directory saves for restart and can be restored without switching live data',
  ],
  ['workspace', 'Agent proposes a reviewable plan without starting a run'],
].map(([name, title]) => ({ file: specs(name)[0], title }));

function normalize(file) {
  if (typeof file !== 'string') throw new Error('UI change paths must be strings');
  const normalized = file.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!normalized || normalized.startsWith('/') || /(^|\/)\.\.?($|\/)|:/u.test(normalized))
    throw new Error(`Invalid repository UI path: ${file}`);
  return normalized;
}

export function selectUiSpecs(paths) {
  if (!Array.isArray(paths)) throw new Error('UI change paths must be an array');
  const files = new Set();
  for (const changed of paths) {
    let file;
    try {
      file = normalize(changed);
    } catch {
      return { full: true, files: [] };
    }
    if (file.startsWith('tests/ui/')) {
      if (!knownSpecs.has(file)) return { full: true, files: [] };
      files.add(file);
    } else if (file.startsWith('apps/desktop/')) {
      if (file.startsWith('apps/desktop/src-tauri/')) continue;
      const domain = /^apps\/desktop\/src\/features\/([^/]+)\//u.exec(file)?.[1];
      if (!domain || !Object.hasOwn(domains, domain)) return { full: true, files: [] };
      for (const spec of domains[domain]) files.add(spec);
    } else if (
      file.startsWith('packages/contracts/') ||
      file.startsWith('tests/fixtures/') ||
      file === 'playwright.config.ts' ||
      file === 'tools/serve-test-ui.mjs' ||
      file === 'tools/ci/ui-suite.mjs' ||
      file === 'tools/ci/test-ui.mjs' ||
      file === 'services/backend/src/shared/errors.ts'
    ) {
      return { full: true, files: [] };
    } else if (
      file.startsWith('services/backend/src/modules/home/') ||
      file === 'services/backend/src/modules/recognition/user-data-sync.ts'
    ) {
      for (const spec of domains.home) files.add(spec);
    }
  }
  return { full: false, files: [...files].sort() };
}

function testLocations(file, root) {
  // Path planning also runs before pnpm install; only test execution needs the parser.
  const ts = require('typescript');
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) throw new Error(`UI spec is missing: ${file}`);
  const source = ts.createSourceFile(
    file,
    readFileSync(absolute, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const locations = new Map();
  const disabledScope = (node) => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (
        ts.isCallExpression(parent) &&
        ts.isPropertyAccessExpression(parent.expression) &&
        ['skip', 'fixme'].includes(parent.expression.name.text)
      )
        return true;
    }
    return false;
  };
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'test' &&
      node.arguments.length >= 2 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      !disabledScope(node)
    ) {
      const title = node.arguments[0].text;
      const lines = locations.get(title) || [];
      lines.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
      locations.set(title, lines);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return locations;
}

export function resolveUiTargets({ ui, uiFiles = [] }, root = repositoryRoot) {
  if (ui === 'none' || ui === 'full') return [];
  if (ui !== 'selected') throw new Error(`Unknown CI UI selection: ${ui}`);
  if (!Array.isArray(uiFiles)) throw new Error('CI uiFiles must be an array');
  const wholeFiles = new Set(uiFiles.map(normalize));
  for (const file of wholeFiles) {
    if (!knownSpecs.has(file) || !existsSync(path.join(root, file)))
      throw new Error(`Unknown or missing selected UI spec: ${file}`);
  }
  const locations = new Map();
  const targets = [];
  for (const { file, title } of smokeTests) {
    if (!locations.has(file)) locations.set(file, testLocations(file, root));
    const lines = locations.get(file).get(title);
    if (lines?.length !== 1)
      throw new Error(`Expected exactly one smoke test in ${file}: ${title}`);
    if (!wholeFiles.has(file)) targets.push(`${file}:${lines[0]}`);
  }
  return [...targets, ...[...wholeFiles].sort()];
}
