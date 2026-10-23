import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, MonitorDown, X } from 'lucide-react';
import { acknowledgeDesktopExit, desktopPlatform, resolveWindowClose, rpc, subscribeDesktopLifecycle, type DesktopLifecycle, type WindowCloseAction } from '@maaverge/contracts';

export default function DesktopLifecycleDialog() {
  const [phase, setPhase] = useState<DesktopLifecycle>('running');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const phaseRef = useRef<DesktopLifecycle>('running');
  const pending = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const showError = (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause));
  const isExiting = () => phaseRef.current === 'exiting';

  useEffect(() => subscribeDesktopLifecycle((next) => {
    if (phaseRef.current === 'exiting' || phaseRef.current === next) return;
    phaseRef.current = next;
    setPhase(next);
    setError('');
    if (next === 'close-requested') setRemember(false);
  }, showError), []);

  useEffect(() => {
    const host = dialog.current;
    if (!host) return;
    if (phase === 'running') {
      if (host.open) {
        host.close();
        const previous = previousFocus.current;
        if (previous?.isConnected && previous !== document.body) previous.focus();
        else document.querySelector<HTMLButtonElement>('.window-close')?.focus();
      }
    } else if (!host.open) {
      previousFocus.current = document.activeElement as HTMLElement | null;
      host.showModal();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'exiting') return;
    // Let the WebView paint the waiting dialog before native cleanup begins.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => { void acknowledgeDesktopExit().catch(showError); });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [phase]);

  const choose = async (action: WindowCloseAction) => {
    if (pending.current || isExiting()) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (remember && action !== 'cancel') {
        // settings.save replaces the settings object. Fetch the latest copy so
        // remembering a window choice preserves unrelated preferences.
        const { settings } = await rpc('app.snapshot', {});
        if (isExiting()) return;
        await rpc('settings.save', { settings: { ...settings, minimizeToTray: action === 'tray', rememberCloseAction: true } });
      }
      if (isExiting()) return;
      await resolveWindowClose(action);
      if (isExiting()) return;
      if (action === 'exit') {
        phaseRef.current = 'exiting';
        setPhase('exiting');
      } else {
        phaseRef.current = 'running';
        setPhase('running');
      }
    } catch (cause) { showError(cause); }
    finally { pending.current = false; setBusy(false); }
  };

  if (!desktopPlatform()) return null;
  return <>
    <dialog ref={dialog} className="modal lifecycle-dialog" aria-labelledby="lifecycle-title" aria-describedby="lifecycle-description" aria-busy={phase === 'exiting' || busy} onCancel={(event) => { event.preventDefault(); if (!busy && phase !== 'exiting') void choose('cancel'); }}>
      {phase === 'exiting' ? <div className="exit-progress">
        <LoaderCircle size={32} className="spin" aria-hidden="true" />
        <h2 id="lifecycle-title">正在退出…</h2>
        <p id="lifecycle-description" role="status">正在停止本地执行并释放资源，请稍候。</p>
      </div> : <>
        <div className="modal-title"><h2 id="lifecycle-title">关闭 Maa Verge</h2><button className="icon-button" aria-label="取消关闭" disabled={busy} onClick={() => void choose('cancel')}><X size={18} /></button></div>
        <p id="lifecycle-description">最小化到托盘可在后台继续运行；退出会停止本地执行并关闭应用。</p>
        <label className="remember-close"><input type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} />记住我的选择<span>可在设置中更改</span></label>
        <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => void choose('exit')}>退出应用</button><button className="button primary" autoFocus disabled={busy} onClick={() => void choose('tray')}>{busy ? <LoaderCircle size={16} className="spin" /> : <MonitorDown size={16} />}最小化到托盘</button></div>
      </>}
      {error && <p className="lifecycle-error" role="alert">{error}</p>}
    </dialog>
    {error && phase === 'running' && <div className="toast error" role="alert">窗口操作失败：{error}<button className="icon-button" aria-label="关闭提示" onClick={() => setError('')}><X size={15} /></button></div>}
  </>;
}
