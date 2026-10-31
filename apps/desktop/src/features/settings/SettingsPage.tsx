import TextField from '@/kit/TextField';
import ProgressBar from '@/kit/ProgressBar';
import Select from '@/kit/Select';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Cpu,
  Database,
  Download,
  HardDrive,
  Info,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
} from 'lucide-react';
import {
  errorMessage,
  pickDirectory,
  rpc,
  type DownloadProxySettings,
  type Settings,
  type Snapshot,
  type UpdateChannel,
} from '@maaverge/contracts';
import '@/shared/styles/support-pages.css';
import './settings-page.css';
import { useAutoSaveDraft } from '@/shared/lib/settings-autosave';
import ModelSettings from './ModelSettings';
import LogSettings from './LogSettings';
import Modal from '@/kit/Modal';
import CopilotStorageSettings from './CopilotStorageSettings';
import ConfigurationSettings from './ConfigurationSettings';
import NotificationSettings from './NotificationSettings';
import MirrorChyanSettings from './MirrorChyanSettings';
import {
  downloadSpeedLabel,
  resourceClientFor,
  resourceClientLabels,
  resourceVersionDetail,
  resourceVersionLabel,
  type ResourceClient,
} from '@/shared/lib/update-display';
import Button from '@/kit/Button';
import DirectoryPicker from '@/kit/DirectoryPicker';
import ExternalLink from '@/kit/ExternalLink';
import PageHeading from '@/kit/PageHeading';
import SaveStateIndicator from '@/kit/SaveStateIndicator';
import SearchField from '@/kit/SearchField';
import EmptyState from '@/kit/EmptyState';
import Section from '@/kit/Section';
import SettingRow from '@/kit/SettingRow';
import Switch from '@/kit/Switch';
import StatusPill from '@/kit/StatusPill';
import { formatDate } from '@/kit/format';
import { updateChannelLabels, updateStatusLabels } from '@/kit/labels';
import type { ActionRunner } from '@/shared/lib/actions';

type SettingsPageProps = {
  snapshot: Snapshot;
  busy: boolean;
  onAction: ActionRunner;
  onPrepareUpdate: (channel: UpdateChannel) => Promise<void>;
  preparingUpdates: ReadonlySet<UpdateChannel['id']>;
  searchQuery?: string;
};

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
    <SettingRow
      padding="compact"
      title={label}
      description={description}
      control={
        <Switch
          size="lg"
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
        />
      }
    />
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
    keywords: '社区 作业站 企鹅 数据 汇报',
  },
  {
    id: 'updates',
    label: '更新',
    icon: RefreshCw,
    keywords:
      '更新 应用 核心 MaaCore MaaResource 游戏资源 资源更新 下载 版本 正式版 预览版 频道 活动 目录 路径 检查 回滚 断点续传 下载代理 Clash VPN 直连 MirrorChyan Mirror酱 mirror酱 CDK 付费 加速',
  },
  {
    id: 'data',
    label: '数据与诊断',
    icon: HardDrive,
    keywords:
      '配置 配置文件 配置目录 数据 日志 log 诊断 事件 导出 清理 自动 保留 存储 本地 目录 路径 作业 copilot JSON 缓存 删除',
  },
  { id: 'about', label: '关于', icon: Info, keywords: '版本 AGPL 许可证 开源 系统 模式' },
] as const;
type Category = (typeof categories)[number]['id'];
let settingsSaveQueue = Promise.resolve();

