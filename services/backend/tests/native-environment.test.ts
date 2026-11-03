import { expect, test } from 'bun:test';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { childEnvironment, nativeEnvironment } from '@backend/infrastructure/config';
import { makeTemporaryDirectory } from '../../../tools/test-support/temporary-directory.mjs';

test('native children receive a clean runtime environment and an explicit library root', () => {
  expect(
    childEnvironment({ Bun_Options: 'bad', NODE_OPTIONS: 'bad', MAAVERGE_MODE: 'native' }),
  ).toEqual({ MAAVERGE_MODE: 'native' });
  for (const platform of ['linux', 'darwin'] as const) {
    const key = platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH';
    expect(
      nativeEnvironment('/isolated/framework', platform)[key]?.startsWith('/isolated/framework'),
    ).toBe(true);
  }
});
