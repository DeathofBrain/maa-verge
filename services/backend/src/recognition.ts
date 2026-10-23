import type { RpcContract } from '../../../packages/contracts/src/rpc-types';
import { validateRecognitionResult } from '../../../packages/contracts/src/validators.js';
import type { Store } from './storage';

export type RecognitionSnapshot = RpcContract['results']['recognition.get'];
type RecognitionPayload = Pick<RecognitionSnapshot, 'items' | 'operators'>;
export const recognitionKey = (deviceId: string, clientType: string, kind: RecognitionSnapshot['kind']) => JSON.stringify([deviceId, clientType, kind]);
const object = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const int32 = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= -2_147_483_648 && Number(value) <= 2_147_483_647;
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length > 0 && [...value].length <= limit;
// Keep the explicit result RPC below the desktop host's 4 MiB NDJSON limit.
const bounded = (payload: RecognitionPayload) => Buffer.byteLength(JSON.stringify(payload)) <= 2 * 1024 * 1024 ? payload : undefined;

/** v6.20.0 DepotRecognitionTask / OperBoxRecognitionTask final callback shapes. */
export function parseRecognition(type: 'OperBox' | 'Depot', callback: any): RecognitionPayload | undefined {
  const result = callback.details;
  if (callback.taskchain !== type || callback.what !== (type === 'OperBox' ? 'OperBoxInfo' : 'DepotInfo') || result?.done !== true) return;
  if (type === 'OperBox') {
    if (!Array.isArray(result.own_opers) || !result.own_opers.length || result.own_opers.length > 2000) return;
    const ids = new Set<string>();
    const operators: RecognitionSnapshot['operators'] = [];
    for (const oper of result.own_opers) {
      if (!object(oper) || !text(oper.id, 200) || !text(oper.name, 300) || typeof oper.own !== 'boolean'
        || !['elite', 'level', 'potential', 'rarity'].every(key => int32(oper[key])) || ids.has(oper.id)) return;
      ids.add(oper.id);
      // Do not persist arbitrary callback extensions or all_opers metadata.
      const { id, name, own, elite, level, potential, rarity } = oper;
      operators.push({ id, name, own, elite, level, potential, rarity });
    }
    return bounded({ items: [], operators });
  }
  if (typeof result.data !== 'string' || Buffer.byteLength(result.data) > 1024 * 1024) return;
  try {
    const data: unknown = JSON.parse(result.data);
    if (!object(data)) return;
    const entries = Object.entries(data);
    if (!entries.length || entries.length > 10000) return;
    const items: RecognitionSnapshot['items'] = [];
    for (const [id, quantity] of entries) {
      if (!text(id, 200) || !int32(quantity) || quantity <= 0) return;
      items.push({ id, name: id, quantity });
    }
    return bounded({ items, operators: [] });
  } catch { return; }
}

export function recognitionSnapshot(store: Store, deviceId: string, kind: RecognitionSnapshot['kind'], clientType: RecognitionSnapshot['clientType']): RecognitionSnapshot {
  const saved = store.get('recognition', recognitionKey(deviceId, clientType, kind));
  if (saved && validateRecognitionResult(saved) && saved.deviceId === deviceId && saved.kind === kind && saved.clientType === clientType) return saved;
  return { deviceId, kind, clientType, collectedAt: null, runId: null, items: [], operators: [] };
}

export function clearDeviceRecognition(store: Store, deviceId: string) {
  for (const saved of store.all<RecognitionSnapshot>('recognition')) if (saved.deviceId === deviceId) store.delete('recognition', recognitionKey(deviceId, saved.clientType, saved.kind));
}
