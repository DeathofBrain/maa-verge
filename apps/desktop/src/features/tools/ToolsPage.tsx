import Checkbox from '@/kit/Checkbox';
import TextField from '@/kit/TextField';
import NumberField from '@/kit/NumberField';
import PageHeading from '@/kit/PageHeading';
import ProgressBar from '@/kit/ProgressBar';
import Select from '@/kit/Select';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Database,
  Gamepad2,
  HardDrive,
  ListChecks,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  Wrench,
} from 'lucide-react';
import {
  errorMessage,
  rpc,
  type RpcParams,
  type RpcResult,
  type Snapshot,
} from '@maaverge/contracts';
import type { ActionRunner } from '@/shared/lib/actions';

type ToolsPageProps = {
  snapshot: Snapshot;
  onSelectDevice: (id: string) => void;
  onAction: ActionRunner;
  searchQuery?: string;
};
import RecognitionPanel, { type RecognitionClient } from './RecognitionPanel';
import OperatorBadge from '@/shared/game/OperatorBadge';
import Button from '@/kit/Button';
import EmptyState from '@/kit/EmptyState';
import IconButton from '@/kit/IconButton';
import Spinner from '@/kit/Spinner';
import { downloadRecognition } from './tool-exports';
import './toolbox.css';

type Kind = RpcParams<'tool.start'>['kind'];
type Config = RpcResult<'tool.config.get'>;
type Availability = RpcResult<'device.availability'>;
type Job = RpcResult<'tool.get'>;
const tools = [
  { id: 'depot', label: '仓库', icon: Database },
  { id: 'operators', label: '干员', icon: BookOpen },
  { id: 'recruit', label: '公招计算', icon: Search },
  { id: 'inventory', label: '库存保持', icon: ListChecks },
  { id: 'data', label: '数据管理', icon: HardDrive },
  { id: 'games', label: '小游戏', icon: Gamepad2 },
] as const;
let lastDevice = '';

