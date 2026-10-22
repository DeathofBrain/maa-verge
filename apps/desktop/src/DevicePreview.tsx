import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { AlertCircle, LoaderCircle, Monitor, MousePointer2, Pause, Play, RefreshCw } from 'lucide-react';
import { rpc, type Device, type RpcResult } from '@maaverge/contracts';
import './device-preview.css';

type Frame = RpcResult<'device.frame'>;
type DisplayedFrame = { frame: Frame; src: string; latency: number };
type Point = { left: number; top: number };
const refreshRates = [5, 10, 15, 30, 60, 90, 120] as const;
type RefreshRate = typeof refreshRates[number];
const refreshRateKey = 'maaverge:ui:preview-fps';
const readRefreshRate = (): RefreshRate => {
  try {
    const saved = Number(localStorage.getItem(refreshRateKey));
    return refreshRates.find((rate) => rate === saved) ?? 60;
  } catch { return 60; }
};
const maxFrameAgeMs = 2000;
// A quick drawer reopen must wait for its previous, non-cancellable RPC to finish.
const pendingFrames = new Map<string, Promise<Frame>>();
const messageOf = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

export default function DevicePreview({ device }: { device?: Device }) {
  const [displayed, setDisplayed] = useState<DisplayedFrame | null>(null);
  const [refreshHz, setRefreshHz] = useState<RefreshRate>(readRefreshRate);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [allowClicks, setAllowClicks] = useState(false);
  const [clickPending, setClickPending] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [fps, setFps] = useState(0);
  const [clock, setClock] = useState(Date.now);
  const [point, setPoint] = useState<Point | null>(null);
  const clickPendingRef = useRef(false);
  const alive = useRef(true);
  const samples = useRef<number[]>([]);
  const online = !!device && device.state !== 'offline';

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    try { localStorage.setItem(refreshRateKey, String(refreshHz)); } catch { /* Refresh still works when preference storage is unavailable. */ }
  }, [refreshHz]);
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    if (!displayed) return;
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [!!displayed]);
  useEffect(() => {
    if (!point) return;
    const timer = window.setTimeout(() => setPoint(null), 600);
    return () => window.clearTimeout(timer);
  }, [point]);
  useEffect(() => {
    if (!online) { setDisplayed(null); setPaused(false); setAllowClicks(false); setError(''); }
  }, [online]);

  useEffect(() => {
    if (!device || !online || paused || !visible || error || clickPending) return;
    const deviceId = device.id;
    const intervalMs = 1000 / refreshHz;
    let cancelled = false;
    let timer: number | undefined;
    samples.current = [];
    setFps(0);
    const poll = async () => {
      const previous = pendingFrames.get(deviceId);
      if (previous) await previous.catch(() => undefined);
      if (cancelled || document.hidden || clickPendingRef.current) return;
      const started = performance.now();
      const request = rpc('device.frame', { deviceId });
      pendingFrames.set(deviceId, request);
      try {
        const frame = await request;
        if (cancelled || document.hidden) return;
        const src = `data:${frame.mimeType};base64,${frame.data}`;
        const image = new Image();
        image.src = src;
        // Decode before swapping the visible image. One sequential loop also prevents
        // fast responses from replacing src before its previous onLoad can fire.
        await image.decode();
        if (cancelled || document.hidden) return;
        if (image.naturalWidth !== frame.width || image.naturalHeight !== frame.height) throw new Error('画面尺寸不匹配，请重试');
        const now = performance.now();
        samples.current = [...samples.current.slice(-19), now];
        const times = samples.current;
        setFps(times.length < 2 ? 0 : (times.length - 1) * 1000 / (now - times[0]));
        setDisplayed({ frame, src, latency: Math.max(frame.latencyMs, now - started) });
        setClock(Date.now());
      } catch (cause) {
        if (!cancelled) { setError(messageOf(cause)); setFps(0); }
        return;
      } finally {
        if (pendingFrames.get(deviceId) === request) pendingFrames.delete(deviceId);
      }
      if (!cancelled) timer = window.setTimeout(() => { void poll(); }, Math.max(0, intervalMs - (performance.now() - started)));
    };
    void poll();
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [device?.id, online, paused, visible, error, retry, clickPending, refreshHz]);

  const age = displayed ? Math.max(0, clock - Date.parse(displayed.frame.capturedAt)) : Infinity;
  const fresh = Number.isFinite(age) && age <= maxFrameAgeMs;
  const canClick = !!(online && device?.state === 'idle' && displayed?.frame.canControl && allowClicks && fresh && !clickPending && !error && visible);
  const retryFrame = () => { setError(''); setPaused(false); setRetry((value) => value + 1); };
  const click = async (event: MouseEvent<HTMLDivElement>) => {
    if (!canClick || !displayed || !device || document.hidden || clickPendingRef.current || event.button !== 0) return;
    const frame = displayed.frame;
    // Recheck at dispatch time, including when a paused frame ages between renders.
    if (Date.now() - Date.parse(frame.capturedAt) > maxFrameAgeMs) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(rect.width / frame.width, rect.height / frame.height);
    const left = (rect.width - frame.width * scale) / 2;
    const top = (rect.height - frame.height * scale) / 2;
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    if (!(scale > 0) || localX < left || localY < top || localX >= rect.width - left || localY >= rect.height - top) return;
    const x = Math.floor((localX - left) / scale);
    const y = Math.floor((localY - top) / scale);
    clickPendingRef.current = true;
    setClickPending(true); setPoint({ left: localX / rect.width * 100, top: localY / rect.height * 100 });
    setActionError(''); setActionMessage('正在发送点击…');
    try {
      // Each deliberate click has one request ID and one attempt; never replay it.
      await rpc('device.click', { deviceId: device.id, frameId: frame.frameId, x, y, requestId: crypto.randomUUID() });
      if (alive.current) setActionMessage(`已发送点击 (${x}, ${y})`);
    } catch (cause) {
      if (alive.current) { setActionError(`点击未确认：${messageOf(cause)}。请查看画面后再操作。`); setActionMessage(''); }
    } finally {
      clickPendingRef.current = false;
      if (alive.current) {
        setClickPending(false);
        // Refresh immediately after input, including when automatic refresh is paused.
        setPaused(false); setError(''); setRetry((value) => value + 1);
      }
    }
  };

  const hint = !online ? '连接设备后即可查看画面' : device?.state === 'running' ? '任务执行中，显示核心最近画面，仅查看' : !displayed?.frame.canControl && displayed ? '设备控制权不可用，仅查看画面' : !allowClicks ? '开启「允许点击操作」后，可点击画面操作设备' : !fresh && displayed ? '画面已过期，请恢复刷新后再点击' : clickPending ? '点击发送中…' : '点击画面对应位置即可操作设备';

  return <section className="device-preview" aria-label="设备画面预览">
    <div className="device-preview-toolbar">
      <div className="device-preview-device"><Monitor size={16} /><strong>{device?.name || '未选择设备'}</strong></div>
      <div className="device-preview-controls"><span className="device-preview-metrics" aria-label="画面性能" title="延迟包含截图请求、传输和解码；显示帧率按实际显示的新帧计算">{displayed ? `往返延迟 ${Math.round(displayed.latency)} ms · 显示帧率 ${paused || error || !visible ? '0.0' : fps.toFixed(1)} FPS` : '等待画面'}</span><label className="device-preview-frequency" title="目标刷新频率；显示帧率取决于截图、传输和解码速度">刷新频率<select aria-label="刷新频率" value={refreshHz} onChange={(event) => setRefreshHz(refreshRates.find((rate) => rate === Number(event.target.value)) ?? 60)}>{refreshRates.map((rate) => <option key={rate} value={rate}>{rate} Hz</option>)}</select></label><button className="button secondary" disabled={!online || !!error} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? '恢复刷新' : '暂停刷新'}</button><label className="device-preview-toggle"><input type="checkbox" checked={allowClicks} disabled={!online || device?.state !== 'idle' || !displayed?.frame.canControl || clickPending} onChange={(event) => { setAllowClicks(event.target.checked); setActionError(''); setActionMessage(''); }} /><MousePointer2 size={13} />允许点击操作</label></div>
    </div>
    {error && <div className="device-preview-error" role="alert"><AlertCircle size={15} /><span>画面更新失败：{error}</span><button className="text-button" onClick={retryFrame}><RefreshCw size={13} />重试画面</button></div>}
    {actionError && <div className="device-preview-error" role="alert"><AlertCircle size={15} /><span>{actionError}</span></div>}
    <div className={`device-preview-stage ${canClick ? 'can-click' : ''} ${error ? 'has-error' : ''}`} aria-label="设备画面区域" onClick={(event) => { void click(event); }}>
      {online && displayed ? <><img src={displayed.src} width={displayed.frame.width} height={displayed.frame.height} alt={`${device?.name}实时画面`} draggable={false} data-frame-id={displayed.frame.frameId} /><span className="device-preview-frame-size">{displayed.frame.width} × {displayed.frame.height}</span>{point && <i className="device-preview-point" style={{ left: `${point.left}%`, top: `${point.top}%` }} aria-hidden="true" />}</> : <div className="device-preview-empty">{!online ? <Monitor size={28} /> : error ? <AlertCircle size={28} /> : <LoaderCircle className="spin" size={28} />}<strong>{!device ? '请选择设备' : !online ? '设备已离线' : error ? '暂时无法获取画面' : '正在获取设备画面…'}</strong><span>{!online ? '在设备页连接后，选择顶部的设备。' : error ? '请检查设备连接，然后重试画面。' : '首帧就绪后将自动刷新。'}</span></div>}
      {online && displayed && paused && <span className="device-preview-paused">已暂停刷新</span>}
    </div>
    <div className="device-preview-footer"><span>{hint}</span><span role="status">{actionMessage}</span></div>
  </section>;
}
