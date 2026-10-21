import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './project.mjs';

export function writeRuntimeNotices(destination) {
  const output = path.join(destination, 'licenses'); mkdirSync(output, { recursive: true });
  for (const [source, target] of [
    ['LICENSE', 'MAAVERGE-LICENSE'], ['services/native/THIRD_PARTY_NOTICES.md', 'native-worker-notices.md'],
    ['services/backend/UNICODE-LICENSE.txt', 'UNICODE-LICENSE.txt'], ['services/backend/BUN-LICENSE.md', 'BUN-LICENSE.md'],
  ]) copyFileSync(path.join(root, source), path.join(output, target));
  const seen = new Set();
  function visit(name, context) {
    const require = createRequire(path.join(context, 'package.json'));
    let directory = path.dirname(require.resolve(name));
    while (true) {
      const manifest = path.join(directory, 'package.json');
      if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name) break;
      const parent = path.dirname(directory); if (parent === directory) throw new Error('Cannot locate dependency notice: ' + name); directory = parent;
    }
    const info = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
    const id = `${name}@${info.version}`; if (seen.has(id)) return; seen.add(id);
    const files = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isFile() && /^(?:licen[sc]e|copying|notice)(?:\.|$)/iu.test(entry.name));
    if (!files.length) throw new Error('Missing dependency license: ' + id);
    writeFileSync(path.join(output, id.replaceAll('/', '_') + '.txt'), id + '\n\n' + files.map(file => readFileSync(path.join(directory, file.name), 'utf8')).join('\n\n'));
    for (const dependency of Object.keys(info.dependencies || {})) visit(dependency, directory);
  }
  const backend = path.join(root, 'services/backend');
  for (const name of Object.keys(JSON.parse(readFileSync(path.join(backend, 'package.json'), 'utf8')).dependencies || {})) visit(name, backend);
}
