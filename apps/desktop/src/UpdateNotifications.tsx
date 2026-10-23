import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Download, LoaderCircle, X } from 'lucide-react';
import { rpc, type UpdateChannel } from '@maaverge/contracts';
import './update-notifications.css';

type Notice = { channel: UpdateChannel; visible: boolean };
const names = { app: 'Maa Verge 应用', core: 'MaaCore 核心', resource: 'MaaResource 游戏资源' };
const terminal = new Set<UpdateChannel['status']>(['staged', 'waiting_idle', 'active', 'failed']);
const progressFor = (channel: UpdateChannel) => Math.max(0, Math.min(100, channel.progress));

// Requests and notifications belong to the application, so changing pages never
// ends a download or loses its result. Runtime snapshots also cover auto-install.
export function useComponentDownloads(channels: UpdateChannel[] | undefined, refresh: () => Promise<void>) {
  const [notices, setNotices] = useState<Partial<Record<UpdateChannel['id'], Notice>>>({});
  const [preparing, setPreparing] = useState<ReadonlySet<UpdateChannel['id']>>(new Set());
  const requests = useRef(new Set<UpdateChannel['id']>());
  const observe = useCallback((updates: UpdateChannel[], force = false) => {
    setNotices((previous) => {
      let next = previous;
      for (const channel of updates) {
        const existing = previous[channel.id];
        if (!force && existing && ['idle', 'checking', 'available'].includes(channel.status)) {
          next = { ...next }; delete next[channel.id];
          continue;
        }
        const failedCandidate = channel.status === 'failed' && channel.latestVersion && channel.latestVersion !== channel.currentVersion;
        const appReady = channel.id === 'app' && channel.status === 'staged';
        if (!force && channel.status !== 'downloading' && !failedCandidate && !appReady && !(existing && terminal.has(channel.status))) continue;
        if (existing && JSON.stringify(existing.channel) === JSON.stringify(channel)) continue;
        const changedStatus = existing?.channel.status !== channel.status;
        next = { ...next, [channel.id]: { channel, visible: force || changedStatus || existing?.visible !== false } };
      }
      return next;
    });
  }, []);
  useEffect(() => { if (channels) observe(channels); }, [channels, observe]);

  const prepare = useCallback(async (channel: UpdateChannel) => {
    if (requests.current.has(channel.id) || channel.status === 'downloading') return;
    requests.current.add(channel.id);
    setPreparing(new Set(requests.current));
    observe([{ ...channel, status: 'downloading', progress: 0, message: '正在开始下载…' }], true);
    try {
      const result = await rpc('updates.prepare', { channel: channel.id });
      if (result.status === 'downloading' || terminal.has(result.status)) observe([result], true);
      else setNotices((previous) => {
        const next = { ...previous }; delete next[channel.id]; return next;
      });
    } catch (cause) {
      observe([{ ...channel, status: 'failed', message: cause instanceof Error ? cause.message : String(cause) }], true);
    } finally {
      requests.current.delete(channel.id);
      setPreparing(new Set(requests.current));
      await refresh();
    }
  }, [observe, refresh]);
  const dismiss = (id: UpdateChannel['id']) => setNotices((previous) => {
    const notice = previous[id];
    return notice ? { ...previous, [id]: { ...notice, visible: false } } : previous;
  });
  return { prepare, preparing, notices: Object.values(notices).filter((notice) => notice.visible), dismiss };
}

export default function UpdateNotifications({ notices, onDismiss }: { notices: Notice[]; onDismiss: (id: UpdateChannel['id']) => void }) {
  if (!notices.length) return null;
  return <aside className="update-notifications" aria-label="组件下载通知">{notices.map(({ channel }) => {
    const downloading = channel.status === 'downloading';
    const failed = channel.status === 'failed';
    const title = downloading ? '正在下载与验证' : failed ? channel.id === 'app' ? '应用更新失败' : '下载失败' : channel.status === 'active' ? '已生效' : channel.id === 'app' ? '签名已验证，等待确认重启' : channel.status === 'waiting_idle' ? '已下载，等待空闲生效' : '已下载并验证，待生效';
    return <section key={channel.id} className={`update-notification ${failed ? 'is-error' : ''}`} role={failed ? 'alert' : 'status'} aria-label={`${names[channel.id]}下载通知`}>
      <div className="update-notification-heading">{downloading ? <LoaderCircle size={18} className="spin" /> : failed ? <AlertCircle size={18} /> : <Check size={18} />}<strong>{names[channel.id]}</strong><button className="icon-button" aria-label={`关闭${names[channel.id]}下载通知`} onClick={() => onDismiss(channel.id)}><X size={15} /></button></div>
      <div className="update-notification-status"><span>{title}</span>{downloading && <span className="numeric">{progressFor(channel)}%</span>}</div>
      {downloading && <progress aria-label={`${names[channel.id]}下载进度`} max={100} value={progressFor(channel)} />}
      {channel.message && <p>{channel.message}</p>}
      {channel.id === 'app' && channel.status === 'staged' && <p>在“设置 → 更新”中确认安装并重启。</p>}
      {downloading && <small><Download size={12} />可继续使用其他页面</small>}
    </section>;
  })}</aside>;
}