export function SettingsPage({
  snapshot,
  busy,
  onAction,
  onPrepareUpdate,
  preparingUpdates,
  searchQuery,
}: SettingsPageProps) {
  const [category, setCategory] = useState<Category>('general');
  const [query, setQuery] = useState(searchQuery || '');
  useEffect(() => {
    if (searchQuery !== undefined) setQuery(searchQuery);
  }, [searchQuery]);
  const categoryOrder = [
    'general',
    'notifications',
    'updates',
    'data',
    'services',
    'model',
    'about',
  ];
  const matches = categories
    .filter((item) =>
      `${item.label} ${item.keywords}`.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((left, right) => categoryOrder.indexOf(left.id) - categoryOrder.indexOf(right.id));
  const selected = matches.find((item) => item.id === category) || matches[0];
  const saveSettings = (patch: Partial<Settings>, _message?: string): Promise<boolean> => {
    const changedPaths =
      patch.componentPaths &&
      Object.fromEntries(
        Object.entries(patch.componentPaths).filter(
          ([key, value]) =>
            value !== (snapshot.settings.componentPaths?.[key as 'core' | 'resource'] || ''),
        ),
      );
    const result = settingsSaveQueue.then(() =>
      onAction('settings', async () => {
        const current = await rpc('app.snapshot', {});
        return rpc('settings.save', {
          settings: {
            ...current.settings,
            ...patch,
            ...(changedPaths
              ? {
                  componentPaths: {
                    core: '',
                    resource: '',
                    ...current.settings.componentPaths,
                    ...changedPaths,
                  },
                }
              : {}),
          },
        });
      }),
    );
    settingsSaveQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const general = useAutoSaveDraft(
    'general',
    {
      theme: snapshot.settings.theme,
      rememberCloseAction: snapshot.settings.rememberCloseAction,
      minimizeToTray: snapshot.settings.minimizeToTray,
    },
    saveSettings,
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
            failures.push(`${updateChannelLabels[channel]}：${errorMessage(cause)}`);
          }
        }
        if (failures.length) throw new Error(`部分更新检查失败：${failures.join('；')}`);
      },
      '三个更新通道已独立检查',
    );

  return (
    <div className="sp-page sp-settings-page settings-workspace">
      <PageHeading
        className="sp-page-heading"
        actionsClassName="sp-heading-actions"
        title="设置"
        icon={<Settings2 />}
        text="自动保存修改"
      />
      <div className="sp-settings-search">
        <SearchField
          className="sp-settings-input"
          aria-label="搜索设置"
          placeholder="搜索主题、通知、更新或存储目录…"
          value={query}
          onValueChange={setQuery}
          clearLabel="清空设置搜索"
          icon={<Search size={18} />}
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
        <div className="sp-settings-content settings-category-content">
          {!selected ? (
            <EmptyState
              className="sp-empty"
              title="没有匹配的设置"
              text="试试“主题”“模型”或“资源更新”。"
              icon={<Search size={28} />}
            />
          ) : (
            <>
              {selected.id === 'general' && (
                <>
                  <Section title="通用与外观" className="settings-card">
                    <SettingRow
                      title="界面主题"
                      control={
                        <Select
                          className="sp-inline-select"
                          aria-label="界面主题"
                          value={general.draft.theme}
                          disabled={busy}
                          onChange={(event) =>
                            general.setDraft(
                              (value) => ({
                                ...value,
                                theme: event.target.value as Settings['theme'],
                              }),
                              0,
                            )
                          }
                        >
                          <option value="system">跟随系统</option>
                          <option value="light">浅色</option>
                          <option value="dark">深色</option>
                        </Select>
                      }
                    />
                    <SettingRow
                      title="关闭窗口时"
                      description="最小化到托盘时继续运行"
                      control={
                        <Select
                          className="sp-inline-select"
                          aria-label="关闭窗口时"
                          value={
                            !general.draft.rememberCloseAction
                              ? 'ask'
                              : general.draft.minimizeToTray
                                ? 'tray'
                                : 'exit'
                          }
                          disabled={busy}
                          onChange={(event) =>
                            general.setDraft(
                              (value) => ({
                                ...value,
                                rememberCloseAction: event.target.value !== 'ask',
                                ...(event.target.value !== 'ask'
                                  ? { minimizeToTray: event.target.value === 'tray' }
                                  : {}),
                              }),
                              0,
                            )
                          }
                        >
                          <option value="ask">每次询问</option>
                          <option value="tray">最小化到托盘</option>
                          <option value="exit">退出应用</option>
                        </Select>
                      }
                    />
                    <SettingRow
                      title="界面语言"
                      control={<span className="sp-value">简体中文</span>}
                    />
                    <SaveStateIndicator
                      className="settings-save-state"
                      status={general.status}
                      onRetry={() => void general.retry()}
                    />
                  </Section>
                </>
              )}
              {selected.id === 'model' && (
                <ModelSettings
                  settings={snapshot.settings}
                  busy={busy}
                  onSave={(model) => saveSettings({ model }, '模型配置已保存')}
                />
              )}
              {selected.id === 'notifications' && (
                <Section title="通知与远控" className="settings-card">
                  <NotificationSettings
                    settings={snapshot.settings}
                    busy={busy}
                    onSave={saveSettings}
                  />
                </Section>
              )}
              {selected.id === 'services' && (
                <Section title="外部服务" className="settings-card">
                  <dl className="sp-description-list">
                    <div>
                      <dt>社区作业服务</dt>
                      <dd>
                        <ExternalLink href="https://prts.plus/">PRTS Plus</ExternalLink>
                        <p className="sp-help">
                          搜索与导入时发送关键词或作业编号，本地浏览无需联网。
                        </p>
                      </dd>
                    </div>
                    <div>
                      <dt>作业内容归属</dt>
                      <dd>作业与视频归原作者所有，转载请遵循作者声明。</dd>
                    </div>
                    <div>
                      <dt>MirrorChyan 加速</dt>
                      <dd>
                        用户端高速下载为付费服务，需要有效 CDK。
                        <Button variant="text" onClick={() => setCategory('updates')}>
                          前往更新设置
                        </Button>
                      </dd>
                    </div>
                    <div>
                      <dt>数据汇报</dt>
                      <dd>默认关闭；按任务参数显式配置</dd>
                    </div>
                  </dl>
                </Section>
              )}
              {selected.id === 'updates' && (
                <>
                  <div className="settings-group-heading">
                    <h2>下载设置</h2>
                  </div>
                  <DownloadProxyForm
                    settings={snapshot.settings}
                    busy={busy}
                    onSave={saveSettings}
                  />
                  <MirrorChyanSettings
                    settings={snapshot.settings}
                    busy={busy || updating}
                    onSave={saveSettings}
                  />
                  <div className="sp-content-heading">
                    <div>
                      <h2>更新</h2>
                      <p>应用重启安装，核心与资源在空闲时生效。</p>
                    </div>
                    <Button disabled={busy || updating} onClick={() => void checkAll()}>
                      <RefreshCw size={15} />
                      检查全部更新
                    </Button>
                  </div>
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
                </>
              )}
              {selected.id === 'data' && (
                <>
                  <div className="settings-group-heading">
                    <h2>数据与诊断</h2>
                  </div>
                  <ConfigurationSettings busy={busy} />
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
                </>
              )}
              {selected.id === 'about' && (
                <Section title="关于 Maa Verge" className="settings-card">
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
                      <dt>数据存储</dt>
                      <dd>保存在本机</dd>
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
                  <p className="sp-help">完整原 MAA 兼容仍在推进中。</p>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
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
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState('');
  const { draft, setDraft, status, retry } = useAutoSaveDraft(
    'component-path-' + key,
    { path: saved },
    async (value) =>
      onSave({
        componentPaths: {
          core: settings.componentPaths?.core || '',
          resource: settings.componentPaths?.resource || '',
          [key]: value.path,
        },
      }),
  );
  const choose = async () => {
    setSelecting(true);
    setError('');
    try {
      const directory = await pickDirectory({
        defaultPath: draft.path || channel.installDirectory,
      });
      if (directory !== null) setDraft({ path: directory }, 0);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSelecting(false);
    }
  };
  return (
    <div className="sp-component-path settings-directory">
      <label className="sp-field">
        下载与安装目录
        <DirectoryPicker
          layout="responsive"
          surface="subtle"
          label="选择文件夹"
          ariaLabel={updateChannelLabels[channel.id] + '下载目录'}
          value={draft.path}
          placeholder="使用默认目录"
          disabled={busy}
          selecting={selecting}
          onPick={() => void choose()}
        />
      </label>
      <div className="settings-save-state">
        <SaveStateIndicator status={status} onRetry={() => void retry()} retryDisabled={busy} />
        <Button
          variant="text"
          className="settings-directory-reset"
          disabled={busy || selecting}
          onClick={() => setDraft({ path: '' }, 0)}
        >
          恢复默认目录
        </Button>
      </div>
      <p className="sp-help">仅用于后续下载，当前安装和回滚版本保留。</p>
      {error && (
        <p className="sp-help" role="alert">
          {error}
        </p>
      )}
    </div>
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
  const [readbackFailed, setReadbackFailed] = useState(false);
  const { draft, setDraft, flush, status, retry, synchronize } =
    useAutoSaveDraft<DownloadProxySettings>(
      'download-proxy',
      saved,
      async (value) => {
        const completed = await onSave({ downloadProxy: value });
        if (!completed) return false;
        try {
          const current = await rpc('app.snapshot', {});
          setReadbackFailed(false);
          return current.settings.downloadProxy ?? { mode: 'auto', url: '' };
        } catch {
          setReadbackFailed(true);
          return true;
        }
      },
      {
        normalize: (value) => ({ ...value, url: value.mode === 'manual' ? value.url.trim() : '' }),
        isValid: (value) => value.mode !== 'manual' || value.url.trim().length > 0,
      },
    );
  return (
    <Section title="下载代理" className="settings-card" description="应用、核心与资源共用此设置。">
      <form
        className="settings-form"
        aria-label="下载代理设置"
        onSubmit={(event) => {
          event.preventDefault();
          void flush();
        }}
      >
        <label className="sp-field">
          连接方式
          <Select
            aria-label="下载代理模式"
            value={draft.mode}
            disabled={busy || readbackFailed}
            onChange={(event) =>
              setDraft(
                (previous) => ({
                  mode: event.target.value as DownloadProxySettings['mode'],
                  url: event.target.value === 'manual' ? previous.url : '',
                }),
                0,
              )
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
            <TextField
              type="text"
              inputMode="url"
              aria-label="手动下载代理地址"
              value={draft.url}
              placeholder="例如 127.0.0.1:7890"
              autoComplete="off"
              spellCheck={false}
              disabled={busy || readbackFailed}
              onBlur={() => void flush()}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, url: event.target.value }))
              }
            />
          </label>
        )}
        <p className="sp-help">
          {draft.mode === 'auto'
            ? '代理不可用时尝试直连。'
            : draft.mode === 'manual'
              ? '支持 IP:端口或 HTTP/HTTPS 地址。'
              : '绕过环境变量与系统代理。'}
        </p>
        {readbackFailed && (
          <p className="sp-help" role="alert">
            下载代理已保存，但读取当前设置失败。
            <Button
              variant="text"
              type="button"
              disabled={busy}
              onClick={() =>
                void rpc('app.snapshot', {}).then(
                  (current) => {
                    synchronize(current.settings.downloadProxy ?? { mode: 'auto', url: '' });
                    setReadbackFailed(false);
                  },
                  () => setReadbackFailed(true),
                )
              }
            >
              重新读取下载代理
            </Button>
          </p>
        )}
        <SaveStateIndicator
          className="settings-save-state"
          status={status}
          onRetry={() => void retry()}
          retryDisabled={busy}
        />
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
  onAction: SettingsPageProps['onAction'];
  onPrepare: SettingsPageProps['onPrepareUpdate'];
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
        : updateStatusLabels[channel.status];
  const checkedAt =
    channel.checkedAt && !Number.isNaN(Date.parse(channel.checkedAt))
      ? formatDate(channel.checkedAt)
      : '尚未检查';
  const preferences = useAutoSaveDraft(
    `update-${channel.id}`,
    {
      releaseChannel: isApp
        ? (settings.appUpdateChannel ?? 'preview')
        : (settings.coreUpdateChannel ?? 'stable'),
      autoCheck: isApp
        ? (settings.autoUpdateApp ?? true)
        : channel.id === 'core'
          ? settings.autoUpdateCore
          : settings.autoUpdateResource,
    },
    async (value) =>
      onSave({
        ...(channel.id !== 'resource'
          ? isApp
            ? { appUpdateChannel: value.releaseChannel }
            : { coreUpdateChannel: value.releaseChannel }
          : {}),
        ...(isApp
          ? { autoUpdateApp: value.autoCheck }
          : channel.id === 'core'
            ? { autoUpdateCore: value.autoCheck }
            : { autoUpdateResource: value.autoCheck }),
      }),
  );
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
    <section className="sp-update-channel update-channel settings-card">
      <div className="sp-update-main">
        <div className="sp-update-title">
          <Icon size={19} />
          <h3>{updateChannelLabels[channel.id]}</h3>
          <StatusPill
            className={`sp-update-state ${channel.status === 'failed' ? 'is-error' : ''}`}
            tone={channel.status === 'failed' ? 'danger' : 'neutral'}
            label={status}
          />
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
          <ProgressBar
            className="settings-update-progress"
            label={`${updateChannelLabels[channel.id]}更新进度`}
            value={Math.max(0, Math.min(100, channel.progress))}
          />
        )}
        {downloadSpeed && (
          <p className="sp-help numeric" aria-label={`${updateChannelLabels[channel.id]}下载速度`}>
            下载速度：{downloadSpeed}
          </p>
        )}
        {isApp && staged && hasActiveRun && (
          <p className="sp-channel-message">立即更新将停止当前执行，未执行的计划会保留。</p>
        )}
      </div>
      <div className="sp-channel-actions">
        {['idle', 'available', 'active', 'failed'].includes(channel.status) && (
          <Button
            disabled={busy || updatesBlocked}
            onClick={() =>
              void onAction(`check-${channel.id}`, () =>
                rpc('updates.check', { channel: channel.id }),
              )
            }
          >
            <RefreshCw size={14} />
            检查更新
          </Button>
        )}
        {(channel.status === 'available' ||
          (channel.status === 'failed' &&
            channel.latestVersion &&
            channel.latestVersion !== channel.currentVersion)) &&
          canInstall && (
            <Button
              variant="primary"
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
            </Button>
          )}
        {staged && canInstall && (
          <Button
            variant="primary"
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
          </Button>
        )}
        {working && (
          <span className="sp-working">
            <LoaderCircle className="spin" size={15} />
            {channel.progress}%
          </span>
        )}
        {channel.id !== 'app' && ['active', 'staged', 'waiting_idle'].includes(channel.status) && (
          <Button
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
          </Button>
        )}
      </div>
      {channel.id === 'resource' && (
        <label className="sp-resource-client sp-field">
          资源客户端
          <Select
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
          <SettingRow
            padding="compact"
            title={isApp ? '应用更新频道' : 'MaaCore 更新频道'}
            description={staged ? '切换频道将取消已准备的版本。' : '预览版包含尚在验证中的新功能。'}
            control={
              <Select
                className="sp-inline-select"
                aria-label={isApp ? '应用更新频道' : 'MaaCore 更新频道'}
                value={preferences.draft.releaseChannel}
                disabled={busy || working}
                onChange={(event) =>
                  preferences.setDraft(
                    (value) => ({
                      ...value,
                      releaseChannel: event.target.value as 'stable' | 'preview',
                    }),
                    0,
                  )
                }
              >
                <option value="stable">正式版</option>
                <option value="preview">预览版</option>
              </Select>
            }
          />
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
              ? '已安排的更新仍会在下次启动时安装'
              : channel.id === 'core'
                ? '启动时及每 24 小时检查'
                : '每 6 小时检查，与核心版本无关'
          }
          checked={preferences.draft.autoCheck}
          disabled={busy}
          onChange={(value) =>
            preferences.setDraft((previous) => ({ ...previous, autoCheck: value }), 0)
          }
        />
        {!isApp && (
          <details className="settings-advanced">
            <summary>下载与安装目录</summary>
            <ComponentPathForm
              channel={channel}
              settings={settings}
              busy={busy || updatesBlocked}
              onSave={onSave}
            />
          </details>
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
  return (
    <Modal
      title="安装应用更新"
      closeLabel="关闭安装确认"
      onClose={onClose}
      className="modal confirm-dialog"
      busy={busy}
      closeDisabled={busy}
      footer={
        <>
          <Button disabled={busy} onClick={() => void onDefer()}>
            下次启动时更新
          </Button>
          <Button variant="primary" busy={busy} disabled={busy} onClick={() => void onInstall()}>
            立即更新并重启
          </Button>
        </>
      }
    >
      <p>
        版本 {version}{' '}
        已下载并通过签名验证，更新包已保存。是否立刻更新？请先保存未保存的更改；立即更新会退出应用、安装更新并重新启动。选择“下次启动时更新”后可继续使用，下次启动时将自动安装。
      </p>
      {hasActiveRun && <p role="status">立即更新将停止当前执行，未执行的计划会保留。</p>}
    </Modal>
  );
}
