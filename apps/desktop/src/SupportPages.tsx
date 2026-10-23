import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight, ArrowUpRight, Bell, BookOpen, Check, ChevronRight,
  Cpu, Database, Download, FileJson, FolderOpen, Gamepad2, HardDrive,
  Info, ListChecks, LoaderCircle, Plus, RefreshCw, RotateCcw,
  Search, Settings2, SlidersHorizontal,
} from 'lucide-react';
import { rpc, taskLabels, type ComponentDownload, type Event, type Plan, type Settings, type Snapshot, type Task, type UpdateChannel } from '@maaverge/contracts';
import './support-pages.css';
import { useSettingsDraft } from './settings-draft';
import RecognitionPanel, { type RecognitionClient } from './RecognitionPanel';
import LogSettings from './LogSettings';
import { resourceClientFor, resourceClientLabels, resourceVersionDetail, resourceVersionLabel, type ResourceClient } from './update-display';

export interface SupportPageProps {
  snapshot: Snapshot;
  selectedDevice: string;
  onSelectDevice: (id: string) => void;
  busy: boolean;
  onAction: (key: string, call: () => Promise<unknown>, success?: string) => Promise<boolean>;
  onPrepareUpdate: (channel: UpdateChannel) => Promise<void>;
  preparingUpdates: ReadonlySet<UpdateChannel['id']>;
  onOpenPlan: (plan: Plan, taskType?: Task['type'], taskIndex?: number) => void;
  onCreateTaskPlan: (type: Task['type'], params?: Task['params']) => void;
  searchQuery?: string;
}

const updateLabels: Record<UpdateChannel['status'], string> = {
  idle: '等待检查', checking: '正在检查', available: '发现新版本', downloading: '正在准备',
  staged: '已验证，待生效', waiting_idle: '等待空闲生效', active: '已更新', failed: '更新失败',
};
const channelLabels: Record<UpdateChannel['id'], string> = { app: 'Maa Verge 应用', core: 'MaaCore 核心', resource: '游戏资源' };
const formatDate = (value: string) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const displayValue = (value: unknown, fallback = '使用默认值') => value === undefined || value === null || value === '' ? fallback : Array.isArray(value) ? value.join('、') : String(value);

function PageHeading({ title, text, actions }: { title: string; text: string; actions?: ReactNode }) {
  return <header className="sp-page-heading"><div><h1>{title}</h1><p>{text}</p></div>{actions && <div className="sp-heading-actions">{actions}</div>}</header>;
}

function Section({ title, children, description, className = '' }: { title: string; children: ReactNode; description?: string; className?: string }) {
  return <section className={`sp-section ${className}`}><div className="sp-section-title"><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</section>;
}

function Notice({ children, icon = <Info size={17} /> }: { children: ReactNode; icon?: ReactNode }) {
  return <div className="sp-notice">{icon}<div>{children}</div></div>;
}

function Empty({ title, text, icon = <FolderOpen size={28} />, action }: { title: string; text: string; icon?: ReactNode; action?: ReactNode }) {
  return <div className="sp-empty">{icon}<h3>{title}</h3><p>{text}</p>{action}</div>;
}

