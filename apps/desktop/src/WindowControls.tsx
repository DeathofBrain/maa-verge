import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { closeWindow, desktopPlatform, minimizeWindow, subscribeWindowMaximized, toggleMaximizeWindow } from '@maaverge/contracts';

export default function WindowControls() {
  const platform = desktopPlatform();
  const [maximized, setMaximized] = useState(false);
  const [error, setError] = useState('');
  const showError = (cause: unknown) => setError(`窗口操作失败：${cause instanceof Error ? cause.message : String(cause)}`);
  useEffect(() => {
    if (!platform || platform === 'macos') return;
    return subscribeWindowMaximized(setMaximized, showError);
  }, [platform]);
  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(''), 6000);
    return () => window.clearTimeout(timeout);
  }, [error]);
  if (!platform || platform === 'macos') return null;
  const perform = (action: () => Promise<void>) => { setError(''); void action().catch(showError); };
  return <div className="window-controls" role="group" aria-label="窗口控制" data-tauri-drag-region="false">
    <button className="window-control" aria-label="最小化窗口" title="最小化" onClick={() => perform(minimizeWindow)}><Minus size={15} /></button>
    <button className="window-control" aria-label={maximized ? '还原窗口' : '最大化窗口'} title={maximized ? '还原' : '最大化'} onClick={() => perform(toggleMaximizeWindow)}>{maximized ? <Copy size={13} /> : <Square size={13} />}</button>
    <button className="window-control window-close" aria-label="关闭窗口" title="关闭" onClick={() => perform(closeWindow)}><X size={17} /></button>
    {error && <div className="window-error" role="alert">{error}</div>}
  </div>;
}
