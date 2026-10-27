import { createHash } from 'node:crypto';
import type {
  RpcContract,
  AccountSnapshotSummary,
} from '../../../packages/contracts/src/rpc-types';
import {
  validateAccountKnowledgeSnapshot,
  validateAccountSnapshotSummary,
  validateRecognitionResult,
} from '../../../packages/contracts/src/validators.js';
import type { ClientType } from './item-resources';
import { recognitionKey, recognitionSnapshot } from './recognition';
import type { Store } from './storage';

type Snapshot = Exclude<RpcContract['results']['account.snapshot.get'], null>;
type Recognition = RpcContract['results']['recognition.get'];
type Provenance = Pick<Snapshot, 'source' | 'coreVersion' | 'resourceVersion' | 'taskIndex'>;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const headKey = (deviceId: string, client: string, kind: Snapshot['kind']) =>
  recognitionKey(deviceId, client, kind);
const known = (value: number, min: number, max: number) =>
  Number.isInteger(value) && value >= min && value <= max ? value : null;
const retention = 20;

/** Labels are local configuration hints, never a verified game UID or a cross-device identity. */
export class AccountKnowledge {
  constructor(private store: Store) {}

  private scope(deviceId: string, clientType: ClientType) {
    const label =
      this.store.get('device_client', deviceId, clientType) === clientType
        ? this.store.get('device_account', deviceId, '')
        : '';
    const configured = typeof label === 'string' && !!label;
    return {
      accountId: digest([deviceId, clientType, configured ? label : '']),
      identity: configured ? ('configured-label' as const) : ('device-only' as const),
    };
  }

  /** Called inside the same success-and-idle transaction as the existing recognition cache. */
  capture(result: Recognition, provenance: Provenance): Snapshot | null {
    if (
      !validateRecognitionResult(result) ||
      !result.collectedAt ||
      !Number.isFinite(Date.parse(result.collectedAt))
    )
      return null;
    const { deviceId, clientType, kind, collectedAt, runId } = result,
      scope = this.scope(deviceId, clientType);
    const items =
      kind === 'depot'
        ? result.items.map(({ id, name, quantity }) => ({ id, name, quantity }))
        : [];
    const operators =
      kind === 'operators'
        ? result.operators.map((op) => ({
            id: op.id,
            name: op.name,
            own: op.own,
            elite: op.own ? known(op.elite, 0, 2) : null,
            level: op.own ? known(op.level, 1, 90) : null,
            potential: op.own ? known(op.potential, 1, 6) : null,
            rarity: known(op.rarity, 1, 6),
          }))
        : [];
    const id = digest([scope.accountId, kind, collectedAt, runId, items, operators]);
    const snapshot: Snapshot = {
      id,
      ...scope,
      deviceId,
      clientType,
      kind,
      collectedAt,
      runId,
      parserVersion: 1,
      ...provenance,
      recordCount: kind === 'depot' ? items.length : operators.length,
      coverage: 'partial',
      unknownFields:
        kind === 'depot'
          ? ['unseenItems', 'manualChangesSinceScan']
          : ['skills', 'masteries', 'modules', 'trust', 'unseenOperators'],
      items,
      operators,
    };
    if (
      !validateAccountKnowledgeSnapshot(snapshot) ||
      Buffer.byteLength(JSON.stringify(snapshot)) > 3 * 1024 * 1024
    )
      return null;
    const previous = this.store.get('account_snapshot', id);
    // A legacy import must not replace a verified snapshot's provenance.
    if (
      previous &&
      validateAccountKnowledgeSnapshot(previous) &&
      previous.id === id &&
      previous.accountId === scope.accountId &&
      previous.deviceId === deviceId &&
      previous.clientType === clientType &&
      previous.kind === kind
    ) {
      this.store.put('account_head', headKey(deviceId, clientType, kind), {
        id,
        accountId: scope.accountId,
        deviceId,
      });
      return previous;
    }
    this.store.put('account_snapshot', id, snapshot);
    const { items: _items, operators: _operators, ...summary } = snapshot;
    this.store.put('account_snapshot_summary', id, summary);
    this.store.put('account_head', headKey(deviceId, clientType, kind), {
      id,
      accountId: scope.accountId,
      deviceId,
    });
    const summaries = this.summaries(scope.accountId, deviceId, clientType, kind);
    for (const old of summaries.slice(retention)) {
      const payload = this.store.get('account_snapshot', old.id);
      if (
        !payload ||
        !validateAccountKnowledgeSnapshot(payload) ||
        payload.id !== old.id ||
        payload.accountId !== scope.accountId ||
        payload.deviceId !== deviceId ||
        payload.clientType !== clientType ||
        payload.kind !== kind
      )
        continue;
      this.store.delete('account_snapshot', old.id);
      this.store.delete('account_snapshot_summary', old.id);
    }
    return snapshot;
  }

