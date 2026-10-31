import { useEffect, useRef, useState } from 'react';
import { errorMessage, rpc, subscribe, type Settings } from '@maaverge/contracts';
import ConfirmDialog from '@/kit/ConfirmDialog';
import Select from '@/kit/Select';

type Connection = NonNullable<Settings['connection']>;
type TouchMode = Connection['touchMode'];
type Props = {
  connection: Connection;
  disabled?: boolean;
  onChange: (value: TouchMode) => void;
};

export default function MaaFwAdbTouchMode({ connection, disabled = false, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const mounted = useRef(false);
  const pending = useRef(false);
  const field = useRef<HTMLLabelElement>(null);
  const currentConnection = useRef(connection);
  currentConnection.current = connection;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!preparing) return;
    return subscribe((event) => {
      if (event.type === 'update.changed' && event.data.channel === 'core')
        setMessage(event.message);
    });
  }, [preparing]);

  const select = async (next: TouchMode) => {
    if (disabled || pending.current) return;
    setError('');
    setMessage('');
    if (next !== 'MaaFwAdb') {
      onChange(next);
      return;
    }
    pending.current = true;
    setChecking(true);
    try {
      const status = await rpc('updates.maafwAdb.status', {});
      if (!mounted.current || currentConnection.current !== connection) return;
      if (status.available) onChange(next);
      else if (!status.coreInstalled)
        setError('请先在「设置 → 更新」安装并启用 MaaCore，再选择 MaaFwAdb。');
      else setOpen(true);
    } catch (cause) {
      if (mounted.current && currentConnection.current === connection)
        setError(errorMessage(cause));
    } finally {
      pending.current = false;
      if (mounted.current) setChecking(false);
    }
  };

  const prepare = async () => {
    if (disabled || pending.current) return;
    pending.current = true;
    setPreparing(true);
    setError('');
    setMessage('正在从官方源下载并校验完整运行时…');
    try {
      const update = await rpc('updates.maafwAdb.prepare', {});
      if (!mounted.current) return;
      if (update.status !== 'active' && update.status !== 'waiting_idle')
        throw new Error(update.message || 'MaaFwAdb 运行时尚未准备完成，请重试。');
      onChange('MaaFwAdb');
      setOpen(false);
      setMessage(
        update.status === 'waiting_idle'
          ? '运行时已准备完成，将在所有设备空闲后生效。请生效后保存配置并重新连接。'
          : 'MaaFwAdb 运行时已就绪，请保存配置并重新连接。',
      );
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      pending.current = false;
      if (mounted.current) setPreparing(false);
    }
  };

  return (
    <>
      <label className="sp-field" ref={field}>
        触控模式
        <Select
          className="wb-parameter-control"
          aria-label="触控模式"
          value={connection.touchMode}
          disabled={disabled || checking || preparing}
          onChange={(event) => void select(event.target.value as TouchMode)}
        >
          <option value="minitouch">Minitouch</option>
          <option value="maatouch">MaaTouch（默认）</option>
          <option value="adb">ADB Input（兼容模式）</option>
          <option value="MaaFwAdb">MaaFwAdb（实验性）</option>
        </Select>
        <span className="sp-help">
          ADB Input 滑动较慢；MaaFwAdb 不支持额外刹车滑动，配合 AVD 连接配置可使用 AVD 增强截图。
        </span>
        {checking && <span role="status">正在检查 MaaFwAdb 运行时…</span>}
        {!open && error && <span role="alert">{error}</span>}
        {!open && message && <span role="status">{message}</span>}
      </label>
      {open && (
        <ConfirmDialog
          title="下载 MaaFwAdb 运行时"
          confirmLabel={preparing ? '正在下载…' : '下载并启用'}
          busy={preparing}
          confirmDisabled={disabled || preparing}
          cancelDisabled={preparing}
          closeDisabled={preparing}
          returnFocus={field.current?.querySelector('select')}
          onClose={() => {
            if (!pending.current) {
              setOpen(false);
              setError('');
              setMessage('');
            }
          }}
          onConfirm={() => void prepare()}
        >
          <p>当前 MaaCore 缺少 MaaFwAdb 所需的控制库，是否下载完整运行时？</p>
          <p>本次下载使用官方源，不使用 Mirror酱。</p>
          <p className="sp-help">
            下载完成后会校验并在所有设备空闲时生效。启用后仍需保存连接配置，再重新连接设备。
          </p>
          {preparing && <p role="status">{message}</p>}
          {error && <p role="alert">{error}</p>}
        </ConfirmDialog>
      )}
    </>
  );
}