function Toggle({ label, description, checked, disabled, onChange }: { label: string; description?: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <div className="sp-setting-row"><div><strong>{label}</strong>{description && <p>{description}</p>}</div><button type="button" className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><i /></button></div>;
}

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const categories = [
  { id: 'general', label: '通用与外观', icon: Settings2, keywords: '主题 浅色 深色 跟随系统 托盘 关闭窗口 语言' },
  { id: 'model', label: '模型与 Agent', icon: Cpu, keywords: '模型 API 接口 提供商 地址 问答 智能 托管' },
  { id: 'notifications', label: '通知与远控', icon: Bell, keywords: '推送 通知 远程 控制 消息' },
  { id: 'services', label: '外部服务', icon: ArrowUpRight, keywords: 'MirrorChyan 社区 作业站 企鹅 数据 汇报' },
  { id: 'updates', label: '更新', icon: RefreshCw, keywords: '更新 核心 MaaCore 游戏资源 资源更新 下载 版本 活动 目录 路径 检查 回滚 aria2 断点续传 下载器' },
  { id: 'data', label: '数据与诊断', icon: HardDrive, keywords: '数据 日志 log 诊断 事件 导出 清理 自动 保留 存储 本地 目录 路径' },
  { id: 'about', label: '关于', icon: Info, keywords: '版本 AGPL 许可证 开源 系统 模式' },
] as const;
type Category = typeof categories[number]['id'];

export function SettingsPage({ snapshot, busy, onAction, onPrepareUpdate, preparingUpdates, searchQuery }: SupportPageProps) {
  const [category, setCategory] = useState<Category>('general');
  const [query, setQuery] = useState(searchQuery || '');
  useEffect(() => { if (searchQuery !== undefined) setQuery(searchQuery); }, [searchQuery]);
  const matches = categories.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = matches.find((item) => item.id === category) || matches[0];
  const saveSettings = (patch: Partial<Settings>, message = '偏好设置已保存') => onAction('settings', () => rpc('settings.save', { settings: { ...snapshot.settings, ...patch } }), message);
  const updating = preparingUpdates.size > 0 || snapshot.updates.some(channel => ['checking', 'downloading'].includes(channel.status));
  const checkAll = () => onAction('check-all', async () => { for (const channel of ['app', 'core', 'resource'] as const) await rpc('updates.check', { channel }); }, '三个更新通道已独立检查');

  return <div className="sp-page sp-settings-page"><PageHeading title="设置" text="查找应用偏好，管理模型与组件更新。" />
    <div className="sp-settings-search"><Search size={18} /><input className="text-input" type="search" aria-label="搜索设置" placeholder="搜索主题、模型、资源更新…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <span>{matches.length} 个分类匹配</span>}</div>
    {query && selected && <div className="sp-search-result"><Search size={15} /><span>设置 <ChevronRight size={13} /> {selected.label}</span><span className="sp-scope">应用设置</span></div>}
    <div className="sp-settings-layout"><nav className="sp-category-nav" aria-label="设置分类">{matches.map(({ id, label, icon: Icon }) => <button key={id} className={selected?.id === id ? 'is-selected' : ''} aria-current={selected?.id === id ? 'page' : undefined} onClick={() => setCategory(id)}><Icon size={18} />{label}</button>)}</nav><div className="sp-settings-content">{!selected ? <Empty title="没有匹配的设置" text="试试“主题”“模型”或“资源更新”。" icon={<Search size={28} />} /> : <>
      {selected.id === 'general' && <><Section title="通用与外观" description="适用范围：应用"><div className="sp-setting-row"><div><strong>界面主题</strong><p>浅色、深色，或跟随系统外观。</p></div><select className="text-input sp-inline-select" aria-label="界面主题" value={snapshot.settings.theme} disabled={busy} onChange={(event) => void saveSettings({ theme: event.target.value as Settings['theme'] })}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></div><Toggle label="关闭窗口后驻留托盘" description="关闭窗口后保留本地运行；完全退出时停止本地执行。" checked={snapshot.settings.minimizeToTray} disabled={busy} onChange={(minimizeToTray) => void saveSettings({ minimizeToTray })} /><div className="sp-setting-row"><div><strong>界面语言</strong><p>当前产品界面使用简体中文。</p></div><span className="sp-value">简体中文</span></div></Section></>}
      {selected.id === 'model' && <ModelForm settings={snapshot.settings} busy={busy} onSave={(model) => saveSettings({ model }, '模型配置已保存')} />}
      {selected.id === 'notifications' && <Section title="通知与远控"><Notice icon={<Bell size={17} />}>系统推送、第三方通知与远程控制尚未接入。</Notice><p className="sp-help">当前运行进度、失败原因与完成结果保留在底部运行栏和执行记录中。</p></Section>}
      {selected.id === 'services' && <Section title="外部服务"><dl className="sp-description-list"><div><dt>社区作业服务</dt><dd>尚未接入，当前使用本机作业文件</dd></div><div><dt>MirrorChyan 加速</dt><dd>尚未接入</dd></div><div><dt>数据汇报</dt><dd>默认关闭；按任务参数显式配置</dd></div></dl><p className="sp-help">核心与资源更新可使用官方来源，无需配置付费加速服务。</p></Section>}
      {selected.id === 'updates' && <><div className="sp-content-heading"><div><h2>更新</h2><p>后台准备，空闲生效；三个通道独立检查。</p></div><button className="button secondary" disabled={busy || updating} onClick={() => void checkAll()}><RefreshCw size={15} />检查全部更新</button></div><ComponentDownloadForm settings={snapshot.settings} busy={busy} onSave={saveSettings} />{snapshot.updates.map((channel) => <UpdateSection key={channel.id} channel={channel} settings={snapshot.settings} hasActiveRun={snapshot.runs.some((run) => run.status === 'running')} busy={busy} updatesBlocked={updating} preparing={preparingUpdates.has(channel.id)} onPrepare={onPrepareUpdate} onAction={onAction} onSave={saveSettings} />)}<Notice>下载完成、验证通过与已生效是不同状态。任务执行期间继续使用原版本，失败时保留旧组合。</Notice></>}
      {selected.id === 'data' && <Section title="数据与诊断"><dl className="sp-description-list"><div><dt>数据归属</dt><dd>保存在本机</dd></div><div><dt>任务表</dt><dd>{snapshot.plans.length} 张</dd></div><div><dt>执行记录</dt><dd>{snapshot.runs.length} 条</dd></div><div><dt>当前事件</dt><dd>{snapshot.events.length} 条</dd></div></dl><LogSettings settings={snapshot.settings} busy={busy} onAction={onAction} onSave={saveSettings} /></Section>}
      {selected.id === 'about' && <Section title="关于 Maa Verge"><p className="sp-about-intro">以任务为中心的本地桌面助手。</p><dl className="sp-description-list"><div><dt>应用版本</dt><dd>0.1.0 开发预览</dd></div><div><dt>运行模式</dt><dd>本地原生运行时</dd></div><div><dt>开源许可证</dt><dd>AGPL-3.0-only</dd></div><div><dt>界面语言</dt><dd>简体中文</dd></div></dl><Notice>完整原 MAA 兼容仍在推进中。各项能力以实际接入与验证状态为准。</Notice></Section>}
    </>}</div></div>
  </div>;
}

// Only unsaved form drafts live in the session; saved settings remain runtime-owned.
function ModelForm({ settings, busy, onSave }: { settings: Settings; busy: boolean; onSave: (model: Settings['model']) => Promise<boolean> }) {
  const [draft, setDraft, resetDraft] = useSettingsDraft('model', settings.model);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.model);
  return <Section title="模型与 Agent" description="保存模型提供商信息；不会在保存时发起模型请求。"><Notice>当前 Agent 提供可审阅的规则提案，真实云模型与自主托管尚未接入。</Notice><form className="sp-model-form" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}><label className="sp-field">模型提供商<input className="text-input" aria-label="模型提供商" placeholder="例如：openai-compatible" value={draft.provider} disabled={busy} onChange={(event) => setDraft((previous) => ({ ...previous, provider: event.target.value }))} /></label><label className="sp-field">API 地址<input className="text-input" type="url" aria-label="模型 API 地址" placeholder="https://example.com/v1" value={draft.baseUrl} disabled={busy} onChange={(event) => setDraft((previous) => ({ ...previous, baseUrl: event.target.value }))} /></label><label className="sp-field">模型名称<input className="text-input" aria-label="模型名称" value={draft.model} disabled={busy} placeholder="填写提供商支持的模型名称" onChange={(event) => setDraft((previous) => ({ ...previous, model: event.target.value }))} /></label><p className="sp-help">密钥管理将在系统钥匙串接入后提供，此处不存放 API 密钥。</p><div className="sp-form-actions"><span className="sp-help">{dirty ? '有未保存的修改' : '已保存'}</span><button className="button secondary" type="button" disabled={busy || !dirty} onClick={resetDraft}>放弃修改</button><button className="button primary" type="submit" disabled={busy}>保存模型配置</button></div></form></Section>;
}