  invalidate(deviceId: string) {
    for (const head of this.store.all('account_head'))
      if (head?.deviceId === deviceId) {
        for (const client of ['Official', 'Bilibili', 'YoStarEN', 'YoStarJP', 'YoStarKR', 'txwy']) {
          for (const kind of ['depot', 'operators'] as const)
            this.store.delete('account_head', headKey(deviceId, client, kind));
        }
        break;
      }
  }

  private summaries(
    accountId: string,
    deviceId: string,
    client: ClientType,
    kind?: Snapshot['kind'],
  ): AccountSnapshotSummary[] {
    return this.store
      .all('account_snapshot_summary')
      .reverse()
      .filter(
        (row): row is AccountSnapshotSummary =>
          validateAccountSnapshotSummary(row) &&
          row.accountId === accountId &&
          row.deviceId === deviceId &&
          row.clientType === client &&
          (!kind || row.kind === kind),
      );
  }

  private latest(deviceId: string, client: ClientType, kind: Snapshot['kind']): Snapshot | null {
    const { accountId } = this.scope(deviceId, client),
      head = this.store.get('account_head', headKey(deviceId, client, kind));
    const snapshot =
      head?.accountId === accountId ? this.store.get('account_snapshot', head.id) : undefined;
    if (
      snapshot &&
      validateAccountKnowledgeSnapshot(snapshot) &&
      snapshot.id === head.id &&
      snapshot.accountId === accountId &&
      snapshot.deviceId === deviceId &&
      snapshot.clientType === client &&
      snapshot.kind === kind
    )
      return snapshot;
    // Compatibility is lazy and explicit: past component versions cannot be reconstructed.
    const cached = recognitionSnapshot(this.store, deviceId, kind, client);
    if (!cached.collectedAt) return null;
    return this.store.transaction(() =>
      this.capture(cached, {
        source: 'legacy-cache',
        coreVersion: null,
        resourceVersion: null,
        taskIndex: null,
      }),
    );
  }

  get(
    deviceId: string,
    client: ClientType,
    kind: Snapshot['kind'],
    snapshotId?: string,
  ): Snapshot | null {
    if (!snapshotId) return this.latest(deviceId, client, kind);
    const saved = this.store.get('account_snapshot', snapshotId),
      { accountId } = this.scope(deviceId, client);
    return saved &&
      validateAccountKnowledgeSnapshot(saved) &&
      saved.id === snapshotId &&
      saved.accountId === accountId &&
      saved.deviceId === deviceId &&
      saved.clientType === client &&
      saved.kind === kind
      ? saved
      : null;
  }

  list(
    deviceId: string,
    clientType: ClientType,
    kind?: Snapshot['kind'],
    offset = 0,
    limit = 20,
  ): RpcContract['results']['account.snapshot.list'] {
    const scope = this.scope(deviceId, clientType);
    const depot = this.latest(deviceId, clientType, 'depot'),
      operators = this.latest(deviceId, clientType, 'operators');
    const all = this.summaries(scope.accountId, deviceId, clientType, kind);
    return {
      ...scope,
      deviceId,
      clientType,
      latest: { depot: depot?.id ?? null, operators: operators?.id ?? null },
      snapshots: all.slice(offset, offset + limit),
      total: all.length,
      offset,
      limit,
    };
  }
}
