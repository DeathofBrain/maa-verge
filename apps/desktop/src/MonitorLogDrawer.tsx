import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { acquireModalEffects } from './modal-effects';
import { Check, Copy, Download, ListChecks, Terminal, Trash2, X } from 'lucide-react';
import { errorMessage, localizeExecutionMessage, rpc, type Snapshot } from '@maaverge/contracts';
import CopilotSelectAll from './CopilotSelectAll';
import Button from './kit/Button';
import IconButton from './kit/IconButton';
import Spinner from './kit/Spinner';
import { formatDateTime, formatDateTimeFull } from './kit/format';
import './monitor-log-drawer.css';

type Props = {
  snapshot: Snapshot;
  initialDeviceIds: string[];
  onClose: () => void;
  embedded?: boolean;
};
type LogRow = { event: Snapshot['events'][number]; deviceId: string; deviceName: string };
const line = (row: LogRow) =>
  `[${formatDateTimeFull(row.event.createdAt)}] ${row.deviceName} ${row.event.type} ${localizeExecutionMessage(row.event.message) || row.event.type}`;
const removedEventIds = new Set<number>();

export default function MonitorLogDrawer({
  snapshot,
  initialDeviceIds,
  onClose,
  embedded = false,
}: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [deviceIds, setDeviceIds] = useState<Set<string>>(
    () =>
      new Set(initialDeviceIds.filter((id) => snapshot.devices.some((device) => device.id === id))),
  );
  const [selecting, setSelecting] = useState(false);
  const [selectedLogs, setSelectedLogs] = useState<Set<number>>(() => new Set());
  const [deletedLogs, setDeletedLogs] = useState<Set<number>>(() => new Set(removedEventIds));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const runDevice = useMemo(
    () => new Map(snapshot.runs.filter((run) => run.planId).map((run) => [run.id, run.deviceId])),
    [snapshot.runs],
  );
  const scope = useMemo(() => new Set(initialDeviceIds), [initialDeviceIds]);
  const devices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of snapshot.events) {
      if (deletedLogs.has(event.id)) continue;
      const data = event.data as {
        runId?: string;
        run?: { id?: string; deviceId?: string };
        deviceId?: string;
        device?: { id?: string };
      };
      const runId = data.runId || data.run?.id;
      const deviceId =
        data.run?.deviceId || (runId && runDevice.get(runId)) || data.deviceId || data.device?.id;
      if (deviceId) counts.set(deviceId, (counts.get(deviceId) || 0) + 1);
    }
    return snapshot.devices
      .filter((device) => scope.has(device.id))
      .map((device) => ({ device, count: counts.get(device.id) || 0 }));
  }, [snapshot.devices, snapshot.events, runDevice, scope, deletedLogs]);
  const allRows = useMemo(() => {
    const rows: LogRow[] = [];
    for (const event of snapshot.events) {
      if (deletedLogs.has(event.id)) continue;
      const data = event.data as {
        runId?: string;
        run?: { id?: string; deviceId?: string };
        deviceId?: string;
        device?: { id?: string };
      };
      const runId = data.runId || data.run?.id;
      const deviceId =
        data.run?.deviceId || (runId && runDevice.get(runId)) || data.deviceId || data.device?.id;
      const device = deviceId ? snapshot.devices.find((item) => item.id === deviceId) : undefined;
      if (device) rows.push({ event, deviceId: device.id, deviceName: device.name });
    }
    return rows.sort(
      (a, b) => b.event.createdAt.localeCompare(a.event.createdAt) || b.event.id - a.event.id,
    );
  }, [snapshot.events, snapshot.devices, runDevice, deletedLogs]);
  const matchedRows = useMemo(
    () => allRows.filter((row) => deviceIds.has(row.deviceId)),
    [allRows, deviceIds],
  );
  const rows = useMemo(() => matchedRows.slice(0, 200), [matchedRows]);
  const selectedRows = rows.filter((row) => selectedLogs.has(row.event.id));
  const single = devices.length === 1;
  const selectedDeviceCount = devices.filter(({ device }) => deviceIds.has(device.id)).length;
  useEffect(() => {
    setDeviceIds((previous) => {
      const next = new Set(
        [...previous].filter((id) => snapshot.devices.some((device) => device.id === id)),
      );
      return next.size === previous.size ? previous : next;
    });
  }, [snapshot.devices]);
  useEffect(() => {
    setSelectedLogs((previous) => {
      const next = new Set([...previous].filter((id) => rows.some((row) => row.event.id === id)));
      return next.size === previous.size ? previous : next;
    });
  }, [rows]);
  useEffect(() => {
    setDeletedLogs((previous) => {
      if (!previous.size) return previous;
      const next = new Set(
        [...previous].filter((id) => snapshot.events.some((event) => event.id === id)),
      );
      for (const id of [...removedEventIds]) if (!next.has(id)) removedEventIds.delete(id);
      return next.size === previous.size ? previous : next;
    });
  }, [snapshot.events]);
  useEffect(() => {
    if (!selectedLogs.size) setConfirmDelete(false);
  }, [selectedLogs]);
  useLayoutEffect(() => {
    if (embedded || !panel.current) return;
    return acquireModalEffects({
      panel: panel.current,
      layer: panel.current.parentElement ?? undefined,
      background: [
        document.querySelector<HTMLElement>('.sidebar'),
        document.querySelector<HTMLElement>('.main-shell'),
        document.querySelector<HTMLElement>('.run-dock'),
      ],
      initialFocus: panel.current.querySelector<HTMLElement>('[data-autofocus]'),
      onEscape: () => close.current(),
    });
  }, [embedded]);
  const toggleDevice = (deviceId: string) =>
    setDeviceIds((previous) => {
      const next = new Set(previous);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  const toggleLog = (eventId: number) =>
    setSelectedLogs((previous) => {
      const next = new Set(previous);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  const selectLogs = (checked: boolean) =>
    setSelectedLogs((previous) => {
      const next = new Set(previous);
      for (const row of rows) {
        if (checked) next.add(row.event.id);
        else next.delete(row.event.id);
      }
      return next;
    });
  const startSelecting = () => {
    setSelectedLogs(new Set());
    setNotice(null);
    setConfirmDelete(false);
    setSelecting(true);
  };
  const stopSelecting = () => {
    setSelectedLogs(new Set());
    setConfirmDelete(false);
    setSelecting(false);
  };
  const copySelected = async () => {
    if (!selectedRows.length) return;
    try {
      await navigator.clipboard.writeText(selectedRows.map(line).join('\n'));
      setNotice({ text: `已复制 ${selectedRows.length} 条日志` });
    } catch {
      setNotice({ text: '复制失败，请检查剪贴板权限后重试', error: true });
    }
  };
  const exportSelected = () => {
    if (!selectedRows.length) return;
    const blob = new Blob([selectedRows.map(line).join('\n')], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `maa-verge-logs-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice({ text: `已导出 ${selectedRows.length} 条日志` });
  };
  const deleteSelected = async () => {
    if (!selectedRows.length || deleting) return;
    const ids = selectedRows.map((row) => row.event.id);
    setDeleting(true);
    try {
      const result = await rpc('logs.delete', { ids });
      for (const id of ids) removedEventIds.add(id);
      setDeletedLogs(new Set(removedEventIds));
      setSelectedLogs(new Set());
      setConfirmDelete(false);
      setNotice({ text: `已删除 ${result.deleted} 条日志` });
    } catch (cause) {
      setNotice({ text: `删除失败：${errorMessage(cause)}`, error: true });
    } finally {
      setDeleting(false);
    }
  };
  const emptyTitle = !devices.length
    ? '没有可查看的设备日志'
    : !selectedDeviceCount
      ? '勾选设备查看日志'
      : single
        ? '该设备暂无日志'
        : '所选设备暂无日志';
  const emptyText = !devices.length
    ? '设备可能已被移除，请关闭后重试。'
    : !selectedDeviceCount
      ? '在左侧勾选一台或多台设备，合并查看它们的日志。'
      : '连接、保存、执行与更新事件会显示在这里。';
  const content = (
    <div className={embedded ? 'monitor-log-embedded' : 'monitor-log-layer'}>
      {!embedded && (
        <button
          className="monitor-log-backdrop"
          tabIndex={-1}
          aria-label="关闭设备日志遮罩"
          onClick={() => close.current()}
        />
      )}
      <div
        className="monitor-log-panel"
        ref={panel}
        role={embedded ? 'region' : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-label="设备日志"
      >
        {!embedded && (
          <div className="monitor-log-bar">
            <div className="monitor-log-title">
              <Terminal size={17} />
              <div>
                <strong>设备日志</strong>
                <small>
                  {single ? devices[0].device.name : `${selectedDeviceCount} 台设备`} ·{' '}
                  {rows.length} 条日志
                </small>
              </div>
            </div>
            <IconButton label="关闭设备日志" data-autofocus onClick={() => close.current()}>
              <X size={18} />
            </IconButton>
          </div>
        )}
        <div className={`monitor-log-body ${single ? 'is-single' : ''}`}>
          {!single && (
            <section className="monitor-log-devices" aria-label="选择日志设备">
              <div className="monitor-log-section-heading">
                <h2>设备</h2>
              </div>
              <div className="monitor-log-device-list">
                {devices.map(({ device, count }) => (
                  <label
                    key={device.id}
                    className={`monitor-log-device ${deviceIds.has(device.id) ? 'is-active' : ''}`}
                  >
                    <input
                      type="checkbox"
                      aria-label={`查看设备日志${device.name}`}
                      checked={deviceIds.has(device.id)}
                      onChange={() => toggleDevice(device.id)}
                    />
                    <span>{device.name}</span>
                    <small>{count}</small>
                  </label>
                ))}
              </div>
            </section>
          )}
          <section className="monitor-log-content" aria-label="设备日志内容">
            <div className="monitor-log-toolbar">
              <Button
                size="sm"
                aria-pressed={selecting}
                disabled={!rows.length}
                onClick={selecting ? stopSelecting : startSelecting}
              >
                {selecting ? <Check size={14} /> : <ListChecks size={14} />}
                {selecting ? '完成选择' : '选择日志'}
              </Button>
              {selecting && (
                <CopilotSelectAll
                  label="全选日志"
                  total={rows.length}
                  selected={selectedRows.length}
                  text="全选日志"
                  onChange={selectLogs}
                />
              )}
              <span role="status">
                {selecting ? `已选 ${selectedRows.length} 条` : `共 ${rows.length} 条`}
              </span>
              {selecting && (
                <div>
                  <Button
                    size="sm"
                    disabled={!selectedRows.length}
                    onClick={() => void copySelected()}
                  >
                    <Copy size={14} />
                    复制所选
                  </Button>
                  <Button size="sm" disabled={!selectedRows.length} onClick={exportSelected}>
                    <Download size={14} />
                    导出所选
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!selectedRows.length || deleting}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={14} />
                    删除所选
                  </Button>
                </div>
              )}
            </div>
            {confirmDelete && selectedRows.length > 0 && (
              <div className="monitor-log-confirm" role="region" aria-label="确认删除日志">
                <span>删除所选 {selectedRows.length} 条日志？删除后无法恢复。</span>
                <div>
                  <Button size="sm" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                    取消
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={deleting}
                    onClick={() => void deleteSelected()}
                  >
                    {deleting ? <Spinner size={14} /> : <Trash2 size={14} />}
                    确认删除
                  </Button>
                </div>
              </div>
            )}
            {notice && (
              <p
                className={`monitor-log-notice ${notice.error ? 'error' : ''}`}
                role={notice.error ? 'alert' : 'status'}
              >
                {notice.text}
              </p>
            )}
            {!rows.length ? (
              <div className="monitor-log-empty">
                <Terminal size={30} />
                <h2>{emptyTitle}</h2>
                <p>{emptyText}</p>
              </div>
            ) : (
              <ol
                className={`monitor-log-list ${selecting ? 'is-selecting' : ''}`}
                aria-label="设备日志列表"
              >
                {rows.map((row) => (
                  <li key={row.event.id}>
                    {selecting ? (
                      <label className="monitor-log-entry">
                        <input
                          type="checkbox"
                          aria-label={`选择日志${row.event.id}`}
                          checked={selectedLogs.has(row.event.id)}
                          onChange={() => toggleLog(row.event.id)}
                        />
                        <LogContent row={row} />
                      </label>
                    ) : (
                      <div className="monitor-log-entry">
                        <LogContent row={row} />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {matchedRows.length > 200 && (
              <p className="monitor-log-footnote">
                显示最近 200 条日志；可缩小设备范围查看更早记录。
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
  return embedded ? content : createPortal(content, document.body);
}

function LogContent({ row }: { row: LogRow }) {
  return (
    <>
      <time dateTime={row.event.createdAt}>{formatDateTime(row.event.createdAt)}</time>
      <span className="monitor-log-device-name">{row.deviceName}</span>
      <span className="monitor-log-copy">
        <code>{row.event.type}</code>
        <span>{localizeExecutionMessage(row.event.message) || row.event.type}</span>
      </span>
    </>
  );
}
