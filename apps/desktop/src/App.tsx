import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Bot, Check, CheckCheck,
  ChevronDown, ChevronRight, CircleHelp, Clock3, Cpu, Database, Download,
  FolderClock, Gamepad2, Hexagon, LayoutDashboard, ListChecks, LoaderCircle,
  Menu, Monitor, Moon, MoreHorizontal, Plus, RefreshCw,
  RotateCcw, Send, Settings2, ShieldCheck, Sparkles, Square, Terminal,
  Trash2, Wifi, X, Zap, Pencil, CalendarDays, Bell, Play, Search,
} from 'lucide-react';
import { rpc, subscribe, taskLabels, type Snapshot, type Plan } from '@maaverge/contracts';
import PlanEditor from './PlanEditor';

type Page = 'overview' | 'plans' | 'agent' | 'history' | 'settings';
type Channel = 'app' | 'core' | 'resource';
type Device = Snapshot['devices'][number];
type Run = Snapshot['runs'][number];
type Message = { id: string; role: 'user' | 'assistant'; text: string; plan?: Plan };

const navItems = [
  { id: 'overview', label: '任务总览', icon: LayoutDashboard },
  { id: 'plans', label: '任务', icon: ListChecks },
  { id: 'agent', label: 'Agent 助手', icon: Bot },
  { id: 'history', label: '执行记录', icon: FolderClock },
] as const;
const statusLabels: Record<Run['status'], string> = {
  running: '执行中', completed: '已完成', failed: '执行失败', stopped: '已停止',
};
const updateLabels: Record<string, string> = {
  idle: '已是最新版本', checking: '正在检查', available: '发现新版本', downloading: '正在准备',
  staged: '准备就绪', waiting_idle: '等待任务结束', active: '已更新', failed: '更新失败',
};
const channelLabels: Record<Channel, string> = { app: 'MAAVerge 应用', core: 'MaaCore 核心', resource: '游戏资源' };
const channelIcons = { app: Hexagon, core: Cpu, resource: Database };
const channelDescriptions: Record<Channel, string> = {
  app: '桌面界面与应用服务', core: '自动化引擎 · 每 24 小时检查', resource: '关卡、活动与公招数据 · 每 6 小时检查',
};
const uid = () => crypto.randomUUID();
const time = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const date = (value: string) => new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
const taskSummary = (plan: Plan) => plan.tasks.map((task) => taskLabels[task.type] || task.type).join(' · ');

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const isBusy = (key: string) => pending.has(key);
  const starting = [...pending].some((key) => key.startsWith('start-'));
  const updating = (id: Channel) => isBusy('check-all') || ['check', 'prepare', 'activate', 'rollback'].some((verb) => isBusy(`${verb}-${id}`));
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [showEvents, setShowEvents] = useState(false);
  const [connectionDiagnostics, setConnectionDiagnostics] = useState<string[]>([]);
  const [deviceAddress, setDeviceAddress] = useState('');
  const [discovered, setDiscovered] = useState<{ address: string; name: string; adbState: string }[]>([]);

  const refresh = useCallback(async () => {
    try {
      const next = await rpc('app.snapshot', {});
      setSnapshot(next);
      setSelectedDevice((previous) => next.devices.some((device) => device.id === previous) ? previous : next.devices[0]?.id || '');
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribe(() => { void refresh(); });
    const interval = window.setInterval(() => { void refresh(); }, 2500);
    return () => { unsubscribe(); window.clearInterval(interval); };
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setEditing(null); setSidebarOpen(false); setShowEvents(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const action = async (key: string, call: () => Promise<unknown>, success?: string) => {
    setPending((previous) => new Set(previous).add(key));
    try { await call(); await refresh(); if (success) setToast({ text: success }); return true; }
    catch (cause) { setToast({ text: cause instanceof Error ? cause.message : String(cause), error: true }); return false; }
    finally { setPending((previous) => { const next = new Set(previous); next.delete(key); return next; }); }
  };

  const navigate = (next: Page) => { setPage(next); setSidebarOpen(false); };
  const startPlan = (plan: Plan) => action(`start-${plan.id}`, () => rpc('run.start', {
    planId: plan.id, deviceId: selectedDevice, requestId: uid(),
  }), '计划已开始执行');
  const stopRun = (run: Run) => action(`stop-${run.id}`, () => rpc('run.stop', { id: run.id }), '已停止执行，计划已保留');
  const checkUpdates = () => action('check-all', async () => {
    for (const channel of ['app', 'core', 'resource'] as const) await rpc('updates.check', { channel });
  }, '三个更新通道已独立检查');
  const discoverDevices = () => action('discover-devices', async () => {
    const devices = await rpc<{ address: string; name: string; adbState: string }[]>('device.discover', {});
    setDiscovered(devices);
    if (!devices.length) setToast({ text: '未发现已连接的 ADB 设备，可手动填写地址' });
  });
  const connectDevice = (address: string) => action('connect-device', async () => {
    const connected = await rpc<Device>('device.connect', { address: address.trim() });
    setSelectedDevice(connected.id);
    setDeviceAddress('');
  }, '设备连接请求已完成，请检查设备状态');

  const autoConnect = () => action('auto-connect', async () => {
    const result = await rpc('device.auto_connect', {});
    setConnectionDiagnostics(result.diagnostics);
    setDiscovered(result.discovered);
    if (result.devices[0]) setSelectedDevice(result.devices[0].id);
  });

  const sendMessage = async (text: string) => {
    if (!text.trim() || isBusy('agent')) return;
    setQuery('');
    setMessages((previous) => [...previous, { id: uid(), role: 'user', text: text.trim() }]);
    setPending((previous) => new Set(previous).add('agent'));
    try {
      const response = await rpc('agent.message', { message: text.trim(), deviceId: selectedDevice || undefined });
      setMessages((previous) => [...previous, { id: uid(), role: 'assistant', text: response.reply, plan: response.plan }]);
      await refresh();
    } catch (cause) {
      setMessages((previous) => [...previous, { id: uid(), role: 'assistant', text: `暂时无法完成请求：${cause instanceof Error ? cause.message : String(cause)}` }]);
    } finally { setPending((previous) => { const next = new Set(previous); next.delete('agent'); return next; }); }
  };

  const device = snapshot?.devices.find((item) => item.id === selectedDevice);
  const activeRuns = snapshot?.runs.filter((run) => run.status === 'running') || [];
  const currentRun = activeRuns.find((run) => run.deviceId === selectedDevice);
  const completed = snapshot?.runs.filter((run) => run.status === 'completed') || [];
  const pageLabel = [...navItems, { id: 'settings', label: '设置与更新' }].find((item) => item.id === page)?.label;

  if (!snapshot) return <div className="boot-screen"><Brand /><LoaderCircle className="spin" size={24} /><p>{error || '正在连接本地应用服务…'}</p>{error && <button className="button primary" onClick={() => void refresh()}>重新连接</button>}</div>;

  return <div className={`app-root ${sidebarOpen ? 'nav-open' : ''}`}>
    {sidebarOpen && <div className="nav-scrim" onClick={() => setSidebarOpen(false)} />}
    <aside className="sidebar">
      <Brand />
      <div className="workspace-label">个人工作空间 <span>LOCAL</span></div>
      <nav aria-label="主导航">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} aria-label={label} aria-current={page === id ? 'page' : undefined} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)}>
          <Icon size={19} /><span>{label}</span>{id === 'agent' && <span className="nav-ai">AI</span>}{page === id && <span className="nav-active-dot" />}
        </button>)}
      </nav>
      <div className="sidebar-task-section"><div className="section-overline sidebar-overline">任务表 <button className="icon-button" aria-label="添加任务表" onClick={() => { navigate('plans'); setEditing('new'); }}><Plus size={15} /></button></div><div className="sidebar-plans">{snapshot.plans.map((plan) => <button key={plan.id} aria-label={`配置任务表${plan.name}`} onClick={() => { navigate('plans'); setEditing(plan); }}><ListChecks size={14} /><span>{plan.name}<small>{plan.tasks.filter((task) => task.enabled !== false).length} 条任务</small></span>{!plan.enabled && <span className="sidebar-disabled">停用</span>}</button>)}</div></div>
      <div className="sidebar-divider" />
      <div className="section-overline sidebar-overline">已连接设备 <span>{snapshot.devices.filter((item) => item.state !== 'offline').length}</span></div>
      <div className="sidebar-devices">{snapshot.devices.map((item) => <button key={item.id} className={`sidebar-device ${item.id === selectedDevice ? 'selected' : ''}`} onClick={() => setSelectedDevice(item.id)}>
        <Monitor size={16} /><span>{item.name}<small>{item.state === 'running' ? '任务执行中' : item.state === 'offline' ? '设备离线' : '等待任务'}</small></span><i className={`status-dot ${item.state === 'offline' ? 'offline' : ''}`} />
      </button>)}</div>
      <div className="sidebar-bottom">
        <div className="local-card"><div className="local-icon"><ShieldCheck size={17} /></div><div>你的数据，留在本地<small>本地运行 · 自主掌控</small></div><span className="local-spark">✦</span></div>
        <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={19} /><span>设置与更新</span>{snapshot.updates.some((item) => item.status === 'available') && <i className="update-dot" />}</button>
        <div className="sidebar-footer"><span className="avatar">M</span><span>本地用户<small>MAAVerge v0.1.0</small></span><button title="查看运行事件" aria-label="查看运行事件" className="icon-button" onClick={() => setShowEvents(true)}><MoreHorizontal size={18} /></button></div>
      </div>
    </aside>

    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><span>工作台</span><ChevronRight size={13} /><strong>{pageLabel}</strong></div>
        <div className="topbar-actions"><span className="environment-badge"><span className="status-dot" />{snapshot.mode === 'mock' ? '模拟工作空间' : '本地运行时'}</span><span className="topbar-divider" /><button title="查看运行事件" aria-label="查看运行事件" className="icon-button notification-button" onClick={() => setShowEvents(true)}><Bell size={18} /><i /></button><span className="avatar small">M</span></div>
      </header>

      <main className="main-content">
        {error && <div role="alert" className="error-banner"><Wifi size={17} />连接异常：{error}<button onClick={() => void refresh()}>重试</button></div>}
        {page === 'overview' && <>{connectionDiagnostics.length > 0 && <div className="connection-diagnostics" role="status">{connectionDiagnostics.map((message, i) => <p key={i}>{message}</p>)}</div>}
          <div className="page-heading"><div><div className="eyebrow">LOCAL WORKSPACE</div><h1>工作空间<span className="heading-dot">.</span></h1><p>管理任务、连接设备，查看每一次执行。</p></div><div className="heading-actions"><span className="date-tag"><CalendarDays size={15} />{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span><button className="button secondary" onClick={() => void refresh()}><RefreshCw size={15} />刷新状态</button></div></div>

          <section className="workspace-command"><div><span className="command-icon"><ListChecks size={24} /></span><div><h2>{currentRun ? currentRun.message : '从任务表开始'}</h2><p>{currentRun ? '可在设备面板查看进度或停止执行。' : '配置任务顺序和参数，确认设备后执行。'}</p></div></div><div className="command-actions"><button className="button secondary" disabled={isBusy('auto-connect')} onClick={() => void autoConnect()}><Wifi size={15} />{isBusy('auto-connect') ? '正在连接…' : '自动连接'}</button><button className="button primary" disabled={!snapshot.plans.length || !!currentRun || !device || device.state === 'offline' || starting} onClick={() => void startPlan(snapshot.plans[0])}><Play size={15} fill="currentColor" />开始日常任务</button></div></section>

          <section className="stats-grid" aria-label="工作空间统计">
            <Stat icon={<Monitor />} label="在线设备" value={snapshot.devices.filter((item) => item.state !== 'offline').length} suffix="台" detail="设备连接正常" color="mint" />
            <Stat icon={<ListChecks />} label="可用计划" value={snapshot.plans.filter((item) => item.enabled).length} suffix="项" detail="随时准备执行" color="blue" />
            <Stat icon={<CheckCheck />} label="已完成任务" value={completed.length} suffix="次" detail="本地记录，实时同步" color="orange" />
            <Stat icon={<Activity />} label="正在执行" value={activeRuns.length} suffix="项" detail={activeRuns.length ? '交给我，安心等待' : '一切就绪，等待指令'} color="purple" />
          </section>

          <div className="dashboard-columns"><section className="panel device-panel"><PanelTitle icon={<Monitor size={17} />} title="设备与运行" action={<DeviceSelect devices={snapshot.devices} value={selectedDevice} onChange={setSelectedDevice} />} />
            <div className="device-status-surface"><Monitor size={34} strokeWidth={1.4} /><div><strong>{device?.name || '尚未连接设备'}</strong><span className="mono">{device?.address || '启动模拟器后使用自动连接'}</span><small><i className={`status-dot ${!device || device.state === 'offline' ? 'offline' : ''}`} />{!device ? '等待连接' : device.state === 'offline' ? '设备离线' : currentRun ? '正在执行任务' : '设备空闲'}{snapshot.mode === 'mock' ? ' · 模拟设备' : ''}</small></div><button className="text-button" disabled={isBusy('auto-connect')} onClick={() => void autoConnect()}>自动连接<RefreshCw size={14} /></button></div>
            <div className="device-info"><div><span className="muted">核心版本</span><span className="mono">{device?.coreVersion || snapshot.updates.find((item) => item.id === 'core')?.currentVersion || '未安装'}</span></div><div><span className="muted">资源版本</span><span className="mono">{device?.resourceVersion || snapshot.updates.find((item) => item.id === 'resource')?.currentVersion || '未安装'}</span></div></div>
            {currentRun ? <div className="current-run"><div className="current-run-heading"><span><LoaderCircle size={15} className="spin" />{snapshot.plans.find((item) => item.id === currentRun.planId)?.name || '任务执行中'}</span><button className="stop-button" onClick={() => void stopRun(currentRun)}><Square size={11} fill="currentColor" />停止</button></div><div className="progress-track"><i style={{ width: `${currentRun.progress}%` }} /></div><div className="progress-caption"><span>{currentRun.message}</span><span>{currentRun.progress}%</span></div></div> : <div className="device-ready"><div><span className="ready-icon"><Check size={16} /></span><span>{!device ? '等待设备连接' : device.state === 'offline' ? '设备已离线' : '设备已就绪'}<small>{!device ? '请先配置 ADB 设备' : snapshot.mode === 'mock' ? '可以安全体验完整模拟流程' : '选择一个计划，开始执行'}</small></span></div><button className="text-button" onClick={() => navigate('plans')}>选择计划<ArrowRight size={14} /></button></div>}
          </section>

          <section className="panel plan-panel"><PanelTitle icon={<ListChecks size={17} />} title="我的任务表" action={<button className="text-button muted" onClick={() => navigate('plans')}>全部任务表<ArrowRight size={14} /></button>} /><div className="plan-list">{snapshot.plans.length ? snapshot.plans.slice(0, 3).map((plan, index) => <PlanRow key={plan.id} plan={plan} index={index} running={activeRuns.some((run) => run.planId === plan.id)} onRun={() => void startPlan(plan)} onEdit={() => setEditing(plan)} disabled={!device || device.state !== 'idle' || starting} />) : <Empty icon={<ListChecks size={28} />} title="从第一个计划开始" text="把日常任务组合成你的工作流。" action={<button className="button primary" onClick={() => setEditing('new')}><Plus size={15} />创建任务表</button>} />}</div><button className="add-plan-button" onClick={() => setEditing('new')}><Plus size={16} />创建新任务表</button><div className="plan-hint"><Clock3 size={15} /><span>任务在本机执行，关闭到托盘后仍可继续。</span></div></section></div>

          <div className="dashboard-bottom"><section className="panel activity-panel"><PanelTitle icon={<Activity size={17} />} title="最近动态" action={<button className="text-button muted" onClick={() => navigate('history')}>查看记录<ArrowRight size={14} /></button>} /><div className="timeline">{snapshot.events.length ? snapshot.events.slice(-3).reverse().map((event) => <div className="timeline-item" key={event.id}><span className="timeline-dot"><Check size={10} /></span><div><span>{event.message}</span><small>{event.type}</small></div><time>{time(event.createdAt)}</time></div>) : <div className="quiet-state"><span className="quiet-orbit"><Activity size={19} /></span><div>暂无执行动态<small>执行任务后，进展会出现在这里。</small></div></div>}</div></section><section className="agent-teaser"><div className="teaser-icon"><Sparkles size={21} /></div><span className="section-overline">任务规划</span><h3>描述目标，检查计划。</h3><p>“帮我收菜、换班，再刷 6 次 1-7。”<br />把想法变成可检查、可执行的计划。</p><button className="text-button" onClick={() => navigate('agent')}>和 Agent 聊聊<ArrowUpRight size={16} /></button><div className="teaser-orbit" /></section></div>
          <footer className="content-footer"><span><span className="status-dot" />本地工作空间运行正常</span><span>MAAVerge <span className="footer-slash">/</span> LOCAL WORKSPACE</span></footer>
        </>}

        {page === 'plans' && <><PageHeading eyebrow="MAKE IT A ROUTINE" title="任务表" text="把重复的日常，编排成顺手的工作流。" action={<button className="button primary" onClick={() => setEditing('new')}><Plus size={16} />创建任务表</button>} /><div className="page-toolbar"><span><ListChecks size={16} />全部任务表 <b>{snapshot.plans.length}</b></span><DeviceSelect devices={snapshot.devices} value={selectedDevice} onChange={setSelectedDevice} /></div><div className="plan-cards">{snapshot.plans.map((plan, index) => <article key={plan.id} className="panel plan-card"><div className="plan-card-top"><span className={`task-icon color-${index % 3}`}><ListChecks size={23} /></span><span className={`pill ${plan.enabled ? 'mint' : ''}`}>{plan.enabled ? '已启用' : '未启用'}</span><button className="icon-button" title="编辑任务表" aria-label={`编辑${plan.name}`} onClick={() => setEditing(plan)}><Pencil size={16} /></button></div><h3>{plan.name}</h3><p>{taskSummary(plan)}</p><div className="task-chip-list">{plan.tasks.map((task, i) => <span className={task.enabled === false ? 'disabled-chip' : ''} key={i}>{taskLabels[task.type] || task.type}{task.type === 'Fight' && typeof task.params.stage === 'string' ? ` ${task.params.stage}` : ''}</span>)}</div><div className="plan-card-schedule"><Clock3 size={14} />{plan.schedule || '手动执行'}<span>消耗预算由策略校验</span></div><div className="plan-card-actions"><button className="icon-button danger-hover" title="删除任务表" aria-label={`删除${plan.name}`} onClick={() => void action(`delete-${plan.id}`, () => rpc('plan.delete', { id: plan.id }), '计划已删除')}><Trash2 size={16} /></button><button className="button secondary" onClick={() => setEditing(plan)}><Pencil size={14} />编辑</button><button className="button primary" disabled={!plan.enabled || !device || device.state !== 'idle' || starting} onClick={() => void startPlan(plan)}><Play size={13} fill="currentColor" />开始执行</button></div></article>)}<button className="new-plan-card" onClick={() => setEditing('new')}><span><Plus size={23} /></span><strong>创建一个新任务表</strong><small>让下一次日常更轻松</small></button></div><div className="info-note"><ShieldCheck size={18} /><div>每个设备同时只执行一个计划。<span>停止会清空核心当前队列，未执行计划会保留；重新执行时将重新校验设备状态。</span></div></div></>}

        {page === 'agent' && <><PageHeading eyebrow="PLAN WITH ASSISTANCE" title="Agent 助手" text="说说你的目标，把下一步交给助手规划。" action={<span className="pill mint"><ShieldCheck size={13} />确认后执行</span>} /><div className="agent-layout"><section className="panel chat-panel"><div className="chat-toolbar"><span><span className="agent-mini-icon"><Sparkles size={15} /></span>MAAVerge Agent<span className="pill">{snapshot.mode === 'mock' ? '本地模拟' : '模型未配置'}</span></span><button className="icon-button" title="清空对话" aria-label="清空对话" onClick={() => setMessages([])}><RotateCcw size={16} /></button></div><div className="chat-body">{messages.length === 0 ? <div className="agent-welcome"><div className="agent-orb"><Sparkles size={38} strokeWidth={1.4} /></div><div className="eyebrow">PLAN BEFORE YOU RUN</div><h2>今天需要安排什么任务？</h2><p>我可以帮你编排任务、解释执行情况，<br />或者一起制定下一步计划。</p><div className="prompt-cards">{['帮我安排一次日常收菜', '制定刷 6 次 1-7 的计划', '制定零消耗的日常计划'].map((prompt, index) => <button key={prompt} onClick={() => void sendMessage(prompt)}>{index === 0 ? <ListChecks size={18} /> : index === 1 ? <Gamepad2 size={18} /> : <RefreshCw size={18} />}<span>{prompt}</span><ArrowUpRight size={14} /></button>)}</div></div> : messages.map((message) => <div key={message.id} className={`chat-message ${message.role}`}><span className={`message-avatar ${message.role === 'assistant' ? 'bot' : ''}`}>{message.role === 'assistant' ? <Sparkles size={17} /> : 'D'}</span><div className="message-content"><div className="message-name">{message.role === 'assistant' ? 'MAAVerge Agent' : '你'}</div><div className="message-text">{message.text}</div>{message.plan && <div className="agent-plan"><div><ListChecks size={17} /><strong>{message.plan.name}</strong><span className="pill">待确认</span></div><ol>{message.plan.tasks.map((task, index) => <li key={index}><span>{String(index + 1).padStart(2, '0')}</span>{taskLabels[task.type] || task.type}{task.type === 'Fight' && typeof task.params.stage === 'string' && <small>{task.params.stage}</small>}</li>)}</ol><button className="button primary" onClick={() => setEditing(message.plan!)}><Pencil size={14} />检查并保存计划<ArrowRight size={14} /></button><small>保存后可在「任务表」中手动执行。</small></div>}</div></div>)}{isBusy('agent') && <div className="thinking"><LoaderCircle size={16} className="spin" />正在整理你的安排…</div>}</div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(query); }}><textarea value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：帮我收菜换班，再刷 6 次 1-7，不使用理智药" aria-label="发送给 Agent 的消息" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(query); } }} /><div><span><ShieldCheck size={13} />{snapshot.mode === 'mock' ? '模拟模式 · 不调用付费模型，不操作游戏' : '计划经过策略校验后执行'}</span><button className="send-button" type="submit" disabled={!query.trim() || isBusy('agent')} aria-label="发送消息"><Send size={17} /></button></div></form></section><aside className="agent-context"><div className="panel context-card"><span className="section-overline">执行上下文</span><h3><Monitor size={16} />当前设备</h3><DeviceSelect devices={snapshot.devices} value={selectedDevice} onChange={setSelectedDevice} /><div className="context-divider" /><h3><ShieldCheck size={16} />默认消耗预算</h3><div className="budget-row"><span>源石回复理智</span><strong>0 <small>颗</small></strong></div><div className="budget-row"><span>理智药</span><strong>0 <small>份</small></strong></div><div className="budget-row"><span>加急许可</span><strong>0 <small>张</small></strong></div><p>模型提出建议，确定性策略负责校验。你的授权边界始终有效。</p></div><div className="agent-capabilities"><CircleHelp size={18} /><h4>从一句话到一个计划</h4><p>描述目标 → 生成计划 → 检查参数 → 保存并执行</p><small>{snapshot.mode === 'mock' ? '当前为确定性模拟助手。云模型、自主托管与视觉操作尚未接入。' : '云模型、自主托管与视觉操作将逐步开放。'}</small></div></aside></div></>}

        {page === 'history' && <><PageHeading eyebrow="EVERY OPERATION, REMEMBERED" title="执行记录" text="每一次行动，都有迹可循。" action={<button className="button secondary" onClick={() => setShowEvents(true)}><Terminal size={15} />运行事件</button>} /><div className="history-stats"><div><span>累计执行</span><strong>{snapshot.runs.length}<small>次</small></strong></div><div><span>成功完成</span><strong className="text-mint">{completed.length}<small>次</small></strong></div><div><span>正在执行</span><strong>{activeRuns.length}<small>次</small></strong></div></div><section className="panel"><div className="history-toolbar"><div className="filter-tabs">{[['all', '全部'], ['running', '执行中'], ['completed', '已完成'], ['failed', '异常'], ['stopped', '已停止']].map(([value, label]) => <button key={value} className={historyFilter === value ? 'active' : ''} onClick={() => setHistoryFilter(value)}>{label}</button>)}</div><span className="muted">本地执行记录</span></div><div className="table-scroll"><table><thead><tr><th>任务 / 计划</th><th>设备</th><th>状态</th><th>开始时间</th><th>进度与结果</th><th>操作</th></tr></thead><tbody>{snapshot.runs.filter((run) => historyFilter === 'all' || run.status === historyFilter).slice().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).map((run) => <tr key={run.id}><td><span className="table-title">{snapshot.plans.find((plan) => plan.id === run.planId)?.name || run.planId}</span><small className="mono">{run.id.slice(0, 8)}</small></td><td>{snapshot.devices.find((item) => item.id === run.deviceId)?.name || run.deviceId}</td><td><span className={`pill ${run.status === 'completed' ? 'mint' : run.status === 'failed' ? 'red' : run.status === 'running' ? 'orange' : ''}`}>{run.status === 'running' && <LoaderCircle size={12} className="spin" />}{statusLabels[run.status]}</span></td><td><span>{date(run.startedAt)}</span><small>{time(run.startedAt)}</small></td><td className="result-cell"><span>{run.message}</span>{run.status === 'running' && <div className="progress-track small"><i style={{ width: `${run.progress}%` }} /></div>}</td><td>{run.status === 'running' ? <button className="text-button danger" onClick={() => void stopRun(run)}>停止</button> : <span className="muted">—</span>}</td></tr>)}</tbody></table></div>{!snapshot.runs.some((run) => historyFilter === 'all' || run.status === historyFilter) && <Empty icon={<FolderClock size={29} />} title="还没有执行记录" text="开始一个计划，执行结果就会保存在这里。" action={<button className="button secondary" onClick={() => navigate('plans')}>前往任务表<ArrowRight size={14} /></button>} />}</section></>}

        {page === 'settings' && <><PageHeading eyebrow="BUILT AROUND YOU" title="设置与更新" text="你的工作空间，按你的方式运行。" action={<button className="button secondary" disabled={isBusy('check-all')} onClick={() => void checkUpdates()}><RefreshCw size={15} className={isBusy('check-all') ? 'spin' : ''} />检查全部更新</button>} /><section className="panel update-panel"><PanelTitle icon={<ArrowDownToLine size={18} />} title="更新中心" action={<span className="pill mint">三个独立通道</span>} /><p className="panel-description">后台准备，空闲生效。更新核心与游戏资源时，无需重启 MAAVerge。</p><div className="update-channels">{snapshot.updates.map((update) => { const Icon = channelIcons[update.id]; return <div key={update.id} className="update-channel"><span className={`channel-icon ${update.id}`}><Icon size={23} /></span><div className="channel-main"><div><h3>{channelLabels[update.id]}</h3><span className={`pill ${['available', 'staged'].includes(update.status) ? 'orange' : update.status === 'failed' ? 'red' : ''}`}>{update.status === 'idle' ? update.id === 'app' ? '开发预览' : update.latestVersion === update.currentVersion ? '已是最新版本' : '等待检查' : updateLabels[update.status]}</span></div><p>{channelDescriptions[update.id]}</p><div className="channel-version"><span className="mono">{update.currentVersion || '尚未安装'}</span>{update.latestVersion && update.latestVersion !== update.currentVersion && <><ArrowRight size={12} /><span className="mono text-mint">{update.latestVersion}</span></>}</div>{['downloading', 'checking'].includes(update.status) && <div className="progress-track small"><i style={{ width: `${update.progress}%` }} /></div>}<small className="channel-message">{update.message}</small></div><div className="channel-actions">{['idle', 'active', 'failed'].includes(update.status) && <button className="button secondary" disabled={updating(update.id)} onClick={() => void action(`check-${update.id}`, () => rpc('updates.check', { channel: update.id }))}><RefreshCw size={14} />检查更新</button>}{update.status === 'available' && <button className="button primary" disabled={updating(update.id)} onClick={() => void action(`prepare-${update.id}`, () => rpc('updates.prepare', { channel: update.id }), '已开始准备更新')}><Download size={14} />{update.currentVersion && update.currentVersion !== '未安装' ? '准备更新' : '下载安装'}</button>}{['staged', 'waiting_idle'].includes(update.status) && <button className="button primary" disabled={updating(update.id) || update.status === 'waiting_idle'} onClick={() => void action(`activate-${update.id}`, () => rpc('updates.activate', { channel: update.id }), '更新将在设备空闲时生效')}><Check size={14} />{update.status === 'waiting_idle' ? '等待空闲生效' : '应用更新'}</button>}{['checking', 'downloading'].includes(update.status) && <span className="working-label"><LoaderCircle size={14} className="spin" />{update.progress}%</span>}{['active', 'staged', 'waiting_idle'].includes(update.status) && <button className="text-button muted" disabled={updating(update.id)} onClick={() => void action(`rollback-${update.id}`, () => rpc('updates.rollback', { channel: update.id }), '回滚请求已处理')}><RotateCcw size={12} />回滚上一版本</button>}</div></div>; })}</div><div className="update-explainer"><ShieldCheck size={17} /><span>核心与资源分别检查，按版本快照验证后切换；正在运行的任务使用原版本，失败时可回滚。</span></div></section><section className="panel device-settings-panel"><PanelTitle icon={<Monitor size={18} />} title="设备管理" action={<div className="device-discovery-actions"><button className="button primary" disabled={isBusy('auto-connect')} onClick={() => void autoConnect()}><Wifi size={14} />{isBusy('auto-connect') ? '正在连接…' : '自动连接模拟器'}</button>{snapshot.mode === 'native' ? <button className="button secondary" disabled={isBusy('discover-devices')} onClick={() => void discoverDevices()}><Search size={14} className={isBusy('discover-devices') ? 'spin' : ''} />发现设备</button> : <span className="pill">模拟设备</span>}</div>} /><p className="panel-description">{snapshot.mode === 'mock' ? '当前使用虚拟设备，可安全体验计划与更新；真实设备连接在桌面本地运行时中提供。' : '通过 ADB 连接已启动的模拟器或安卓设备。连接设备不会自动执行计划。'}</p><div className="auto-connect-setting"><SettingRow title="自动连接模拟器" description="启动后与运行期间自动发现本地模拟器；连接后等待你执行任务。" disabled={isBusy('settings')} checked={snapshot.settings.autoConnect ?? true} onChange={(value) => void action('settings', () => rpc('settings.save', { settings: { ...snapshot.settings, autoConnect: value } }), '连接偏好已保存')} /></div>{connectionDiagnostics.length > 0 && <div className="connection-diagnostics" role="status"><strong>连接诊断</strong>{connectionDiagnostics.map((message, i) => <p key={i}>{message}</p>)}</div>}<div className="managed-devices">{snapshot.devices.map((item) => <div className="managed-device" key={item.id}><span className="managed-device-icon"><Monitor size={19} /></span><div><strong>{item.name}</strong><small className="mono">{item.address}</small></div><span className={`pill ${item.state === 'idle' ? 'mint' : item.state === 'running' ? 'orange' : ''}`}>{item.state === 'idle' ? '空闲就绪' : item.state === 'running' ? '执行中' : '离线'}</span>{snapshot.mode === 'native' && <button className="icon-button danger-hover" title="移除设备" aria-label={`移除${item.name}`} disabled={isBusy(`disconnect-${item.id}`) || item.state === 'running'} onClick={() => void action(`disconnect-${item.id}`, () => rpc('device.disconnect', { id: item.id }), '设备已移除')}><Trash2 size={15} /></button>}</div>)}</div>{snapshot.mode === 'native' && <><form className="device-connect-form" onSubmit={(event) => { event.preventDefault(); if (deviceAddress.trim()) void connectDevice(deviceAddress); }}><label className="field-label" htmlFor="device-address">手动连接 ADB 地址</label><div><input className="text-input" id="device-address" placeholder="例如：127.0.0.1:5555 或 USB 序列号" value={deviceAddress} onChange={(event) => setDeviceAddress(event.target.value)} /><button className="button primary" disabled={!deviceAddress.trim() || isBusy('connect-device')} type="submit"><Wifi size={14} />连接设备</button></div></form>{discovered.length > 0 && <div className="discovered-devices"><span className="section-overline">发现的 ADB 设备</span>{discovered.map((item) => <div key={item.address}><span><strong>{item.name}</strong><small>{item.address} · {item.adbState}</small></span><button className="button secondary" disabled={isBusy('connect-device')} onClick={() => void connectDevice(item.address)}>连接</button></div>)}</div>}</>}</section><BudgetSettings settings={snapshot.settings} busy={isBusy('settings')} onSave={(budgets) => action('settings', () => rpc('settings.save', { settings: { ...snapshot.settings, budgets } }), '消耗预算已保存')} /><div className="settings-columns"><section className="panel preferences-panel"><PanelTitle icon={<Settings2 size={17} />} title="运行偏好" /><SettingRow title="自动检查核心更新" description="启动时与每 24 小时检查稳定版本" disabled={isBusy('settings')} checked={Boolean(snapshot.settings.autoUpdateCore ?? true)} onChange={(value) => void action('settings', () => rpc('settings.save', { settings: { ...snapshot.settings, autoUpdateCore: value } }), '偏好设置已保存')} /><SettingRow title="独立检查游戏资源" description="每 6 小时检查活动、关卡与公招数据" disabled={isBusy('settings')} checked={Boolean(snapshot.settings.autoUpdateResource ?? true)} onChange={(value) => void action('settings', () => rpc('settings.save', { settings: { ...snapshot.settings, autoUpdateResource: value } }), '偏好设置已保存')} /><SettingRow title="关闭窗口后驻留托盘" description="保持本地调度；完全退出后停止运行" disabled={isBusy('settings')} checked={Boolean(snapshot.settings.minimizeToTray ?? true)} onChange={(value) => void action('settings', () => rpc('settings.save', { settings: { ...snapshot.settings, minimizeToTray: value } }), '偏好设置已保存')} /></section><section className="panel about-panel"><Brand /><p>本地运行的自动化工作空间。</p><div><span>运行模式</span><span className="pill mint">{snapshot.mode === 'mock' ? '确定性 Mock' : '本地运行时'}</span></div><div><span>界面语言</span><span>简体中文</span></div><div><span>开源许可证</span><span className="mono">AGPL-3.0-only</span></div><div><span>数据归属</span><span><ShieldCheck size={13} />保存在本机</span></div><small>{snapshot.mode === 'mock' ? '当前下载、更新和设备均为模拟，不产生真实游戏操作或模型费用。' : '真实设备、云模型与原生组件能力以运行时实际接入情况为准。'}</small></section></div></>}
      </main>
    </div>

    {editing && <PlanEditor plan={editing} onClose={() => setEditing(null)} onSave={async (plan) => { const saved = await action('save-plan', () => rpc('plan.save', { plan }), '任务表已保存'); if (saved) setEditing(null); return saved; }} />}
    {showEvents && <div className="modal-backdrop" onClick={() => setShowEvents(false)}><section className="modal event-modal" role="dialog" aria-modal="true" aria-label="运行事件" onClick={(event) => event.stopPropagation()}><div className="modal-title"><div><div className="eyebrow">LOCAL RUNTIME</div><h2>运行事件</h2></div><button className="icon-button" aria-label="关闭事件" onClick={() => setShowEvents(false)}><X size={21} /></button></div><p className="muted">本机事件流 · {snapshot.events.length} 条记录</p><div className="event-stream">{snapshot.events.length ? snapshot.events.slice().reverse().map((event) => <div key={event.id}><time>{time(event.createdAt)}</time><span><strong>{event.message}</strong><small className="mono">{event.type}</small></span></div>) : <Empty icon={<Terminal size={26} />} title="事件流等待中" text="执行、更新与计划变更会记录在这里。" />}</div></section></div>}
    {toast && <div role={toast.error ? 'alert' : 'status'} className={`toast ${toast.error ? 'error' : ''}`}>{toast.error ? <CircleHelp size={18} /> : <Check size={18} />}<span>{toast.text}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setToast(null)}><X size={15} /></button></div>}
  </div>;
}

