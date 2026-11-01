import { afterEach, expect, test } from 'bun:test';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';
import { loadAtomicResourceProfile } from '@backend/modules/atomic/resources';
import { AtomicVision } from '@backend/modules/atomic/vision';
import type { AtomicExecutionPort, AtomicResourceProfile } from '@backend/modules/atomic/types';
import { validateRoomIdentity } from '@backend/modules/atomic/infrast';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const templates = [
  'InfrastOverview.png',
  'SmileyOnRest.png',
  'SmileyOnWork.png',
  'SmileyOnDistract.png',
  'BattleQuickFormationConfirm.png',
];
const nodes = () => ({
  InfrastEnteredFlag: { template: 'InfrastOverview.png' },
  InfrastSmiley: { template: templates.slice(1, 4), maskRange: [100, 255] },
  InfrastSkillsUpper: { roi: [400, 280, 880, 80] },
  InfrastSkillsLower: { roi: [400, 560, 880, 80] },
  InfrastOperNameOcr: { rectMove: [-8, 20, 125, 22] },
  InfrastOperFacilityOcr: { rectMove: [14, -230, 60, 30] },
  InfrastOperSelected: {
    specificRect: [-18, -220, 10, 160],
    rectMove: [18, 0, 10, 160],
    specialParams: [800],
    colorScales: [
      [
        [95, 0, 0],
        [105, 255, 255],
      ],
    ],
  },
  InfrastDormConfirmButton: { algorithm: 'JustReturn', specificRect: [1108, 667, 22, 22] },
  CharsNameOcrReplace: { baseTask: 'CharsNameOcrReplaceHotfix' },
});
async function resources(overrides: Record<string, unknown> = {}) {
  const root = await makeTemporaryDirectory(path.join(os.tmpdir(), 'maa-atomic-resources-'));
  roots.push(root);
  const resource = path.join(root, 'resource');
  await mkdir(path.join(resource, 'tasks', 'Copilot'), { recursive: true });
  await mkdir(path.join(resource, 'tasks', 'hotfix'), { recursive: true });
  const taskFile = path.join(resource, 'tasks', 'tasks.json');
  await writeFile(taskFile, JSON.stringify({ ...nodes(), ...overrides }));
  await writeFile(
    path.join(resource, 'tasks', 'Copilot', 'formation.json'),
    JSON.stringify({ BattleQuickFormationConfirm: { roi: [880, 608, 400, 112] } }),
  );
  await writeFile(
    path.join(resource, 'tasks', 'hotfix', 'ocr_replace.json'),
    JSON.stringify({
      CharsNameOcrReplaceHotfix: { algorithm: 'OcrDetect', ocrReplace: [['错字', '甲']] },
    }),
  );
  return { root, resource, taskFile };
}

test('reviewed fixed resource files preserve hashes, baseline and actual resource identity without writing inputs', async () => {
  const files = await resources();
  const before = await readFile(files.taskFile);
  const profile = await loadAtomicResourceProfile(files.root, 'Official', {
    availableTemplates: templates,
    resourceVersion: 'generation-test',
  });
  expect(profile.available).toBe(true);
  expect(profile.adapterBaseline?.ref).toBe('v6.20.0');
  expect(profile.adapterBaseline?.commit).toBe('71bce1cc85bce55d3b20e19066b2dd33252072fc');
  expect(profile.resourceVersion).toBe('generation-test');
  expect(profile.rules['operators.name'].replace).toEqual([['错字', '甲']]);
  expect(profile.rules['training.confirm'].source.path).toBe(
    'resource/tasks/Copilot/formation.json',
  );
  expect(profile.rules['training.confirm'].source.ref).toBe('generation-test');
  expect(
    profile.sources.find((source) => source.path === 'resource/tasks/tasks.json')?.sha256,
  ).toMatch(/^[a-f0-9]{64}$/);
  expect(await readFile(files.taskFile)).toEqual(before);
  expect(
    (await loadAtomicResourceProfile(files.resource, 'Bilibili', { availableTemplates: templates }))
      .available,
  ).toBe(true);
});

