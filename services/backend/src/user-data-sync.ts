export type SyncInterval = 'always' | 'daily' | 'weekly';
export type SyncStep = { type: 'OperBox' | 'Depot'; key: 'operatorsAt' | 'depotAt' };

/** MAA game days change at 04:00 in the selected client's fixed server timezone. */
export function gameDate(at: Date, clientType = 'Official'): Date {
  const offset = clientType === 'YoStarEN' ? -7 : ['YoStarJP', 'YoStarKR'].includes(clientType) ? 9 : 8;
  return new Date(at.getTime() + (offset - 4) * 3_600_000);
}

export function syncDue(previous: string | null | undefined, interval: SyncInterval, at = new Date(), clientType = 'Official'): boolean {
  if (interval === 'always' || !previous) return true;
  const last = new Date(previous).getTime();
  if (!Number.isFinite(last) || last > at.getTime()) return true;
  const current = gameDate(at, clientType), prior = gameDate(new Date(last), clientType);
  const start = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  const weekStart = interval === 'weekly' ? start - (current.getUTCDay() + 6) % 7 * 86_400_000 : start;
  return prior.getTime() < weekStart;
}

export function userDataSteps(params: Record<string, unknown>, previous: { operatorsAt?: string | null; depotAt?: string | null }, at = new Date(), clientType = 'Official'): SyncStep[] {
  const steps: SyncStep[] = [];
  const interval = (params.interval ?? 'always') as SyncInterval;
  if (params.operators !== false && syncDue(previous.operatorsAt, interval, at, clientType)) steps.push({ type: 'OperBox', key: 'operatorsAt' });
  if (params.depot !== false && syncDue(previous.depotAt, interval, at, clientType)) steps.push({ type: 'Depot', key: 'depotAt' });
  return steps;
}