function Brand() { return <div className="brand"><span className="brand-mark"><svg width="27" height="29" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m2 27 11-23h6l11 23h-8l-6-13-6 13H2Z" fill="currentColor" /><path d="m12.5 27 3.5-7 3.5 7h-7Z" fill="#efa66c" /></svg></span><span>MAA<span className="brand-light">Verge</span><small>YOUR DAILY COPILOT</small></span></div>; }
function PageHeading({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}<span className="heading-dot">.</span></h1><p>{text}</p></div>{action && <div className="heading-actions">{action}</div>}</div>; }
function PanelTitle({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) { return <div className="panel-title"><h2>{icon}{title}</h2>{action}</div>; }
function Stat({ icon, label, value, suffix, detail, color }: { icon: ReactNode; label: string; value: number; suffix: string; detail: string; color: string }) { return <div className="stat-card"><div className="stat-heading"><span>{label}</span><span className={`stat-icon ${color}`}>{icon}</span></div><div className="stat-value">{String(value).padStart(2, '0')}<span>{suffix}</span></div><div className="stat-detail"><span className={`tiny-line ${color}`} />{detail}</div></div>; }
function DeviceSelect({ devices, value, onChange }: { devices: Device[]; value: string; onChange: (id: string) => void }) { return <div className="select-wrap"><Monitor size={13} /><select aria-label="选择设备" value={value} onChange={(event) => onChange(event.target.value)}>{devices.length ? devices.map((device) => <option value={device.id} key={device.id}>{device.name}{device.state === 'offline' ? '（离线）' : ''}</option>) : <option value="">暂无设备</option>}</select><ChevronDown size={12} /></div>; }
function PlanRow({ plan, index, running, onRun, onEdit, disabled }: { plan: Plan; index: number; running: boolean; onRun: () => void; onEdit: () => void; disabled: boolean }) { return <div className="plan-row"><span className={`task-icon color-${index % 3}`}>{index % 3 === 0 ? <Zap size={20} /> : index % 3 === 1 ? <Gamepad2 size={20} /> : <Moon size={20} />}</span><button className="plan-row-copy" onClick={onEdit}><strong>{plan.name}{running && <span className="running-dot" />}</strong><span>{taskSummary(plan)}</span><small><Clock3 size={11} />{plan.schedule || '手动执行'}<span>·</span>{plan.tasks.length} 个步骤</small></button><button className="play-button" disabled={disabled || !plan.enabled} onClick={onRun} aria-label={`执行${plan.name}`} title={`执行${plan.name}`}>{running ? <LoaderCircle size={15} className="spin" /> : <Play size={14} fill="currentColor" />}</button></div>; }
function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) { return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>; }
function SettingRow({ title, description, checked, disabled, onChange }: { title: string; description: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) { return <div className="setting-row"><span><strong>{title}</strong><small>{description}</small></span><button className={`toggle ${checked ? 'on' : ''}`} disabled={disabled} role="switch" aria-label={title} aria-checked={checked} onClick={() => onChange(!checked)}><i /></button></div>; }


function BudgetSettings({ settings, busy, onSave }: { settings: Snapshot['settings']; busy: boolean; onSave: (budgets: Snapshot['settings']['budgets']) => Promise<boolean> }) {
  const [budgets, setBudgets] = useState(settings.budgets);
  return <section className="panel budget-settings"><PanelTitle icon={<ShieldCheck size={17} />} title="消耗预算" /><p className="panel-description">每次任务表执行的总上限，默认均为 0。任务中填写的消耗不得超过这里的授权。</p><form onSubmit={(event) => { event.preventDefault(); void onSave(budgets); }}><div className="budget-inputs">{([['medicine', '理智药'], ['originium', '源石'], ['expedited', '加急许可']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min="0" max="100" step="1" required aria-label={`${label}预算`} disabled={busy} value={budgets[key]} onChange={(event) => setBudgets((previous) => ({ ...previous, [key]: Number(event.target.value) }))} /></label>)}</div><div className="budget-save"><button className="button secondary" type="submit" disabled={busy}>保存预算</button></div></form></section>;
}
