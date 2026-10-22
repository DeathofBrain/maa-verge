import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, BookOpen, Bot, Check, ChevronDown, ChevronRight, ChevronUp, Clock3, Copy, FileJson, FolderOpen, History, House, Layers, ListChecks, LoaderCircle, Menu, Monitor, Plus, Search, Send, Settings2, ShieldCheck, Square, Terminal, Trash2, Wifi, Wrench, X } from 'lucide-react';
import { desktopPlatform, syncWindowTheme, rpc, subscribe, taskEnabled, taskLabels, type Plan, type Run, type Snapshot, type Task } from '@maaverge/contracts';
import PlanEditor, { taskFieldSearch } from './PlanEditor';
import { CopilotPage, DevicesPage, SettingsPage, ToolsPage } from './SupportPages';
import HomeDashboard from './HomeDashboard';
import WindowControls from './WindowControls';
import DevicePreview from './DevicePreview';

type Page = 'home' | 'daily' | 'specialized' | 'copilot' | 'tools' | 'agent' | 'history' | 'devices' | 'settings';
type Group = 'daily' | 'specialized';
type Message = { id: string; role: 'user' | 'assistant'; text: string; plan?: Plan };
const navigation = [
  { id: 'home', label: '主页', icon: House }, { id: 'daily', label: '任务表', icon: ListChecks }, { id: 'specialized', label: '专项任务', icon: Layers },
  { id: 'copilot', label: '作业中心', icon: BookOpen }, { id: 'tools', label: '工具箱', icon: Wrench },
  { id: 'agent', label: 'Agent 助手', icon: Bot }, { id: 'history', label: '执行记录', icon: History },
] as const;
const pageNames: Record<Page, string> = { home: '主页', daily: '任务表', specialized: '专项任务', copilot: '作业中心', tools: '工具箱', agent: 'Agent 助手', history: '执行记录', devices: '设备', settings: '设置' };
const statusNames: Record<Run['status'], string> = { running: '执行中', completed: '已完成', failed: '执行失败', stopped: '已停止' };
const uid = () => crypto.randomUUID();
const time = (value: string) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const groupFor = (type: Task['type']): Group => ['Roguelike', 'Reclamation', 'OperProgress'].includes(type) ? 'specialized' : 'daily';
const readSelection = () => { try { return localStorage.getItem('maaverge:ui:selected-plan') || ''; } catch { return ''; } };

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [selectedPlanId, setSelectedPlanId] = useState(readSelection);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [newGroup, setNewGroup] = useState<Group | null>(null);
  const [focusTaskType, setFocusTaskType] = useState<Task['type']>();
  const [focusTaskIndex, setFocusTaskIndex] = useState<number>();
  const [initialParams, setInitialParams] = useState<Task['params']>();
  const [proposal, setProposal] = useState<Plan | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [pageSearch, setPageSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const pendingRef = useRef(new Set<string>());
  const refreshSequence = useRef(0);
  const navigationRevision = useRef(0);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Plan | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentQuery, setAgentQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [runPanel, setRunPanel] = useState<'progress' | 'logs' | 'preview' | null>(null);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const next = await rpc('app.snapshot', {});
      if (sequence !== refreshSequence.current) return;
      setSnapshot(next);
      setSelectedDevice((previous) => next.devices.some((item) => item.id === previous) ? previous : next.devices.find((item) => item.state !== 'offline')?.id || next.devices[0]?.id || '');
      setError('');
    } catch (cause) { if (sequence === refreshSequence.current) setError(cause instanceof Error ? cause.message : String(cause)); }
  }, []);
  useEffect(() => {
    void refresh();
    const unsubscribe = subscribe(() => { void refresh(); });
    const interval = window.setInterval(() => { void refresh(); }, 2500);
    return () => { unsubscribe(); window.clearInterval(interval); };
  }, [refresh]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(null), 6000); return () => window.clearTimeout(timeout); }, [toast]);
  useEffect(() => {
    const preference = snapshot?.settings.theme || 'system';
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = preference === 'system' ? media.matches ? 'dark' : 'light' : preference;
      document.documentElement.dataset.theme = theme;
      void syncWindowTheme(theme).catch((cause: unknown) => setToast({ text: `无法同步窗口背景：${cause instanceof Error ? cause.message : String(cause)}`, error: true }));
    };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [snapshot?.settings.theme]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.current?.focus(); setSearchOpen(true); }
      if (event.key === 'Escape') { setSidebarOpen(false); setSearchOpen(false); setDeleting(null); setRunPanel(null); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, []);
  const action = useCallback(async (key: string, call: () => Promise<unknown>, success?: string) => {
    if (pendingRef.current.has(key)) return false;
    setToast(null);
    pendingRef.current.add(key); setPending(new Set(pendingRef.current));
    try { await call(); await refresh(); if (success) setToast({ text: success }); return true; }
    catch (cause) { setToast({ text: cause instanceof Error ? cause.message : String(cause), error: true }); return false; }
    finally { pendingRef.current.delete(key); setPending(new Set(pendingRef.current)); }
  }, [refresh]);
  const navigate = (next: Page) => { navigationRevision.current++; setPage(next); setSidebarOpen(false); setPageSearch(''); setSearchOpen(false); };
  const choosePlan = (plan: Plan, type?: Task['type'], taskIndex?: number) => {
    setSelectedPlanId(plan.id); setNewGroup(null); setProposal(null); setFocusTaskType(type); setFocusTaskIndex(taskIndex); setInitialParams(undefined);
    navigate(plan.group === 'specialized' ? 'specialized' : 'daily');
    try { localStorage.setItem('maaverge:ui:selected-plan', plan.id); } catch { /* UI selection is optional. */ }
  };
  const createPlan = (group: Group, type?: Task['type'], params?: Task['params']) => {
    setNewGroup(group); setProposal(null); setFocusTaskType(type); setFocusTaskIndex(undefined); setInitialParams(params); navigate(group);
  };
  const savePlan = (plan: Plan) => action('save-plan', () => rpc('plan.save', { plan }), '任务表已保存');
  const startPlan = (plan: Plan) => action('start-plan', async () => {
    let devices = snapshot?.devices || [];
    let deviceId = plan.deviceId || selectedDevice;
    if (!devices.some((item) => item.id === deviceId && item.state !== 'offline') && snapshot?.settings.autoConnect) {
      const connection = await rpc('device.auto_connect', {});
      const candidates = new Set(connection.devices.map((item) => item.id));
      const deadline = Date.now() + 15_000;
      while (true) {
        devices = (await rpc('app.snapshot', {})).devices;
        if (!plan.deviceId) deviceId = devices.find((item) => candidates.has(item.id) && item.state === 'idle')?.id || deviceId;
        if (devices.some((item) => item.id === deviceId && item.state === 'idle')) break;
        if (Date.now() >= deadline || !connection.devices.length) throw new Error(connection.diagnostics.join('；') || '设备连接尚未就绪，请在设备页查看诊断后重试');
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    }
    if (!deviceId || !devices.some((item) => item.id === deviceId && item.state !== 'offline')) throw new Error(plan.deviceId ? '绑定设备尚未连接，请在设备页连接后重试' : '请先连接设备，或开启自动连接');
    const run = await rpc('run.start', { planId: plan.id, deviceId, requestId: uid() });
    setSelectedRunId(run.id); setSelectedDevice(deviceId);
  }, '任务表已开始执行');
  const stopRun = (run: Run) => action(`stop-${run.id}`, () => rpc('run.stop', { id: run.id }), '执行已停止，保存的任务表已保留');
  const duplicatePlan = async (plan: Plan) => {
    const copy = { ...structuredClone(plan), id: uid(), name: `${plan.name.slice(0, 75)} 副本` };
    if (await action('duplicate-plan', () => rpc('plan.save', { plan: copy }), '任务表已复制')) choosePlan(copy);
  };
  const sendMessage = async (text: string) => {
    if (!text.trim() || pendingRef.current.has('agent')) return;
    setAgentQuery(''); setMessages((previous) => [...previous, { id: uid(), role: 'user', text: text.trim() }]);
    await action('agent', async () => {
      const response = await rpc('agent.message', { message: text.trim(), deviceId: selectedDevice || undefined });
      setMessages((previous) => [...previous, { id: uid(), role: 'assistant', text: response.reply, plan: response.plan }]);
    });
  };
  const group: Group = page === 'specialized' ? 'specialized' : 'daily';
  const selectedPlan = snapshot?.plans.find((item) => item.id === selectedPlanId && (item.group || 'daily') === group) || snapshot?.plans.find((item) => (item.group || 'daily') === group);
  const editorPlan = (proposal?.group === group ? proposal : null) || (newGroup === group ? 'new' : selectedPlan);
  const editorKey = editorPlan === 'new' ? `new:${newGroup}:${focusTaskType || ''}:${JSON.stringify(initialParams || {})}` : editorPlan?.id || '';
  const editorRevision = navigationRevision.current;
  const activeRuns = snapshot?.runs.filter((item) => item.status === 'running') || [];
  const dockRun = activeRuns.find((item) => item.deviceId === selectedDevice) || activeRuns[0];
  const detailRun = snapshot?.runs.find((item) => item.id === selectedRunId) || dockRun || snapshot?.runs[0];
  const device = snapshot?.devices.find((item) => item.id === selectedDevice);
  const relevantEvents = snapshot?.events.filter((event) => !detailRun || !event.data.runId || event.data.runId === detailRun.id).slice().reverse() || [];
  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !snapshot) return [];
    const results: { key: string; title: string; location: string; open: () => void }[] = [];
    for (const plan of snapshot.plans) if (plan.name.toLowerCase().includes(term)) results.push({ key: `plan-${plan.id}`, title: plan.name, location: '任务表', open: () => choosePlan(plan) });
    for (const [type, label] of Object.entries(taskLabels)) if (`${type} ${label}`.toLowerCase().includes(term)) results.push({ key: `task-${type}`, title: label, location: '添加到新任务表', open: () => createPlan(groupFor(type as Task['type']), type as Task['type']) });
    for (const field of taskFieldSearch.filter((item) => `${item.label} ${item.key}`.toLowerCase().includes(term))) {
      const target = snapshot.plans.find((plan) => plan.id === selectedPlanId && plan.tasks.some((task) => task.type === field.type)) || snapshot.plans.find((plan) => plan.tasks.some((task) => task.type === field.type));
      results.push({ key: `field-${field.type}-${field.key}`, title: field.label, location: `${taskLabels[field.type]} · ${target?.name || '新任务表'}`, open: () => {
        if (target) choosePlan(target, field.type, target.tasks.findIndex((task) => task.type === field.type));
        else createPlan(groupFor(field.type), field.type);
        setPageSearch(search.trim());
      } });
    }
    const categories = [
      ['更新 资源更新 核心 应用 回滚', '更新', 'settings'], ['主题 外观 浅色 深色 托盘', '通用与外观', 'settings'], ['预算 药 源石 消耗 加急', '执行与消耗', 'settings'],
      ['模型 Agent API', '模型与 Agent', 'settings'], ['通知 远控', '通知与远控', 'settings'], ['ADB 连接 截图 触控 模拟器 设备', '设备与连接', 'devices'],
      ['仓库 干员 库存 材料 导出 公招', '工具箱', 'tools'], ['作业 社区 视频', '作业中心', 'copilot'],
    ] as const;
    for (const [keywords, title, target] of categories) if (keywords.toLowerCase().includes(term) || term.includes(title)) results.push({ key: `setting-${title}`, title, location: target === 'settings' ? '应用设置' : pageNames[target], open: () => { navigate(target); setPageSearch(search.trim()); } });
    return results.slice(0, 9);
  }, [search, snapshot, selectedPlanId]);
  const platform = desktopPlatform();
  const moduleLoadFailed = /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module/iu.test(error);
  if (!snapshot) return <div className="boot-screen" data-desktop-platform={platform || undefined}>{platform && <header className="boot-titlebar" data-tauri-drag-region="deep"><WindowControls /></header>}<Brand /><LoaderCircle className="spin" size={24} /><p>{moduleLoadFailed ? '界面组件加载失败，请重新加载界面后重试。' : error || '正在连接本地应用服务…'}</p>{error && <button className="button primary" onClick={() => moduleLoadFailed ? window.location.reload() : void refresh()}>{moduleLoadFailed ? '重新加载界面' : '重新连接'}</button>}</div>;
  const supportProps = { snapshot, selectedDevice, onSelectDevice: setSelectedDevice, busy: pending.size > 0, onAction: action, onOpenPlan: choosePlan, onCreateTaskPlan: (type: Task['type'], params?: Task['params']) => createPlan(groupFor(type), type, params), searchQuery: pageSearch };
  const history = snapshot.runs.filter((run) => (historyFilter === 'all' || run.status === historyFilter) && `${snapshot.plans.find((item) => item.id === run.planId)?.name || ''} ${run.message}`.includes(historyQuery));
  return <div className={`app-root ${sidebarOpen ? 'nav-open' : ''}`} data-desktop-platform={platform || undefined}>
    {sidebarOpen && <button className="nav-scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}
    <aside className="sidebar"><Brand /><nav aria-label="主导航" className="primary-nav">{navigation.map(({ id, label, icon: Icon }) => <div className="nav-group" key={id}>
      <button className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span>{id === 'agent' && <span className="subtle-tag">预览</span>}</button>
      {((id === 'daily' || id === 'specialized') && page === id) && <div className="sidebar-task-section"><div className="sidebar-section-label"><span>{id === 'daily' ? '我的任务表' : '专项任务表'}</span><button className="icon-button" aria-label="添加任务表" title="添加任务表" onClick={() => createPlan(id === 'daily' ? 'daily' : 'specialized')}><Plus size={16} /></button></div><div className="sidebar-plans">{snapshot.plans.filter((item) => (item.group || 'daily') === (id === 'daily' ? 'daily' : 'specialized')).map((plan) => <div className={`sidebar-plan ${selectedPlan?.id === plan.id && !newGroup && !proposal ? 'selected' : ''}`} key={plan.id}><button className="sidebar-plan-select" aria-label={`配置任务表${plan.name}`} onClick={() => choosePlan(plan)}><FileJson size={16} /><span>{plan.name}</span>{!plan.enabled && <small>停用</small>}</button><button className="icon-button sidebar-plan-copy" title="复制任务表" aria-label={`复制任务表${plan.name}`} onClick={() => void duplicatePlan(plan)}><Copy size={13} /></button></div>)}</div>{newGroup === (id === 'daily' ? 'daily' : 'specialized') && <div className="new-plan-marker"><Plus size={14} />新任务表 · 未保存</div>}{!snapshot.plans.some((item) => (item.group || 'daily') === (id === 'daily' ? 'daily' : 'specialized')) && !newGroup && <p className="sidebar-hint">添加一张任务表开始</p>}</div>}
    </div>)}</nav><div className="sidebar-bottom"><button className={`nav-item ${page === 'devices' ? 'active' : ''}`} aria-current={page === 'devices' ? 'page' : undefined} onClick={() => navigate('devices')}><Monitor size={19} /><span>设备</span><span className={`status-dot ${!device || device.state === 'offline' ? 'offline' : ''}`} /></button><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}><Settings2 size={19} /><span>设置</span>{snapshot.updates.some((item) => item.status === 'available') && <span className="update-dot" />}</button><div className="sidebar-footer"><span>Maa Verge 0.1.0</span></div></div></aside>
    <div className="main-shell"><header className="topbar" data-tauri-drag-region="deep"><div className="workspace-context"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><span className="workspace-name"><FolderOpen size={16} />默认工作空间</span><span className="context-divider" /><div className="device-selector" data-tauri-drag-region="false"><span className={`status-dot ${!device || device.state === 'offline' ? 'offline' : ''}`} /><select aria-label="选择设备" value={selectedDevice} onChange={(event) => setSelectedDevice(event.target.value)}><option value="">未连接设备</option>{snapshot.devices.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.state === 'offline' ? '离线' : item.state === 'running' ? '执行中' : '已连接'}</option>)}</select><ChevronDown size={12} /></div></div><div className="topbar-actions"><span className="environment-badge">{snapshot.mode === 'mock' ? '模拟工作空间' : '本地运行'}</span><div className="global-search" data-tauri-drag-region="false"><Search size={15} /><input ref={searchInput} aria-label="搜索任务与设置" placeholder="搜索任务与设置" value={search} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearch(event.target.value); setSearchOpen(true); }} onKeyDown={(event) => { if (event.key === 'Enter' && searchResults[0]) { searchResults[0].open(); setSearchOpen(false); } }} />{searchOpen && search.trim() && <><button className="search-dismiss" aria-label="关闭搜索结果" onClick={() => setSearchOpen(false)} /><div className="search-results" role="region" aria-label="搜索结果">{searchResults.length ? searchResults.map((item) => <button key={item.key} onClick={() => { item.open(); setSearchOpen(false); }}><Search size={14} /><span>{item.title}<small>{item.location}</small></span><ArrowRight size={14} /></button>) : <p>没有找到匹配项，试试“更新”或任务名称。</p>}</div></>}</div><WindowControls /></div></header>
    <main className="main-content" aria-label={pageNames[page]}><div className="page-transition" key={page}>{error && <div className="error-banner" role="alert"><Wifi size={16} /><span>本地服务连接异常：{error}</span><button className="text-button" onClick={() => void refresh()}>重试</button></div>}
      {page === 'home' && <HomeDashboard snapshot={snapshot} selectedDevice={selectedDevice} stopping={pending.has(`stop-${dockRun?.id}`)} onStopRun={(run) => { void stopRun(run); }} onShowRun={(run) => { setSelectedRunId(run.id); setRunPanel('progress'); }} onNavigate={(next) => { navigate(next); if (next === 'settings') setPageSearch('执行与消耗'); }} onUpdates={() => { navigate('settings'); setPageSearch('更新'); }} />}
      {(page === 'daily' || page === 'specialized') && (editorPlan ? <PlanEditor key={editorKey} plan={editorPlan} devices={snapshot.devices} settings={snapshot.settings} initialGroup={group} focusTaskType={focusTaskType} focusTaskIndex={focusTaskIndex} initialParams={initialParams} unsaved={editorPlan === proposal} searchQuery={pageSearch} running={activeRuns.some((run) => run.planId === (editorPlan === 'new' ? '' : editorPlan.id))} onSave={savePlan} onStart={startPlan} onSaved={(plan) => { if (navigationRevision.current !== editorRevision) return; setSelectedPlanId(plan.id); setNewGroup(null); setProposal(null); setFocusTaskType(undefined); setFocusTaskIndex(undefined); setInitialParams(undefined); if (plan.group !== page) setPage(plan.group); try { localStorage.setItem('maaverge:ui:selected-plan', plan.id); } catch { /* Selection only. */ } }} onClose={() => { navigationRevision.current++; setNewGroup(null); setProposal(null); }} onDelete={(plan) => setDeleting(plan)} /> : <Empty icon={<ListChecks size={30} />} title={group === 'daily' ? '创建第一张日常任务表' : '为专项任务建一张表'} text={group === 'daily' ? '把启动游戏、基建、公招与作战按顺序安排好。' : '为集成战略、生息演算或干员养成分别保存配置。'} action={<button className="button primary" onClick={() => createPlan(group)}><Plus size={16} />新建任务表</button>} />)}
      {page === 'devices' && <DevicesPage {...supportProps} />}{page === 'settings' && <SettingsPage {...supportProps} />}{page === 'copilot' && <CopilotPage {...supportProps} />}{page === 'tools' && <ToolsPage {...supportProps} />}
      {page === 'agent' && <section className="agent-page"><PageHeading title="Agent 助手" text="描述目标，检查计划，再交给任务表执行。" action={<span className="pill"><ShieldCheck size={13} />审阅后执行</span>} /><div className="agent-notice"><Bot size={17} /><span>{snapshot.mode === 'mock' ? '当前使用本地规则生成演示计划，不调用云端模型。' : '云端模型和自主托管尚未接入；可继续使用任务表完成日常。'}</span></div><div className="agent-layout"><div className="chat-panel"><div className="chat-messages" aria-live="polite">{!messages.length && <div className="agent-welcome"><span className="agent-emblem"><Bot size={31} /></span><h2>从一个具体目标开始</h2><p>生成的计划可以回到日常工作台逐项调整。</p><div className="prompt-list">{['制定刷 6 次 1-7 的计划', '安排零消耗的日常任务', '检查我的任务配置'].map((prompt) => <button key={prompt} onClick={() => void sendMessage(prompt)}>{prompt}<ArrowRight size={15} /></button>)}</div></div>}{messages.map((message) => <div className={`chat-message ${message.role}`} key={message.id}><span className="chat-role">{message.role === 'user' ? '你' : 'Agent'}</span><div><p>{message.text}</p>{message.plan && <div className="proposal-card"><div><ListChecks size={18} /><h3>{message.plan.name}</h3></div><ol>{message.plan.tasks.map((task, index) => <li key={index}><span>{index + 1}</span>{taskLabels[task.type] || task.type}<small>{task.type === 'Fight' ? `${String(task.params.stage || '当前关卡')} · ${String(task.params.times || 1)} 次` : taskEnabled(task) ? '已启用' : '已关闭'}</small></li>)}</ol><p className="muted">理智药 0 · 源石 0；请在工作台核对有效参数。</p><button className="button primary" onClick={() => { setProposal(message.plan!); setNewGroup(null); setFocusTaskType(undefined); navigate(message.plan!.group === 'specialized' ? 'specialized' : 'daily'); }}>检查并保存计划<ArrowRight size={14} /></button></div>}</div></div>)}{pending.has('agent') && <p className="thinking"><LoaderCircle className="spin" size={15} />正在整理计划…</p>}</div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(agentQuery); }}><textarea aria-label="给 Agent 的消息" placeholder="例如：今晚刷 6 次 1-7，不使用理智药" value={agentQuery} onChange={(event) => setAgentQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(agentQuery); } }} /><button aria-label="发送消息" className="button primary" disabled={!agentQuery.trim() || pending.has('agent')}><Send size={17} /></button></form></div><aside className="agent-context"><h3>共用同一张任务表</h3><p>Agent 提案会进入工作台草稿。逐项设置、消耗校验和设备控制使用同一套规则。</p><div className="context-fact"><Monitor size={16} /><span>当前设备<strong>{device?.name || '未连接'}</strong></span></div><div className="context-fact"><ShieldCheck size={16} /><span>应用授权上限<strong>药 {snapshot.settings.budgets.medicine} · 石 {snapshot.settings.budgets.originium}</strong></span></div><button className="text-button" onClick={() => { navigate('settings'); setPageSearch('模型'); }}>模型设置<ArrowRight size={14} /></button></aside></div></section>}
      {page === 'history' && <section className="history-page"><PageHeading title="执行记录" text="查看每次运行的结果、设备与失败原因。" action={<button className="button secondary" onClick={() => setRunPanel('logs')}><Terminal size={15} />运行事件</button>} /><div className="history-toolbar"><div className="segmented" role="group" aria-label="筛选执行记录">{[['all', '全部'], ['running', '执行中'], ['completed', '已完成'], ['failed', '失败'], ['stopped', '已停止']].map(([value, label]) => <button className={historyFilter === value ? 'active' : ''} key={value} onClick={() => setHistoryFilter(value)}>{label}</button>)}</div><label className="inline-search"><Search size={15} /><input aria-label="搜索执行记录" placeholder="搜索任务表或结果" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} /></label></div>{history.length ? <div className="table-scroll"><table className="history-table"><thead><tr><th>任务表</th><th>状态</th><th>开始时间</th><th>执行结果</th><th /></tr></thead><tbody>{history.map((run) => <tr className={detailRun?.id === run.id ? 'selected' : ''} key={run.id}><td>{snapshot.plans.find((item) => item.id === run.planId)?.name || '已删除的任务表'}</td><td><span className={`pill ${run.status}`}>{statusNames[run.status]}</span></td><td className="numeric">{time(run.startedAt)}</td><td>{run.message}</td><td><button className="icon-button" aria-label={`查看执行${run.id}`} onClick={() => { setSelectedRunId(run.id); setRunPanel('progress'); }}><ChevronRight size={16} /></button></td></tr>)}</tbody></table></div> : <Empty icon={<History size={30} />} title={snapshot.runs.length ? '没有匹配的执行记录' : '还没有执行记录'} text="从日常任务表开始一次执行，结果会保存在这里。" />}</section>}
    </div></main></div>
    {runPanel && <section className={`execution-drawer ${runPanel === 'preview' ? 'has-preview' : ''}`} aria-label="运行详情"><div className="execution-drawer-heading"><div className="drawer-tabs">{([['progress', '运行详情'], ['logs', '日志'], ['preview', '画面']] as const).map(([value, label]) => <button key={value} className={runPanel === value ? 'active' : ''} onClick={() => setRunPanel(value)}>{label}</button>)}</div><div className="drawer-actions">{runPanel !== 'preview' && snapshot.runs.length > 0 && <select aria-label="查看哪次执行" value={detailRun?.id || ''} onChange={(event) => setSelectedRunId(event.target.value)}>{snapshot.runs.map((run) => <option key={run.id} value={run.id}>{time(run.startedAt)} · {statusNames[run.status]}</option>)}</select>}<button className="icon-button" aria-label="收起运行详情" onClick={() => setRunPanel(null)}><ChevronDown size={18} /></button></div></div><div className="execution-content">
      {runPanel === 'progress' && (detailRun ? <div className="run-detail"><div className="run-detail-title"><span className={`pill ${detailRun.status}`}>{statusNames[detailRun.status]}</span><h3>{snapshot.plans.find((item) => item.id === detailRun.planId)?.name || '任务执行'}</h3>{detailRun.status === 'running' && <button className="button danger" disabled={pending.has(`stop-${detailRun.id}`)} onClick={() => void stopRun(detailRun)}><Square size={13} />停止执行</button>}</div><p>{detailRun.message}</p><div className="run-progress"><i style={{ width: `${detailRun.progress}%` }} /></div><div className="run-metadata"><span>任务进度 {detailRun.progress}%</span><span>开始于 {time(detailRun.startedAt)}</span><span>设备：{snapshot.devices.find((item) => item.id === detailRun.deviceId)?.name || detailRun.deviceId}</span>{detailRun.finishedAt && <span>结束于 {time(detailRun.finishedAt)}</span>}</div><p className="muted run-footnote">{detailRun.status === 'running' ? '运行中编辑和保存的设置用于下一次执行。停止会结束当前队列。' : '执行结果以运行时的参数与证据为准。'}</p></div> : <Empty icon={<Clock3 size={24} />} title="等待第一次执行" text="选择任务表并开始，运行进度会显示在这里。" />)}
      {runPanel === 'logs' && (relevantEvents.length ? <div className="event-log">{relevantEvents.map((event) => <div key={event.id}><time>{time(event.createdAt)}</time><code>{event.type}</code><span>{event.message}</span>{Object.keys(event.data).length > 0 && <details><summary>事件数据</summary><pre>{JSON.stringify(event.data, null, 2)}</pre></details>}</div>)}</div> : <Empty icon={<Terminal size={24} />} title="暂无运行事件" text="连接、保存、执行与更新的事件会显示在这里。" />)}
      {runPanel === 'preview' && <DevicePreview key={device?.id || 'no-device'} device={device} mode={snapshot.mode} />}
    </div></section>}
    <footer className={`run-dock ${dockRun ? 'is-running' : ''}`} aria-label="执行状态栏"><button className="dock-status" onClick={() => setRunPanel(runPanel === 'progress' ? null : 'progress')}>{dockRun ? <LoaderCircle size={17} className="spin" /> : <span className={`status-dot ${!device || device.state === 'offline' ? 'offline' : ''}`} />}<strong>{dockRun ? '执行中' : device && device.state !== 'offline' ? '就绪' : '等待连接'}</strong>{(dockRun || page !== 'home') && <><span className="dock-divider" /><span className="dock-message">{dockRun ? dockRun.message : selectedPlan?.name || pageNames[page]}<small>{dockRun ? `任务进度 ${dockRun.progress}%` : device?.name || '请连接模拟器或设备'}</small></span></>}</button><div className="dock-actions">{dockRun && <button className="button danger dock-stop" disabled={pending.has(`stop-${dockRun.id}`)} onClick={() => void stopRun(dockRun)}><Square size={12} />停止执行</button>}<button aria-label="运行详情" className={runPanel === 'progress' ? 'selected' : ''} onClick={() => setRunPanel(runPanel === 'progress' ? null : 'progress')}><ListChecks size={16} /><span>运行详情</span></button><button aria-label="日志" className={runPanel === 'logs' ? 'selected' : ''} onClick={() => setRunPanel(runPanel === 'logs' ? null : 'logs')}><Terminal size={16} /><span>日志</span></button><button aria-label="画面" className={runPanel === 'preview' ? 'selected' : ''} onClick={() => setRunPanel(runPanel === 'preview' ? null : 'preview')}><Monitor size={16} /><span>画面</span></button><button className="icon-button" aria-label={runPanel ? '收起运行面板' : '展开运行面板'} onClick={() => setRunPanel(runPanel ? null : 'progress')}>{runPanel ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button></div></footer>
    {deleting && <ConfirmDialog title="删除任务表" onClose={() => setDeleting(null)}><p>确定删除“{deleting.name}”？执行记录会保留。</p><div className="modal-actions"><button className="button secondary" onClick={() => setDeleting(null)}>取消</button><button className="button danger" disabled={pending.has('delete-plan')} onClick={async () => { if (await action('delete-plan', () => rpc('plan.delete', { id: deleting.id }), '任务表已删除')) { setDeleting(null); setSelectedPlanId(''); } }}><Trash2 size={15} />删除任务表</button></div></ConfirmDialog>}
    {toast && <div role={toast.error ? 'alert' : 'status'} className={`toast ${toast.error ? 'error' : ''}`}>{toast.error ? <AlertCircle size={17} /> : <Check size={17} />}<span>{toast.text}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setToast(null)}><X size={15} /></button></div>}
  </div>;
}
function Brand() { return <div className="brand" data-tauri-drag-region="deep"><span className="brand-mark" aria-hidden="true"><img src="/logo.png" width="32" height="32" alt="" draggable={false} /></span><span>Maa Verge</span></div>; }
function PageHeading({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="page-heading"><div><h1>{title}</h1><p>{text}</p></div>{action && <div className="heading-actions">{action}</div>}</div>; }
function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) { return <div className="empty-state"><span className="empty-icon">{icon}</span><h2>{title}</h2><p>{text}</p>{action}</div>; }
function ConfirmDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); return () => previous?.focus(); }, []);
  return <div className="modal-backdrop" onClick={onClose}><section ref={ref} className="modal confirm-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key !== 'Tab') return; const nodes = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])]; if (!nodes.length) return; if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); } }}><div className="modal-title"><h2>{title}</h2><button className="icon-button" aria-label="关闭确认" onClick={onClose}><X size={18} /></button></div>{children}</section></div>;
}
