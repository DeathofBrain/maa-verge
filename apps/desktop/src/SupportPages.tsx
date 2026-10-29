import Select from './Select';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Cpu,
  Database,
  Download,
  FolderOpen,
  HardDrive,
  Info,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import {
  errorMessage,
  rpc,
  type DownloadProxySettings,
  type Plan,
  type Settings,
  type Snapshot,
  type Task,
  type UpdateChannel,
} from '@maaverge/contracts';
import './support-pages.css';
import { useSettingsDraft } from './settings-draft';
import LogSettings from './LogSettings';
import CopilotStorageSettings from './CopilotStorageSettings';
import {
  downloadSpeedLabel,
  resourceClientFor,
  resourceClientLabels,
  resourceVersionDetail,
  resourceVersionLabel,
  type ResourceClient,
} from './update-display';

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
  idle: '等待检查',
  checking: '正在检查',
  available: '发现新版本',
  downloading: '正在准备',
  staged: '已验证，待生效',
  waiting_idle: '等待空闲生效',
  active: '已更新',
  failed: '更新失败',
};
const channelLabels: Record<UpdateChannel['id'], string> = {
  app: 'Maa Verge 应用',
  core: 'MaaCore 核心',
  resource: '游戏资源',
};
const formatDate = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

function PageHeading({
  title,
  text,
  actions,
}: {
  title: string;
  text: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sp-page-heading">
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {actions && <div className="sp-heading-actions">{actions}</div>}
    </header>
  );
}

