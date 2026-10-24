import type { Plan, Run } from '@maaverge/contracts';

export const isCopilotRun = (run: Run) => run.source === 'copilot';
export const runSourceLabel = (run: Run) => isCopilotRun(run) ? '作业' : '任务表';
export const runDisplayName = (run: Run, plans: Plan[]) => run.sourceName || run.planName
  || plans.find((plan) => plan.id === run.planId)?.name
  || (isCopilotRun(run) ? '作业执行' : '已删除的任务表');
