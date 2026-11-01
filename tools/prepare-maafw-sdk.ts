import { extractArchive } from '../services/backend/src/infrastructure/filesystem/archives.ts';
import { prepareFrameworkSdk, frameworkTarget } from './maafw-assets.mjs';

const targetIndex = process.argv.indexOf('--target');
const target = targetIndex < 0 ? frameworkTarget() : process.argv[targetIndex + 1];
console.log(
  await prepareFrameworkSdk({
    target,
    extract: extractArchive,
    download: !process.argv.includes('--no-download'),
  }),
);
