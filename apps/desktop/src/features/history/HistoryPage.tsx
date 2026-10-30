import Button from '@/kit/Button';
import IconButton from '@/kit/IconButton';
import { ChevronRight, History, Search, Terminal } from 'lucide-react';
import { localizeExecutionMessage, type Plan, type Run } from '@maaverge/contracts';
import type { Snapshot } from '@maaverge/contracts';
import FilterChips from '@/kit/FilterChips';
import EmptyState from '@/kit/EmptyState';
import SearchField from '@/kit/SearchField';
import PageHeading from '@/kit/PageHeading';
import StatusPill from '@/kit/StatusPill';
import { formatDate } from '@/kit/format';
import { runStatusLabels, runStatusTones } from '@/kit/labels';
import { isCopilotRun, runDisplayName, runSourceLabel } from '@/shared/lib/run-source';
import type { MenuItem } from '@/kit/ContextMenu';

type ContextMenuBinding = {
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
};

type Props = {
  snapshot: Snapshot;
  historyFilter: string;
  setHistoryFilter: (value: string) => void;
  historyQuery: string;
  setHistoryQuery: (value: string) => void;
  contextMenu: (label: string, items: MenuItem[]) => ContextMenuBinding;
  showExecution: (run: Run) => void;
  pending: Set<string>;
  stopRun: (run: Run) => void;
  choosePlan: (plan: Plan) => void;
  executionRun?: Run;
  setRunPanel: (panel: 'logs') => void;
};

export default function HistoryPage({
  snapshot,
  historyFilter,
  setHistoryFilter,
  historyQuery,
  setHistoryQuery,
  contextMenu,
  showExecution,
  pending,
  stopRun,
  choosePlan,
  executionRun,
  setRunPanel,
}: Props) {
  const history = snapshot.runs.filter(
    (run) =>
      (historyFilter === 'all' || run.status === historyFilter) &&
      `${runDisplayName(run, snapshot.plans)} ${runSourceLabel(run)} ${localizeExecutionMessage(run.message)} ${snapshot.devices.find((device) => device.id === run.deviceId)?.name || run.deviceId}`.includes(
        historyQuery,
      ),
  );
  return (
    <section className="history-page">
      <PageHeading
        padding="page"
        title="执行记录"
        text="查看每次运行的结果、设备与失败原因。"
        actions={
          <Button onClick={() => setRunPanel('logs')}>
            <Terminal size={15} />
            运行事件
          </Button>
        }
      />
      <div className="history-toolbar">
        <FilterChips
          aria-label="筛选执行记录"
          value={historyFilter}
          onChange={(value) => setHistoryFilter(value)}
          items={[
            { id: 'all', label: '全部' },
            { id: 'running', label: '执行中' },
            { id: 'completed', label: '已完成' },
            { id: 'failed', label: '失败' },
            { id: 'stopped', label: '已停止' },
          ]}
        />
        <SearchField
          className="inline-search"
          aria-label="搜索执行记录"
          placeholder="搜索名称、来源、实例或结果"
          value={historyQuery}
          onValueChange={setHistoryQuery}
          icon={<Search size={15} />}
        />
      </div>
      {history.length ? (
        <div className="table-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th>任务表 / 作业</th>
                <th>模拟器实例</th>
                <th>状态</th>
                <th>开始时间</th>
                <th>执行结果</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.map((run) => (
                <tr
                  className={executionRun?.id === run.id ? 'selected' : ''}
                  key={run.id}
                  tabIndex={0}
                  {...contextMenu('执行记录菜单', [
                    { label: '查看执行详情', action: () => showExecution(run) },
                    {
                      label: isCopilotRun(run) ? '打开作业中心' : '编辑任务表',
                      disabled:
                        !isCopilotRun(run) &&
                        !snapshot.plans.some((plan) => plan.id === run.planId),
                      action: () => {
                        if (isCopilotRun(run)) {
                          showExecution(run);
                          return;
                        }
                        const plan = snapshot.plans.find((plan) => plan.id === run.planId);
                        if (plan) choosePlan(plan);
                      },
                    },
                    {
                      label: '停止执行',
                      danger: true,
                      disabled: run.status !== 'running' || pending.has(`stop-${run.id}`),
                      action: () => {
                        void stopRun(run);
                      },
                    },
                  ])}
                >
                  <td>
                    {runDisplayName(run, snapshot.plans)}
                    {isCopilotRun(run) && <small className="subtle-tag">作业</small>}
                  </td>
                  <td>
                    {snapshot.devices.find((item) => item.id === run.deviceId)?.name ||
                      run.deviceId}
                  </td>
                  <td>
                    <StatusPill
                      tone={runStatusTones[run.status]}
                      label={runStatusLabels[run.status]}
                    />
                  </td>
                  <td className="numeric">{formatDate(run.startedAt)}</td>
                  <td>{localizeExecutionMessage(run.message)}</td>
                  <td>
                    <IconButton label={`查看执行${run.id}`} onClick={() => showExecution(run)}>
                      <ChevronRight size={16} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          className="empty-state"
          icon={<History size={30} />}
          title={snapshot.runs.length ? '没有匹配的执行记录' : '还没有执行记录'}
          text="从任务表或作业中心开始执行，结果会保存在这里。"
        />
      )}
    </section>
  );
}
