import { existsSync } from 'node:fs';
import path from 'node:path';
import { Store } from '../../services/backend/src/storage';
import { parseSettings } from '../../services/backend/src/models';

const dataRoot = process.argv[2];
if (!dataRoot || process.argv.length !== 3) throw new Error('Expected one isolated test data directory');
const nativeRoot = path.join(path.resolve(dataRoot), 'native');
if (existsSync(path.join(nativeRoot, 'maaverge.sqlite3'))) throw new Error('Test setup requires a new, unused native data directory');
const store = new Store(nativeRoot);
try {
  store.put('settings', 'main', parseSettings({ autoConnect: false, autoUpdateApp: false, autoUpdateCore: false, autoUpdateResource: false }));
  store.put('meta', 'initialized', true);
} finally { store.close(); }
