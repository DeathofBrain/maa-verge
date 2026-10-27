/** Synthetic control-file failures. Never connects to a network or device. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('aria2 version 1.37.0\nEnabled Features: HTTPS, Message Digest');
  process.exit(0);
}
const argument = (name: string) =>
  args.find((value) => value.startsWith(name + '='))!.slice(name.length + 1);
const partial = path.join(argument('--dir'), argument('--out'));
const url = args.at(-1)!;
const mode = new URL(url).pathname.slice(1);
const marker = partial + '.calls';
const calls: unknown[] = JSON.parse(await readFile(marker, 'utf8').catch(() => '[]'));
calls.push({ url, locale: process.env.LC_ALL, lang: process.env.LANG });
await writeFile(marker, JSON.stringify(calls));
const control = partial + '.aria2';
if (mode === 'network-error') {
  await writeFile(partial, 'da');
  await writeFile(control, 'recoverable control');
  console.error('Got EOF from the server');
  process.exit(1);
}
if (mode === 'persistent-control-error' || mode === 'control-is-directory') {
  await writeFile(partial, 'da');
  if (mode === 'control-is-directory') await mkdir(control, { recursive: true });
  else await writeFile(control, 'broken control');
  console.error('Failed to read from the segment file ' + control);
  process.exit(1);
}
if (await Bun.file(control).exists()) {
  // One large chunk also tests that a diagnostic cannot be lost when the
  // downloader truncates its retained console output.
  console.error('Unsupported ctrl file version: 636f\n' + 'diagnostic tail\n'.repeat(1000));
  process.exit(1);
}
await writeFile(partial, 'data');