test('unsupported clients, missing templates and unsupported algorithm drift are explicitly unavailable', async () => {
  const files = await resources();
  const foreign = await loadAtomicResourceProfile(files.root, 'YoStarEN', {
    availableTemplates: templates,
  });
  expect(foreign.available).toBe(false);
  expect(foreign.rules).toEqual({});
  const missing = await loadAtomicResourceProfile(files.root, 'Official', {
    availableTemplates: [],
  });
  expect(missing.available).toBe(false);
  expect(missing.diagnostics.join(',')).toContain('模板');
  await writeFile(
    files.taskFile,
    JSON.stringify({
      ...nodes(),
      InfrastEnteredFlag: { template: 'InfrastOverview.png', method: 'RGBCount' },
    }),
  );
  const drift = await loadAtomicResourceProfile(files.root, 'Official', {
    availableTemplates: templates,
  });
  expect(drift.rules['base.entered']).toBeUndefined();
  expect(drift.available).toBe(false);
});

test('task file links and cyclic inheritance do not escape the explicit adapter boundary', async () => {
  const files = await resources();
  const outside = path.join(files.root, 'outside.json');
  await writeFile(outside, JSON.stringify(nodes()));
  await rm(files.taskFile);
  await symlink(outside, files.taskFile);
  expect(
    (await loadAtomicResourceProfile(files.root, 'Official', { availableTemplates: templates }))
      .available,
  ).toBe(false);
  await rm(files.taskFile);
  await writeFile(
    files.taskFile,
    JSON.stringify({
      ...nodes(),
      InfrastEnteredFlag: { baseTask: 'Loop' },
      Loop: { baseTask: 'InfrastEnteredFlag' },
    }),
  );
  const cycle = await loadAtomicResourceProfile(files.root, 'Official', {
    availableTemplates: templates,
  });
  expect(cycle.available).toBe(false);
  expect(cycle.rules['base.entered']).toBeUndefined();
});

test('room identity gate requires a full position for repeated facilities and rejects singleton ordinals', () => {
  for (const facility of ['Mfg', 'Trade', 'Power', 'Dorm'] as const) {
    expect(() => validateRoomIdentity({ facility, room: 1 })).toThrow('position');
    expect(() => validateRoomIdentity({ facility, room: 1, position: 'B1' })).toThrow('position');
    expect(() => validateRoomIdentity({ facility, room: 1, position: 'B101' })).not.toThrow();
  }
  expect(() => validateRoomIdentity({ facility: 'Processing', room: 2 })).toThrow('room=1');
  expect(() => validateRoomIdentity({ facility: 'Recycle', room: 1 })).not.toThrow();
});

function emptyProfile(): AtomicResourceProfile {
  return {
    id: 'synthetic',
    clientType: 'Official',
    available: false,
    diagnostics: [],
    rules: {},
    actions: {},
    card: null,
    sources: [],
  };
}
test('semantic actions reject a nonstandard coordinate frame before sending any mutation', async () => {
  const calls: string[] = [];
  const port: AtomicExecutionPort = {
    async execute(operation) {
      calls.push(operation);
      return { frameId: 'synthetic', width: 1281, height: 720, data: 'synthetic-test-frame' };
    },
  };
  const profile = emptyProfile();
  profile.actions.action = { box: [0, 0, 10, 10], delayMs: 0 };
  await expect(new AtomicVision(port, profile).action('action')).rejects.toThrow('16:9');
  expect(calls).toEqual(['frame']);
});

