import { afterEach, expect, test } from 'bun:test';
import { mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadAtomicResourceProfile } from '@maaverge/automation';
import { openAtomicResourceSource } from '@backend/modules/resources/atomic-resource-source';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const templates = ['InfrastOverview.png', 'Rest.png', 'Work.png', 'Distract.png'];
async function resources() {
  const root = await makeTemporaryDirectory(path.join(os.tmpdir(), 'maa-atomic-source-'));
  roots.push(root);
  const resource = path.join(root, 'resource');
  await mkdir(path.join(resource, 'tasks'), { recursive: true });
  await mkdir(path.join(resource, 'template', 'nested'), { recursive: true });
  const taskFile = path.join(resource, 'tasks', 'tasks.json');
  await writeFile(
    taskFile,
    JSON.stringify({
      InfrastEnteredFlag: { template: templates[0] },
      InfrastSmiley: { template: templates.slice(1), maskRange: [100, 255] },
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
      InfrastDormConfirmButton: {
        algorithm: 'JustReturn',
        specificRect: [1108, 667, 22, 22],
      },
    }),
  );
  for (const template of templates) await writeFile(path.join(resource, 'template', template), '');
  await writeFile(path.join(resource, 'template', 'nested', 'Additional.png'), '');
  return { root, resource, taskFile };
}

test('generation and direct resource roots supply the same immutable profile and nested template identities', async () => {
  const files = await resources();
  const before = await readFile(files.taskFile);
  for (const directory of [files.root, files.resource]) {
    const source = await openAtomicResourceSource(directory);
    expect(source).not.toBeNull();
    const listed = await source!.listTemplates();
    expect(listed.complete).toBe(true);
    expect(listed.ids).toContain('nested/Additional.png');
    expect(listed.ids).toContain('Additional.png');
    const profile = await loadAtomicResourceProfile(source, 'Official', {
      resourceVersion: 'immutable-test',
    });
    expect(profile.available).toBe(true);
    expect(profile.resourceVersion).toBe('immutable-test');
    expect(
      profile.sources.find((entry) => entry.path === 'resource/tasks/tasks.json')?.sha256,
    ).toMatch(/^[a-f0-9]{64}$/);
  }
  expect(await readFile(files.taskFile)).toEqual(before);
});

test('fixed source reads retain traversal and byte-limit checks and support the legacy task filename', async () => {
  const files = await resources();
  await writeFile(path.join(files.root, 'outside.json'), '{"outside":true}');
  const source = await openAtomicResourceSource(files.root);
  expect(source).not.toBeNull();
  expect(await source!.read('../outside.json', 1024)).toBeUndefined();
  expect(await source!.read('tasks/tasks.json', 1)).toBeUndefined();
  expect(await source!.read('tasks/tasks.json', 8 * 1024 * 1024)).toBeInstanceOf(Uint8Array);
  await rename(files.taskFile, path.join(files.resource, 'tasks.json'));
  const profile = await loadAtomicResourceProfile(source, 'Official');
  expect(profile.available).toBe(true);
  expect(profile.sources.find((entry) => entry.path === 'resource/tasks.json')).toBeDefined();
});

test('task file and ancestor directory links cannot supply resource rules', async () => {
  const files = await resources();
  const outside = path.join(files.root, 'outside.json');
  await writeFile(outside, await readFile(files.taskFile));
  await rm(files.taskFile);
  await symlink(outside, files.taskFile);
  let source = await openAtomicResourceSource(files.root);
  expect(await source!.read('tasks/tasks.json', 8 * 1024 * 1024)).toBeUndefined();
  expect((await loadAtomicResourceProfile(source, 'Official')).available).toBe(false);

  await rm(path.join(files.resource, 'tasks'), { recursive: true });
  const outsideTasks = path.join(files.root, 'outside-tasks');
  await mkdir(outsideTasks);
  await writeFile(path.join(outsideTasks, 'tasks.json'), await readFile(outside));
  await symlink(
    outsideTasks,
    path.join(files.resource, 'tasks'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  source = await openAtomicResourceSource(files.root);
  expect((await loadAtomicResourceProfile(source, 'Official')).available).toBe(false);
});

test('linked generation and direct resource roots cannot be opened', async () => {
  const files = await resources();
  const generationAlias = path.join(files.root, 'generation-alias');
  const resourceAlias = path.join(files.root, 'resource-alias');
  const kind = process.platform === 'win32' ? 'junction' : 'dir';
  await symlink(files.root, generationAlias, kind);
  await symlink(files.resource, resourceAlias, kind);
  expect(await openAtomicResourceSource(generationAlias)).toBeNull();
  expect(await openAtomicResourceSource(resourceAlias)).toBeNull();
  expect(await openAtomicResourceSource(path.join(files.root, 'missing'))).toBeNull();
  expect(await openAtomicResourceSource('relative-resource-root')).toBeNull();
});

test('template aliases are rejected and an incomplete enumeration remains explicit', async () => {
  const files = await resources();
  await symlink(
    path.join(files.resource, 'template', templates[0]!),
    path.join(files.resource, 'template', 'Alias.png'),
  );
  const source = await openAtomicResourceSource(files.root);
  const listed = await source!.listTemplates();
  expect(listed.complete).toBe(false);
  expect(listed.ids).not.toContain('Alias.png');
  const profile = await loadAtomicResourceProfile(source, 'Official');
  expect(profile.diagnostics.join('；')).toContain('模板');
});
