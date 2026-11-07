import type { CopilotRecord, CopilotWorkspace } from '@maaverge/contracts';

// 普通作业声明两种难度时拆成两条独立队列项；保全和悖论不使用突袭标记。
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
