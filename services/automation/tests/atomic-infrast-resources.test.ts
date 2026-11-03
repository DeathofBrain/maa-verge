import { unexpectedPipeline } from './pipeline-fixture';
import { expect, test } from 'bun:test';
import { loadAtomicResourceProfile, createInfrastCapabilities } from '@maaverge/automation';
import { AtomicVision } from '@maaverge/automation';
import type {
  AtomicExecutionPort,
  AtomicResourceProfile,
  AtomicResourceSource,
} from '@maaverge/automation';
import { validateRoomIdentity } from '@maaverge/automation';

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
function resources(overrides: Record<string, unknown> = {}) {
  const files = new Map<string, Uint8Array>([
    [
      'battle_data.json',
      new TextEncoder().encode(
        JSON.stringify({ chars: { char_test_a: { name: '甲' }, char_test_b: { name: '乙' } } }),
      ),
    ],
    ['tasks/tasks.json', new TextEncoder().encode(JSON.stringify({ ...nodes(), ...overrides }))],
    [
      'tasks/Copilot/formation.json',
      new TextEncoder().encode(
        JSON.stringify({ BattleQuickFormationConfirm: { roi: [880, 608, 400, 112] } }),
      ),
    ],
    [
      'tasks/hotfix/ocr_replace.json',
      new TextEncoder().encode(
        JSON.stringify({
          CharsNameOcrReplaceHotfix: { algorithm: 'OcrDetect', ocrReplace: [['错字', '甲']] },
        }),
      ),
    ],
  ]);
  const source: AtomicResourceSource = {
    async read(relative, maxBytes) {
      const bytes = files.get(relative);
      return bytes && bytes.length <= maxBytes ? bytes : undefined;
    },
    async listTemplates() {
      return { ids: [...templates], complete: true };
    },
  };
  return { source, files };
}

