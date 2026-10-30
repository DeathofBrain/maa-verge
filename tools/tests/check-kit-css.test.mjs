import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectRules,
  inspectHostStylesheets,
  inspectKitStylesheet,
  inspectSelector,
  inspectSharedImports,
  splitSelectorList,
  stripComments,
} from '../check-kit-css.mjs';

test('kit selectors built from kit classes, attributes and registered pseudo-classes pass', () => {
  for (const selector of [
    '.mv-button',
    '.mv-button--sm',
    '.mv-switch[aria-checked="true"]',
    '.mv-button:hover',
    '.mv-button:focus-visible',
    '.mv-input::placeholder',
    '.mv-overlay:not([hidden])',
    '.mv-field > .mv-field-error',
    '.mv-pill[data-tone="danger"]',
    '.mv-a, .mv-b--c',
  ])
    assert.deepEqual(inspectSelector(selector), [], selector);
});

test('selectors reaching outside the kit are rejected', () => {
  for (const selector of [
    '.mv-field .mv-field-error',
    '.settings-workspace .mv-setting-row',
    '.mv-list li',
    '.mv-list + .mv-list',
    '.mv-list ~ .mv-list',
    '.mv-a > .mv-b > .mv-c',
    '#mv-field',
    '.sp-field',
    '*',
    ':root[data-theme="dark"] .mv-x',
    '.mv-a:slotted(.mv-b)',
  ])
    assert.notDeepEqual(inspectSelector(selector), [], selector);
});

test('selector lists are split on top-level commas only', () => {
  assert.deepEqual(splitSelectorList('.mv-a, .mv-b'), ['.mv-a', '.mv-b']);
  assert.deepEqual(splitSelectorList('.mv-a:not(.mv-b, .mv-c)'), ['.mv-a:not(.mv-b, .mv-c)']);
});

test('comments are blanked without shifting line numbers', () => {
  const stripped = stripComments('a {\n  /* note\n     more */\n  color: red;\n}');
  assert.equal(stripped.split('\n').length, 5);
  assert.equal(stripped.includes('note'), false);
});

test('keyframe steps are skipped while selectors inside at-rules are still checked', () => {
  const css = [
    '@keyframes mv-spin {',
    '  from { opacity: 0; }',
    '  50% { opacity: 1; }',
    '  to { opacity: 0; }',
    '}',
    '@media (max-width: 760px) {',
    '  .mv-ok { padding: 0; }',
    '  .mv-bad .mv-worse { padding: 0; }',
    '}',
  ].join('\n');
  const violations = inspectKitStylesheet(css);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /:8 .*后代组合器/);
});

test('!important and @import are rejected with their line numbers', () => {
  const violations = inspectKitStylesheet(
    ".mv-a {\n  color: red !important;\n}\n@import './x.css';",
  );
  assert.equal(violations.length, 2);
  assert.match(violations[0], /:2 禁止使用 !important/);
  assert.match(violations[1], /:4 禁止 @import/);
});

test('collectRules records the line where a selector starts', () => {
  const rules = collectRules('\n\n.mv-a,\n.mv-b {\n  color: red;\n}');
  assert.deepEqual(
    rules.map((rule) => [rule.line, rule.prelude]),
    [[3, '.mv-a,\n.mv-b']],
  );
});

test('host stylesheets may not restyle kit internals', () => {
  const violations = inspectHostStylesheets([
    { file: 'a.css', css: '.mv-button { color: red; }' },
    { file: 'b.css', css: '/* .mv-button */\n.moving-panel { color: red; }' },
    { file: 'c.css', css: '.tc-heading { color: red; }' },
  ]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /^a\.css:1 /);
});

test('a stylesheet may be imported by at most one other stylesheet', () => {
  const importing = (file, target) => ({ file, css: `@import '${target}';\n` });
  assert.deepEqual(inspectSharedImports([]), []);
  assert.deepEqual(inspectSharedImports([importing('a.css', './shared.css')]), []);
  assert.deepEqual(
    inspectSharedImports([importing('a.css', './one.css'), importing('b.css', './two.css')]),
    [],
  );
  const duplicated = inspectSharedImports([
    importing('a.css', './shared.css'),
    importing('sub/b.css', '../shared.css'),
  ]);
  assert.equal(duplicated.length, 1);
  assert.match(duplicated[0], /^shared\.css 被 @import 2 次（a\.css:1、sub\/b\.css:1）/);
});
