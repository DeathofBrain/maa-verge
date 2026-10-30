import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, LoaderCircle, Trash2, Wifi } from 'lucide-react';
import {
  errorMessage,
  desktopPlatform,
  syncWindowTheme,
  rpc,
  subscribe,
  taskLabels,
  nextPlanName,
  planDeviceIds,
  planAllowsDevice,
  type Plan,
  type Run,
  type Task,
} from '@maaverge/contracts';
import { DevicesPage } from '@/features/devices/DevicesPage';
import PlanEditor, { type PlanEditorCommand } from '@/features/plans/PlanEditor';
import { discardPlanDraft } from '@/features/plans/plan-draft';
import { taskFieldSearch } from '@/features/plans/task-fields';
import { useContextMenu } from '@/kit/ContextMenu';
import ScheduleNotifications from '@/features/schedules/ScheduleNotifications';
import { SettingsPage } from '@/features/settings/SettingsPage';
import CopilotPage from '@/features/copilot/CopilotPage';
import ToolsPage from '@/features/tools/ToolsPage';
import HomeDashboard from '@/features/home/HomeDashboard';
import WindowControls from './shell/WindowControls';
import ExecutionMonitor from '@/features/execution/ExecutionMonitor';
import TasksPage from '@/features/plans/TasksPage';
import RunTasksDialog from '@/features/plans/RunTasksDialog';
import DeviceConnectionDrawer from '@/features/devices/DeviceConnectionDrawer';
import UpdateNotifications, { useComponentDownloads } from '@/features/updates/UpdateNotifications';
import ConfirmDialog from '@/kit/ConfirmDialog';
import ErrorBanner from '@/kit/ErrorBanner';
import Toast from '@/kit/Toast';
import AgentPage, { type AgentMessage } from '@/features/agent/AgentPage';
import { AppSidebar, AppTopbar, Brand } from './shell/AppNavigation';
import RunDock from './shell/RunDock';
import useAppSnapshot from './model/useAppSnapshot';
import useAppActions from './model/useAppActions';
import usePlanWrites from '@/features/plans/usePlanWrites';
import { type Page, pageNames } from './model/navigation-model';
import HistoryPage from '@/features/history/HistoryPage';
import AppRunPanel from './shell/AppRunPanel';
import { deviceActivity, type RunPanelTab } from './model/device-activity';

const uid = () => crypto.randomUUID();
const readSelection = () => {
  try {
    return localStorage.getItem('maaverge:ui:selected-plan') || '';
  } catch {
    return '';
  }
};

