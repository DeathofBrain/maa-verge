import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  History,
  House,
  Layers,
  ListChecks,
  LoaderCircle,
  Menu,
  Monitor,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';
import {
  errorMessage,
  desktopPlatform,
  syncWindowTheme,
  rpc,
  subscribe,
  localizeExecutionMessage,
  taskEnabled,
  taskLabels,
  nextPlanName,
  type Plan,
  type Run,
  type Snapshot,
  type Task,
} from '@maaverge/contracts';
import { DevicesPage } from './DevicesPage';
import PlanEditor, {
  discardPlanDraft,
  taskFieldSearch,
  type PlanEditorCommand,
} from './PlanEditor';
import { useContextMenu } from './ContextMenu';
import ScheduleNotifications from './ScheduleNotifications';
import { CopilotPage, SettingsPage, ToolsPage } from './SupportPages';
import HomeDashboard from './HomeDashboard';
import WindowControls from './WindowControls';
import DevicePreview from './DevicePreview';
import MultiRunPanel from './MultiRunPanel';
import ExecutionMonitor from './ExecutionMonitor';
import TasksPage from './TasksPage';
import DeviceConnectionDrawer from './DeviceConnectionDrawer';
import SideDrawer from './SideDrawer';
import MonitorLogDrawer from './MonitorLogDrawer';
import { isCopilotRun, runDisplayName, runSourceLabel } from './run-source';
import UpdateNotifications, { useComponentDownloads } from './UpdateNotifications';

