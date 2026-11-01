import type { CopilotRecord, CopilotWorkspace } from '@maaverge/contracts';

function difficulties(record: CopilotRecord): boolean[] {
  if (record.kind !== 'Copilot') return [false];
  if (record.difficulty === 3) return [false, true];
  return [record.difficulty === 2];
}

export function copilotQueueSize(records: CopilotRecord[]): number {
  return records.reduce((count, record) => count + difficulties(record).length, 0);
}

export function createCopilotQueueEntries(records: CopilotRecord[]): CopilotWorkspace['queue'] {
  return records.flatMap((record) =>
    difficulties(record).map((isRaid) => ({
      id: crypto.randomUUID(),
      versionId: record.versionId,
      enabled: true,
      isRaid,
      navName: '',
    })),
  );
}
