import Select from '@/kit/Select';
import { useEffect, useId, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  errorMessage,
  rpc,
  stagePresets,
  subscribe,
  type RpcParams,
  type RpcResult,
} from '@maaverge/contracts';
import { gameDataChanged } from '@/shared/lib/update-display';
import './stage-selector.css';

type Catalog = RpcResult<'stages.list'>;
type ClientType = NonNullable<RpcParams<'stages.list'>['clientType']>;
export interface StageSelectorProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (stage: string) => void;
  clientType?: ClientType;
  disabled?: boolean;
}
const defaults: Catalog['stages'] = stagePresets.map((stage) => ({
  value: stage.value,
  label: stage.label,
  category: stage.value ? 'permanent' : 'default',
  available: true,
}));

export default function StageSelector({
  id,
  label = '作战关卡',
  value,
  onChange,
  clientType = 'Official',
  disabled = false,
}: StageSelectorProps) {
  const generatedId = useId(),
    inputId = id ?? `stage-${generatedId}`;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [manual, setManual] = useState(false);
  const [loadedClient, setLoadedClient] = useState<ClientType>();
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<{ client: ClientType; message: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const forceRefresh = useRef(false);
  const currentCatalog = catalog?.clientType === clientType ? catalog : null;
  const stages = currentCatalog?.stages ?? defaults;
  const selected = stages.find((stage) => stage.value === value);
  const loaded = loadedClient === clientType;
  const error = failure?.client === clientType ? failure.message : '';

  useEffect(
    () =>
      subscribe((event) => {
        if (gameDataChanged(event)) setRefresh((previous) => previous + 1);
      }),
    [],
  );
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) setRefresh((previous) => previous + 1);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const force = forceRefresh.current;
    forceRefresh.current = false;
    void rpc('stages.list', { clientType, ...(force ? { refresh: true } : {}) })
      .then((result) => {
        if (!cancelled) {
          setCatalog(result);
          setLoadedClient(clientType);
          setFailure(null);
          setLoading(false);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setLoadedClient(clientType);
          setFailure({ client: clientType, message: errorMessage(cause) });
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clientType, refresh]);
  useEffect(() => {
    if (loaded && !selected && value) setManual(true);
  }, [loaded, selected, value]);

  const toggleManual = (checked: boolean) => {
    setManual(checked);
    if (!checked && !selected) onChange('');
  };
  const activityStages = stages.filter((stage) => stage.category === 'activity');
  const permanentStages = stages.filter((stage) => stage.category === 'permanent');
  const option = (stage: Catalog['stages'][number]) => (
    <option key={stage.value} value={stage.value} disabled={!stage.available}>
      {stage.label}
      {!stage.available ? `（${stage.tip || '暂不可用'}）` : ''}
    </option>
  );
  return (
    <div className="stage-selector">
      <div className="stage-selector-heading">
        <label htmlFor={inputId}>{label}</label>
        <div className="stage-selector-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="刷新关卡目录"
            disabled={disabled || loading}
            onClick={() => {
              forceRefresh.current = true;
              setRefresh((previous) => previous + 1);
            }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
          <label className="stage-selector-manual">
            <input
              type="checkbox"
              checked={manual}
              disabled={disabled}
              onChange={(event) => toggleManual(event.target.checked)}
            />
            手动输入关卡
          </label>
        </div>
      </div>
      {manual ? (
        <input
          id={inputId}
          className="text-input"
          value={value}
          disabled={disabled}
          maxLength={200}
          placeholder="例如 1-7；留空使用当前 / 上次关卡"
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Select
          id={inputId}
          className="text-input"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {stages.filter((stage) => stage.category === 'default').map(option)}
          {!selected && value && <option value={value}>{value}（已保存）</option>}
          {activityStages.length > 0 && (
            <optgroup label="资源活动关卡">{activityStages.map(option)}</optgroup>
          )}
          <optgroup label="常驻关卡">{permanentStages.map(option)}</optgroup>
        </Select>
      )}
      <p className="stage-selector-hint" aria-live="polite">
        {manual
          ? '手动关卡使用原版 MAA 导航名称；留空使用当前 / 上次关卡。'
          : selected?.tip ||
            (loaded ? currentCatalog?.message || '显示常驻关卡' : '正在读取当前资源的关卡…')}
      </p>
      {currentCatalog?.calendar.source === 'official-cache' && (
        <p className="stage-selector-hint">
          官方活动日历 ·{' '}
          {currentCatalog.calendar.checkedAt
            ? `最近校验 ${new Date(currentCatalog.calendar.checkedAt).toLocaleString('zh-CN')}`
            : '已缓存'}
          {currentCatalog.calendar.stale ? ' · 缓存待更新' : ''}
          {currentCatalog.calendar.refreshing ? ' · 正在更新' : ''}
        </p>
      )}
      {currentCatalog?.calendar.error && (
        <p className="stage-selector-error" role="status">
          {currentCatalog.calendar.error}
        </p>
      )}
      {error && (
        <p className="stage-selector-error" role="status">
          关卡目录读取失败，仍可选择常驻关卡或手动输入。{error}
        </p>
      )}
    </div>
  );
}