test('reviewed resource bytes preserve hashes, baseline and actual identity without mutating inputs', async () => {
  const { source, files } = resources();
  const before = new Uint8Array(files.get('tasks/tasks.json')!);
  const profile = await loadAtomicResourceProfile(source, 'Official', {
    resourceVersion: 'generation-test',
  });
  expect(profile.available).toBe(true);
  expect(profile.adapterBaseline?.ref).toBe('v6.20.0');
  expect(profile.adapterBaseline?.commit).toBe('71bce1cc85bce55d3b20e19066b2dd33252072fc');
  expect(profile.resourceVersion).toBe('generation-test');
  expect(profile.operatorNames?.names).toEqual(['甲', '乙']);
  expect(profile.operatorNames?.source).toMatchObject({
    ref: 'generation-test',
    path: 'resource/battle_data.json',
  });
  expect(profile.operatorNames?.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(profile.rules['operators.name'].replace).toEqual([['错字', '甲']]);
  expect(profile.rules['training.confirm'].source.path).toBe(
    'resource/tasks/Copilot/formation.json',
  );
  expect(profile.rules['training.confirm'].source.ref).toBe('generation-test');
  expect(
    profile.sources.find((source) => source.path === 'resource/tasks/tasks.json')?.sha256,
  ).toMatch(/^[a-f0-9]{64}$/);
  expect(files.get('tasks/tasks.json')).toEqual(before);
  expect(
    (await loadAtomicResourceProfile(source, 'Bilibili', { availableTemplates: templates }))
      .available,
  ).toBe(true);
});

test('missing or malformed same-generation name dictionaries disable card semantics explicitly', async () => {
  const { source, files } = resources();
  const port: AtomicExecutionPort = {
    runPipeline: unexpectedPipeline,
    execute: async () => {
      throw new Error('resource checks must not operate a device');
    },
  };
  for (const bytes of [
    undefined,
    new TextEncoder().encode(JSON.stringify({ chars: { char_test: { name: 1 } } })),
  ]) {
    if (bytes) files.set('battle_data.json', bytes);
    else files.delete('battle_data.json');
    const profile = await loadAtomicResourceProfile(source);
    expect(profile.operatorNames).toBeUndefined();
    const observation = createInfrastCapabilities(port, profile).find(
      (entry) => entry.descriptor.id === 'observation.operators',
    )!;
    expect(observation.descriptor.available).toBe(false);
    expect(observation.descriptor.requiredResources).toContain('operators.dictionary');
    expect(observation.descriptor.unavailableReason).toContain('operators.dictionary');
  }
});

test('unsupported clients, missing templates and unsupported algorithm drift are explicitly unavailable', async () => {
  const { source, files } = resources();
  const foreign = await loadAtomicResourceProfile(source, 'YoStarEN', {
    availableTemplates: templates,
  });
  expect(foreign.available).toBe(false);
  expect(foreign.rules).toEqual({});
  const missing = await loadAtomicResourceProfile(source, 'Official', {
    availableTemplates: [],
  });
  expect(missing.available).toBe(false);
  expect(missing.diagnostics.join(',')).toContain('模板');
  files.set(
    'tasks/tasks.json',
    new TextEncoder().encode(
      JSON.stringify({
        ...nodes(),
        InfrastEnteredFlag: { template: 'InfrastOverview.png', method: 'RGBCount' },
      }),
    ),
  );
  const drift = await loadAtomicResourceProfile(source, 'Official', {
    availableTemplates: templates,
  });
  expect(drift.rules['base.entered']).toBeUndefined();
  expect(drift.available).toBe(false);
});

test('cyclic inheritance cannot provide an adapted rule', async () => {
  const { source } = resources({
    InfrastEnteredFlag: { baseTask: 'Loop' },
    Loop: { baseTask: 'InfrastEnteredFlag' },
  });
  const cycle = await loadAtomicResourceProfile(source, 'Official', {
    availableTemplates: templates,
  });
  expect(cycle.available).toBe(false);
  expect(cycle.rules['base.entered']).toBeUndefined();
});

test('unique template suffixes bind real active-view IDs including per-template overrides and thresholds', async () => {
  const { source } = resources({
    InfrastFilterMenuCancelNotStationed: {
      template: ['FilterA.png', 'FilterB.png'],
      templThreshold: [0.73, 0.95],
    },
  });
  const actualIds = [...templates, 'FilterA.png', 'FilterB.png'].map((id) => `Infrast/${id}`);
  const profile = await loadAtomicResourceProfile(source, 'Official', {
    availableTemplates: actualIds,
  });
  expect(profile.available).toBe(true);
  expect(profile.rules['base.entered'].templateId).toBe('Infrast/InfrastOverview.png');
  expect(profile.rules['operators.anchor.1'].templateId).toBe('Infrast/SmileyOnWork.png');
  expect(profile.rules['operators.filter.1'].templateId).toBe('Infrast/FilterB.png');
  expect(profile.rules['operators.filter.1'].threshold).toBe(0.95);
  const used: unknown[] = [];
  const port: AtomicExecutionPort = {
    runPipeline: unexpectedPipeline,
    async execute(operation, input) {
      if (operation === 'frame')
        return { frameId: 'synthetic-frame', width: 1280, height: 720, data: 'fixture' };
      if (operation !== 'recognize') throw new Error('read-only template binding fixture');
      used.push(input.templateId);
      return {
        hit: true,
        coordinateSize: [1280, 720],
        matches: [{ box: [10, 10, 5, 5], score: 1 }],
      };
    },
  };
  expect((await new AtomicVision(port, profile).match('base.entered')).hit).toBe(true);
  expect(used).toEqual(['Infrast/InfrastOverview.png']);
});

test('exact template IDs win and ambiguous suffixes never guess a theme', async () => {
  const { source } = resources();
  const exact = await loadAtomicResourceProfile(source, 'Official', {
    availableTemplates: [...templates, 'OtherTheme/InfrastOverview.png'],
  });
  expect(exact.rules['base.entered'].templateId).toBe('InfrastOverview.png');
  const ambiguous = await loadAtomicResourceProfile(source, 'Official', {
    availableTemplates: [
      ...templates.filter((id) => id !== 'InfrastOverview.png'),
      'ThemeA/InfrastOverview.png',
      'ThemeB/InfrastOverview.png',
    ],
  });
  expect(ambiguous.available).toBe(false);
  expect(ambiguous.rules['base.entered']).toBeUndefined();
  expect(ambiguous.diagnostics.join('；')).toContain('无法唯一定位');
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
    runPipeline: unexpectedPipeline,
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
    runPipeline: unexpectedPipeline,
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
  profile.operatorNames = {
    names: ['甲'],
    source: {
      repository: 'synthetic',
      ref: 'test',
      path: 'battle_data.json',
      sha256: '0'.repeat(64),
    },
  };
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
  await vision.clickCard({
    name: '甲',
    rawName: '甲',
    nameVerified: true,
    selected: false,
    box: [418, 60, 10, 160],
  });
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
  const { source } = resources(rules);
  const profile = await loadAtomicResourceProfile(source, 'Official', {
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
  const { observeFacility } = await import('@maaverge/automation');
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
    runPipeline: unexpectedPipeline,
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