function ComponentPathForm({ channel, settings, busy, onSave }: { channel: UpdateChannel; settings: Settings; busy: boolean; onSave: (patch: Partial<Settings>) => Promise<boolean> }) {
  const key = channel.id === 'core' ? 'core' : 'resource';
  const saved = settings.componentPaths?.[key] || channel.installDirectory || '';
  const [draft, setDraft, reset] = useSettingsDraft(`component-path-${key}`, { path: saved });
  const dirty = draft.path !== saved;
  const save = (value: string) => onSave({ componentPaths: { core: settings.componentPaths?.core || '', resource: settings.componentPaths?.resource || '', [key]: value } });
  return <form className="sp-component-path" onSubmit={(event) => { event.preventDefault(); void save(draft.path); }}>
    <label className="sp-field">下载与安装目录<input className="text-input" aria-label={`${channelLabels[channel.id]}下载目录`} value={draft.path} placeholder="输入完整的绝对路径" required disabled={busy} onChange={(event) => setDraft({ path: event.target.value })} /></label>
    <div className="sp-form-actions"><span className="sp-help">{dirty ? '有未保存的修改' : '用于后续下载与安装'}</span><button className="button secondary" type="button" disabled={busy} onClick={() => void save('')}>恢复默认目录</button>{dirty && <button className="button secondary" type="button" disabled={busy} onClick={reset}>放弃修改</button>}<button className="button primary" type="submit" disabled={busy || !dirty}>保存目录</button></div>
    <p className="sp-help">安装版默认保存在程序同级的 {key === 'core' ? 'MaaCore' : 'MaaResource'} 目录。更改后保留当前安装与回滚版本，新下载使用此目录。</p>
  </form>;
}