type Page = 'home' | 'tasks' | 'copilot' | 'tools' | 'agent' | 'history' | 'devices' | 'settings';
type Message = { id: string; role: 'user' | 'assistant'; text: string; plan?: Plan };
const navigation = [
  { id: 'home', label: '主页', icon: House },
  { id: 'tasks', label: '任务', icon: ListChecks },
  { id: 'copilot', label: '作业中心', icon: BookOpen },
  { id: 'tools', label: '工具箱', icon: Wrench },
  { id: 'agent', label: 'Agent 助手', icon: Bot },
  { id: 'history', label: '执行记录', icon: History },
] as const;
const pageNames: Record<Page, string> = {
  home: '主页',
  tasks: '任务',
  copilot: '作业中心',
  tools: '工具箱',
  agent: 'Agent 助手',
  history: '执行记录',
  devices: '设备',
  settings: '设置',
};
const statusNames: Record<Run['status'], string> = {
  running: '执行中',
  completed: '已完成',
  failed: '执行失败',
  stopped: '已停止',
};
const uid = () => crypto.randomUUID();
const time = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const planWrites = useRef(new Map<string, Promise<unknown>>());
  const deletedPlans = useRef(new Set<string>());
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [taskView, setTaskView] = useState<'plans' | 'execution'>('plans');
  const [detailPlanId, setDetailPlanId] = useState<string | 'new' | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState(readSelection);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [focusTaskType, setFocusTaskType] = useState<Task['type']>();
  const [focusTaskIndex, setFocusTaskIndex] = useState<number>();
  const [initialParams, setInitialParams] = useState<Task['params']>();
  const [proposal, setProposal] = useState<Plan | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [pageSearch, setPageSearch] = useState('');
  const [deviceSettingsEntry, setDeviceSettingsEntry] = useState<string>();
  const searchInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const pendingRef = useRef(new Set<string>());
  const refreshSequence = useRef(0);
  const detailRevision = useRef(0);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Plan | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentQuery, setAgentQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const [executionSelection, setExecutionSelection] = useState<Run>();
  const [copilotRunId, setCopilotRunId] = useState<string>();
  const [copilotLegacy, setCopilotLegacy] = useState<{
    planId: string;
    taskIndex: number;
    nonce: string;
  }>();
  const [runPanel, setRunPanel] = useState<'progress' | 'logs' | 'preview' | 'instances' | null>(
    null,
  );

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const next = await rpc('app.snapshot', {});
      if (sequence !== refreshSequence.current) return;
      setSnapshot(next);
      setSelectedDevice((previous) =>
        next.devices.some((item) => item.id === previous)
          ? previous
          : next.devices.find((item) => item.state !== 'offline')?.id || next.devices[0]?.id || '',
      );
      setError('');
    } catch (cause) {
      if (sequence === refreshSequence.current) setError(errorMessage(cause));
    }
  }, []);
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
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [toast]);
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        setSearchOpen(false);
        if (!pendingRef.current.has('delete-plan')) setDeleting(null);
        setRunPanel(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    if (!runPanel) return;
    detailRevision.current++;
    setDetailPlanId(null);
    setProposal(null);
  }, [runPanel]);
  const action = useCallback(
    async (key: string, call: () => Promise<unknown>, success?: string) => {
      if (pendingRef.current.has(key)) return false;
      setToast(null);
      pendingRef.current.add(key);
      setPending(new Set(pendingRef.current));
      try {
        await call();
        await refresh();
        if (success) setToast({ text: success });
        return true;
      } catch (cause) {
        await refresh();
        setToast({ text: errorMessage(cause), error: true });
        return false;
      } finally {
        pendingRef.current.delete(key);
        setPending(new Set(pendingRef.current));
      }
    },
    [refresh],
  );
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
  const mutatePlan = async <T,>(id: string, call: () => Promise<T>): Promise<T> => {
    const previous = planWrites.current.get(id);
    const next = (previous || Promise.resolve()).catch(() => {}).then(call);
    planWrites.current.set(id, next);
    try {
      return await next;
    } finally {
      if (planWrites.current.get(id) === next) planWrites.current.delete(id);
    }
  };
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
  const startPlan = (plan: Plan, requestedDeviceId?: string) =>
    action(
      `start-plan-${plan.deviceId || requestedDeviceId || selectedDevice}`,
      async () => {
        const navigationRevision = detailRevision.current;
        let devices = snapshot?.devices || [];
        let deviceId = plan.deviceId || requestedDeviceId || selectedDevice;
        if (
          !devices.some((item) => item.id === deviceId && item.state !== 'offline') &&
          snapshot?.settings.autoConnect
        ) {
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
        }
        if (!deviceId || !devices.some((item) => item.id === deviceId && item.state !== 'offline'))
          throw new Error(
            plan.deviceId
              ? '绑定设备尚未连接，请在设备页连接后重试'
              : '请先连接设备，或开启自动连接',
          );
        await rpc('run.start', { planId: plan.id, deviceId, requestId: uid() });
        if (!requestedDeviceId && detailRevision.current === navigationRevision) {
          setSelectedDevice(deviceId);
        }
      },
      '任务表已开始执行',
    );
  const stopRun = (run: Run) =>
    action(`stop-${run.id}`, () => rpc('run.stop', { id: run.id }), '执行已停止，保存的配置已保留');
  const stopMany = useCallback(
    async (runs: Run[]) => {
      const unique = [...new Map(runs.map((run) => [run.id, run])).values()];
      if (!unique.length || pendingRef.current.has('stop-many')) return false;
      pendingRef.current.add('stop-many');
      setPending(new Set(pendingRef.current));
      try {
        const settled = await Promise.allSettled(
          unique.map((run) => rpc('run.stop', { id: run.id })),
        );
        const failed = settled.filter((result) => result.status === 'rejected').length;
        await refresh();
        setToast({
          text: failed
            ? `已停止 ${unique.length - failed} 台设备，${failed} 台失败。`
            : `已停止 ${unique.length} 台设备。`,
          error: failed > 0,
        });
        return failed === 0;
      } finally {
        pendingRef.current.delete('stop-many');
        setPending(new Set(pendingRef.current));
      }
    },
    [refresh],
  );
  const duplicatePlan = async (plan: Plan) => {
    const copy = { ...structuredClone(plan), id: uid(), name: `${plan.name.slice(0, 75)} 副本` };
    if (await action('duplicate-plan', () => rpc('plan.save', { plan: copy }), '任务表已复制'))
      choosePlan(copy);
  };
  const editPlan = (plan: Plan, type: PlanEditorCommand['type']) => {
    choosePlan(plan);
    setEditorCommand({ id: uid(), type });
  };
  const deletePlan = async (plan: Plan) => {
    deletedPlans.current.add(plan.id);
    if (
      !(await action(
        'delete-plan',
        () => mutatePlan(plan.id, () => rpc('plan.delete', { id: plan.id })),
        '任务表已删除',
      ))
    ) {
      deletedPlans.current.delete(plan.id);
      return;
    }
    discardPlanDraft(plan.id);
    setDeleting(null);
    if (detailPlanId === plan.id || proposal?.id === plan.id) closeTaskDetail();
    if (selectedPlanId === plan.id) {
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
  const sendMessage = async (text: string) => {
    if (!text.trim() || pendingRef.current.has('agent')) return;
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
  const activeRuns = snapshot?.runs.filter((item) => item.status === 'running') || [];
  const dockRun = activeRuns.find((item) => item.deviceId === selectedDevice) || activeRuns[0];
  const executionRun =
    executionSelection?.status !== 'running'
      ? executionSelection
      : snapshot?.runs.find((item) => item.id === executionSelection.id) || executionSelection;
  const device = snapshot?.devices.find((item) => item.id === selectedDevice);
  const selectDevice = (id: string) => {
    setSelectedDevice(id);
  };
  const toggleRunPanel = (panel: 'progress' | 'logs' | 'preview' | 'instances') => {
    setDeviceSettingsEntry(undefined);
    if (panel === 'progress') {
      if (dockRun) showExecution(dockRun);
      else {
        navigate('tasks');
        setTaskView('execution');
      }
      return;
    }
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
  const history = snapshot.runs.filter(
    (run) =>
      (historyFilter === 'all' || run.status === historyFilter) &&
      `${runDisplayName(run, snapshot.plans)} ${runSourceLabel(run)} ${localizeExecutionMessage(run.message)} ${snapshot.devices.find((device) => device.id === run.deviceId)?.name || run.deviceId}`.includes(
        historyQuery,
      ),
  );
  return (
    <div
      className={`app-root ${sidebarOpen ? 'nav-open' : ''}`}
      data-desktop-platform={platform || undefined}
    >
      {sidebarOpen && (
        <button className="nav-scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className="sidebar">
        <Brand />
        <nav aria-label="主导航" className="primary-nav">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-item ${page === id ? 'active' : ''}`}
              aria-current={page === id ? 'page' : undefined}
              key={id}
              onClick={() => {
                if (id === 'tasks') {
                  setTaskView('plans');
                  setExecutionSelection(undefined);
                }
                navigate(id);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === 'agent' && <span className="subtle-tag">预览</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === 'devices' ? 'active' : ''}`}
            aria-current={page === 'devices' ? 'page' : undefined}
            onClick={() => navigate('devices')}
          >
            <Monitor size={19} />
            <span>设备</span>
            <span
              className={`status-dot ${!device || device.state === 'offline' ? 'offline' : ''}`}
            />
          </button>
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            aria-current={page === 'settings' ? 'page' : undefined}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={19} />
            <span>设置</span>
            {snapshot.updates.some((item) => item.status === 'available') && (
              <span className="update-dot" />
            )}
          </button>
          <div className="sidebar-footer">
            <span>
              Maa Verge{' '}
              {snapshot.updates.find((channel) => channel.id === 'app')?.currentVersion ||
                '未知版本'}
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar" data-tauri-drag-region="deep">
          <div className="workspace-context">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="device-selector" data-tauri-drag-region="false">
              <span
                className={`status-dot ${!device || device.state === 'offline' ? 'offline' : ''}`}
              />
              <select
                aria-label="选择设备"
                value={selectedDevice}
                onChange={(event) => selectDevice(event.target.value)}
              >
                <option value="">未连接设备</option>
                {snapshot.devices.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} ·{' '}
                    {item.state === 'offline'
                      ? '离线'
                      : item.state === 'running'
                        ? '执行中'
                        : '已连接'}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} />
            </div>
          </div>
          <div className="topbar-actions">
            <div className="global-search" data-tauri-drag-region="false">
              <Search size={15} />
              <input
                ref={searchInput}
                aria-label="搜索任务与设置"
                placeholder="搜索任务与设置"
                value={search}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && searchResults[0]) {
                    searchResults[0].open();
                    setSearchOpen(false);
                  }
                }}
              />
              {searchOpen && search.trim() && (
                <>
                  <button
                    className="search-dismiss"
                    aria-label="关闭搜索结果"
                    onClick={() => setSearchOpen(false)}
                  />
                  <div className="search-results" role="region" aria-label="搜索结果">
                    {searchResults.length ? (
                      searchResults.map((item) => (
                        <button
                          key={item.key}
                          onClick={() => {
                            item.open();
                            setSearchOpen(false);
                          }}
                        >
                          <Search size={14} />
                          <span>
                            {item.title}
                            <small>{item.location}</small>
                          </span>
                          <ArrowRight size={14} />
                        </button>
                      ))
                    ) : (
                      <p>没有找到匹配项，试试“更新”或任务名称。</p>
                    )}
                  </div>
                </>
              )}
            </div>
            <WindowControls />
          </div>
        </header>
        <main className="main-content" aria-label={pageNames[page]}>
          <div className="page-transition" key={page}>
            {error && (
              <div className="error-banner" role="alert">
                <Wifi size={16} />
                <span>本地服务连接异常：{error}</span>
                <button className="text-button" onClick={() => void refresh()}>
                  重试
                </button>
              </div>
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
                      suspended={deleting?.id === (editorPlan === 'new' ? '' : editorPlan.id)}
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
                      onDelete={(plan) => setDeleting(plan)}
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
                    onOverview={() => setExecutionSelection(undefined)}
                    onStop={stopRun}
                    onStopMany={stopMany}
                    onEdit={(plan) => choosePlan(plan)}
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
                onDelete={(plan) => setDeleting(plan)}
                onStart={(plan, deviceId) => startPlan(plan, deviceId)}
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
              <section className="agent-page">
                <PageHeading
                  title="Agent 助手"
                  text="描述目标，检查计划，再交给任务表执行。"
                  action={
                    <span className="pill">
                      <ShieldCheck size={13} />
                      审阅后执行
                    </span>
                  }
                />
                <div className="agent-notice">
                  <Bot size={17} />
                  <span>当前使用本地规则生成待审阅提案；云端模型与自主托管尚未接入。</span>
                </div>
                <div className="agent-layout">
                  <div className="chat-panel">
                    <div className="chat-messages" aria-live="polite">
                      {!messages.length && (
                        <div className="agent-welcome">
                          <span className="agent-emblem">
                            <Bot size={31} />
                          </span>
                          <h2>从一个具体目标开始</h2>
                          <p>生成的计划可以回到日常工作台逐项调整。</p>
                          <div className="prompt-list">
                            {[
                              '制定刷 6 次 1-7 的计划',
                              '安排零消耗的日常任务',
                              '检查我的任务配置',
                            ].map((prompt) => (
                              <button key={prompt} onClick={() => void sendMessage(prompt)}>
                                {prompt}
                                <ArrowRight size={15} />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {messages.map((message) => (
                        <div className={`chat-message ${message.role}`} key={message.id}>
                          <span className="chat-role">
                            {message.role === 'user' ? '你' : 'Agent'}
                          </span>
                          <div>
                            <p>{message.text}</p>
                            {message.plan && (
                              <div className="proposal-card">
                                <div>
                                  <ListChecks size={18} />
                                  <h3>{message.plan.name}</h3>
                                </div>
                                <ol>
                                  {message.plan.tasks.map((task, index) => (
                                    <li key={index}>
                                      <span>{index + 1}</span>
                                      {taskLabels[task.type] || task.type}
                                      <small>
                                        {task.type === 'Fight'
                                          ? `${String(task.params.stage || '当前关卡')} · ${String(task.params.times || 1)} 次`
                                          : taskEnabled(task)
                                            ? '已启用'
                                            : '已关闭'}
                                      </small>
                                    </li>
                                  ))}
                                </ol>
                                <p className="muted">理智药 0 · 源石 0；请在工作台核对有效参数。</p>
                                <button
                                  className="button primary"
                                  onClick={() => {
                                    setProposal(message.plan!);
                                    setDetailPlanId(null);
                                    setFocusTaskType(undefined);
                                    setFocusTaskIndex(undefined);
                                    setInitialParams(undefined);
                                    setTaskView('plans');
                                    navigate('tasks', true);
                                  }}
                                >
                                  检查并保存计划
                                  <ArrowRight size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {pending.has('agent') && (
                        <p className="thinking">
                          <LoaderCircle className="spin" size={15} />
                          正在整理计划…
                        </p>
                      )}
                    </div>
                    <form
                      className="chat-composer"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void sendMessage(agentQuery);
                      }}
                    >
                      <textarea
                        aria-label="给 Agent 的消息"
                        placeholder="例如：今晚刷 6 次 1-7，不使用理智药"
                        value={agentQuery}
                        onChange={(event) => setAgentQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (
                            event.key === 'Enter' &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing
                          ) {
                            event.preventDefault();
                            void sendMessage(agentQuery);
                          }
                        }}
                      />
                      <button
                        aria-label="发送消息"
                        className="button primary"
                        disabled={!agentQuery.trim() || pending.has('agent')}
                      >
                        <Send size={17} />
                      </button>
                    </form>
                  </div>
                  <aside className="agent-context">
                    <h3>共用同一张任务表</h3>
                    <p>Agent 提案会进入工作台草稿。逐项设置、消耗校验和设备控制使用同一套规则。</p>
                    <div className="context-fact">
                      <Monitor size={16} />
                      <span>
                        当前设备<strong>{device?.name || '未连接'}</strong>
                      </span>
                    </div>
                    <div className="context-fact">
                      <ShieldCheck size={16} />
                      <span>
                        消耗设置<strong>由任务表内自动作战的用药与源石数量决定</strong>
                      </span>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        navigate('settings');
                        setPageSearch('模型');
                      }}
                    >
                      模型设置
                      <ArrowRight size={14} />
                    </button>
                  </aside>
                </div>
              </section>
            )}
            {page === 'history' && (
              <section className="history-page">
                <PageHeading
                  title="执行记录"
                  text="查看每次运行的结果、设备与失败原因。"
                  action={
                    <button className="button secondary" onClick={() => setRunPanel('logs')}>
                      <Terminal size={15} />
                      运行事件
                    </button>
                  }
                />
                <div className="history-toolbar">
                  <div className="segmented" role="group" aria-label="筛选执行记录">
                    {[
                      ['all', '全部'],
                      ['running', '执行中'],
                      ['completed', '已完成'],
                      ['failed', '失败'],
                      ['stopped', '已停止'],
                    ].map(([value, label]) => (
                      <button
                        className={historyFilter === value ? 'active' : ''}
                        key={value}
                        onClick={() => setHistoryFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="inline-search">
                    <Search size={15} />
                    <input
                      aria-label="搜索执行记录"
                      placeholder="搜索名称、来源、实例或结果"
                      value={historyQuery}
                      onChange={(event) => setHistoryQuery(event.target.value)}
                    />
                  </label>
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
                                  const plan = snapshot.plans.find(
                                    (plan) => plan.id === run.planId,
                                  );
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
                              <span className={`pill ${run.status}`}>
                                {statusNames[run.status]}
                              </span>
                            </td>
                            <td className="numeric">{time(run.startedAt)}</td>
                            <td>{localizeExecutionMessage(run.message)}</td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`查看执行${run.id}`}
                                onClick={() => showExecution(run)}
                              >
                                <ChevronRight size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    icon={<History size={30} />}
                    title={snapshot.runs.length ? '没有匹配的执行记录' : '还没有执行记录'}
                    text="从任务表或作业中心开始执行，结果会保存在这里。"
                  />
                )}
              </section>
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
      {runPanel === 'logs' && (
        <MonitorLogDrawer
          snapshot={snapshot}
          initialDeviceIds={
            selectedDevice ? [selectedDevice] : snapshot.devices.map((item) => item.id)
          }
          onClose={() => setRunPanel(null)}
        />
      )}
      {(runPanel === 'preview' || runPanel === 'instances') && (
        <SideDrawer
          title={runPanel === 'preview' ? '设备画面' : '多开执行'}
          closeLabel="收起运行详情"
          onClose={() => setRunPanel(null)}
        >
          {runPanel === 'preview' ? (
            <div className="side-drawer-preview">
              <label className="sp-field">
                画面设备
                <select
                  className="text-input"
                  aria-label="画面设备"
                  value={selectedDevice}
                  onChange={(event) => selectDevice(event.target.value)}
                >
                  {!snapshot.devices.length && <option value="">尚未连接设备</option>}
                  {snapshot.devices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ·{' '}
                      {item.state === 'offline'
                        ? '已离线'
                        : item.state === 'running'
                          ? '执行中'
                          : '已连接'}
                    </option>
                  ))}
                </select>
              </label>
              <DevicePreview key={device?.id || 'no-device'} device={device} />
            </div>
          ) : (
            <MultiRunPanel
              devices={snapshot.devices}
              plans={snapshot.plans}
              runs={snapshot.runs}
              pending={pending}
              onStart={startPlan}
              onStop={stopRun}
              onInspect={showExecution}
              onConnect={() => navigate('devices')}
            />
          )}
        </SideDrawer>
      )}
      <footer className={`run-dock ${dockRun ? 'is-running' : ''}`} aria-label="执行状态栏">
        <button className="dock-status" onClick={() => toggleRunPanel('progress')}>
          {dockRun ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <span
              className={`status-dot ${!device || device.state === 'offline' ? 'offline' : ''}`}
            />
          )}
          <strong>
            {dockRun ? '执行中' : device && device.state !== 'offline' ? '就绪' : '等待连接'}
          </strong>
          {(dockRun || page !== 'home') && (
            <>
              <span className="dock-divider" />
              <span className="dock-message">
                {dockRun
                  ? localizeExecutionMessage(dockRun.message)
                  : selectedPlan?.name || pageNames[page]}
                <small>
                  {dockRun
                    ? `${snapshot.devices.find((item) => item.id === dockRun.deviceId)?.name || dockRun.deviceId} · 任务进度 ${dockRun.progress}%`
                    : device?.name || '请连接模拟器或设备'}
                </small>
              </span>
            </>
          )}
        </button>
        <div className="dock-actions">
          <button
            aria-label="多开执行"
            className={runPanel === 'instances' ? 'selected' : ''}
            onClick={() => toggleRunPanel('instances')}
          >
            <Layers size={16} />
            <span>多开执行{activeRuns.length > 1 ? ` · ${activeRuns.length}` : ''}</span>
          </button>
          {dockRun && (
            <button
              className="button danger dock-stop"
              disabled={pending.has(`stop-${dockRun.id}`)}
              onClick={() => void stopRun(dockRun)}
            >
              <Square size={12} />
              停止执行
            </button>
          )}
          <button
            aria-label="运行详情"
            className={page === 'tasks' && taskView === 'execution' ? 'selected' : ''}
            onClick={() => toggleRunPanel('progress')}
          >
            <ListChecks size={16} />
            <span>运行详情</span>
          </button>
          <button
            aria-label="日志"
            className={runPanel === 'logs' ? 'selected' : ''}
            onClick={() => toggleRunPanel('logs')}
          >
            <Terminal size={16} />
            <span>日志</span>
          </button>
          <button
            aria-label="画面"
            className={runPanel === 'preview' ? 'selected' : ''}
            onClick={() => toggleRunPanel('preview')}
          >
            <Monitor size={16} />
            <span>画面</span>
          </button>
          <button
            className="icon-button"
            aria-label={runPanel ? '收起运行面板' : '展开运行面板'}
            onClick={() => {
              if (runPanel) setRunPanel(null);
              else toggleRunPanel('progress');
            }}
          >
            {runPanel ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
          </button>
        </div>
      </footer>
      {deleting && (
        <ConfirmDialog
          title="删除任务表"
          onClose={() => {
            if (!pendingRef.current.has('delete-plan')) setDeleting(null);
          }}
        >
          <p>确定删除“{deleting.name}”？此表的未保存改动也会丢弃，执行记录会保留。</p>
          {activeRuns.some((run) => run.planId === deleting.id) && (
            <p role="alert">请先停止此任务表的执行，再删除任务表。</p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={pending.has('delete-plan')}
              onClick={() => setDeleting(null)}
            >
              取消
            </button>
            <button
              className="button danger"
              disabled={
                pending.has('delete-plan') || activeRuns.some((run) => run.planId === deleting.id)
              }
              onClick={() => void deletePlan(deleting)}
            >
              <Trash2 size={15} />
              {pending.has('delete-plan') ? '正在删除…' : '删除任务表'}
            </button>
          </div>
        </ConfirmDialog>
      )}
      <ScheduleNotifications />
      <UpdateNotifications notices={downloads.notices} onDismiss={downloads.dismiss} />
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`toast ${toast.error ? 'error' : ''}`}
        >
          {toast.error ? <AlertCircle size={17} /> : <Check size={17} />}
          <span>{toast.text}</span>
          <button className="icon-button" aria-label="关闭提示" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function Brand() {
  return (
    <div className="brand" data-tauri-drag-region="deep">
      <span className="brand-mark" aria-hidden="true">
        <img src="/logo.png" width="32" height="32" alt="" draggable={false} />
      </span>
      <span>Maa Verge</span>
    </div>
  );
}
function PageHeading({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
function ConfirmDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={ref}
        className="modal confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const nodes = [
            ...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []),
          ];
          if (!nodes.length) return;
          if (event.shiftKey && document.activeElement === nodes[0]) {
            event.preventDefault();
            nodes.at(-1)?.focus();
          } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
            event.preventDefault();
            nodes[0].focus();
          }
        }}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="关闭确认" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