export default function App() {
  const contextMenu = useContextMenu();
  const [editorCommand, setEditorCommand] = useState<PlanEditorCommand>();
  const { mutatePlan, deletedPlans } = usePlanWrites();
  const historicalDeviceRef = useRef<string | undefined>(undefined);
  const [page, setPage] = useState<Page>('home');
  const [taskView, setTaskView] = useState<'plans' | 'execution'>('plans');
  const [detailPlanId, setDetailPlanId] = useState<string | 'new' | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState(readSelection);
  const [selectedDevice, setSelectedDevice] = useState('');
  const { snapshot, refresh, error } = useAppSnapshot({ historicalDeviceRef, setSelectedDevice });
  const { action, pending, isPending, stopMany, toast, setToast } = useAppActions(refresh);
  const [focusTaskType, setFocusTaskType] = useState<Task['type']>();
  const [focusTaskIndex, setFocusTaskIndex] = useState<number>();
  const [initialParams, setInitialParams] = useState<Task['params']>();
  const [proposal, setProposal] = useState<Plan | null>(null);
  const [startSelection, setStartSelection] = useState<Plan | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [pageSearch, setPageSearch] = useState('');
  const [deviceSettingsEntry, setDeviceSettingsEntry] = useState<string>();
  const searchInput = useRef<HTMLInputElement>(null);
  const detailRevision = useRef(0);
  const [deleting, setDeleting] = useState<{ plans: Plan[]; batch: boolean } | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [agentQuery, setAgentQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const [executionSelection, setExecutionSelection] = useState<Run>();
  historicalDeviceRef.current =
    executionSelection?.status !== 'running' ? executionSelection?.deviceId : undefined;
  const [copilotRunId, setCopilotRunId] = useState<string>();
  const [copilotLegacy, setCopilotLegacy] = useState<{
    planId: string;
    taskIndex: number;
    nonce: string;
  }>();
  const [runPanel, setRunPanel] = useState<RunPanelTab | null>(null);

  const downloads = useComponentDownloads(snapshot?.updates, refresh);
  useEffect(() => {
    void refresh();
    if (!desktopPlatform()) return;
    const unsubscribe = subscribe(() => {
      void refresh();
    });
    const interval = window.setInterval(() => {
      void refresh();
    }, 2500);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [refresh]);
  useEffect(() => {
    const preference = snapshot?.settings.theme || 'system';
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
      document.documentElement.dataset.theme = theme;
      void syncWindowTheme(theme).catch((cause: unknown) =>
        setToast({ text: `无法同步窗口背景：${errorMessage(cause)}`, error: true }),
      );
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [snapshot?.settings.theme]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('dialog:modal')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        setSearchOpen(false);
        if (!isPending('delete-plan')) setDeleting(null);
        setRunPanel(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPending]);
  useEffect(() => {
    if (!runPanel) return;
    detailRevision.current++;
    setDetailPlanId(null);
    setProposal(null);
  }, [runPanel]);
  const closeTaskDetail = () => {
    detailRevision.current++;
    setDetailPlanId(null);
    setProposal(null);
  };
  const navigate = (next: Page, keepDetail = false) => {
    if (!keepDetail) {
      detailRevision.current++;
      setDetailPlanId(null);
      setProposal(null);
    }
    setDeviceSettingsEntry(undefined);
    setRunPanel(null);
    setExecutionSelection(undefined);
    setPage(next);
    setSidebarOpen(false);
    setPageSearch('');
    setSearchOpen(false);
  };
  const choosePlan = (plan: Plan, type?: Task['type'], taskIndex?: number) => {
    setSelectedPlanId(plan.id);
    setProposal(null);
    setDetailPlanId(plan.id);
    setFocusTaskType(type);
    setFocusTaskIndex(taskIndex);
    setInitialParams(undefined);
    setTaskView('plans');
    navigate('tasks', true);
    try {
      localStorage.setItem('maaverge:ui:selected-plan', plan.id);
    } catch {
      /* UI selection is optional. */
    }
  };
  const createPlan = (type?: Task['type'], params?: Task['params']) => {
    if (type && ['Copilot', 'SSSCopilot', 'ParadoxCopilot'].includes(type)) {
      navigate('copilot');
      return;
    }
    setProposal(null);
    setDetailPlanId('new');
    setSelectedPlanId('');
    setFocusTaskType(type);
    setFocusTaskIndex(undefined);
    setInitialParams(params);
    setTaskView('plans');
    navigate('tasks', true);
  };
  const showExecution = (run: Run) => {
    setSelectedDevice(run.deviceId);
    setRunPanel(null);
    setDetailPlanId(null);
    setProposal(null);
    navigate('tasks');
    setExecutionSelection(run);
    setTaskView('execution');
  };
  const updateExecution = useCallback(
    (run: Run) => setExecutionSelection((previous) => (previous?.id === run.id ? run : previous)),
    [],
  );
  const savePlan = async (plan: Plan) => {
    if (deletedPlans.current.has(plan.id)) return false;
    try {
      await mutatePlan(plan.id, () => rpc('plan.save', { plan }));
      await refresh();
      return !deletedPlans.current.has(plan.id);
    } catch (cause) {
      setToast({ text: errorMessage(cause), error: true });
      return false;
    }
  };
  const startPlan = (
    plan: Plan,
    requestedDeviceId?: string,
    requestId?: string,
  ): Promise<boolean> => {
    const bindings = planDeviceIds(plan);
    if (!requestedDeviceId && bindings.length > 1) {
      setStartSelection(plan);
      return Promise.resolve(false);
    }
    return action(
      `start-plan-${requestedDeviceId || bindings[0] || selectedDevice}`,
      async () => {
        const navigationRevision = detailRevision.current;
        let devices = snapshot?.devices || [];
        let deviceId = requestedDeviceId || bindings[0] || selectedDevice;
        if (deviceId && !planAllowsDevice(plan, deviceId))
          throw new Error('请选择本任务表绑定的设备');
        let connectionFailure: unknown;
        if (
          !devices.some((item) => item.id === deviceId && item.state !== 'offline') &&
          snapshot?.settings.autoConnect
        ) {
          try {
            const connection = await rpc('device.auto_connect', {});
            const candidates = new Set(connection.devices.map((item) => item.id));
            const deadline = Date.now() + 15_000;
            while (true) {
              devices = (await rpc('app.snapshot', {})).devices;
              if (!deviceId)
                deviceId =
                  devices.find((item) => candidates.has(item.id) && item.state === 'idle')?.id ||
                  deviceId;
              if (devices.some((item) => item.id === deviceId && item.state === 'idle')) break;
              if (Date.now() >= deadline || !connection.devices.length)
                throw new Error(
                  connection.diagnostics.join('；') || '设备连接尚未就绪，请在设备页查看诊断后重试',
                );
              await new Promise((resolve) => window.setTimeout(resolve, 250));
            }
          } catch (cause) {
            connectionFailure = cause;
          }
        }
        if (!deviceId || !devices.some((item) => item.id === deviceId))
          throw new Error(
            connectionFailure
              ? errorMessage(connectionFailure)
              : bindings.length
                ? '绑定设备尚未连接，请在设备页连接后重试'
                : '请先连接设备，或开启自动连接',
          );
        // The service validates the requested target, including a launch-scoped
        // notification when its local emulator endpoint is unavailable.
        await rpc('run.start', { planId: plan.id, deviceId, requestId: requestId || uid() });
        if (!requestedDeviceId && detailRevision.current === navigationRevision) {
          setSelectedDevice(deviceId);
        }
      },
      '任务表已开始执行',
    );
  };
  const stopRun = (run: Run) =>
    action(`stop-${run.id}`, () => rpc('run.stop', { id: run.id }), '执行已停止，保存的配置已保留');
  const duplicatePlan = async (plan: Plan) => {
    const copy = { ...structuredClone(plan), id: uid(), name: `${plan.name.slice(0, 75)} 副本` };
    if (await action('duplicate-plan', () => rpc('plan.save', { plan: copy }), '任务表已复制'))
      choosePlan(copy);
  };
  const editPlan = (plan: Plan, type: PlanEditorCommand['type']) => {
    choosePlan(plan);
    setEditorCommand({ id: uid(), type });
  };
  const requestDeletePlans = (plans: Plan[], batch = false) => {
    setDeleteErrors({});
    setDeleting({ plans, batch });
  };
  const clearDeletedPlan = (id: string) => {
    discardPlanDraft(id);
    if (detailPlanId === id || proposal?.id === id) closeTaskDetail();
    if (selectedPlanId === id) {
      setSelectedPlanId('');
      setFocusTaskType(undefined);
      setFocusTaskIndex(undefined);
      setInitialParams(undefined);
      try {
        localStorage.removeItem('maaverge:ui:selected-plan');
      } catch {
        /* UI selection is optional. */
      }
    }
  };
  const deletePlans = async (plans: Plan[], batch: boolean) => {
    if (
      snapshot?.runs.some(
        (run) => run.status === 'running' && plans.some((plan) => plan.id === run.planId),
      )
    )
      return;
    await action(
      'delete-plan',
      async () => {
        for (const plan of plans) deletedPlans.current.add(plan.id);
        const settled = await Promise.allSettled(
          plans.map((plan) => mutatePlan(plan.id, () => rpc('plan.delete', { id: plan.id }))),
        );
        const errors: Record<string, string> = {};
        const failed: Plan[] = [];
        settled.forEach((result, index) => {
          const plan = plans[index];
          if (result.status === 'rejected') {
            deletedPlans.current.delete(plan.id);
            errors[plan.id] = errorMessage(result.reason);
            failed.push(plan);
          } else clearDeletedPlan(plan.id);
        });
        setDeleteErrors(errors);
        if (failed.length) {
          setDeleting({ plans: failed, batch });
          throw new Error(
            batch
              ? `已删除 ${plans.length - failed.length} 张任务表，${failed.length} 张删除失败：${errors[failed[0].id]}`
              : errors[failed[0].id],
          );
        }
        setDeleting(null);
      },
      batch ? `已删除 ${plans.length} 张任务表。` : '任务表已删除',
    );
  };
  const sendMessage = async (text: string) => {
    if (!text.trim() || isPending('agent')) return;
    setAgentQuery('');
    setMessages((previous) => [...previous, { id: uid(), role: 'user', text: text.trim() }]);
    await action('agent', async () => {
      const response = await rpc('agent.message', {
        message: text.trim(),
        deviceId: selectedDevice || undefined,
      });
      setMessages((previous) => [
        ...previous,
        { id: uid(), role: 'assistant', text: response.reply, plan: response.plan },
      ]);
    });
  };
  const selectedPlan = snapshot?.plans.find((item) => item.id === selectedPlanId);
  const detailPlan =
    detailPlanId === 'new'
      ? 'new'
      : detailPlanId
        ? snapshot?.plans.find((item) => item.id === detailPlanId) || null
        : null;
  const editorPlan = proposal || detailPlan;
  const editorRevision = detailRevision.current;
  const editorKey =
    editorPlan === 'new'
      ? `new:${focusTaskType || ''}:${JSON.stringify(initialParams || {})}`
      : editorPlan?.id || '';
  const { activeRuns, device, dockRun, dockTool, dockExecution } = deviceActivity(
    snapshot,
    selectedDevice,
  );
  const executionRun =
    executionSelection?.status !== 'running'
      ? executionSelection
      : snapshot?.runs.find((item) => item.id === executionSelection.id) || executionSelection;
  const selectDevice = (id: string) => {
    setSelectedDevice(id);
  };
  const toggleRunPanel = (panel: RunPanelTab) => {
    setDeviceSettingsEntry(undefined);
    setRunPanel(runPanel === panel ? null : panel);
  };
  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !snapshot) return [];
    const results: { key: string; title: string; location: string; open: () => void }[] = [];
    for (const plan of snapshot.plans)
      if (plan.name.toLowerCase().includes(term))
        results.push({
          key: `plan-${plan.id}`,
          title: plan.name,
          location: '任务表',
          open: () => choosePlan(plan),
        });
    for (const [type, label] of Object.entries(taskLabels))
      if (`${type} ${label}`.toLowerCase().includes(term))
        results.push({
          key: `task-${type}`,
          title: label,
          location: ['Copilot', 'SSSCopilot', 'ParadoxCopilot'].includes(type)
            ? '作业中心'
            : '添加到新任务表',
          open: () => createPlan(type as Task['type']),
        });
    for (const field of taskFieldSearch.filter((item) =>
      `${item.label} ${item.key}`.toLowerCase().includes(term),
    )) {
      const target =
        snapshot.plans.find(
          (plan) =>
            plan.id === selectedPlanId && plan.tasks.some((task) => task.type === field.type),
        ) || snapshot.plans.find((plan) => plan.tasks.some((task) => task.type === field.type));
      results.push({
        key: `field-${field.type}-${field.key}`,
        title: field.label,
        location: `${taskLabels[field.type]} · ${target?.name || '新任务表'}`,
        open: () => {
          if (target)
            choosePlan(
              target,
              field.type,
              target.tasks.findIndex((task) => task.type === field.type),
            );
          else createPlan(field.type);
          setPageSearch(search.trim());
        },
      });
    }
    const categories = [
      ['更新 资源更新 核心 应用 回滚', '更新', 'settings'],
      ['主题 外观 浅色 深色 托盘', '通用与外观', 'settings'],
      ['模型 Agent API', '模型与 Agent', 'settings'],
      ['通知 远控', '通知与远控', 'settings'],
      ['ADB 连接 截图 触控 模拟器 设备', '设备与连接', 'devices'],
      ['日志 log 诊断 导出 清理 保留', '数据与诊断', 'settings'],
      ['仓库 干员 库存 材料 导出 公招', '工具箱', 'tools'],
      ['作业 社区 视频', '作业中心', 'copilot'],
    ] as const;
    for (const [keywords, title, target] of categories)
      if (keywords.toLowerCase().includes(term) || term.includes(title))
        results.push({
          key: `setting-${title}`,
          title,
          location: target === 'settings' ? '应用设置' : pageNames[target],
          open: () => {
            navigate(target);
            setPageSearch(search.trim());
          },
        });
    return results.slice(0, 9);
  }, [search, snapshot, selectedPlanId]);
  const platform = desktopPlatform();
  const moduleLoadFailed =
    /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module/iu.test(
      error,
    );
  if (!snapshot)
    return (
      <div className="boot-screen" data-desktop-platform={platform || undefined}>
        {platform && (
          <header className="boot-titlebar" data-tauri-drag-region="deep">
            <WindowControls />
          </header>
        )}
        <Brand />
        {error ? <AlertCircle size={24} /> : <LoaderCircle className="spin" size={24} />}
        <p role={error ? 'alert' : 'status'}>
          {moduleLoadFailed
            ? '界面组件加载失败，请重新加载界面后重试。'
            : error || '正在连接本地应用服务…'}
        </p>
        {error && (
          <button
            className="button primary"
            onClick={() => (moduleLoadFailed ? window.location.reload() : void refresh())}
          >
            {moduleLoadFailed ? '重新加载界面' : '重新连接'}
          </button>
        )}
      </div>
    );
  const supportProps = {
    snapshot,
    selectedDevice,
    onSelectDevice: selectDevice,
    busy: pending.size > 0,
    onAction: action,
    onPrepareUpdate: downloads.prepare,
    preparingUpdates: downloads.preparing,
    onOpenPlan: choosePlan,
    onCreateTaskPlan: (type: Task['type'], params?: Task['params']) => createPlan(type, params),
    searchQuery: pageSearch,
  };
  return (
    <div
      className={`app-root ${sidebarOpen ? 'nav-open' : ''}`}
      data-desktop-platform={platform || undefined}
    >
      <AppSidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        page={page}
        navigate={navigate}
        onTasks={setTaskView}
        onClearExecution={setExecutionSelection}
        device={device}
        appVersion={
          snapshot.updates.find((channel) => channel.id === 'app')?.currentVersion || '未知版本'
        }
        hasUpdate={snapshot.updates.some((item) => item.status === 'available')}
      />
      <div className="main-shell">
        <AppTopbar
          searchInput={searchInput}
          search={search}
          setSearch={setSearch}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
          searchResults={searchResults}
          onOpenNav={() => setSidebarOpen(true)}
        />
        <main className="main-content" aria-label={pageNames[page]}>
          <div className="page-transition" key={page}>
            {error && (
              <ErrorBanner className="error-banner">
                <Wifi size={16} />
                <span>本地服务连接异常：{error}</span>
                <button className="text-button" onClick={() => void refresh()}>
                  重试
                </button>
              </ErrorBanner>
            )}
            {page === 'home' && (
              <HomeDashboard
                snapshot={snapshot}
                selectedDevice={selectedDevice}
                stopping={pending.has(`stop-${dockRun?.id}`)}
                onStopRun={(run) => {
                  void stopRun(run);
                }}
                onShowRun={showExecution}
                onNavigate={navigate}
                onUpdates={() => {
                  navigate('settings');
                  setPageSearch('更新');
                }}
              />
            )}
            {page === 'tasks' && (
              <TasksPage
                snapshot={snapshot}
                selectedDeviceId={selectedDevice}
                pending={pending}
                view={taskView}
                editor={
                  editorPlan ? (
                    <PlanEditor
                      key={editorKey}
                      plan={editorPlan}
                      devices={snapshot.devices}
                      settings={snapshot.settings}
                      selectedDeviceId={selectedDevice}
                      onOpenDeviceSettings={(deviceId) => {
                        setRunPanel(null);
                        setDeviceSettingsEntry(deviceId || '');
                      }}
                      defaultName={nextPlanName(snapshot.plans.map((plan) => plan.name))}
                      focusTaskType={focusTaskType}
                      focusTaskIndex={focusTaskIndex}
                      initialParams={initialParams}
                      initialTab={
                        editorCommand?.type === 'settings' || editorCommand?.type === 'rename'
                          ? 'settings'
                          : 'tasks'
                      }
                      unsaved={editorPlan === proposal}
                      searchQuery={pageSearch}
                      busyDeviceIds={activeRuns.map((run) => run.deviceId)}
                      running={activeRuns.some(
                        (run) => run.planId === (editorPlan === 'new' ? '' : editorPlan.id),
                      )}
                      activeRun={
                        editorPlan === 'new'
                          ? undefined
                          : activeRuns.find((run) => run.planId === editorPlan.id)
                      }
                      stopping={
                        editorPlan === 'new'
                          ? false
                          : pending.has(
                              `stop-${activeRuns.find((run) => run.planId === editorPlan.id)?.id}`,
                            )
                      }
                      onViewRun={showExecution}
                      onStopRun={(run) => {
                        void stopRun(run);
                      }}
                      suspended={deleting?.plans.some(
                        (plan) => plan.id === (editorPlan === 'new' ? '' : editorPlan.id),
                      )}
                      command={editorCommand}
                      onCommandHandled={() => setEditorCommand(undefined)}
                      onDuplicate={(plan) => void duplicatePlan(plan)}
                      onCopyCopilot={(planId, taskIndex) => {
                        setCopilotLegacy({ planId, taskIndex, nonce: uid() });
                        navigate('copilot');
                      }}
                      onSave={savePlan}
                      onStart={(plan) => startPlan(plan)}
                      onSaved={(plan) => {
                        if (detailRevision.current !== editorRevision) return;
                        setSelectedPlanId(plan.id);
                        setDetailPlanId(plan.id);
                        setProposal(null);
                        setFocusTaskType(undefined);
                        setFocusTaskIndex(undefined);
                        setInitialParams(undefined);
                        try {
                          localStorage.setItem('maaverge:ui:selected-plan', plan.id);
                        } catch {
                          /* Selection only. */
                        }
                      }}
                      onClose={closeTaskDetail}
                      onDelete={(plan) => requestDeletePlans([plan])}
                    />
                  ) : undefined
                }
                execution={
                  <ExecutionMonitor
                    snapshot={snapshot}
                    selectedRun={executionRun}
                    selectedDeviceId={selectedDevice}
                    onSelectDevice={selectDevice}
                    pending={pending}
                    onSelectRun={showExecution}
                    onRunUpdate={updateExecution}
                    onDevicesDeleted={refresh}
                    onOverview={() => setExecutionSelection(undefined)}
                    onStop={stopRun}
                    onStopMany={stopMany}
                    onPrepare={() => {
                      setTaskView('plans');
                      setExecutionSelection(undefined);
                    }}
                  />
                }
                onView={(next) => {
                  closeTaskDetail();
                  setRunPanel(null);
                  setDeviceSettingsEntry(undefined);
                  setTaskView(next);
                  setExecutionSelection(undefined);
                }}
                onOpenPlan={(plan) => choosePlan(plan)}
                onCreatePlan={() => createPlan()}
                onCommand={(plan, type) => editPlan(plan, type)}
                onDelete={(plan) => requestDeletePlans([plan])}
                onDeleteMany={(plans) => requestDeletePlans(plans, true)}
                onStart={startPlan}
                onStop={stopRun}
                onShowRun={showExecution}
                onCloseDetail={closeTaskDetail}
              />
            )}
            {page === 'devices' && <DevicesPage {...supportProps} />}
            {page === 'settings' && <SettingsPage {...supportProps} />}
            {page === 'copilot' && (
              <CopilotPage
                {...supportProps}
                initialRunId={copilotRunId}
                onRunSelection={setCopilotRunId}
                initialLegacy={copilotLegacy}
                onViewRun={(id) => {
                  const run = snapshot.runs.find((item) => item.id === id);
                  if (run) showExecution(run);
                }}
              />
            )}
            {page === 'tools' && <ToolsPage {...supportProps} />}
            {page === 'agent' && (
              <AgentPage
                messages={messages}
                sendMessage={sendMessage}
                agentQuery={agentQuery}
                setAgentQuery={setAgentQuery}
                pending={pending}
                onReviewPlan={(plan) => {
                  setProposal(plan);
                  setDetailPlanId(null);
                  setFocusTaskType(undefined);
                  setFocusTaskIndex(undefined);
                  setInitialParams(undefined);
                  setTaskView('plans');
                  navigate('tasks', true);
                }}
                onOpenSettings={() => {
                  navigate('settings');
                  setPageSearch('??');
                }}
                device={device}
              />
            )}
            {page === 'history' && (
              <HistoryPage
                snapshot={snapshot}
                historyFilter={historyFilter}
                setHistoryFilter={setHistoryFilter}
                historyQuery={historyQuery}
                setHistoryQuery={setHistoryQuery}
                contextMenu={contextMenu}
                showExecution={showExecution}
                pending={pending}
                stopRun={stopRun}
                choosePlan={choosePlan}
                executionRun={executionRun}
                setRunPanel={setRunPanel}
              />
            )}
          </div>
        </main>
      </div>
      {deviceSettingsEntry !== undefined && (
        <DeviceConnectionDrawer
          key={deviceSettingsEntry}
          snapshot={snapshot}
          deviceId={deviceSettingsEntry}
          busy={pending.has('settings')}
          onSave={(settings) =>
            action(
              'settings',
              () => rpc('settings.save', { settings }),
              '连接配置已保存，下次连接生效',
            )
          }
          onClose={() => setDeviceSettingsEntry(undefined)}
        />
      )}
      {runPanel && (
        <AppRunPanel
          snapshot={snapshot}
          selectedDevice={selectedDevice}
          panel={runPanel}
          pending={pending}
          onClose={() => setRunPanel(null)}
          onPrepare={() => {
            navigate('tasks');
            setTaskView('plans');
          }}
          onRunUpdate={updateExecution}
          onStart={startPlan}
          onStop={stopRun}
          onInspect={showExecution}
          onConnect={() => navigate('devices')}
        />
      )}
      <RunDock
        devices={snapshot.devices}
        selectedDevice={selectedDevice}
        onSelectDevice={selectDevice}
        device={device}
        dockExecution={dockExecution}
        selectedPlan={selectedPlan}
        pageLabel={pageNames[page]}
        isHome={page === 'home'}
        runPanel={runPanel}
        onTogglePanel={toggleRunPanel}
        onClosePanel={() => setRunPanel(null)}
        activeRunsCount={activeRuns.length}
        stopDisabled={dockExecution ? pending.has(`stop-${dockExecution.id}`) : false}
        onStopDock={() => {
          if (dockRun) void stopRun(dockRun);
          else if (dockTool)
            void action(
              `stop-${dockTool.id}`,
              () => rpc('tool.stop', { id: dockTool.id }),
              '已停止工具执行',
            );
        }}
      />
      {startSelection && (
        <RunTasksDialog
          snapshot={snapshot}
          plans={[snapshot.plans.find((plan) => plan.id === startSelection.id) || startSelection]}
          selectedDeviceId={selectedDevice}
          pending={pending}
          onStart={startPlan}
          onClose={() => setStartSelection(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={deleting.batch ? '删除所选任务表' : '删除任务表'}
          closeLabel="关闭确认"
          className="modal confirm-dialog"
          busy={pending.has('delete-plan')}
          cancelDisabled={pending.has('delete-plan')}
          confirmLabel={
            pending.has('delete-plan')
              ? '正在删除…'
              : deleting.batch
                ? `删除 ${deleting.plans.length} 张任务表`
                : '删除任务表'
          }
          confirmIcon={<Trash2 size={15} />}
          danger
          confirmDisabled={activeRuns.some((run) =>
            deleting.plans.some((plan) => plan.id === run.planId),
          )}
          onConfirm={() => void deletePlans(deleting.plans, deleting.batch)}
          onClose={() => {
            if (!isPending('delete-plan')) setDeleting(null);
          }}
        >
          <p>
            {deleting.batch
              ? `确定删除所选的 ${deleting.plans.length} 张任务表？这些任务表的未保存改动也会丢弃，执行记录会保留。`
              : `确定删除“${deleting.plans[0].name}”？此表的未保存改动也会丢弃，执行记录会保留。`}
          </p>
          {deleting.batch && (
            <ul className="tc-delete-list">
              {deleting.plans.map((plan) => (
                <li key={plan.id}>
                  {plan.name}
                  {deleteErrors[plan.id] && <span>：{deleteErrors[plan.id]}</span>}
                </li>
              ))}
            </ul>
          )}
          {activeRuns.some((run) => deleting.plans.some((plan) => plan.id === run.planId)) && (
            <p role="alert">
              请先停止{deleting.batch ? '所选任务表' : '此任务表'}的执行，再删除任务表。
            </p>
          )}
        </ConfirmDialog>
      )}
      <ScheduleNotifications />
      <UpdateNotifications notices={downloads.notices} onDismiss={downloads.dismiss} />
      {toast && <Toast text={toast.text} error={toast.error} onDismiss={() => setToast(null)} />}
    </div>
  );
}