function ComponentDownloadForm({ settings, busy, onSave }: { settings: Settings; busy: boolean; onSave: (patch: Partial<Settings>) => Promise<boolean> }) {
  const saved = settings.componentDownload || { engine: 'builtin', aria2Path: '' };
  const [draft, setDraft, reset] = useSettingsDraft<ComponentDownload>('component-download', saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const save = () => onSave({ componentDownload: draft });
  return <Section title="组件下载器" description="MaaCore 与 MaaResource 共用；保存后用于后续下载。"><form className="sp-model-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <label className="sp-field">下载器<select className="text-input" aria-label="组件下载器" value={draft.engine} disabled={busy} onChange={(event) => setDraft((previous) => ({ ...previous, engine: event.target.value as ComponentDownload['engine'] }))}><option value="builtin">内置下载器</option><option value="aria2">aria2（断点续传）</option></select></label>
    {draft.engine === 'aria2' && <><label className="sp-field">aria2c 路径<input className="text-input" aria-label="aria2c 路径" value={draft.aria2Path} disabled={busy} placeholder="留空则从 PATH 查找 aria2c" onChange={(event) => setDraft((previous) => ({ ...previous, aria2Path: event.target.value }))} /></label><p className="sp-help">请先安装 aria2，填写 aria2c 可执行文件路径，或将其加入 PATH。中断后可重试续传。</p></>}
    <div className="sp-form-actions"><span className="sp-help">{dirty ? '有未保存的修改' : '已保存'}</span><button className="button secondary" type="button" disabled={busy || !dirty} onClick={reset}>放弃修改</button><button className="button primary" type="submit" disabled={busy || !dirty}>保存下载器</button></div>
  </form></Section>;
}

function UpdateSection({ channel, settings, busy, updatesBlocked, preparing, hasActiveRun, onAction, onPrepare, onSave }: { channel: UpdateChannel; settings: Settings; busy: boolean; updatesBlocked: boolean; preparing: boolean; hasActiveRun: boolean; onAction: SupportPageProps['onAction']; onPrepare: SupportPageProps['onPrepareUpdate']; onSave: (patch: Partial<Settings>) => Promise<boolean> }) {
  const [resourceClient, setResourceClient] = useState<ResourceClient>(resourceClientFor(settings.connection?.clientType ?? 'Official'));
  const Icon = channel.id === 'app' ? HardDrive : channel.id === 'core' ? Cpu : Database;
  const working = preparing || ['checking', 'downloading'].includes(channel.status);
  const status = channel.status === 'idle' ? channel.id === 'app' ? '开发预览' : channel.latestVersion === channel.currentVersion ? '已是最新版本' : '等待检查' : updateLabels[channel.status];
  return <section className="sp-update-channel update-channel"><div className="sp-update-main"><div className="sp-update-title"><Icon size={19} /><h3>{channelLabels[channel.id]}</h3><span className={`pill sp-update-state ${channel.status === 'failed' ? 'is-error' : ''}`}>{status}</span></div><div className="channel-version sp-channel-version">{resourceVersionLabel(channel, resourceClient)}{channel.latestVersion && channel.latestVersion !== channel.currentVersion && <><ArrowRight size={13} /><span>{channel.id === 'resource' ? channel.latestVersion.slice(0, 10) : channel.latestVersion}</span></>}</div><p className="sp-help">{channel.id === 'resource' && resourceVersionDetail(channel, resourceClient)}</p><p className="sp-help">{channel.id === 'app' ? '桌面应用与本地服务' : channel.id === 'core' ? '来源：官方 MaaCore 发布' : '关卡、活动与公招数据；版本独立于核心'}</p>{channel.message && <p className="sp-channel-message">{channel.message}</p>}{working && <div className="sp-update-progress" aria-label={`${channelLabels[channel.id]}更新进度`}><span style={{ width: `${Math.max(0, Math.min(100, channel.progress))}%` }} /></div>}</div><div className="sp-channel-actions">
    {['idle', 'active', 'failed'].includes(channel.status) && <button className="button secondary" disabled={busy || updatesBlocked} onClick={() => void onAction(`check-${channel.id}`, () => rpc('updates.check', { channel: channel.id }))}><RefreshCw size={14} />检查更新</button>}
    {(channel.status === 'available' || (channel.status === 'failed' && channel.latestVersion && channel.latestVersion !== channel.currentVersion)) && channel.id !== 'app' && <button className="button primary" disabled={busy || preparing} onClick={() => void onPrepare(channel)}><Download size={14} />{channel.status === 'failed' ? '重试下载' : channel.currentVersion ? '准备更新' : '下载安装'}</button>}
    {['staged', 'waiting_idle'].includes(channel.status) && <button className="button primary" disabled={busy || updatesBlocked || channel.status === 'waiting_idle'} onClick={() => void onAction(`activate-${channel.id}`, () => rpc('updates.activate', { channel: channel.id }), '更新将在安全空闲边界生效')}><Check size={14} />{channel.status === 'waiting_idle' ? '等待空闲生效' : '应用更新'}</button>}
    {working && <span className="sp-working"><LoaderCircle className="spin" size={15} />{channel.progress}%</span>}
    {channel.id !== 'app' && ['active', 'staged', 'waiting_idle'].includes(channel.status) && <button className="button secondary" disabled={busy || updatesBlocked || hasActiveRun} onClick={() => void onAction(`rollback-${channel.id}`, () => rpc('updates.rollback', { channel: channel.id }), '回滚请求已处理')}><RotateCcw size={14} />回滚上一版本</button>}
  </div>{channel.id === 'resource' && <label className="sp-resource-client sp-field">资源客户端<select className="text-input" aria-label="资源版本客户端" value={resourceClient} onChange={(event) => setResourceClient(event.target.value as ResourceClient)}>{Object.entries(resourceClientLabels).map(([client, label]) => <option key={client} value={client}>{label}</option>)}</select></label>}{channel.id !== 'app' && <div className="sp-update-preference"><Toggle label={channel.id === 'core' ? '自动检查核心更新' : '独立检查游戏资源'} description={channel.id === 'core' ? '启动时与每 24 小时检查' : '每 6 小时独立检查资源更新'} checked={channel.id === 'core' ? settings.autoUpdateCore : settings.autoUpdateResource} disabled={busy} onChange={(value) => void onSave(channel.id === 'core' ? { autoUpdateCore: value } : { autoUpdateResource: value })} /><ComponentPathForm channel={channel} settings={settings} busy={busy || updatesBlocked} onSave={onSave} /></div>}</section>;
}

const copilotTypes: Task['type'][] = ['Copilot', 'SSSCopilot', 'ParadoxCopilot', 'VideoRecognition'];
const copilotTabs: { type: Task['type'] | 'all'; label: string }[] = [{ type: 'all', label: '全部作业' }, { type: 'Copilot', label: '普通作业' }, { type: 'SSSCopilot', label: '保全派驻' }, { type: 'ParadoxCopilot', label: '悖论模拟' }, { type: 'VideoRecognition', label: '视频识别' }];

export function CopilotPage({ snapshot, onOpenPlan, onCreateTaskPlan, searchQuery }: SupportPageProps) {
  const [tab, setTab] = useState<Task['type'] | 'all'>('all');
  const [query, setQuery] = useState(searchQuery || '');
  const [selection, setSelection] = useState('');
  const [newType, setNewType] = useState<Task['type']>('Copilot');
  useEffect(() => { if (searchQuery !== undefined) setQuery(searchQuery); }, [searchQuery]);
  const entries = useMemo(() => snapshot.plans.flatMap((plan) => plan.tasks.flatMap((task, index) => copilotTypes.includes(task.type) ? [{ id: `${plan.id}:${index}`, plan, task, index }] : [])), [snapshot.plans]);
  const visible = entries.filter(({ plan, task }) => (tab === 'all' || task.type === tab) && `${plan.name} ${taskLabels[task.type]} ${displayValue(task.params.filename, '')}`.toLowerCase().includes(query.toLowerCase()));
  const selected = visible.find((entry) => entry.id === selection) || visible[0];

  return <div className="sp-page"><PageHeading title="作业中心" text="集中查看任务表中的本地作业与视频识别配置。" actions={<div className="sp-create-controls"><select className="text-input" aria-label="新建作业类型" value={newType} onChange={(event) => setNewType(event.target.value as Task['type'])}>{copilotTypes.map((type) => <option key={type} value={type}>{taskLabels[type]}</option>)}</select><button className="button primary" onClick={() => onCreateTaskPlan(newType)}><Plus size={16} />新建作业配置</button></div>} />
    <div className="sp-tabs" role="tablist" aria-label="作业类型">{copilotTabs.map(({ type, label }) => <button key={type} role="tab" aria-selected={tab === type} className={tab === type ? 'is-selected' : ''} onClick={() => setTab(type)}>{label}</button>)}</div>
    <div className="sp-library-layout"><section className="sp-library-list"><div className="sp-list-toolbar"><Search size={17} /><input className="text-input" type="search" aria-label="搜索作业" placeholder="搜索名称、文件路径或类型" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{visible.length} 份配置</span></div>{visible.length ? <div className="sp-table-scroll"><table className="sp-table"><thead><tr><th>作业文件</th><th>类型</th><th>所属任务表</th><th>状态</th></tr></thead><tbody>{visible.map((entry) => <tr key={entry.id} className={selected?.id === entry.id ? 'is-selected' : ''}><td><button className="sp-row-link" onClick={() => setSelection(entry.id)} title={displayValue(entry.task.params.filename, '尚未指定文件')}><FileJson size={16} /><span>{displayValue(entry.task.params.filename, Array.isArray(entry.task.params.copilot_list) ? `作业列表 · ${entry.task.params.copilot_list.length} 项` : '尚未指定文件')}</span></button></td><td>{taskLabels[entry.task.type]}</td><td>{entry.plan.name}</td><td><span className="sp-subtle-state">待核心校验</span></td></tr>)}</tbody></table></div> : <Empty icon={<BookOpen size={30} />} title={query ? '没有匹配的作业' : '还没有作业配置'} text={query ? '调整名称、文件路径或类型筛选。' : '选择作业类型，新建配置并填写本机文件路径。'} action={!query && <button className="button secondary" onClick={() => onCreateTaskPlan(tab === 'all' ? 'Copilot' : tab)}><Plus size={15} />添加第一份作业</button>} />}
      <div className="sp-library-footnote"><Info size={15} /><p>社区编号导入、文件解析预览与练度校验尚未接入。本页展示已保存参数，文件是否有效由核心执行时校验。</p></div>
    </section><aside className="sp-inspector" aria-label="作业详情">{selected ? <><div className="sp-inspector-heading"><FileJson size={24} /><h2>{taskLabels[selected.task.type]}</h2><p>{selected.plan.name} · 第 {selected.index + 1} 条任务</p></div><Section title="保存的配置"><dl className="sp-description-list"><div><dt>文件路径</dt><dd className="sp-path">{displayValue(selected.task.params.filename, '未指定；请检查作业列表参数')}</dd></div><div><dt>循环次数</dt><dd>{displayValue(selected.task.params.loop_times, '1')}</dd></div>{selected.task.type === 'Copilot' && <><div><dt>自动编队</dt><dd>{selected.task.params.formation ? '已开启' : '已关闭'}</dd></div><div><dt>编队序号</dt><dd>{displayValue(selected.task.params.formation_index, '默认')}</dd></div></>}<div><dt>任务状态</dt><dd>{selected.task.enabled === false || selected.task.params.enable === false ? '已禁用' : '已启用'}</dd></div></dl></Section><Notice>查看并核对任务参数后，从任务表开始执行。运行中的作业使用启动时配置。</Notice><button className="button primary sp-full-width" onClick={() => onOpenPlan(selected.plan, selected.task.type, selected.index)}><SlidersHorizontal size={16} />编辑作业配置<ArrowRight size={15} /></button>{selected.task.type === 'VideoRecognition' && <p className="sp-help">当前视频任务仍沿用设备执行入口，独立离线识别流程待接入。</p>}</> : <Empty title="选择一份作业" text="详情会显示文件路径、模式与保存参数。" icon={<FileJson size={28} />} />}</aside></div>
  </div>;
}

const tools = [
  { id: 'depot', label: '仓库', icon: Database, type: 'Depot' },
  { id: 'operators', label: '干员', icon: BookOpen, type: 'OperBox' },
  { id: 'recruit', label: '公招计算', icon: Search, type: 'Recruit' },
  { id: 'inventory', label: '库存保持', icon: ListChecks, type: 'Depot' },
  { id: 'data', label: '数据管理', icon: HardDrive, type: null },
  { id: 'games', label: '小游戏', icon: Gamepad2, type: 'Custom' },
] as const;
type ToolId = typeof tools[number]['id'];
function eventPlanId(event: Event): string | undefined {
  const run = event.data.run;
  return typeof event.data.planId === 'string' ? event.data.planId : run && typeof run === 'object' && 'planId' in run && typeof run.planId === 'string' ? run.planId : undefined;
}

export function ToolsPage({ snapshot, selectedDevice, busy, onAction, onOpenPlan, onCreateTaskPlan, searchQuery }: SupportPageProps) {
  const [tool, setTool] = useState<ToolId>('depot');
  const [recognitionClients, setRecognitionClients] = useState<Record<string, RecognitionClient>>({});
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  useEffect(() => {
    if (!searchQuery) return;
    const match = tools.find((item) => item.label.includes(searchQuery) || searchQuery.includes(item.label));
    if (match) setTool(match.id);
  }, [searchQuery]);
  const active = tools.find((item) => item.id === tool)!;
  const planEntries = snapshot.plans.flatMap((plan) => plan.tasks.flatMap((task, index) => active.type && task.type === active.type ? [{ plan, task, index }] : []));
  const planIds = new Set(planEntries.map((entry) => entry.plan.id));
  const keywords = tool === 'depot' || tool === 'inventory' ? ['Depot', '仓库'] : tool === 'operators' ? ['OperBox', '干员识别'] : tool === 'recruit' ? ['Recruit', '公招', '招募'] : tool === 'games' ? ['Custom', '小游戏', 'PixelPaint', 'SecretFront'] : [];
  const events = snapshot.events.filter((event) => tool === 'data' || planIds.has(eventPlanId(event) || '') || keywords.some((keyword) => `${event.message} ${JSON.stringify(event.data)}`.includes(keyword))).slice().reverse();
  const event = events.find((item) => item.id === selectedEvent) || events[0];
  const createTool = () => {
    if (tool === 'recruit') onCreateTaskPlan('Recruit', { times: 0, confirm: [], select: [4], refresh: false, expedite: false });
    else if (tool === 'games') onCreateTaskPlan('Custom', { task_names: ['MiniGame@PixelPaint@Begin'] });
    else if (active.type) onCreateTaskPlan(active.type);
  };
  const createLabel = tool === 'recruit' ? '配置只计算任务' : tool === 'games' ? '配置像素画任务' : tool === 'operators' ? '配置干员识别' : '配置仓库识别';

  return <div className="sp-page"><PageHeading title="工具箱" text="识别、计算与本地数据，每项结果都有来源。" /><div className="sp-tools-layout"><nav className="sp-category-nav" aria-label="工具分类">{tools.map(({ id, label, icon: Icon }) => <button key={id} className={tool === id ? 'is-selected' : ''} aria-current={tool === id ? 'page' : undefined} onClick={() => { setTool(id); setSelectedEvent(null); }}><Icon size={18} />{label}</button>)}</nav><div className="sp-tool-content"><div className="sp-content-heading"><div><h2>{active.label}</h2><p>{tool === 'inventory' ? '目标库存与补货流程' : tool === 'data' ? '当前本地事件与数据导出' : tool === 'depot' ? '识别物品数量，查看与导出本机采集结果' : tool === 'operators' ? '识别已拥有干员及练度，查看与导出采集结果' : '配置任务，执行后查看相关记录'}</p></div>{tool !== 'data' && <button className="button primary" onClick={createTool}><Plus size={16} />{createLabel}</button>}</div>
      {tool === 'inventory' && <Notice>目标库存与自动补货尚未接入。可先在“仓库”中识别并查看本机保存的物品数量。</Notice>}
      {(tool === 'depot' || tool === 'operators') && <RecognitionPanel key={`${tool}:${selectedDevice}`} kind={tool === 'depot' ? 'depot' : 'operators'} snapshot={snapshot} selectedDevice={selectedDevice} busy={busy} onAction={onAction} clientType={recognitionClients[selectedDevice]} onClientChange={(value) => setRecognitionClients((previous) => ({ ...previous, [selectedDevice]: value }))} />}
      {tool === 'recruit' && <Notice>“只计算”任务预设招募次数为 0、关闭确认与刷新。请在执行前核对，实际招募使用日常中的公开招募任务。</Notice>}
      {tool === 'games' && <Notice>目前只开放经审核的资源入口。像素画任务使用已有 Custom 执行路径。</Notice>}
      {tool !== 'data' && <Section title="相关任务配置" description="与日常、专项任务使用同一任务表。">{planEntries.length ? <div className="sp-tool-plans">{planEntries.map(({ plan, task, index }) => <button key={`${plan.id}:${index}`} onClick={() => onOpenPlan(plan, task.type, index)}><FileJson size={17} /><span><strong>{plan.name}</strong><small>第 {index + 1} 条 · {taskLabels[task.type]}{task.type === 'Recruit' ? ` · ${Number(task.params.times ?? 4) === 0 ? '仅计算' : '实际招募'}` : ''}</small></span><ChevronRight size={16} /></button>)}</div> : <div className="sp-inline-empty"><FolderOpen size={21} /><div><strong>还没有相关任务</strong><p>创建配置后，可在任务工作台调整参数并执行。</p></div><button className="button secondary" onClick={createTool}>创建配置</button></div>}</Section>}
      <Section title={tool === 'data' ? '本地事件' : '相关执行事件'} description={tool === 'data' ? `当前快照包含 ${snapshot.events.length} 条事件。` : '当前快照中的执行记录；仓库和干员的采集结果在上方独立展示。'}>{events.length ? <div className="sp-event-layout"><div className="sp-tool-events" aria-label="工具执行事件">{events.map((item) => <button key={item.id} className={event?.id === item.id ? 'is-selected' : ''} onClick={() => setSelectedEvent(item.id)}><time>{formatDate(item.createdAt)}</time><strong>{item.message}</strong><small>{item.type}</small></button>)}</div><div className="sp-event-detail">{event && <><div><h3>{event.message}</h3><time>{formatDate(event.createdAt)}</time></div><pre>{JSON.stringify(event.data, null, 2)}</pre><button className="button secondary" onClick={() => downloadJson(`maaverge-event-${event.id}.json`, event)}><Download size={15} />导出此事件</button></>}</div></div> : <Empty icon={<Database size={28} />} title="尚无相关结果" text="执行工具任务后查看相关事件；任务成功与识别数据完整性仍需分别核对。" />}{events.length > 0 && <div className="sp-form-actions"><button className="button secondary" onClick={() => downloadJson(`maaverge-${tool}-events.json`, events)}><Download size={15} />导出相关事件</button></div>}</Section>
    </div></div></div>;
}
