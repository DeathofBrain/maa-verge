import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight, ArrowUpRight, Bell, BookOpen, Check, ChevronRight,
  Cpu, Database, Download, FileJson, FolderOpen, HardDrive,
  Info, LoaderCircle, Plus, RefreshCw, RotateCcw,
  Search, Settings2, SlidersHorizontal, X,
} from 'lucide-react';
import { rpc, taskLabels, type ComponentDownload, type Plan, type Settings, type Snapshot, type Task, type UpdateChannel } from '@maaverge/contracts';
import './support-pages.css';
import { useSettingsDraft } from './settings-draft';
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



const categories = [
  { id: 'general', label: '通用与外观', icon: Settings2, keywords: '主题 浅色 深色 跟随系统 托盘 关闭窗口 语言' },
  { id: 'model', label: '模型与 Agent', icon: Cpu, keywords: '模型 API 接口 提供商 地址 问答 智能 托管' },
  { id: 'notifications', label: '通知与远控', icon: Bell, keywords: '推送 通知 远程 控制 消息' },
  { id: 'services', label: '外部服务', icon: ArrowUpRight, keywords: 'MirrorChyan 社区 作业站 企鹅 数据 汇报' },
  { id: 'updates', label: '更新', icon: RefreshCw, keywords: '更新 应用 核心 MaaCore 游戏资源 资源更新 下载 版本 正式版 预览版 频道 活动 目录 路径 检查 回滚 aria2 断点续传 下载器' },
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
  const checkAll = () => onAction('check-all', async () => {
    const failures: string[] = [];
    for (const channel of ['app', 'core', 'resource'] as const) {
      try { await rpc('updates.check', { channel }); }
      catch (cause) { failures.push(`${channelLabels[channel]}：${cause instanceof Error ? cause.message : String(cause)}`); }
    }
    if (failures.length) throw new Error(`部分更新检查失败：${failures.join('；')}`);
  }, '三个更新通道已独立检查');

  return <div className="sp-page sp-settings-page"><PageHeading title="设置" text="查找应用偏好，管理模型与组件更新。" />
    <div className="sp-settings-search"><Search size={18} /><input className="text-input" type="search" aria-label="搜索设置" placeholder="搜索主题、模型、资源更新…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <span>{matches.length} 个分类匹配</span>}</div>
    {query && selected && <div className="sp-search-result"><Search size={15} /><span>设置 <ChevronRight size={13} /> {selected.label}</span><span className="sp-scope">应用设置</span></div>}
    <div className="sp-settings-layout"><nav className="sp-category-nav" aria-label="设置分类">{matches.map(({ id, label, icon: Icon }) => <button key={id} className={selected?.id === id ? 'is-selected' : ''} aria-current={selected?.id === id ? 'page' : undefined} onClick={() => setCategory(id)}><Icon size={18} />{label}</button>)}</nav><div className="sp-settings-content">{!selected ? <Empty title="没有匹配的设置" text="试试“主题”“模型”或“资源更新”。" icon={<Search size={28} />} /> : <>
      {selected.id === 'general' && <><Section title="通用与外观" description="适用范围：应用"><div className="sp-setting-row"><div><strong>界面主题</strong><p>浅色、深色，或跟随系统外观。</p></div><select className="text-input sp-inline-select" aria-label="界面主题" value={snapshot.settings.theme} disabled={busy} onChange={(event) => void saveSettings({ theme: event.target.value as Settings['theme'] })}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></div><div className="sp-setting-row"><div><strong>关闭窗口时</strong><p>最小化到托盘可继续运行；退出会停止本地执行。</p></div><select className="text-input sp-inline-select" aria-label="关闭窗口时" value={!snapshot.settings.rememberCloseAction ? 'ask' : snapshot.settings.minimizeToTray ? 'tray' : 'exit'} disabled={busy} onChange={(event) => void saveSettings({ rememberCloseAction: event.target.value !== 'ask', ...(event.target.value !== 'ask' ? { minimizeToTray: event.target.value === 'tray' } : {}) })}><option value="ask">每次询问</option><option value="tray">最小化到托盘</option><option value="exit">退出应用</option></select></div><div className="sp-setting-row"><div><strong>界面语言</strong><p>当前产品界面使用简体中文。</p></div><span className="sp-value">简体中文</span></div></Section></>}
      {selected.id === 'model' && <ModelForm settings={snapshot.settings} busy={busy} onSave={(model) => saveSettings({ model }, '模型配置已保存')} />}
      {selected.id === 'notifications' && <Section title="通知与远控"><Notice icon={<Bell size={17} />}>系统推送、第三方通知与远程控制尚未接入。</Notice><p className="sp-help">当前运行进度、失败原因与完成结果保留在底部运行栏和执行记录中。</p></Section>}
      {selected.id === 'services' && <Section title="外部服务"><dl className="sp-description-list"><div><dt>社区作业服务</dt><dd>尚未接入，当前使用本机作业文件</dd></div><div><dt>MirrorChyan 加速</dt><dd>尚未接入</dd></div><div><dt>数据汇报</dt><dd>默认关闭；按任务参数显式配置</dd></div></dl><p className="sp-help">核心与资源更新可使用官方来源，无需配置付费加速服务。</p></Section>}
      {selected.id === 'updates' && <><div className="sp-content-heading"><div><h2>更新</h2><p>应用确认后重启安装；核心与资源空闲生效。</p></div><button className="button secondary" disabled={busy || updating} onClick={() => void checkAll()}><RefreshCw size={15} />检查全部更新</button></div><ComponentDownloadForm settings={snapshot.settings} busy={busy} onSave={saveSettings} />{snapshot.updates.map((channel) => <UpdateSection key={channel.id} channel={channel} settings={snapshot.settings} hasActiveRun={snapshot.runs.some((run) => run.status === 'running')} busy={busy} updatesBlocked={updating} preparing={preparingUpdates.has(channel.id)} onPrepare={onPrepareUpdate} onAction={onAction} onSave={saveSettings} />)}<Notice>下载完成、验证通过与已生效是不同状态。任务执行期间继续使用原版本，失败时保留旧组合。</Notice></>}
      {selected.id === 'data' && <Section title="数据与诊断"><dl className="sp-description-list"><div><dt>数据归属</dt><dd>保存在本机</dd></div><div><dt>任务表</dt><dd>{snapshot.plans.length} 张</dd></div><div><dt>执行记录</dt><dd>{snapshot.runs.length} 条</dd></div><div><dt>当前事件</dt><dd>{snapshot.events.length} 条</dd></div></dl><LogSettings settings={snapshot.settings} busy={busy} onAction={onAction} onSave={saveSettings} /></Section>}
      {selected.id === 'about' && <Section title="关于 Maa Verge"><p className="sp-about-intro">以任务为中心的本地桌面助手。</p><dl className="sp-description-list"><div><dt>应用版本</dt><dd>{snapshot.updates.find((channel) => channel.id === 'app')?.currentVersion || '未知版本'}</dd></div><div><dt>运行模式</dt><dd>本地原生运行时</dd></div><div><dt>开源许可证</dt><dd>AGPL-3.0-only</dd></div><div><dt>界面语言</dt><dd>简体中文</dd></div></dl><Notice>完整原 MAA 兼容仍在推进中。各项能力以实际接入与验证状态为准。</Notice></Section>}
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
  const saved = settings.componentDownload || { engine: 'aria2', aria2Path: '' };
  const [draft, setDraft, reset] = useSettingsDraft<ComponentDownload>('component-download', saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const save = () => onSave({ componentDownload: draft });
  return <Section title="组件下载器" description="MaaCore 与 MaaResource 共用；保存后用于后续下载。"><form className="sp-model-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <label className="sp-field">下载器<select className="text-input" aria-label="组件下载器" value={draft.engine} disabled={busy} onChange={(event) => setDraft((previous) => ({ ...previous, engine: event.target.value as ComponentDownload['engine'] }))}><option value="aria2">aria2（随应用提供，推荐）</option><option value="builtin">内置 HTTP 下载器</option></select></label>
    {draft.engine === 'aria2' && <><p className="sp-help">已随应用提供 aria2，无需另行安装。中断后可重试续传。</p><details open={Boolean(saved.aria2Path)}><summary>高级选项：自定义 aria2c 路径</summary><label className="sp-field">aria2c 路径<input className="text-input" aria-label="aria2c 路径" value={draft.aria2Path} disabled={busy} placeholder="留空使用随应用提供的 aria2c" onChange={(event) => setDraft((previous) => ({ ...previous, aria2Path: event.target.value }))} /></label><p className="sp-help">仅在需要替换下载器时填写可执行文件的绝对路径。</p></details></>}
    <div className="sp-form-actions"><span className="sp-help">{dirty ? '有未保存的修改' : '已保存'}</span><button className="button secondary" type="button" disabled={busy || !dirty} onClick={reset}>放弃修改</button><button className="button primary" type="submit" disabled={busy || !dirty}>保存下载器</button></div>
  </form></Section>;
}

function UpdateSection({ channel, settings, busy, updatesBlocked, preparing, hasActiveRun, onAction, onPrepare, onSave }: { channel: UpdateChannel; settings: Settings; busy: boolean; updatesBlocked: boolean; preparing: boolean; hasActiveRun: boolean; onAction: SupportPageProps['onAction']; onPrepare: SupportPageProps['onPrepareUpdate']; onSave: (patch: Partial<Settings>) => Promise<boolean> }) {
  const [resourceClient, setResourceClient] = useState<ResourceClient>(resourceClientFor(settings.connection?.clientType ?? 'Official'));
  const [confirmInstall, setConfirmInstall] = useState(false);
  const Icon = channel.id === 'app' ? HardDrive : channel.id === 'core' ? Cpu : Database;
  const working = preparing || ['checking', 'downloading'].includes(channel.status);
  const isApp = channel.id === 'app';
  const canInstall = !isApp || channel.appCanInstall === true;
  const staged = ['staged', 'waiting_idle'].includes(channel.status);
  const hasCandidate = channel.latestVersion && channel.latestVersion !== channel.currentVersion && ['available', 'downloading', 'staged', 'waiting_idle', 'failed'].includes(channel.status);
  const status = channel.status === 'idle' ? channel.latestVersion && channel.latestVersion === channel.currentVersion ? '已是最新版本' : channel.checkedAt ? '暂无新版本' : '等待检查' : isApp && channel.status === 'staged' ? '签名已验证，待安装' : updateLabels[channel.status];
  const checkedAt = channel.checkedAt && !Number.isNaN(Date.parse(channel.checkedAt)) ? formatDate(channel.checkedAt) : '尚未检查';
  useEffect(() => { if (!staged || !canInstall) setConfirmInstall(false); }, [staged, canInstall]);
  return <section className="sp-update-channel update-channel"><div className="sp-update-main"><div className="sp-update-title"><Icon size={19} /><h3>{channelLabels[channel.id]}</h3><span className={`pill sp-update-state ${channel.status === 'failed' ? 'is-error' : ''}`}>{status}</span></div><div className="channel-version sp-channel-version">{resourceVersionLabel(channel, resourceClient)}{hasCandidate && <><ArrowRight size={13} /><span>{channel.id === 'resource' ? channel.latestVersion!.slice(0, 10) : channel.latestVersion}</span></>}</div>{channel.id === 'resource' && <p className="sp-help">{resourceVersionDetail(channel, resourceClient)}</p>}<p className="sp-help">{isApp ? '桌面应用与本地服务；下载并校验签名后，确认重启安装。' : channel.id === 'core' ? '来源：官方 MaaCore 发布' : '关卡、活动与公招数据；版本独立于核心'}</p><p className="sp-help sp-update-checked">上次检查：{checkedAt}</p>{channel.message && <p className="sp-channel-message">{channel.message}</p>}{isApp && channel.appCanInstall === false && <p className="sp-help">当前安装方式不支持自动安装，请使用对应平台的安装包或软件包管理器更新。</p>}{isApp && channel.appRelease && <details className="sp-release-notes"><summary>发布说明{channel.appRelease.prerelease ? ' · 预览版' : ' · 正式版'}</summary>{!Number.isNaN(Date.parse(channel.appRelease.publishedAt)) && <p className="sp-help">发布于 {formatDate(channel.appRelease.publishedAt)}</p>}<pre>{channel.appRelease.notes || '此版本未提供发布说明。'}</pre></details>}{working && <div className="sp-update-progress" aria-label={`${channelLabels[channel.id]}更新进度`}><span style={{ width: `${Math.max(0, Math.min(100, channel.progress))}%` }} /></div>}{isApp && staged && hasActiveRun && <p className="sp-channel-message">任务正在运行，请等待全部任务结束后安装。</p>}</div><div className="sp-channel-actions">
    {['idle', 'available', 'active', 'failed'].includes(channel.status) && <button className="button secondary" disabled={busy || updatesBlocked} onClick={() => void onAction(`check-${channel.id}`, () => rpc('updates.check', { channel: channel.id }))}><RefreshCw size={14} />检查更新</button>}
    {(channel.status === 'available' || (channel.status === 'failed' && channel.latestVersion && channel.latestVersion !== channel.currentVersion)) && canInstall && <button className="button primary" disabled={busy || preparing} onClick={() => void onPrepare(channel)}><Download size={14} />{channel.status === 'failed' ? '重试下载' : isApp ? '下载更新' : channel.currentVersion ? '准备更新' : '下载安装'}</button>}
    {staged && canInstall && <button className="button primary" disabled={busy || updatesBlocked || channel.status === 'waiting_idle' || (isApp && hasActiveRun)} onClick={() => isApp ? setConfirmInstall(true) : void onAction(`activate-${channel.id}`, () => rpc('updates.activate', { channel: channel.id }), '更新将在安全空闲边界生效')}><Check size={14} />{isApp ? '安装并重启' : channel.status === 'waiting_idle' ? '等待空闲生效' : '应用更新'}</button>}
    {working && <span className="sp-working"><LoaderCircle className="spin" size={15} />{channel.progress}%</span>}
    {channel.id !== 'app' && ['active', 'staged', 'waiting_idle'].includes(channel.status) && <button className="button secondary" disabled={busy || updatesBlocked || hasActiveRun} onClick={() => void onAction(`rollback-${channel.id}`, () => rpc('updates.rollback', { channel: channel.id }), '回滚请求已处理')}><RotateCcw size={14} />回滚上一版本</button>}
  </div>{channel.id === 'resource' && <label className="sp-resource-client sp-field">资源客户端<select className="text-input" aria-label="资源版本客户端" value={resourceClient} onChange={(event) => setResourceClient(event.target.value as ResourceClient)}>{Object.entries(resourceClientLabels).map(([client, label]) => <option key={client} value={client}>{label}</option>)}</select></label>}<div className="sp-update-preference">{channel.id !== 'resource' && <div className="sp-setting-row"><div><strong>{isApp ? '应用更新频道' : 'MaaCore 更新频道'}</strong><p>{staged ? isApp ? '切换频道会取消已准备的版本并重新检查。' : '切换频道会取消已准备的版本，下次检查使用新频道。' : '正式版提供稳定更新；预览版包含最新预览版与正式版。'}</p></div><select className="text-input sp-inline-select" aria-label={isApp ? '应用更新频道' : 'MaaCore 更新频道'} value={isApp ? settings.appUpdateChannel ?? 'preview' : settings.coreUpdateChannel ?? 'stable'} disabled={busy || working} onChange={(event) => void onSave(isApp ? { appUpdateChannel: event.target.value as Settings['appUpdateChannel'] } : { coreUpdateChannel: event.target.value as Settings['coreUpdateChannel'] })}><option value="stable">正式版</option><option value="preview">预览版</option></select></div>}<Toggle label={isApp ? '启动时检查应用更新' : channel.id === 'core' ? '自动检查核心更新' : '独立检查游戏资源'} description={isApp ? '仅检查新版本，下载与重启安装由你确认。' : channel.id === 'core' ? '启动时与每 24 小时检查' : '每 6 小时独立检查资源更新'} checked={isApp ? settings.autoUpdateApp ?? true : channel.id === 'core' ? settings.autoUpdateCore : settings.autoUpdateResource} disabled={busy} onChange={(value) => void onSave(isApp ? { autoUpdateApp: value } : channel.id === 'core' ? { autoUpdateCore: value } : { autoUpdateResource: value })} />{!isApp && <ComponentPathForm channel={channel} settings={settings} busy={busy || updatesBlocked} onSave={onSave} />}</div>{confirmInstall && <AppInstallConfirmation version={channel.latestVersion || '新版本'} busy={busy || updatesBlocked} hasActiveRun={hasActiveRun} onClose={() => setConfirmInstall(false)} onInstall={async () => { if (await onAction('activate-app', () => rpc('updates.activate', { channel: 'app' }))) setConfirmInstall(false); }} />}</section>;
}

function AppInstallConfirmation({ version, busy, hasActiveRun, onClose, onInstall }: { version: string; busy: boolean; hasActiveRun: boolean; onClose: () => void; onInstall: () => Promise<void> }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(<div className="modal-backdrop sp-app-install-modal" onClick={() => { if (!busy) onClose(); }}><section ref={ref} className="modal confirm-dialog" role="dialog" aria-modal="true" aria-label="安装应用更新" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const nodes = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])];
    if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
  }}><div className="modal-title"><h2>安装应用更新</h2><button className="icon-button" aria-label="关闭安装确认" disabled={busy} onClick={onClose}><X size={18} /></button></div><p>版本 {version} 已下载并通过签名验证。请先保存未保存的更改；继续后应用将退出、安装更新并重新启动。</p>{hasActiveRun && <p role="status">任务正在运行，请等待全部任务结束后安装。</p>}<div className="modal-actions"><button className="button secondary" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy || hasActiveRun} onClick={() => void onInstall()}>{busy && <LoaderCircle className="spin" size={15} />}确认安装并重启</button></div></section></div>, document.body);
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

export { default as ToolsPage } from './ToolsPage';
