import Select from './kit/Select';
import { useEffect, useState } from 'react';
import { Database, Download, Play, RefreshCw, Search } from 'lucide-react';
import { errorMessage, rpc, type RpcParams, type RpcResult } from '@maaverge/contracts';
import type { SupportPageProps } from './app/page-types';
import MaterialIcon from './MaterialIcon';
import OperatorBadge from './OperatorBadge';
import Button from './kit/Button';
import Spinner from './kit/Spinner';
import { downloadRecognition, recognitionExport, type ExportFormat } from './tool-exports';
import './recognition-panel.css';

type Kind = RpcParams<'recognition.get'>['kind'];
export type RecognitionClient = NonNullable<RpcParams<'recognition.get'>['clientType']>;
type Client = RecognitionClient;
type Result = RpcResult<'recognition.get'>;
const clients: [Client, string][] = [
  ['Official', '官服'],
  ['Bilibili', 'B服'],
  ['YoStarEN', '国际服'],
  ['YoStarJP', '日服'],
  ['YoStarKR', '韩服'],
  ['txwy', '繁中服'],
];
const date = (value: string) => new Date(value).toLocaleString('zh-CN');

export default function RecognitionPanel({
  kind,
  snapshot,
  selectedDevice,
  busy,
  onAction,
  clientType,
  onClientChange,
}: Pick<SupportPageProps, 'snapshot' | 'selectedDevice' | 'busy' | 'onAction'> & {
  kind: Kind;
  clientType?: Client;
  onClientChange: (value: Client) => void;
}) {
  const label = kind === 'depot' ? '仓库' : '干员';
  const identity = JSON.stringify([selectedDevice, kind, clientType]);
  const [loaded, setLoaded] = useState<{ identity: string; result?: Result; error?: string }>();
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(60);
  const [format, setFormat] = useState<ExportFormat>('json');
  const [owned, setOwned] = useState('all');
  const device = snapshot.devices.find((item) => item.id === selectedDevice);
  const result = loaded?.identity === identity ? loaded.result : undefined;
  const error = loaded?.identity === identity ? loaded.error : undefined;
  const syncedAt = kind === 'depot' ? device?.dataSync?.depotAt : device?.dataSync?.operatorsAt;
  const recentRun = snapshot.runs.find((run) => run.deviceId === selectedDevice);
  const runRevision =
    (recentRun ? `${recentRun.id}:${recentRun.status}` : '') +
    ':' +
    snapshot.toolJobs
      ?.filter((job) => job.deviceId === selectedDevice)
      .map((job) => job.id + job.status)
      .join(':');
  const profile = snapshot.settings.deviceProfiles?.find(
    (item) => item.id === device?.connectionProfileId,
  );
  const selectedClient =
    clientType ??
    result?.clientType ??
    profile?.connection?.clientType ??
    snapshot.settings.connection?.clientType ??
    'Official';
  const resourceKey = snapshot.updates
    .filter((item) => item.id !== 'app')
    .map((item) => item.currentVersion)
    .join(':');
  useEffect(() => {
    let cancelled = false;
    if (!selectedDevice) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void rpc('recognition.get', { deviceId: selectedDevice, kind, clientType })
      .then(
        (value) => {
          if (!cancelled) setLoaded({ identity, result: value });
        },
        (cause: unknown) => {
          if (!cancelled) setLoaded({ identity, error: errorMessage(cause) });
        },
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identity, selectedDevice, kind, clientType, revision, syncedAt, runRevision, resourceKey]);
  useEffect(() => {
    setQuery('');
    setLimit(60);
  }, [identity]);
  const start = () =>
    onAction(
      `recognition-${selectedDevice}`,
      async () => {
        if (!device || device.state !== 'idle') throw new Error('请先连接空闲设备');
        await rpc('tool.start', {
          kind,
          deviceId: selectedDevice,
          clientType: selectedClient,
          requestId: crypto.randomUUID(),
        });
        setRevision((value) => value + 1);
      },
      `${label}识别已开始`,
    );
  const text = query.trim().toLocaleLowerCase();
  const items =
    result?.items.filter((item) => `${item.name} ${item.id}`.toLocaleLowerCase().includes(text)) ??
    [];
  const operators =
    result?.operators.filter(
      (item) =>
        (owned === 'all' || (owned === 'owned' ? item.own : !item.own)) &&
        `${item.name} ${item.id}`.toLocaleLowerCase().includes(text),
    ) ?? [];
  const count = kind === 'depot' ? items.length : operators.length;
  const collected = !!result?.collectedAt;

  return (
    <section className="sp-section recognition-panel" aria-label={`${label}识别结果`}>
      <div className="recognition-heading">
        <div>
          <h2>{label}识别结果</h2>
          <p>
            {device?.name || '未选择设备'} ·{' '}
            {collected ? `采集于 ${date(result.collectedAt!)}` : '尚无成功采集记录'}
          </p>
        </div>
        <div className="recognition-actions">
          <Select
            className="text-input"
            aria-label="识别结果客户端"
            value={selectedClient}
            onChange={(event) => onClientChange(event.target.value as Client)}
          >
            {clients.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </Select>
          <Button
            className="recognition-action"
            disabled={!selectedDevice || loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={15} />
            刷新识别结果
          </Button>
          <Button
            className="recognition-action"
            variant="primary"
            disabled={busy || !device || device.state !== 'idle' || loading}
            onClick={() => {
              void start();
            }}
          >
            <Play size={15} />
            开始{label}识别
          </Button>
        </div>
      </div>
      {error ? (
        <div className="recognition-empty" role="alert">
          <p>读取识别结果失败：{error}</p>
          <Button onClick={() => setRevision((value) => value + 1)}>重试</Button>
        </div>
      ) : !selectedDevice ? (
        <div className="recognition-empty">
          <Database size={28} />
          <p>请先在底栏选择设备。</p>
        </div>
      ) : !result ? (
        <div className="recognition-empty" role="status">
          <Spinner size={22} />
          <p>正在读取识别结果…</p>
        </div>
      ) : (
        <>
          {device?.state === 'running' && (
            <p className="recognition-note" role="status">
              设备正在执行任务；识别完成后自动刷新，当前显示上次成功采集的数据。
            </p>
          )}
          {collected ? (
            <>
              <div className="recognition-toolbar">
                <label>
                  <Search size={16} />
                  <input
                    className="text-input"
                    type="search"
                    aria-label={`搜索${kind === 'depot' ? '仓库物品' : '干员'}`}
                    placeholder="搜索名称或 ID"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setLimit(60);
                    }}
                  />
                </label>
                <span>
                  {count} {kind === 'depot' ? '种物品' : '名干员'}
                </span>
                <Select
                  className="text-input"
                  aria-label="导出格式"
                  value={format}
                  onChange={(event) => setFormat(event.target.value as ExportFormat)}
                >
                  {(
                    [
                      'json',
                      'markdown',
                      'csv',
                      ...(kind === 'depot' ? ['arkplanner', 'lolicon'] : []),
                    ] as ExportFormat[]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {value.toUpperCase()}
                    </option>
                  ))}
                </Select>
                <Button onClick={() => downloadRecognition(result, format)}>
                  <Download size={15} />
                  导出{label}结果
                </Button>
              </div>
              {kind === 'operators' && (
                <div className="recognition-toolbar">
                  <Select
                    className="text-input"
                    aria-label="持有情况"
                    value={owned}
                    onChange={(event) => setOwned(event.target.value)}
                  >
                    <option value="all">全部干员</option>
                    <option value="owned">已持有</option>
                    <option value="missing">未持有</option>
                  </Select>
                  <Button
                    onClick={() => {
                      void onAction(
                        'copy-operators',
                        () =>
                          navigator.clipboard.writeText(recognitionExport(result, 'markdown').text),
                        '已复制干员结果',
                      );
                    }}
                  >
                    复制表格
                  </Button>
                </div>
              )}
              {count ? (
                kind === 'depot' ? (
                  <ul className="recognition-materials" aria-label="仓库物品">
                    {items.slice(0, limit).map((item) => (
                      <li key={item.id}>
                        <MaterialIcon
                          itemId={item.id}
                          name={item.name}
                          clientType={result.clientType}
                          resourceKey={resourceKey}
                        />
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.id}</small>
                        </div>
                        <b>
                          × {item.quantity.toLocaleString('zh-CN')}
                          {item.estimatedQuantity !== undefined && (
                            <small>掉落推算 {item.estimatedQuantity.toLocaleString('zh-CN')}</small>
                          )}
                        </b>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="sp-table-scroll">
                    <table className="sp-table recognition-operators">
                      <thead>
                        <tr>
                          <th>干员</th>
                          <th>持有</th>
                          <th>星级</th>
                          <th>精英化</th>
                          <th>等级</th>
                          <th>潜能</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operators.slice(0, limit).map((item) => (
                          <tr key={item.id}>
                            <td>
                              <OperatorBadge
                                name={item.name}
                                operatorId={item.id}
                                resourceKey={resourceKey}
                                clientType={result.clientType}
                              />
                              <small>{item.id}</small>
                            </td>
                            <td>{item.own ? '已持有' : '未持有'}</td>
                            <td>{item.rarity < 1 ? '未识别' : `${item.rarity} 星`}</td>
                            <td>{item.elite < 0 ? '未识别' : `精英 ${item.elite}`}</td>
                            <td>{item.level < 0 ? '未识别' : item.level}</td>
                            <td>{item.potential < 1 ? '未识别' : item.potential}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="recognition-empty">
                  <p>{text ? '没有匹配的结果' : '此次识别未返回条目'}</p>
                </div>
              )}
              {count > limit && (
                <Button onClick={() => setLimit((value) => value + 60)}>
                  显示更多（剩余 {count - limit} 项）
                </Button>
              )}
              <p className="recognition-note">
                来源：{label}识别。
                {result.estimatedAt && `已确认掉落推算至 ${date(result.estimatedAt)}。`}
                采集结果不会随游戏内变化实时更新，换号后请重新识别。
              </p>
            </>
          ) : (
            <div className="recognition-empty">
              <Database size={28} />
              <h3>尚无{label}识别结果</h3>
              <p>连接设备并打开游戏后，点击“开始{label}识别”。成功采集后可在此查看、搜索和导出。</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