export default function ToolsPage({
  snapshot,
  onAction,
  onSelectDevice,
  searchQuery,
}: ToolsPageProps) {
  const [deviceId, setDeviceId] = useState(lastDevice);
  const [kind, setKind] = useState<Kind>('depot');
  const [client, setClient] = useState<RecognitionClient>('Official');
  const [availability, setAvailability] = useState<{
    deviceId: string;
    value?: Availability;
    error?: string;
  }>();
  const [checking, setChecking] = useState(false);
  const [revision, setRevision] = useState(0);
  const [configState, setConfigState] = useState<{ key: string; value: Config }>();
  const [configError, setConfigError] = useState('');
  const [catalog, setCatalog] = useState<RpcResult<'tool.catalog'>>();
  const [stages, setStages] = useState<RpcResult<'stages.list'>>();
  const [loadedJob, setJob] = useState<Job>();
  const job =
    loadedJob?.deviceId === deviceId && loadedJob.clientType === client && loadedJob.kind === kind
      ? loadedJob
      : undefined;
  const [sources, setSources] = useState<{
    key: string;
    depot: string | null;
    operators: string | null;
  }>();
  const device = snapshot.devices.find((item) => item.id === deviceId);
  const status = availability?.deviceId === deviceId ? availability : undefined;
  const key = JSON.stringify([deviceId, client, kind]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const editRevision = useRef(0);
  const config = configState?.key === key ? configState.value : undefined;
  const latestEvent = snapshot.events.at(-1)?.id;
  const accountRevision = [...snapshot.events]
    .reverse()
    .find(
      (event) => event.type === 'device.account_changed' && event.data.deviceId === deviceId,
    )?.id;
  const jobs =
    snapshot.toolJobs?.filter(
      (item) => item.deviceId === deviceId && item.clientType === client && item.kind === kind,
    ) ?? [];
  const latest = jobs.find((item) => item.status === 'running') ?? jobs[0];
  const resourceKey = snapshot.updates
    .filter((item) => item.id !== 'app')
    .map((item) => item.currentVersion)
    .join(':');
  const resourceUpdated = snapshot.updates
    .find((item) => item.id === 'resource')
    ?.resourceActivities?.find((item) => item.clientType === client)?.lastUpdated;
  const blocked = checking || !status?.value?.available;
  useEffect(() => {
    if (kind !== 'data' || !deviceId || !status?.value) return;
    let cancelled = false;
    void Promise.all([
      rpc('recognition.get', { deviceId, clientType: client, kind: 'depot' }),
      rpc('recognition.get', { deviceId, clientType: client, kind: 'operators' }),
    ]).then(
      ([depot, operators]) => {
        if (!cancelled)
          setSources({ key, depot: depot.collectedAt, operators: operators.collectedAt });
      },
      (error) => {
        if (!cancelled) setConfigError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [kind, deviceId, client, key, latestEvent, !!status?.value]);
  useEffect(() => {
    const match =
      searchQuery &&
      tools.find((tool) => tool.label.includes(searchQuery) || searchQuery.includes(tool.label));
    if (match) setKind(match.id);
  }, [searchQuery]);
  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    setChecking(true);
    void rpc('device.availability', { deviceId })
      .then(
        (value) => {
          if (!cancelled) setAvailability({ deviceId, value });
        },
        (error) => {
          if (!cancelled) setAvailability({ deviceId, error: errorMessage(error) });
        },
      )
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, device?.state, latestEvent, revision]);
  useEffect(() => {
    if (!deviceId || !status?.value) return;
    let cancelled = false;
    setConfigError('');
    void rpc('tool.config.get', { deviceId, clientType: client, kind }).then(
      (value) => {
        if (!cancelled) setConfigState({ key, value });
      },
      (error) => {
        if (!cancelled) setConfigError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, deviceId, client, kind, revision, accountRevision, !!status?.value]);
  useEffect(() => {
    if (!deviceId || !status?.value) return;
    let cancelled = false;
    void Promise.all([
      rpc('tool.catalog', { clientType: client }),
      rpc('stages.list', { clientType: client }),
    ]).then(
      ([nextCatalog, nextStages]) => {
        if (!cancelled) {
          setCatalog(nextCatalog);
          setStages(nextStages);
        }
      },
      (error) => {
        if (!cancelled) setConfigError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [deviceId, client, resourceKey, revision, !!status?.value]);
  useEffect(() => {
    if (!latest) {
      setJob(undefined);
      return;
    }
    let cancelled = false;
    void rpc('tool.get', { id: latest.id }).then(
      (value) => {
        if (!cancelled) setJob(value);
      },
      (error) => {
        if (!cancelled) setConfigError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [latest?.id, latest?.status, latest?.progress, latestEvent]);
  const selectedTags = (config?.tags ?? []) as string[];
  const patch = (change: Omit<Partial<Config>, 'tags'> & { tags?: string[] }) => {
    const edit = ++editRevision.current;
    const value = { ...config, ...change } as Config;
    setConfigState({ key, value });
    setConfigError('');
    // Valid edits are written immediately; invalid field drafts remain editable.
    if (
      value.targets?.some(
        (target) =>
          !target.stage ||
          !target.itemId ||
          !Number.isInteger(target.quantity) ||
          target.quantity < 1,
      )
    ) {
      setConfigError('请补全关卡、材料 ID 和正整数目标数量后保存。');
      return;
    }
    void rpc('tool.config.save', { deviceId, clientType: client, kind, config: value }).catch(
      (error) => {
        if (currentKey.current === key && editRevision.current === edit)
          setConfigError(errorMessage(error));
      },
    );
  };
  const start = () =>
    onAction(
      'tool-start-' + deviceId,
      async () => {
        if (blocked || !config) throw new Error('请先选择空闲设备并等待状态检查完成');
        await rpc('tool.start', {
          deviceId,
          clientType: client,
          kind,
          requestId: crypto.randomUUID(),
          config,
        });
        setRevision((value) => value + 1);
      },
      '工具操作已开始',
    );
  const targetChange = (index: number, change: Partial<NonNullable<Config['targets']>[number]>) =>
    patch({
      targets: config?.targets?.map((target, i) =>
        i === index ? { ...target, ...change } : target,
      ),
    });
  const move = (index: number, direction: number) => {
    const targets = [...(config?.targets ?? [])];
    const other = index + direction;
    if (other < 0 || other >= targets.length) return;
    [targets[index], targets[other]] = [targets[other], targets[index]];
    patch({ targets });
  };
  const active = tools.find((item) => item.id === kind)!;
  return (
    <div className="sp-page toolbox-page">
      <PageHeading
        className="sp-page-heading"
        title="工具箱"
        icon={<Wrench />}
        text="选择设备，确认空闲，再开始工具操作。"
      />
      <section className="sp-section toolbox-device" aria-label="工具箱目标设备">
        <label>
          目标设备
          <Select
            aria-label="工具箱设备"
            value={deviceId}
            onChange={(event) => {
              const id = event.target.value;
              lastDevice = id;
              setDeviceId(id);
              setAvailability(undefined);
              setCatalog(undefined);
              setStages(undefined);
              setJob(undefined);
              if (id) {
                onSelectDevice(id);
                const selected = snapshot.devices.find((item) => item.id === id);
                const profile = snapshot.settings.deviceProfiles?.find(
                  (item) => item.id === selected?.connectionProfileId,
                );
                setClient(
                  profile?.connection.clientType ??
                    snapshot.settings.connection?.clientType ??
                    'Official',
                );
              }
            }}
          >
            <option value="">请选择要使用工具的设备</option>
            {snapshot.devices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ·{' '}
                {item.state === 'offline' ? '离线' : item.state === 'running' ? '执行中' : '已连接'}
              </option>
            ))}
          </Select>
        </label>
        {deviceId && (
          <>
            <p role={status?.error ? 'alert' : 'status'}>
              {checking ? (
                <>
                  <Spinner size={16} /> 正在检查设备占用…
                </>
              ) : (
                (status?.error ?? status?.value?.reason ?? '等待状态检查')
              )}
            </p>
            <Button onClick={() => setRevision((value) => value + 1)}>
              <RefreshCw size={15} />
              重新检查
            </Button>
          </>
        )}
      </section>
      {!deviceId ? (
        <EmptyState
          className="recognition-empty"
          icon={<Database size={30} />}
          title="先选择目标设备"
          text="工具配置、执行及保存结果都属于所选设备。"
        />
      ) : (
        <div className="sp-tools-layout">
          <nav className="sp-category-nav" aria-label="工具分类">
            {tools.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                aria-current={kind === id ? 'page' : undefined}
                className={kind === id ? 'is-selected' : ''}
                onClick={() => setKind(id)}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>
          <div className="sp-tool-content">
            <header className="tool-content-heading">
              <h2>{active.label}</h2>
            </header>
            {job?.deviceId === deviceId && (
              <section className="sp-section tool-operation" aria-label="工具执行状态">
                <div>
                  <strong>
                    {job.status === 'failed' ? errorMessage(job.message) : job.message}
                  </strong>
                  <ProgressBar
                    className="tool-operation-progress"
                    size="lg"
                    value={job.progress}
                    label="工具执行进度"
                  />
                  <p>
                    {new Date(job.startedAt).toLocaleString('zh-CN')} ·{' '}
                    {tools.find((tool) => tool.id === job.kind)?.label}
                  </p>
                </div>
                {job.status === 'running' && (
                  <Button
                    onClick={() => {
                      void onAction(
                        'tool-stop-' + job.id,
                        () => rpc('tool.stop', { id: job.id }),
                        '正在停止工具',
                      );
                    }}
                  >
                    <Square size={14} />
                    停止
                  </Button>
                )}
                {job.kind === 'inventory' && Array.isArray(job.result?.targets) && (
                  <div className="sp-table-scroll">
                    <table className="sp-table">
                      <thead>
                        <tr>
                          <th>材料</th>
                          <th>当前数量</th>
                          <th>目标</th>
                          <th>结果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {job.result.targets.map((target: any) => (
                          <tr key={target.id}>
                            <td>{target.itemId}</td>
                            <td>{target.current}</td>
                            <td>{target.quantity}</td>
                            <td>{target.reached ? '已达标' : '尚未达标'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
            {status?.value && (kind === 'depot' || kind === 'operators') && (
              <RecognitionPanel
                kind={kind}
                snapshot={snapshot}
                selectedDevice={deviceId}
                busy={blocked}
                onAction={onAction}
                clientType={client}
                onClientChange={setClient}
              />
            )}
            {status?.value && kind !== 'depot' && kind !== 'operators' && (
              <section className="sp-section">
                <label className="tool-field">
                  游戏客户端
                  <Select
                    value={client}
                    onChange={(event) => setClient(event.target.value as RecognitionClient)}
                  >
                    {[
                      ['Official', '官服'],
                      ['Bilibili', 'B 服'],
                      ['YoStarEN', '国际服'],
                      ['YoStarJP', '日服'],
                      ['YoStarKR', '韩服'],
                      ['txwy', '繁中服'],
                    ].map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </label>
                {!config ? (
                  <p role="status">正在读取工具配置…</p>
                ) : (
                  <fieldset className="tool-config" disabled={blocked && kind !== 'data'}>
                    {kind === 'recruit' && (
                      <>
                        <label className="tool-field">
                          输入方式
                          <Select
                            value={config.mode ?? 'device'}
                            onChange={(event) =>
                              patch({ mode: event.target.value as Config['mode'] })
                            }
                          >
                            <option value="device">识别设备上的公招标签</option>
                            <option value="manual">手动选择标签</option>
                          </Select>
                        </label>
                        {config.mode === 'manual' && (
                          <div className="tool-tags">
                            {catalog?.tags.map((tag) => (
                              <label key={tag}>
                                <Checkbox
                                  checked={selectedTags.includes(tag) ?? false}
                                  disabled={
                                    !selectedTags.includes(tag) && (config.tags?.length ?? 0) >= 5
                                  }
                                  onChange={(event) =>
                                    patch({
                                      tags: event.target.checked
                                        ? [...(config.tags ?? []), tag]
                                        : selectedTags.filter((item) => item !== tag),
                                    })
                                  }
                                />
                                {tag}
                              </label>
                            ))}
                          </div>
                        )}
                        <p className="sp-help">仅计算，不确认招募、不刷新标签、不使用加急许可。</p>
                      </>
                    )}
                    {kind === 'inventory' && (
                      <>
                        <div className="tool-options">
                          {(
                            [
                              ['updateDepot', '执行前刷新仓库', true],
                              ['sortByProgress', '按库存达成率排序', false],
                              ['onlyFirst', '仅执行首个库存不足项', false],
                              ['skipDuringActivity', '活动期间跳过', false],
                              ['skipDuringResourceCollection', '资源收集全天开放期间跳过', false],
                              ['autoSeries', '使用 AUTO 代理倍率', false],
                            ] as const
                          ).map(([field, label, fallback]) => (
                            <label key={field}>
                              <Checkbox
                                checked={config[field] ?? fallback}
                                onChange={(event) => patch({ [field]: event.target.checked })}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                        <div className="sp-table-scroll">
                          <table className="sp-table tool-targets">
                            <thead>
                              <tr>
                                <th>关卡</th>
                                <th>材料 ID</th>
                                <th>目标数量</th>
                                <th>药剂上限</th>
                                <th>源石上限</th>
                                <th>顺序</th>
                              </tr>
                            </thead>
                            <tbody>
                              {config.targets?.map((target, index) => (
                                <tr key={target.id}>
                                  <td>
                                    <TextField
                                      aria-label={`关卡 ${index + 1}`}
                                      list="tool-stages"
                                      value={target.stage}
                                      onChange={(event) =>
                                        targetChange(index, { stage: event.target.value })
                                      }
                                    />
                                  </td>
                                  <td>
                                    <TextField
                                      aria-label={`材料 ID ${index + 1}`}
                                      value={target.itemId}
                                      onChange={(event) =>
                                        targetChange(index, { itemId: event.target.value })
                                      }
                                    />
                                  </td>
                                  {(['quantity', 'medicine', 'stone'] as const).map((field) => (
                                    <td key={field}>
                                      <NumberField
                                        aria-label={`${field} ${index + 1}`}
                                        min={field === 'quantity' ? 1 : 0}
                                        max={field === 'quantity' ? 2147483647 : 100}
                                        value={target[field]}
                                        onChange={(event) =>
                                          targetChange(index, {
                                            [field]: event.target.valueAsNumber,
                                          })
                                        }
                                      />
                                    </td>
                                  ))}
                                  <td>
                                    <IconButton
                                      label={`上移库存计划 ${index + 1}`}
                                      onClick={() => move(index, -1)}
                                    >
                                      <ArrowUp size={14} />
                                    </IconButton>
                                    <IconButton
                                      label={`下移库存计划 ${index + 1}`}
                                      onClick={() => move(index, 1)}
                                    >
                                      <ArrowDown size={14} />
                                    </IconButton>
                                    <IconButton
                                      label={`删除库存计划 ${index + 1}`}
                                      onClick={() =>
                                        patch({
                                          targets: config.targets?.filter((_, i) => i !== index),
                                        })
                                      }
                                    >
                                      <Trash2 size={14} />
                                    </IconButton>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <datalist id="tool-stages">
                          {stages?.stages
                            .filter((stage) => stage.available)
                            .map((stage) => (
                              <option key={stage.value} value={stage.value}>
                                {stage.label}
                              </option>
                            ))}
                        </datalist>
                        <Button
                          disabled={(config.targets?.length ?? 0) >= 29}
                          onClick={() =>
                            patch({
                              targets: [
                                ...(config.targets ?? []),
                                {
                                  id: crypto.randomUUID(),
                                  stage: '',
                                  itemId: '',
                                  quantity: 1,
                                  medicine: 0,
                                  stone: 0,
                                },
                              ],
                            })
                          }
                        >
                          <Plus size={15} />
                          添加库存目标
                        </Button>
                        <p className="sp-help">
                          每组最多 29 项。默认不消耗药剂或源石，库存为识别值及已确认掉落推算值。
                        </p>
                      </>
                    )}
                    {kind === 'data' && (
                      <>
                        <div className="tool-options">
                          <label>
                            <Checkbox
                              disabled={blocked}
                              checked={config.operators !== false}
                              onChange={(event) => patch({ operators: event.target.checked })}
                            />
                            刷新干员
                          </label>
                          <label>
                            <Checkbox
                              disabled={blocked}
                              checked={config.depot !== false}
                              onChange={(event) => patch({ depot: event.target.checked })}
                            />
                            刷新仓库
                          </label>
                        </div>
                        <dl className="sp-description-list">
                          <div>
                            <dt>仓库数据</dt>
                            <dd>
                              {sources?.key === key && sources.depot
                                ? new Date(sources.depot).toLocaleString('zh-CN')
                                : '尚无成功采集'}
                            </dd>
                          </div>
                          <div>
                            <dt>干员数据</dt>
                            <dd>
                              {sources?.key === key && sources.operators
                                ? new Date(sources.operators).toLocaleString('zh-CN')
                                : '尚无成功采集'}
                            </dd>
                          </div>
                          <div>
                            <dt>工具资源</dt>
                            <dd>{catalog?.resourceVersion ?? '未安装'}</dd>
                          </div>
                          <div>
                            <dt>工具资源更新时间</dt>
                            <dd>{resourceUpdated ?? '当前资源未提供更新时间'}</dd>
                          </div>
                        </dl>
                        <p className="sp-help">
                          来源为所选设备识别及本机已激活资源。识别数据可分别导出。
                        </p>
                        {(['depot', 'operators'] as const).map((resultKind) => (
                          <Button
                            key={resultKind}
                            onClick={() => {
                              void onAction(
                                'export-' + resultKind,
                                async () => {
                                  const result = await rpc('recognition.get', {
                                    deviceId,
                                    clientType: client,
                                    kind: resultKind,
                                  });
                                  downloadRecognition(result, 'json');
                                },
                                '数据已导出',
                              );
                            }}
                          >
                            导出{resultKind === 'depot' ? '仓库' : '干员'}数据
                          </Button>
                        ))}
                        <Button
                          onClick={() => {
                            void onAction(
                              'tool-refresh-resources',
                              () => rpc('stages.list', { clientType: client, refresh: true }),
                              '资源导航已刷新',
                            );
                          }}
                        >
                          刷新活动与关卡导航
                        </Button>
                      </>
                    )}
                    {kind === 'games' && (
                      <>
                        <label className="tool-field">
                          小游戏
                          <Select
                            value={config.game ?? 'pixelpaint'}
                            onChange={(event) =>
                              patch({ game: event.target.value as Config['game'] })
                            }
                          >
                            <option
                              value="pixelpaint"
                              disabled={!catalog?.games.includes('pixelpaint')}
                            >
                              像素画
                            </option>
                            <option
                              value="secretfront"
                              disabled={!catalog?.games.includes('secretfront')}
                            >
                              隐秘战线
                            </option>
                          </Select>
                        </label>
                        {config.game === 'secretfront' && (
                          <>
                            <label className="tool-field">
                              目标结局
                              <Select
                                value={config.ending ?? 'A'}
                                onChange={(event) =>
                                  patch({ ending: event.target.value as Config['ending'] })
                                }
                              >
                                {['A', 'B', 'C', 'D', 'E'].map((value) => (
                                  <option key={value}>{value}</option>
                                ))}
                              </Select>
                            </label>
                            <label className="tool-field">
                              事件分支
                              <TextField
                                value={config.branch ?? ''}
                                maxLength={80}
                                onChange={(event) => patch({ branch: event.target.value })}
                              />
                            </label>
                          </>
                        )}
                        <p className="sp-help">
                          仅开放已审核且当前资源可用的入口，请先打开对应游戏页面。
                        </p>
                      </>
                    )}
                    <div className="sp-form-actions">
                      <Button
                        variant="primary"
                        disabled={
                          blocked ||
                          !!configError ||
                          (kind === 'games' &&
                            !catalog?.games.includes(config.game ?? 'pixelpaint'))
                        }
                        onClick={() => {
                          void start();
                        }}
                      >
                        <Play size={15} />
                        {kind === 'inventory'
                          ? '开始补货'
                          : kind === 'recruit'
                            ? '开始计算'
                            : kind === 'data'
                              ? '刷新数据'
                              : '开始小游戏'}
                      </Button>
                    </div>
                  </fieldset>
                )}
                {catalog?.diagnostics.map((message) => (
                  <p className="sp-help" key={message}>
                    {message}
                  </p>
                ))}
              </section>
            )}
            {configError && (
              <p className="error-banner" role="alert">
                {configError}
              </p>
            )}
            {kind === 'recruit' &&
              job?.deviceId === deviceId &&
              job.kind === 'recruit' &&
              Array.isArray(job.result?.combinations) && (
                <section className="sp-section" aria-label="公招计算结果">
                  {job.result.combinations.map((combination: any, index: number) => (
                    <div className="tool-recruit-result" key={index}>
                      <strong>
                        {Array.isArray(combination.tags) ? combination.tags.join('＋') : '识别组合'}{' '}
                        · {combination.minimumRarity ?? combination.level ?? '—'} 星起
                      </strong>
                      <div>
                        {(combination.operators ?? combination.opers ?? []).map((operator: any) => (
                          <span key={operator.id ?? operator.name}>
                            <OperatorBadge
                              name={operator.name}
                              operatorId={operator.id}
                              clientType={client}
                              resourceKey={resourceKey}
                            />
                            {operator.potential != null && <small>潜能 {operator.potential}</small>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