function Section({
  title,
  children,
  description,
  className = '',
}: {
  title: string;
  children: ReactNode;
  description?: string;
  className?: string;
}) {
  return (
    <section className={`sp-section ${className}`}>
      <div className="sp-section-title">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Notice({
  children,
  icon = <Info size={17} />,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="sp-notice">
      {icon}
      <div>{children}</div>
    </div>
  );
}

function Empty({
  title,
  text,
  icon = <FolderOpen size={28} />,
  action,
}: {
  title: string;
  text: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="sp-empty">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="sp-setting-row">
      <div>
        <strong>{label}</strong>
        {description && <p>{description}</p>}
      </div>
      <button
        type="button"
        className={`toggle ${checked ? 'on' : ''}`}
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </div>
  );
}

const categories = [
  {
    id: 'general',
    label: '通用与外观',
    icon: Settings2,
    keywords: '主题 浅色 深色 跟随系统 托盘 关闭窗口 语言',
  },
  {
    id: 'model',
    label: '模型与 Agent',
    icon: Cpu,
    keywords: '模型 API 接口 提供商 地址 问答 智能 托管',
  },
  { id: 'notifications', label: '通知与远控', icon: Bell, keywords: '推送 通知 远程 控制 消息' },
  {
    id: 'services',
    label: '外部服务',
    icon: ArrowUpRight,
    keywords: 'MirrorChyan 社区 作业站 企鹅 数据 汇报',
  },
  {
    id: 'updates',
    label: '更新',
    icon: RefreshCw,
    keywords:
      '更新 应用 核心 MaaCore 游戏资源 资源更新 下载 版本 正式版 预览版 频道 活动 目录 路径 检查 回滚 断点续传 下载代理 Clash VPN 直连',
  },
  {
    id: 'data',
    label: '数据与诊断',
    icon: HardDrive,
    keywords:
      '数据 日志 log 诊断 事件 导出 清理 自动 保留 存储 本地 目录 路径 作业 copilot JSON 缓存 删除',
  },
  { id: 'about', label: '关于', icon: Info, keywords: '版本 AGPL 许可证 开源 系统 模式' },
] as const;
type Category = (typeof categories)[number]['id'];

export function SettingsPage({
  snapshot,
  busy,
  onAction,
  onPrepareUpdate,
  preparingUpdates,
  searchQuery,
}: SupportPageProps) {
  const [category, setCategory] = useState<Category>('general');
  const [query, setQuery] = useState(searchQuery || '');
  useEffect(() => {
    if (searchQuery !== undefined) setQuery(searchQuery);
  }, [searchQuery]);
  const matches = categories.filter((item) =>
    `${item.label} ${item.keywords}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selected = matches.find((item) => item.id === category) || matches[0];
  const saveSettings = (patch: Partial<Settings>, message = '偏好设置已保存') =>
    onAction(
      'settings',
      () => rpc('settings.save', { settings: { ...snapshot.settings, ...patch } }),
      message,
    );
  const updating =
    preparingUpdates.size > 0 ||
    snapshot.updates.some((channel) => ['checking', 'downloading'].includes(channel.status));
  const checkAll = () =>
    onAction(
      'check-all',
      async () => {
        const failures: string[] = [];
        for (const channel of ['app', 'core', 'resource'] as const) {
          try {
            await rpc('updates.check', { channel });
          } catch (cause) {
            failures.push(`${channelLabels[channel]}：${errorMessage(cause)}`);
          }
        }
        if (failures.length) throw new Error(`部分更新检查失败：${failures.join('；')}`);
      },
      '三个更新通道已独立检查',
    );

  return (
    <div className="sp-page sp-settings-page">
      <PageHeading title="设置" text="查找应用偏好，管理模型与组件更新。" />
      <div className="sp-settings-search">
        <Search size={18} />
        <input
          className="text-input"
          type="search"
          aria-label="搜索设置"
          placeholder="搜索主题、模型、资源更新…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && <span>{matches.length} 个分类匹配</span>}
      </div>
      {query && selected && (
        <div className="sp-search-result">
          <Search size={15} />
          <span>
            设置 <ChevronRight size={13} /> {selected.label}
          </span>
          <span className="sp-scope">应用设置</span>
        </div>
      )}
      <div className="sp-settings-layout">
        <nav className="sp-category-nav" aria-label="设置分类">
          {matches.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={selected?.id === id ? 'is-selected' : ''}
              aria-current={selected?.id === id ? 'page' : undefined}
              onClick={() => setCategory(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sp-settings-content">
          {!selected ? (
            <Empty
              title="没有匹配的设置"
              text="试试“主题”“模型”或“资源更新”。"
              icon={<Search size={28} />}
            />
          ) : (
            <>
              {selected.id === 'general' && (
                <>
                  <Section title="通用与外观" description="适用范围：应用">
                    <div className="sp-setting-row">
                      <div>
                        <strong>界面主题</strong>
                        <p>浅色、深色，或跟随系统外观。</p>
                      </div>
                      <Select
                        className="text-input sp-inline-select"
                        aria-label="界面主题"
                        value={snapshot.settings.theme}
                        disabled={busy}
                        onChange={(event) =>
                          void saveSettings({ theme: event.target.value as Settings['theme'] })
                        }
                      >
                        <option value="system">跟随系统</option>
                        <option value="light">浅色</option>
                        <option value="dark">深色</option>
                      </Select>
                    </div>
                    <div className="sp-setting-row">
                      <div>
                        <strong>关闭窗口时</strong>
                        <p>最小化到托盘可继续运行；退出会停止本地执行。</p>
                      </div>
                      <Select
                        className="text-input sp-inline-select"
                        aria-label="关闭窗口时"
                        value={
                          !snapshot.settings.rememberCloseAction
                            ? 'ask'
                            : snapshot.settings.minimizeToTray
                              ? 'tray'
                              : 'exit'
                        }
                        disabled={busy}
                        onChange={(event) =>
                          void saveSettings({
                            rememberCloseAction: event.target.value !== 'ask',
                            ...(event.target.value !== 'ask'
                              ? { minimizeToTray: event.target.value === 'tray' }
                              : {}),
                          })
                        }
                      >
                        <option value="ask">每次询问</option>
                        <option value="tray">最小化到托盘</option>
                        <option value="exit">退出应用</option>
                      </Select>
                    </div>
                    <div className="sp-setting-row">
                      <div>
                        <strong>界面语言</strong>
                        <p>当前产品界面使用简体中文。</p>
                      </div>
                      <span className="sp-value">简体中文</span>
                    </div>
                  </Section>
                </>
              )}
              {selected.id === 'model' && (
                <ModelForm
                  settings={snapshot.settings}
                  busy={busy}
                  onSave={(model) => saveSettings({ model }, '模型配置已保存')}
                />
              )}
              {selected.id === 'notifications' && (
                <Section title="通知与远控">
                  <Notice icon={<Bell size={17} />}>
                    系统推送、第三方通知与远程控制尚未接入。
                  </Notice>
                  <p className="sp-help">
                    当前运行进度、失败原因与完成结果保留在底部运行栏和执行记录中。
                  </p>
                </Section>
              )}
              {selected.id === 'services' && (
                <Section title="外部服务">
                  <dl className="sp-description-list">
                    <div>
                      <dt>社区作业服务</dt>
                      <dd>
                        <a href="https://prts.plus/" target="_blank" rel="noopener noreferrer">
                          PRTS Plus
                        </a>
                        ；搜索、解析编号与导入时联网，发送查询条件或作业编号。本地作业浏览无需访问社区。
                      </dd>
                    </div>
                    <div>
                      <dt>作业内容归属</dt>
                      <dd>
                        作业、说明与视频归各自权利人所有；上传者可能并非原作者。转载遵循具体作者声明，不自动适用本项目
                        AGPL 许可。
                      </dd>
                    </div>
                    <div>
                      <dt>MirrorChyan 加速</dt>
                      <dd>尚未接入</dd>
                    </div>
                    <div>
                      <dt>数据汇报</dt>
                      <dd>默认关闭；按任务参数显式配置</dd>
                    </div>
                  </dl>
                  <p className="sp-help">
                    Maa Verge 是独立客户端。核心与资源更新可使用官方来源，无需配置付费加速服务。
                  </p>
                </Section>
              )}
              {selected.id === 'updates' && (
                <>
                  <div className="sp-content-heading">
                    <div>
                      <h2>更新</h2>
                      <p>应用确认后重启安装；核心与资源空闲生效。</p>
                    </div>
                    <button
                      className="button secondary"
                      disabled={busy || updating}
                      onClick={() => void checkAll()}
                    >
                      <RefreshCw size={15} />
                      检查全部更新
                    </button>
                  </div>
                  <DownloadProxyForm
                    settings={snapshot.settings}
                    busy={busy}
                    onSave={saveSettings}
                  />
                  {snapshot.updates.map((channel) => (
                    <UpdateSection
                      key={channel.id}
                      channel={channel}
                      settings={snapshot.settings}
                      hasActiveRun={snapshot.runs.some((run) => run.status === 'running')}
                      busy={busy}
                      updatesBlocked={updating}
                      preparing={preparingUpdates.has(channel.id)}
                      onPrepare={onPrepareUpdate}
                      onAction={onAction}
                      onSave={saveSettings}
                    />
                  ))}
                  <Notice>
                    下载完成、验证通过与已生效是不同状态。任务执行期间继续使用原版本，失败时保留旧组合。
                  </Notice>
                </>
              )}
              {selected.id === 'data' && (
                <Section title="数据与诊断">
                  <dl className="sp-description-list">
                    <div>
                      <dt>数据归属</dt>
                      <dd>保存在本机</dd>
                    </div>
                    <div>
                      <dt>任务表</dt>
                      <dd>{snapshot.plans.length} 张</dd>
                    </div>
                    <div>
                      <dt>执行记录</dt>
                      <dd>{snapshot.runs.length} 条</dd>
                    </div>
                    <div>
                      <dt>当前事件</dt>
                      <dd>{snapshot.events.length} 条</dd>
                    </div>
                  </dl>
                  <CopilotStorageSettings
                    settings={snapshot.settings}
                    busy={busy}
                    onSave={saveSettings}
                  />
                  <LogSettings
                    settings={snapshot.settings}
                    busy={busy}
                    onAction={onAction}
                    onSave={saveSettings}
                  />
                </Section>
              )}
              {selected.id === 'about' && (
                <Section title="关于 Maa Verge">
                  <p className="sp-about-intro">以任务为中心的本地桌面助手。</p>
                  <dl className="sp-description-list">
                    <div>
                      <dt>应用版本</dt>
                      <dd>
                        {snapshot.updates.find((channel) => channel.id === 'app')?.currentVersion ||
                          '未知版本'}
                      </dd>
                    </div>
                    <div>
                      <dt>运行模式</dt>
                      <dd>本地原生运行时</dd>
                    </div>
                    <div>
                      <dt>开源许可证</dt>
                      <dd>AGPL-3.0-only</dd>
                    </div>
                    <div>
                      <dt>界面语言</dt>
                      <dd>简体中文</dd>
                    </div>
                  </dl>
                  <Notice>完整原 MAA 兼容仍在推进中。各项能力以实际接入与验证状态为准。</Notice>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Only unsaved form drafts live in the session; saved settings remain runtime-owned.
function ModelForm({
  settings,
  busy,
  onSave,
}: {
  settings: Settings;
  busy: boolean;
  onSave: (model: Settings['model']) => Promise<boolean>;
}) {
  const [draft, setDraft, resetDraft] = useSettingsDraft('model', settings.model);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.model);
  return (
    <Section title="模型与 Agent" description="保存模型提供商信息；不会在保存时发起模型请求。">
      <Notice>当前 Agent 提供可审阅的规则提案，真实云模型与自主托管尚未接入。</Notice>
      <form
        className="sp-model-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(draft);
        }}
      >
        <label className="sp-field">
          模型提供商
          <input
            className="text-input"
            aria-label="模型提供商"
            placeholder="例如：openai-compatible"
            value={draft.provider}
            disabled={busy}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, provider: event.target.value }))
            }
          />
        </label>
        <label className="sp-field">
          API 地址
          <input
            className="text-input"
            type="url"
            aria-label="模型 API 地址"
            placeholder="https://example.com/v1"
            value={draft.baseUrl}
            disabled={busy}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, baseUrl: event.target.value }))
            }
          />
        </label>
        <label className="sp-field">
          模型名称
          <input
            className="text-input"
            aria-label="模型名称"
            value={draft.model}
            disabled={busy}
            placeholder="填写提供商支持的模型名称"
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, model: event.target.value }))
            }
          />
        </label>
        <p className="sp-help">密钥管理将在系统钥匙串接入后提供，此处不存放 API 密钥。</p>
        <div className="sp-form-actions">
          <span className="sp-help">{dirty ? '有未保存的修改' : '已保存'}</span>
          <button
            className="button secondary"
            type="button"
            disabled={busy || !dirty}
            onClick={resetDraft}
          >
            放弃修改
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            保存模型配置
          </button>
        </div>
      </form>
    </Section>
  );
}

function ComponentPathForm({
  channel,
  settings,
  busy,
  onSave,
}: {
  channel: UpdateChannel;
  settings: Settings;
  busy: boolean;
  onSave: (patch: Partial<Settings>) => Promise<boolean>;
}) {
  const key = channel.id === 'core' ? 'core' : 'resource';
  const saved = settings.componentPaths?.[key] || channel.installDirectory || '';
  const [draft, setDraft, reset] = useSettingsDraft(`component-path-${key}`, { path: saved });
  const dirty = draft.path !== saved;
  const save = (value: string) =>
    onSave({
      componentPaths: {
        core: settings.componentPaths?.core || '',
        resource: settings.componentPaths?.resource || '',
        [key]: value,
      },
    });
  return (
    <form
      className="sp-component-path"
      onSubmit={(event) => {
        event.preventDefault();
        void save(draft.path);
      }}
    >
      <label className="sp-field">
        下载与安装目录
        <input
          className="text-input"
          aria-label={`${channelLabels[channel.id]}下载目录`}
          value={draft.path}
          placeholder="输入完整的绝对路径"
          required
          disabled={busy}
          onChange={(event) => setDraft({ path: event.target.value })}
        />
      </label>
      <div className="sp-form-actions">
        <span className="sp-help">{dirty ? '有未保存的修改' : '用于后续下载与安装'}</span>
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={() => void save('')}
        >
          恢复默认目录
        </button>
        {dirty && (
          <button className="button secondary" type="button" disabled={busy} onClick={reset}>
            放弃修改
          </button>
        )}
        <button className="button primary" type="submit" disabled={busy || !dirty}>
          保存目录
        </button>
      </div>
      <p className="sp-help">
        安装版默认保存在程序同级的 {key === 'core' ? 'MaaCore' : 'MaaResource'}{' '}
        目录。更改后保留当前安装与回滚版本，新下载使用此目录。
      </p>
    </form>
  );
}

function DownloadProxyForm({
  settings,
  busy,
  onSave,
}: {
  settings: Settings;
  busy: boolean;
  onSave: (patch: Partial<Settings>) => Promise<boolean>;
}) {
  const saved: DownloadProxySettings = settings.downloadProxy ?? { mode: 'auto', url: '' };
  const [draft, setDraft, reset] = useSettingsDraft<DownloadProxySettings>('download-proxy', saved);
  const [saving, setSaving] = useState(false);
  const [readbackFailed, setReadbackFailed] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const disabled = busy || saving;
  const readSaved = async () => {
    try {
      const snapshot = await rpc('app.snapshot', {});
      setDraft(snapshot.settings.downloadProxy ?? { mode: 'auto', url: '' });
      setReadbackFailed(false);
    } catch {
      setReadbackFailed(true);
    }
  };
  const retryRead = async () => {
    if (disabled) return;
    setSaving(true);
    try {
      await readSaved();
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    if (disabled) return;
    const next = { ...draft, url: draft.mode === 'manual' ? draft.url.trim() : '' };
    setSaving(true);
    setReadbackFailed(false);
    try {
      if (await onSave({ downloadProxy: next })) await readSaved();
    } finally {
      setSaving(false);
    }
  };
  return (
    <Section
      title="下载代理"
      description="Maa Verge 应用、MaaCore 与 MaaResource 的更新检查和下载共用此设置。"
    >
      <form
        className="sp-model-form"
        aria-label="下载代理设置"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="sp-field">
          连接方式
          <Select
            className="text-input"
            aria-label="下载代理模式"
            value={draft.mode}
            disabled={disabled}
            onChange={(event) =>
              setDraft((previous) => ({
                mode: event.target.value as DownloadProxySettings['mode'],
                url: event.target.value === 'manual' ? previous.url : '',
              }))
            }
          >
            <option value="auto">自动（系统代理与环境变量）</option>
            <option value="manual">手动 HTTP/HTTPS 代理</option>
            <option value="direct">直连</option>
          </Select>
        </label>
        {draft.mode === 'manual' && (
          <label className="sp-field">
            手动代理地址
            <input
              className="text-input"
              type="text"
              inputMode="url"
              aria-label="手动下载代理地址"
              value={draft.url}
              placeholder="例如 127.0.0.1:7890"
              autoComplete="off"
              spellCheck={false}
              required
              disabled={disabled}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, url: event.target.value }))
              }
            />
          </label>
        )}
        <p className="sp-help">
          {draft.mode === 'auto'
            ? '优先使用环境变量与系统代理；代理不可用时尝试直连。'
            : draft.mode === 'manual'
              ? '可填写 IP:端口或完整 HTTP/HTTPS 代理地址。地址无效或连接失败时显示错误，保留已下载内容。'
              : '绕过环境变量与系统代理，直接连接下载来源。'}
        </p>
        {readbackFailed && (
          <p className="sp-help" role="alert">
            下载代理已保存，但读取当前设置失败。请重新读取后继续编辑。
            <button
              className="text-button"
              type="button"
              disabled={disabled}
              onClick={() => void retryRead()}
            >
              重新读取下载代理
            </button>
          </p>
        )}
        <div className="sp-form-actions">
          <span className="sp-help">
            {readbackFailed ? '设置已保存，等待重新读取' : dirty ? '有未保存的修改' : '已保存'}
          </span>
          <button
            className="button secondary"
            type="button"
            disabled={disabled || !dirty}
            onClick={reset}
          >
            放弃修改
          </button>
          <button className="button primary" type="submit" disabled={disabled || !dirty}>
            保存下载代理
          </button>
        </div>
      </form>
    </Section>
  );
}

function UpdateSection({
  channel,
  settings,
  busy,
  updatesBlocked,
  preparing,
  hasActiveRun,
  onAction,
  onPrepare,
  onSave,
}: {
  channel: UpdateChannel;
  settings: Settings;
  busy: boolean;
  updatesBlocked: boolean;
  preparing: boolean;
  hasActiveRun: boolean;
  onAction: SupportPageProps['onAction'];
  onPrepare: SupportPageProps['onPrepareUpdate'];
  onSave: (patch: Partial<Settings>) => Promise<boolean>;
}) {
  const [resourceClient, setResourceClient] = useState<ResourceClient>(
    resourceClientFor(settings.connection?.clientType ?? 'Official'),
  );
  const [confirmInstall, setConfirmInstall] = useState(false);
  const [appActionBusy, setAppActionBusy] = useState(false);
  const appActionPending = useRef(false);
  const Icon = channel.id === 'app' ? HardDrive : channel.id === 'core' ? Cpu : Database;
  const working = preparing || ['checking', 'downloading'].includes(channel.status);
  const downloadSpeed = downloadSpeedLabel(channel);
  const isApp = channel.id === 'app';
  const canInstall = !isApp || channel.appCanInstall === true;
  const staged = ['staged', 'waiting_idle'].includes(channel.status);
  const hasCandidate =
    channel.latestVersion &&
    channel.latestVersion !== channel.currentVersion &&
    ['available', 'downloading', 'staged', 'waiting_idle', 'failed'].includes(channel.status);
  const status =
    channel.status === 'idle'
      ? channel.latestVersion && channel.latestVersion === channel.currentVersion
        ? '已是最新版本'
        : channel.checkedAt
          ? '暂无新版本'
          : '等待检查'
      : isApp && channel.status === 'staged'
        ? channel.appInstallOnStartup === false
          ? '上次安装未完成，可重试'
          : '签名已验证，待安装'
        : updateLabels[channel.status];
  const checkedAt =
    channel.checkedAt && !Number.isNaN(Date.parse(channel.checkedAt))
      ? formatDate(channel.checkedAt)
      : '尚未检查';
  useEffect(() => {
    if (!staged || !canInstall) setConfirmInstall(false);
  }, [staged, canInstall]);
  const installAction = async (action: 'activate' | 'defer') => {
    if (appActionPending.current) return;
    appActionPending.current = true;
    setAppActionBusy(true);
    try {
      const completed = await onAction(`${action}-app`, () =>
        action === 'activate'
          ? rpc('updates.activate', { channel: 'app' })
          : rpc('updates.prepare', { channel: 'app' }),
      );
      if (completed) setConfirmInstall(false);
    } finally {
      appActionPending.current = false;
      setAppActionBusy(false);
    }
  };
  return (
    <section className="sp-update-channel update-channel">
      <div className="sp-update-main">
        <div className="sp-update-title">
          <Icon size={19} />
          <h3>{channelLabels[channel.id]}</h3>
          <span className={`pill sp-update-state ${channel.status === 'failed' ? 'is-error' : ''}`}>
            {status}
          </span>
        </div>
        <div className="channel-version sp-channel-version">
          {resourceVersionLabel(channel, resourceClient)}
          {hasCandidate && (
            <>
              <ArrowRight size={13} />
              <span>
                {channel.id === 'resource'
                  ? channel.latestVersion!.slice(0, 10)
                  : channel.latestVersion}
              </span>
            </>
          )}
        </div>
        {channel.id === 'resource' && (
          <p className="sp-help">{resourceVersionDetail(channel, resourceClient)}</p>
        )}
        <p className="sp-help">
          {isApp
            ? '桌面应用与本地服务；下载并校验签名后，可立即重启安装，或下次启动时自动安装。'
            : channel.id === 'core'
              ? '来源：官方 MaaCore 发布'
              : '关卡、活动与公招数据；版本独立于核心'}
        </p>
        <p className="sp-help sp-update-checked">上次检查：{checkedAt}</p>
        {channel.message && (
          <p className="sp-channel-message">
            {channel.status === 'failed' ? errorMessage(channel.message) : channel.message}
          </p>
        )}
        {isApp && channel.appCanInstall === false && (
          <p className="sp-help">
            当前安装方式不支持自动安装，请使用对应平台的安装包或软件包管理器更新。
          </p>
        )}
        {isApp && channel.appRelease && (
          <details className="sp-release-notes">
            <summary>发布说明{channel.appRelease.prerelease ? ' · 预览版' : ' · 正式版'}</summary>
            {!Number.isNaN(Date.parse(channel.appRelease.publishedAt)) && (
              <p className="sp-help">发布于 {formatDate(channel.appRelease.publishedAt)}</p>
            )}
            <pre>{channel.appRelease.notes || '此版本未提供发布说明。'}</pre>
          </details>
        )}
        {working && (
          <div className="sp-update-progress" aria-label={`${channelLabels[channel.id]}更新进度`}>
            <span style={{ width: `${Math.max(0, Math.min(100, channel.progress))}%` }} />
          </div>
        )}
        {downloadSpeed && (
          <p className="sp-help numeric" aria-label={`${channelLabels[channel.id]}下载速度`}>
            下载速度：{downloadSpeed}
          </p>
        )}
        {isApp && staged && hasActiveRun && (
          <p className="sp-channel-message">立即更新将停止当前执行，未执行的计划会保留。</p>
        )}
      </div>
      <div className="sp-channel-actions">
        {['idle', 'available', 'active', 'failed'].includes(channel.status) && (
          <button
            className="button secondary"
            disabled={busy || updatesBlocked}
            onClick={() =>
              void onAction(`check-${channel.id}`, () =>
                rpc('updates.check', { channel: channel.id }),
              )
            }
          >
            <RefreshCw size={14} />
            检查更新
          </button>
        )}
        {(channel.status === 'available' ||
          (channel.status === 'failed' &&
            channel.latestVersion &&
            channel.latestVersion !== channel.currentVersion)) &&
          canInstall && (
            <button
              className="button primary"
              disabled={busy || preparing}
              onClick={() => void onPrepare(channel)}
            >
              <Download size={14} />
              {channel.status === 'failed'
                ? '重试下载'
                : isApp
                  ? '下载更新'
                  : channel.currentVersion
                    ? '准备更新'
                    : '下载安装'}
            </button>
          )}
        {staged && canInstall && (
          <button
            className="button primary"
            disabled={
              isApp ? appActionBusy : busy || updatesBlocked || channel.status === 'waiting_idle'
            }
            onClick={() =>
              isApp
                ? setConfirmInstall(true)
                : void onAction(
                    `activate-${channel.id}`,
                    () => rpc('updates.activate', { channel: channel.id }),
                    '更新将在安全空闲边界生效',
                  )
            }
          >
            <Check size={14} />
            {isApp ? '安装并重启' : channel.status === 'waiting_idle' ? '等待空闲生效' : '应用更新'}
          </button>
        )}
        {working && (
          <span className="sp-working">
            <LoaderCircle className="spin" size={15} />
            {channel.progress}%
          </span>
        )}
        {channel.id !== 'app' && ['active', 'staged', 'waiting_idle'].includes(channel.status) && (
          <button
            className="button secondary"
            disabled={busy || updatesBlocked || hasActiveRun}
            onClick={() =>
              void onAction(
                `rollback-${channel.id}`,
                () => rpc('updates.rollback', { channel: channel.id }),
                '回滚请求已处理',
              )
            }
          >
            <RotateCcw size={14} />
            回滚上一版本
          </button>
        )}
      </div>
      {channel.id === 'resource' && (
        <label className="sp-resource-client sp-field">
          资源客户端
          <Select
            className="text-input"
            aria-label="资源版本客户端"
            value={resourceClient}
            onChange={(event) => setResourceClient(event.target.value as ResourceClient)}
          >
            {Object.entries(resourceClientLabels).map(([client, label]) => (
              <option key={client} value={client}>
                {label}
              </option>
            ))}
          </Select>
        </label>
      )}
      <div className="sp-update-preference">
        {channel.id !== 'resource' && (
          <div className="sp-setting-row">
            <div>
              <strong>{isApp ? '应用更新频道' : 'MaaCore 更新频道'}</strong>
              <p>
                {staged
                  ? isApp
                    ? '切换频道会取消已准备的版本并重新检查。'
                    : '切换频道会取消已准备的版本，下次检查使用新频道。'
                  : '正式版提供稳定更新；预览版包含最新预览版与正式版。'}
              </p>
            </div>
            <Select
              className="text-input sp-inline-select"
              aria-label={isApp ? '应用更新频道' : 'MaaCore 更新频道'}
              value={
                isApp
                  ? (settings.appUpdateChannel ?? 'preview')
                  : (settings.coreUpdateChannel ?? 'stable')
              }
              disabled={busy || working}
              onChange={(event) =>
                void onSave(
                  isApp
                    ? { appUpdateChannel: event.target.value as Settings['appUpdateChannel'] }
                    : { coreUpdateChannel: event.target.value as Settings['coreUpdateChannel'] },
                )
              }
            >
              <option value="stable">正式版</option>
              <option value="preview">预览版</option>
            </Select>
          </div>
        )}
        <Toggle
          label={
            isApp
              ? '启动时检查应用更新'
              : channel.id === 'core'
                ? '自动检查核心更新'
                : '独立检查游戏资源'
          }
          description={
            isApp
              ? '此开关仅控制新版本检查；已安排的更新仍会在下次启动时安装。'
              : channel.id === 'core'
                ? '启动时与每 24 小时检查'
                : '每 6 小时独立检查资源更新'
          }
          checked={
            isApp
              ? (settings.autoUpdateApp ?? true)
              : channel.id === 'core'
                ? settings.autoUpdateCore
                : settings.autoUpdateResource
          }
          disabled={busy}
          onChange={(value) =>
            void onSave(
              isApp
                ? { autoUpdateApp: value }
                : channel.id === 'core'
                  ? { autoUpdateCore: value }
                  : { autoUpdateResource: value },
            )
          }
        />
        {!isApp && (
          <ComponentPathForm
            channel={channel}
            settings={settings}
            busy={busy || updatesBlocked}
            onSave={onSave}
          />
        )}
      </div>
      {confirmInstall && (
        <AppInstallConfirmation
          version={channel.latestVersion || '新版本'}
          busy={appActionBusy}
          hasActiveRun={hasActiveRun}
          onClose={() => setConfirmInstall(false)}
          onDefer={() => installAction('defer')}
          onInstall={() => installAction('activate')}
        />
      )}
    </section>
  );
}

function AppInstallConfirmation({
  version,
  busy,
  hasActiveRun,
  onClose,
  onDefer,
  onInstall,
}: {
  version: string;
  busy: boolean;
  hasActiveRun: boolean;
  onClose: () => void;
  onDefer: () => Promise<void>;
  onInstall: () => Promise<void>;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(
    <div
      className="modal-backdrop sp-app-install-modal"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <section
        ref={ref}
        className="modal confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="安装应用更新"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) {
            event.stopPropagation();
            onClose();
          }
          if (event.key !== 'Tab') return;
          const nodes = [
            ...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []),
          ];
          if (event.shiftKey && document.activeElement === nodes[0]) {
            event.preventDefault();
            nodes.at(-1)?.focus();
          } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
            event.preventDefault();
            nodes[0]?.focus();
          }
        }}
      >
        <div className="modal-title">
          <h2>安装应用更新</h2>
          <button
            className="icon-button"
            aria-label="关闭安装确认"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p>
          版本 {version}{' '}
          已下载并通过签名验证，更新包已保存。是否立刻更新？请先保存未保存的更改；立即更新会退出应用、安装更新并重新启动。选择“下次启动时更新”后可继续使用，下次启动时将自动安装。
        </p>
        {hasActiveRun && <p role="status">立即更新将停止当前执行，未执行的计划会保留。</p>}
        <div className="modal-actions">
          <button className="button secondary" disabled={busy} onClick={() => void onDefer()}>
            下次启动时更新
          </button>
          <button className="button primary" disabled={busy} onClick={() => void onInstall()}>
            {busy && <LoaderCircle className="spin" size={15} />}立即更新并重启
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export { default as CopilotPage } from './CopilotPage';

export { default as ToolsPage } from './ToolsPage';
