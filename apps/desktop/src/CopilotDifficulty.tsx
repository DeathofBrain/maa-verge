import type { CopilotDifficulty as Difficulty, CopilotPreview } from '@maaverge/contracts';
import './copilot-difficulty.css';

export type SetDifficultySummary = { normal: number; raid: number; unknown: number; invalid: number };

/** Counts describe supported members, not a difficulty supported by every member. */
export function summarizeSetDifficulty(entries: CopilotPreview['entries']): SetDifficultySummary {
  const summary = { normal: 0, raid: 0, unknown: 0, invalid: 0 };
  for (const entry of entries) {
    if (!entry.record || entry.error) { summary.invalid++; continue; }
    const value = entry.record.difficulty;
    if (value === 1 || value === 3) summary.normal++;
    if (value === 2 || value === 3) summary.raid++;
    if (value !== 1 && value !== 2 && value !== 3) summary.unknown++;
  }
  return summary;
}

export default function CopilotDifficulty({ difficulty, summary }: { difficulty?: Difficulty; summary?: SetDifficultySummary }) {
  const normal = summary ? summary.normal > 0 : difficulty === 1 || difficulty === 3;
  const raid = summary ? summary.raid > 0 : difficulty === 2 || difficulty === 3;
  if (!normal && !raid) return null;
  const title = summary
    ? `普通：${summary.normal} 项；突袭：${summary.raid} 项；难度未声明：${summary.unknown} 项；无效：${summary.invalid} 项。表示集中存在支持对应难度的作业，各成员请分别核对。`
    : `作业声明支持${normal && raid ? '普通与突袭' : normal ? '普通' : '突袭'}难度`;
  return <div className="cp-difficulty-badges" aria-label={summary ? '作业集支持难度' : '作业支持难度'} title={title}>
    {normal && <span className="cp-difficulty-badge is-normal">普通</span>}
    {raid && <span className="cp-difficulty-badge is-raid">突袭</span>}
  </div>;
}
