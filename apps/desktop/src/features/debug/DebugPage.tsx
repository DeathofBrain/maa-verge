import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Bug, RefreshCw } from 'lucide-react';
import { errorMessage, type Device, type ScreenFrame } from '@maaverge/contracts';
import Button from '@/kit/Button';
import EmptyState from '@/kit/EmptyState';
import ErrorBanner from '@/kit/ErrorBanner';
import Field from '@/kit/Field';
import PageHeading from '@/kit/PageHeading';
import SearchField from '@/kit/SearchField';
import Section from '@/kit/Section';
import Select from '@/kit/Select';
import StatusPill from '@/kit/StatusPill';
import DebugFrame, { type FrameSelection } from './DebugFrame';
import PrimitiveInputForm, {
  initialInput,
  parseInput,
  schemaProperties,
  type InputDraft,
} from './PrimitiveInputForm';
import { debugRpc, type PrimitiveDescriptor, type PrimitiveResult } from './debug-api';
import {
  activeDebugSession,
  debugSessionSnapshot,
  detachDebugSession,
  releaseDebugSession,
  startDebugSession,
  subscribeDebugSession,
} from './debug-session-owner';
import './debug-page.css';

/** 维护者调试目录：元数据决定原语层级和画面副作用，会话及输入仍走类型化 RPC。 */
type Props = { devices: Device[]; onError?: (message: string) => void; onHide: () => void };
const layers = [
  { id: 1, label: 'L1 最小原语' },
  { id: 2, label: 'L2 通用组合' },
  { id: 3, label: 'L3 游戏事件' },
  { id: 'workflow', label: '完整流程' },
] as const;
/** 新描述优先使用明确层级；旧服务仍按已有分类归入兼容分组。 */
const primitiveGroup = (item: PrimitiveDescriptor) =>
  item.primitiveLevel ??
  ({ operation: 1, observation: 2, game: 3, workflow: 'workflow' } as const)[item.layer];
const invalidatesFrame = (item: PrimitiveDescriptor) =>
  item.effect === undefined ? item.layer !== 'observation' : item.effect !== 'observe';
const statusLabels = {
  succeeded: '已完成',
  failed: '失败',
  unknown: '结果未知',
  cancelled: '已取消',
};
const booleanLabel = (value: boolean | undefined) =>
  value === undefined ? '未提供' : value ? '成功' : '失败';
const requestId = () => crypto.randomUUID();

