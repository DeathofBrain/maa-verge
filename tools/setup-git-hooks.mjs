import { existsSync } from 'node:fs';

// Source archives, CI and production-only installs do not need development hooks.
if (
  !process.env.CI &&
  process.env.HUSKY !== '0' &&
  process.env.NODE_ENV !== 'production' &&
  existsSync('.git')
) {
  const { default: install } = await import('husky');
  const error = install();
  if (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
