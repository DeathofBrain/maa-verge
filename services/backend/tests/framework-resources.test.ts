import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { link, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';
import {
  frameworkVersion,
  prepareFrameworkResources,
  resolveFrameworkSdk,
} from '../src/modules/framework/resources';
import assets from '../../../3rdparty/maaframework/runtime-assets.json';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
async function write(root: string, relative: string, bytes: Uint8Array | string) {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), bytes);
}
async function fixture(run: (root: string, source: string, destination: string) => Promise<void>) {
  const root = await makeTemporaryDirectory(path.join(os.tmpdir(), 'maaverge-framework-view-'));
  const source = path.join(root, 'source'),
    destination = path.join(root, 'views');
  await write(source, 'template/Ready.png', png);
  await write(source, 'template/items/item.png', png);
  await write(source, 'PaddleOCR/det/inference.onnx', 'base detector');
  await write(source, 'PaddleOCR/rec/inference.onnx', 'base recognizer');
  await write(source, 'PaddleOCR/rec/keys.txt', 'base dictionary');
  await write(source, 'LICENSE.md', 'source resource license');
  try {
    await run(root, source, destination);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
describe('immutable framework resource views', () => {
  test('loads an active generation resource subtree and preserves both source and license roots', () =>
    fixture(async (root, source, destination) => {
      const generation = path.join(root, 'generation');
      const resource = path.join(generation, 'resource');
      await mkdir(generation);
      await rename(source, resource);
      await write(generation, 'LICENSE.md', 'generation license');
      const view = await prepareFrameworkResources({
        source: generation,
        destination,
        clientType: 'Bilibili',
        frameworkVersion,
        validate: async (directory) => {
          expect(await readFile(path.join(directory, 'image/Ready.png'))).toEqual(png);
          expect(await readFile(path.join(directory, 'model/ocr/rec.onnx'), 'utf8')).toBe(
            'base recognizer',
          );
          return { ocrAvailable: true };
        },
      });
      expect(view.ocrAvailable).toBe(true);
      expect(view.sourcePaths).toEqual([generation, resource]);
      const manifest = JSON.parse(await readFile(path.join(view.path, 'manifest.json'), 'utf8'));
      expect(manifest.license.inheritedFrom).toEqual([generation, resource]);
      expect(manifest.license.noticeFiles).toEqual([
        path.join(generation, 'LICENSE.md'),
        path.join(resource, 'LICENSE.md'),
      ]);
      expect(manifest.sources).toContainEqual(
        expect.objectContaining({ source: path.join(resource, 'template/Ready.png') }),
      );
      expect(await readFile(path.join(view.path, 'licenses/generation/LICENSE.md'), 'utf8')).toBe(
        'generation license',
      );
      expect(await readFile(path.join(view.path, 'licenses/LICENSE.md'), 'utf8')).toBe(
        'source resource license',
      );
    }));
  test('selects international overlays inside the active generation resource subtree', () =>
    fixture(async (root, source, destination) => {
      const generation = path.join(root, 'generation');
      const resource = path.join(generation, 'resource');
      const overlay = path.join(resource, 'global/YoStarJP/resource');
      await mkdir(generation);
      await rename(source, resource);
      await write(overlay, 'PaddleOCR/rec/inference.onnx', 'JP recognizer');
      await write(overlay, 'PaddleOCR/rec/keys.txt', 'JP dictionary');
      await write(overlay, 'template/Localized.png', png);
      const view = await prepareFrameworkResources({
        source: generation,
        destination,
        clientType: 'YoStarJP',
        frameworkVersion,
        validate: async (directory) => {
          expect(await readFile(path.join(directory, 'model/ocr/det.onnx'), 'utf8')).toBe(
            'base detector',
          );
          expect(await readFile(path.join(directory, 'model/ocr/rec.onnx'), 'utf8')).toBe(
            'JP recognizer',
          );
          expect(await readFile(path.join(directory, 'model/ocr/keys.txt'), 'utf8')).toBe(
            'JP dictionary',
          );
          return { ocrAvailable: true };
        },
      });
      expect(view.sourcePaths).toEqual([generation, resource, overlay]);
      expect(view.templates['Localized.png']).toBe('image/Localized.png');
    }));
  test('rejects a linked generation resource subtree before validation', () =>
    fixture(async (root, source, destination) => {
      const generation = path.join(root, 'generation');
      await mkdir(generation);
      try {
        await symlink(source, path.join(generation, 'resource'), 'dir');
      } catch (error) {
        if (
          process.platform === 'win32' &&
          ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')
        )
          return;
        throw error;
      }
      let validated = false;
      await expect(
        prepareFrameworkResources({
          source: generation,
          destination,
          clientType: 'Official',
          frameworkVersion,
          validate: async () => {
            validated = true;
            return { ocrAvailable: true };
          },
        }),
      ).rejects.toThrow('链接');
      expect(validated).toBe(false);
    }));
  test('an empty source cannot publish an unloadable view through a permissive validator', () =>
    fixture(async (root, _source, destination) => {
      const empty = path.join(root, 'empty');
      await mkdir(empty);
      let validated = false;
      await expect(
        prepareFrameworkResources({
          source: empty,
          destination,
          clientType: 'Official',
          frameworkVersion,
          validate: async () => {
            validated = true;
            return { ocrAvailable: true };
          },
        }),
      ).rejects.toThrow('缺少可加载');
      expect(validated).toBe(false);
      expect(await readdir(destination)).toEqual([]);
    }));
  test('shares original OCR bytes and registered images with provenance', () =>
    fixture(async (_root, source, destination) => {
      let probed = false;
      const view = await prepareFrameworkResources({
        source,
        destination,
        clientType: 'Official',
        frameworkVersion,
        validate: async (directory) => {
          expect(await readFile(path.join(directory, 'model/ocr/det.onnx'), 'utf8')).toBe(
            'base detector',
          );
          probed = true;
          return { ocrAvailable: true };
        },
      });
      expect(probed).toBe(true);
      expect(view.ocrAvailable).toBe(true);
      expect(view.templates['items/item.png']).toBe('image/items/item.png');
      const manifest = JSON.parse(await readFile(path.join(view.path, 'manifest.json'), 'utf8'));
      expect(manifest.sourcePaths).toEqual([source]);
      expect(manifest.license.noticeFiles).toEqual([path.join(source, 'LICENSE.md')]);
      expect(manifest.files['model/ocr/keys.txt'].sha256).toBe(
        createHash('sha256').update('base dictionary').digest('hex'),
      );
      expect((await readdir(destination)).every((name) => name.startsWith('framework-'))).toBe(
        true,
      );
    }));
  test('uses the selected client recognizer/dictionary pair and base detector', () =>
    fixture(async (_root, source, destination) => {
      const overlay = path.join(source, 'global/YoStarJP/resource');
      await write(overlay, 'PaddleOCR/rec/inference.onnx', 'JP recognizer');
      await write(overlay, 'PaddleOCR/rec/keys.txt', 'JP dictionary');
      await write(overlay, 'template/Localized.png', png);
      const view = await prepareFrameworkResources({
        source,
        destination,
        clientType: 'YoStarJP',
        frameworkVersion,
        validate: async (directory) => {
          expect(await readFile(path.join(directory, 'model/ocr/det.onnx'), 'utf8')).toBe(
            'base detector',
          );
          expect(await readFile(path.join(directory, 'model/ocr/rec.onnx'), 'utf8')).toBe(
            'JP recognizer',
          );
          expect(await readFile(path.join(directory, 'model/ocr/keys.txt'), 'utf8')).toBe(
            'JP dictionary',
          );
          return { ocrAvailable: true };
        },
      });
      expect(view.sourcePaths).toEqual([source, overlay]);
      expect(view.templates['Localized.png']).toBe('image/Localized.png');
    }));
  test('incomplete client OCR is disabled without silently using another dictionary', () =>
    fixture(async (_root, source, destination) => {
      await write(source, 'global/YoStarEN/resource/PaddleOCR/rec/inference.onnx', 'EN recognizer');
      const view = await prepareFrameworkResources({
        source,
        destination,
        clientType: 'YoStarEN',
        frameworkVersion,
        validate: async (directory) => {
          expect(await readdir(directory)).not.toContain('model');
          return { ocrAvailable: false };
        },
      });
      expect(view.ocrAvailable).toBe(false);
      expect(view.diagnostic).toContain('缺少成套OCR');
      expect(view.templates['Ready.png']).toBe('image/Ready.png');
    }));
  test('incompatible OCR removes models and validates template-only candidate', () =>
    fixture(async (_root, source, destination) => {
      let calls = 0;
      const view = await prepareFrameworkResources({
        source,
        destination,
        clientType: 'Official',
        frameworkVersion,
        validate: async (directory) => {
          calls++;
          if ((await readdir(directory)).includes('model'))
            return { ocrAvailable: false, diagnostic: 'unsupported model shape' };
          return { ocrAvailable: false };
        },
      });
      expect(calls).toBe(2);
      expect(view.ocrAvailable).toBe(false);
      expect(view.diagnostic).toBe('unsupported model shape');
      expect(await readdir(view.path)).not.toContain('model');
    }));
  test('failed loading without a complete model set cannot publish a template-only view', () =>
    fixture(async (_root, source, destination) => {
      await rm(path.join(source, 'PaddleOCR'), { recursive: true });
      await expect(
        prepareFrameworkResources({
          source,
          destination,
          clientType: 'Official',
          frameworkVersion,
          validate: async () => {
            throw new Error('template resource failed to load');
          },
        }),
      ).rejects.toThrow('template resource failed to load');
      expect(await readdir(destination)).toEqual([]);
    }));
  test('concurrent requests share one validation and publish one generation', () =>
    fixture(async (_root, source, destination) => {
      let calls = 0;
      const options = {
        source,
        destination,
        clientType: 'Official',
        frameworkVersion,
        validate: async () => {
          calls++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { ocrAvailable: true };
        },
      };
      const [a, b] = await Promise.all([
        prepareFrameworkResources(options),
        prepareFrameworkResources(options),
      ]);
      expect(a).toEqual(b);
      expect(calls).toBe(1);
      expect(await readdir(destination)).toEqual([a.generation]);
    }));
  test('changed source produces a new generation and preserves existing view', () =>
    fixture(async (_root, source, destination) => {
      const options = {
        source,
        destination,
        clientType: 'Official',
        frameworkVersion,
        validate: async () => ({ ocrAvailable: true }),
      };
      const first = await prepareFrameworkResources(options);
      await write(source, 'PaddleOCR/rec/keys.txt', 'updated dictionary');
      const second = await prepareFrameworkResources(options);
      expect(second.generation).not.toBe(first.generation);
      expect(await readFile(path.join(first.path, 'model/ocr/keys.txt'), 'utf8')).toBe(
        'base dictionary',
      );
    }));
  test('damaged existing generation fails without overwriting it', () =>
    fixture(async (_root, source, destination) => {
      const options = {
        source,
        destination,
        clientType: 'Official',
        frameworkVersion,
        validate: async () => ({ ocrAvailable: true }),
      };
      const view = await prepareFrameworkResources(options);
      await write(view.path, 'model/ocr/rec.onnx', 'tampered');
      await expect(prepareFrameworkResources(options)).rejects.toThrow('完整性');
      expect(await readFile(path.join(view.path, 'model/ocr/rec.onnx'), 'utf8')).toBe('tampered');
    }));
  for (const kind of ['symbolic', 'hard'])
    test(`rejects ${kind} linked templates`, () =>
      fixture(async (_root, source, destination) => {
        if (kind === 'hard')
          await link(
            path.join(source, 'template/Ready.png'),
            path.join(source, 'template/Alias.png'),
          );
        else {
          try {
            await symlink('Ready.png', path.join(source, 'template/Alias.png'));
          } catch (error) {
            if (
              process.platform === 'win32' &&
              ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')
            )
              return;
            throw error;
          }
        }
        await expect(
          prepareFrameworkResources({
            source,
            destination,
            clientType: 'Official',
            frameworkVersion,
          }),
        ).rejects.toThrow('链接');
      }));
  test('rejects linked roots, overlapping caches and unregistered unsafe filenames', () =>
    fixture(async (root, source, destination) => {
      const alias = path.join(root, 'alias');
      await symlink(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
      await expect(
        prepareFrameworkResources({
          source: alias,
          destination,
          clientType: 'Official',
          frameworkVersion,
        }),
      ).rejects.toThrow('链接');
      await expect(
        prepareFrameworkResources({
          source,
          destination: path.join(source, 'cache'),
          clientType: 'Official',
          frameworkVersion,
        }),
      ).rejects.toThrow('重叠');
      if (process.platform !== 'win32') {
        await write(source, 'template/unsafe:name.png', png);
        await expect(
          prepareFrameworkResources({
            source,
            destination,
            clientType: 'Official',
            frameworkVersion,
          }),
        ).rejects.toThrow('不安全');
      }
    }));
  test('a validator cannot alter the resource candidate and publish stale hashes', () =>
    fixture(async (_root, source, destination) => {
      await expect(
        prepareFrameworkResources({
          source,
          destination,
          clientType: 'Official',
          frameworkVersion,
          validate: async (directory) => {
            await write(directory, 'image/Ready.png', 'changed after hashing');
            return { ocrAvailable: true };
          },
        }),
      ).rejects.toThrow('校验期间发生变化');
      expect(await readdir(destination)).toEqual([]);
    }));
  test('resource generations reject unregistered pipeline files after validation or publication', () =>
    fixture(async (_root, source, destination) => {
      await expect(
        prepareFrameworkResources({
          source,
          destination,
          clientType: 'Official',
          frameworkVersion,
          validate: async (directory) => {
            await write(directory, 'pipeline/Unexpected.json', '{}');
            return { ocrAvailable: true };
          },
        }),
      ).rejects.toThrow('校验期间发生变化');
      expect(await readdir(destination)).toEqual([]);
      const options = {
        source,
        destination,
        clientType: 'Official',
        frameworkVersion,
        validate: async () => ({ ocrAvailable: true }),
      };
      const view = await prepareFrameworkResources(options);
      await write(view.path, 'pipeline/Unexpected.json', '{}');
      await expect(prepareFrameworkResources(options)).rejects.toThrow('完整性');
    }));
  test('already cancelled preparation never creates a cache or invokes validation', () =>
    fixture(async (root, source, destination) => {
      const controller = new AbortController();
      controller.abort(new Error('cancelled resource preparation'));
      let validated = false;
      await expect(
        prepareFrameworkResources({
          source,
          destination,
          clientType: 'Official',
          frameworkVersion,
          signal: controller.signal,
          validate: async () => {
            validated = true;
            return { ocrAvailable: true };
          },
        }),
      ).rejects.toThrow('cancelled resource preparation');
      expect(validated).toBe(false);
      expect(await readdir(root)).not.toContain('views');
    }));
  test('cancellation during validation cleans staging and never retries or publishes', () =>
    fixture(async (_root, source, destination) => {
      const controller = new AbortController();
      let calls = 0;
      await expect(
        prepareFrameworkResources({
          source,
          destination,
          clientType: 'Official',
          frameworkVersion,
          signal: controller.signal,
          validate: async () => {
            calls++;
            controller.abort(new Error('cancelled while probing'));
            throw new Error('probe interrupted');
          },
        }),
      ).rejects.toThrow('cancelled while probing');
      expect(calls).toBe(1);
      expect(await readdir(destination)).toEqual([]);
    }));
  test('independent callers do not share one cancellation lifetime', () =>
    fixture(async (_root, source, destination) => {
      let release!: () => void, ready!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const bothProbing = new Promise<void>((resolve) => {
        ready = resolve;
      });
      let calls = 0;
      const validate = async () => {
        if (++calls === 2) ready();
        await gate;
        return { ocrAvailable: true };
      };
      const controller = new AbortController();
      const cancelled = prepareFrameworkResources({
        source,
        destination,
        clientType: 'Official',
        frameworkVersion,
        validate,
        signal: controller.signal,
      });
      const active = prepareFrameworkResources({
        source,
        destination,
        clientType: 'Official',
        frameworkVersion,
        validate,
      });
      const resultsPromise = Promise.allSettled([cancelled, active]);
      await bothProbing;
      controller.abort(new Error('one caller cancelled'));
      release();
      const results = await resultsPromise;
      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('fulfilled');
      expect(await readdir(destination)).toHaveLength(1);
    }));
});
test('SDK resolution requires explicit development opt-in and rejects tampering', () =>
  fixture(async (root) => {
    const sdk = path.join(root, '.tools/maafw', frameworkVersion, 'macos-arm64');
    await write(sdk, 'bin/libMaaFramework.dylib', 'synthetic native');
    await write(sdk, 'share/MaaAgentBinary/LICENSE', 'agent license');
    await write(sdk, 'LICENSE.md', 'framework license');
    const files: Record<string, { size: number; sha256: string }> = {};
    for (const relative of [
      'bin/libMaaFramework.dylib',
      'share/MaaAgentBinary/LICENSE',
      'LICENSE.md',
    ]) {
      const bytes = await readFile(path.join(sdk, relative));
      files[relative] = {
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    }
    await write(
      sdk,
      'maafw-manifest.json',
      JSON.stringify({
        formatVersion: 1,
        version: frameworkVersion,
        target: 'macos-arm64',
        archiveSha256: assets.targets['macos-arm64'].sha256,
        files,
      }),
    );
    await expect(
      resolveFrameworkSdk({ checkoutRoot: root, platform: 'darwin', arch: 'arm64' }),
    ).rejects.toThrow('尚未安装');
    expect(
      (
        await resolveFrameworkSdk({
          checkoutRoot: root,
          platform: 'darwin',
          arch: 'arm64',
          allowDevelopmentSdk: true,
        })
      ).path,
    ).toBe(sdk);
    await write(sdk, 'share/MaaAgentBinary/LICENSE', 'changed dependency');
    await expect(
      resolveFrameworkSdk({
        checkoutRoot: root,
        platform: 'darwin',
        arch: 'arm64',
        allowDevelopmentSdk: true,
      }),
    ).rejects.toThrow('完整性');
    await write(sdk, 'share/MaaAgentBinary/LICENSE', 'agent license');
    await write(sdk, 'bin/libMaaFramework.dylib', 'tampered');
    await expect(
      resolveFrameworkSdk({
        checkoutRoot: root,
        platform: 'darwin',
        arch: 'arm64',
        allowDevelopmentSdk: true,
      }),
    ).rejects.toThrow('完整性');
  }));