test('immutable-frame recognitions accept truthful fresh=false while mutation takes a new frame and rechecks identity', async () => {
  const calls: { operation: string; frameId?: unknown }[] = [];
  let frames = 0;
  const port: AtomicExecutionPort = {
    async execute(operation, input) {
      calls.push({ operation, frameId: input.frameId });
      if (operation === 'frame')
        return { frameId: `f${++frames}`, width: 1280, height: 720, data: 'synthetic-test-frame' };
      if (operation === 'recognize')
        return {
          fresh: false,
          hit: true,
          coordinateSize: [1280, 720],
          matches: [{ box: [410, 300, 125, 22], score: 1, text: '甲' }],
        };
      return { accepted: true };
    },
  };
  const profile = emptyProfile();
  profile.card = {
    regions: [[400, 280, 880, 80]],
    nameOffset: [-8, 20, 125, 22],
    facilityOffset: [14, -230, 60, 30],
    selectedOffset: [-18, -220, 10, 160],
    clickOffset: [18, 0, 10, 160],
    selectedCount: 800,
    selectedLower: [95, 0, 0],
    selectedUpper: [105, 255, 255],
  };
  profile.rules['operators.name'] = {
    id: 'name',
    kind: 'ocr',
    source: { repository: 'synthetic', ref: 'test', path: 'test' },
  };
  const vision = new AtomicVision(port, profile);
  const old = await vision.frame();
  expect((await vision.recognize(old, profile.rules['operators.name'])).hit).toBe(true);
  await vision.clickCard({ name: '甲', selected: false, box: [418, 60, 10, 160] });
  expect(calls.filter((call) => call.operation === 'click').map((call) => call.frameId)).toEqual([
    'f2',
  ]);
});

test('explicit Mfg Trade Power Full and Mini rules preserve the reviewed pure-color RGBCount semantics', async () => {
  const rules: Record<string, unknown> = {},
    pureTemplates: string[] = [];
  for (const facility of ['Mfg', 'Trade', 'Power'])
    for (const suffix of ['', 'Mini']) {
      const template = `PureColor${facility}${suffix}.png`;
      pureTemplates.push(template);
      rules[`Infrast${facility}${suffix}`] = {
        template,
        method: 'RGBCount',
        pureColor: true,
        colorScales: [
          [
            [21, 174, 225],
            [81, 234, 255],
          ],
        ],
        templThreshold: 0.95,
        nmsDistance: 40,
        roi: suffix ? [0, 240, 640, 400] : [0, 200, 820, 520],
      };
    }
  const files = await resources(rules);
  const profile = await loadAtomicResourceProfile(files.root, 'Official', {
    availableTemplates: [...templates, ...pureTemplates],
  });
  for (const facility of ['Mfg', 'Trade', 'Power'])
    for (const suffix of ['', '.mini']) {
      const rule = profile.rules[`facility.icon.${facility}${suffix}`];
      expect(rule.method).toBe('RGBCount');
      expect(rule.pureColor).toBe(true);
      expect(rule.colorWithClose).toBe(true);
      expect(rule.nmsDistance).toBe(40);
      expect(rule.colorScales).toEqual([
        [
          [21, 174, 225],
          [81, 234, 255],
        ],
      ]);
    }
});

test('pure-color Mini hits do not prove Mini view and never outrank a Full hit', async () => {
  const { observeFacility } = await import('@backend/modules/atomic/infrast');
  const profile = emptyProfile();
  const source = { repository: 'synthetic', ref: 'test', path: 'test' };
  profile.rules['facility.icon.Mfg'] = {
    id: 'full',
    kind: 'template',
    templateId: 'full',
    method: 'RGBCount',
    pureColor: true,
    source,
  };
  profile.rules['facility.icon.Mfg.mini'] = {
    id: 'mini',
    kind: 'template',
    templateId: 'mini',
    method: 'RGBCount',
    pureColor: true,
    source,
  };
  let fullHit = true;
  const calls: string[] = [];
  const port: AtomicExecutionPort = {
    async execute(operation, input) {
      if (operation === 'frame')
        return { frameId: 'synthetic', width: 1280, height: 720, data: 'synthetic' };
      calls.push(String(input.templateId));
      const matches =
        input.templateId === 'full' && !fullHit
          ? []
          : [{ box: [400, 300, 12, 85], score: input.templateId === 'full' ? 0.96 : 0.99 }];
      return { hit: matches.length > 0, coordinateSize: [1280, 720], matches };
    },
  };
  const vision = new AtomicVision(port, profile);
  expect((await observeFacility(vision, 'Mfg')).view).toBe('normal');
  expect(calls).toEqual(['full']);
  fullHit = false;
  calls.length = 0;
  expect((await observeFacility(vision, 'Mfg')).view).toBe('unknown');
  expect(calls).toEqual(['full', 'mini']);
});