export default function DebugPage({ devices, onError, onHide }: Props) {
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? '');
  const [catalog, setCatalog] = useState<PrimitiveDescriptor[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<InputDraft>({});
  const owner = useRef(Symbol('Debug page')).current;
  const ownership = useSyncExternalStore(subscribeDebugSession, debugSessionSnapshot);
  const session = ownership.phase === 'active' ? activeDebugSession(owner) : undefined;
  const starting = ownership.phase === 'starting';
  const ending = ownership.phase === 'releasing';
  const needsRelease = ownership.phase === 'release_failed';
  const [hiding, setHiding] = useState(false);
  const hidePending = useRef(false);
  const [invoking, setInvoking] = useState(false);
  const [result, setResult] = useState<PrimitiveResult>();
  const [frame, setFrame] = useState<ScreenFrame>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const alive = useRef(true);
  const epoch = useRef(0);
  const startPending = useRef(false);
  const invokePending = useRef(false);
  const endPending = useRef(false);
  const cleanupError = useRef(onError);
  cleanupError.current = onError;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      epoch.current++;
      detachDebugSession(owner, (message) => cleanupError.current?.(message));
    };
  }, [owner]);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    void debugRpc('primitive.catalog.get', deviceId ? { deviceId } : {})
      .then(({ items }) => {
        if (cancelled) return;
        setCatalog(items);
        setSelectedId((current) =>
          items.some((item) => item.id === current) ? current : (items[0]?.id ?? ''),
        );
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, catalogRevision]);

  const selected = catalog.find((item) => item.id === selectedId);
  useEffect(() => {
    setDraft(selected ? initialInput(selected.inputSchema) : {});
    setResult(undefined);
  }, [selected]);
  useEffect(() => {
    if (frame && selected && 'frameId' in schemaProperties(selected.inputSchema))
      setDraft((current) => ({ ...current, frameId: frame.frameId }));
  }, [frame, selected]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return catalog.filter((item) =>
      `${item.id} ${item.label} ${item.description}`.toLowerCase().includes(term),
    );
  }, [catalog, query]);

  const startSession = async () => {
    if (!deviceId || startPending.current || ownership.phase !== 'idle' || endPending.current)
      return;
    const generation = ++epoch.current;
    startPending.current = true;
    setError('');
    setNotice('');
    try {
      const next = await startDebugSession(owner, deviceId);
      if (next && alive.current && generation === epoch.current)
        setNotice('调试会话已建立，设备由本页持有。');
    } catch (cause) {
      if (alive.current) setError(errorMessage(cause));
      else cleanupError.current?.(`释放 Debug 会话失败：${errorMessage(cause)}`);
    } finally {
      startPending.current = false;
    }
  };

  const releaseSession = async (): Promise<boolean> => {
    if (ownership.phase === 'idle') return !startPending.current;
    if (starting) return false;
    if (endPending.current) return false;
    endPending.current = true;
    setError('');
    setNotice('');
    try {
      if (!(await releaseDebugSession(owner))) return false;
      epoch.current++;
      if (alive.current) {
        setFrame(undefined);
        setResult(undefined);
        setNotice('已停止并释放调试会话。');
        setDraft((current) => ('frameId' in current ? { ...current, frameId: '' } : current));
      }
      return true;
    } catch (cause) {
      if (alive.current) setError(`释放会话失败，请重试：${errorMessage(cause)}`);
      return false;
    } finally {
      endPending.current = false;
      if (!activeDebugSession(owner)) invokePending.current = false;
      if (alive.current) {
        if (!activeDebugSession(owner)) setInvoking(false);
      }
    }
  };

  const changeDevice = async (next: string) => {
    if (next === deviceId || starting || startPending.current) return;
    if (!(await releaseSession())) return;
    epoch.current++;
    setDeviceId(next);
    setFrame(undefined);
    setResult(undefined);
    setNotice('');
  };
  const hideDebug = async () => {
    if (starting || ending || hidePending.current) return;
    hidePending.current = true;
    setHiding(true);
    try {
      if ((await releaseSession()) && alive.current) onHide();
    } finally {
      hidePending.current = false;
      if (alive.current) setHiding(false);
    }
  };
  const invoke = async () => {
    const owned = activeDebugSession(owner);
    if (!owned || !selected?.available || invokePending.current || endPending.current) return;
    let input: Record<string, unknown>;
    try {
      input = parseInput(selected.inputSchema, draft);
    } catch (cause) {
      setError(errorMessage(cause));
      return;
    }
    const generation = epoch.current;
    invokePending.current = true;
    setInvoking(true);
    setError('');
    setNotice('');
    setResult(undefined);
    try {
      const next = await debugRpc('debug.primitive.invoke', {
        debugSessionId: owned.debugSessionId,
        primitiveId: selected.id,
        input,
        requestId: requestId(),
      });
      if (!alive.current || generation !== epoch.current) return;
      setResult(next);
      if (next.frame) setFrame(next.frame);
      else if (invalidatesFrame(selected)) {
        setFrame(undefined);
        setDraft((current) => ('frameId' in current ? { ...current, frameId: '' } : current));
      }
    } catch (cause) {
      if (alive.current && generation === epoch.current) setError(errorMessage(cause));
    } finally {
      if (generation === epoch.current) {
        invokePending.current = false;
        if (alive.current) setInvoking(false);
      }
    }
  };
  const selectCoordinates = ({ point, roi }: FrameSelection) => {
    if (!selected || invoking || ending) return;
    const properties = schemaProperties(selected.inputSchema);
    const patch: InputDraft = {};
    if ('x' in properties) patch.x = String(point.x);
    if ('y' in properties) patch.y = String(point.y);
    if (roi && 'roi' in properties) patch.roi = JSON.stringify(roi);
    if (frame && 'frameId' in properties) patch.frameId = frame.frameId;
    setDraft((current) => ({ ...current, ...patch }));
  };

  return (
    <div className="debug-page" role="region" aria-label="Debug 原语调试">
      <PageHeading
        title="Debug"
        icon={<Bug size={22} />}
        text="查看已登记的原语，手动验证参数、执行结果与步骤。"
        actions={
          <Button
            disabled={starting || ending || hiding}
            busy={hiding}
            onClick={() => void hideDebug()}
          >
            隐藏 Debug
          </Button>
        }
      />
      <div className="debug-session-bar">
        <Field label="调试设备">
          {(id) => (
            <Select
              id={id}
              aria-label="调试设备"
              value={deviceId}
              disabled={starting || ending || needsRelease}
              onChange={(event) => void changeDevice(event.target.value)}
            >
              {!devices.length && <option value="">暂无设备</option>}
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name} · {device.address}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="debug-inline">
          <StatusPill
            label={
              needsRelease
                ? '待重试释放会话'
                : ending
                  ? '正在释放会话'
                  : starting
                    ? '正在建立会话'
                    : session
                      ? '会话已建立'
                      : '尚未建立会话'
            }
            tone={needsRelease ? 'warning' : session ? 'info' : 'neutral'}
          />
          <Button
            disabled={!deviceId || ownership.phase !== 'idle'}
            busy={starting}
            onClick={() => void startSession()}
          >
            建立调试会话
          </Button>
          <Button
            disabled={(!session && !needsRelease) || ending}
            busy={ending}
            onClick={() => void releaseSession()}
          >
            {needsRelease ? '重试释放会话' : invoking ? '停止并释放会话' : '释放会话'}
          </Button>
        </div>
      </div>
      {(error || ownership.error) && <ErrorBanner>{error || ownership.error}</ErrorBanner>}
      {needsRelease && (
        <p className="debug-muted">上次调试会话尚未释放。请重试释放，之后可建立新会话。</p>
      )}
      {notice && (
        <p role="status" className="debug-notice">
          {notice}
        </p>
      )}
      <div className="debug-layout">
        <aside className="debug-catalog" aria-label="原语目录">
          <div className="debug-inline debug-catalog-tools">
            <SearchField
              aria-label="搜索原语"
              placeholder="搜索名称、ID 或描述"
              value={query}
              onValueChange={setQuery}
              clearLabel="清除原语搜索"
            />
            <Button
              size="sm"
              aria-label="刷新原语目录"
              disabled={catalogLoading || starting || invoking || ending}
              onClick={() => setCatalogRevision((value) => value + 1)}
            >
              <RefreshCw size={15} />
            </Button>
          </div>
          {catalogLoading ? (
            <p role="status">正在读取原语目录…</p>
          ) : (
            layers.map((layer) => {
              const items = visible.filter((item) => primitiveGroup(item) === layer.id);
              return (
                <section className="debug-layer" key={layer.id} aria-label={layer.label}>
                  <h2>
                    {layer.label} <span>{items.length}</span>
                  </h2>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="debug-primitive"
                      aria-label={item.label}
                      aria-pressed={item.id === selectedId}
                      disabled={invoking || ending}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span>{item.label}</span>
                      <code>{item.id}</code>
                      {!item.available && <small>{item.unavailableReason ?? '当前不可用'}</small>}
                    </button>
                  ))}
                  {!items.length && (
                    <p className="debug-muted">{query ? '没有匹配的能力' : '尚未登记能力'}</p>
                  )}
                </section>
              );
            })
          )}
        </aside>
        <div className="debug-workspace" role="region" aria-label="原语测试工作区">
          {selected ? (
            <>
              <Section title={selected.label} description={selected.description}>
                <div className="debug-inline">
                  <code>{selected.id}</code>
                  <StatusPill
                    label={selected.available ? '可用' : '不可用'}
                    tone={selected.available ? 'success' : 'offline'}
                  />
                </div>
                {!selected.available && (
                  <p className="debug-muted">
                    {selected.unavailableReason ?? '当前环境不支持此能力。'}
                  </p>
                )}
                <PrimitiveInputForm
                  schema={selected.inputSchema}
                  draft={draft}
                  disabled={invoking || ending || needsRelease}
                  onChange={setDraft}
                />
                <Button
                  variant="primary"
                  disabled={!session || !selected.available || invoking || ending || catalogLoading}
                  busy={invoking}
                  onClick={() => void invoke()}
                >
                  运行此能力
                </Button>
                {!session && <p className="debug-muted">先选择设备并建立调试会话。</p>}
              </Section>
              {frame && (
                <DebugFrame
                  key={frame.frameId}
                  frame={frame}
                  disabled={invoking || ending || needsRelease}
                  onSelect={selectCoordinates}
                />
              )}
              <Section title="执行结果">
                {invoking ? (
                  <p role="status">正在执行，可停止并释放会话。</p>
                ) : result ? (
                  <div aria-label="原语执行结果" className="debug-result">
                    <div className="debug-inline">
                      <StatusPill
                        label={statusLabels[result.status]}
                        tone={
                          result.status === 'succeeded'
                            ? 'success'
                            : result.status === 'failed'
                              ? 'danger'
                              : 'warning'
                        }
                      />
                      <span>原生执行：{booleanLabel(result.nativeSuccess)}</span>
                      <span>
                        目标验证：
                        {result.verified === undefined
                          ? '未验证'
                          : result.verified
                            ? '通过'
                            : '未通过'}
                      </span>
                    </div>
                    <pre>{JSON.stringify(result.data, null, 2)}</pre>
                    <h3>步骤记录</h3>
                    {result.steps.length ? (
                      <ol className="debug-steps">
                        {result.steps.map((step, index) => (
                          <li key={index}>
                            <pre>{JSON.stringify(step, null, 2)}</pre>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="debug-muted">本次没有子步骤。</p>
                    )}
                  </div>
                ) : (
                  <p className="debug-muted">运行后查看结果；执行完成与目标验证分别记录。</p>
                )}
              </Section>
              <details className="debug-schema">
                <summary>查看输入与结果定义</summary>
                <pre>
                  {JSON.stringify(
                    { input: selected.inputSchema, result: selected.resultSchema },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </>
          ) : (
            <EmptyState title="暂无可查看的原语" text="刷新目录，或更换调试设备。" />
          )}
        </div>
      </div>
    </div>
  );
}
