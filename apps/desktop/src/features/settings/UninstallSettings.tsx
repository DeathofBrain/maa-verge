import { useEffect, useRef, useState } from 'react';
import {
  desktopPlatform,
  errorMessage,
  getDesktopUninstallInfo,
  uninstallDesktopApplication,
  type DesktopUninstallInfo,
} from '@maaverge/contracts';
import Button from '@/kit/Button';
import ConfirmDialog from '@/kit/ConfirmDialog';
import Section from '@/kit/Section';

export default function UninstallSettings({ busy }: { busy: boolean }) {
  const macos = desktopPlatform() === 'macos';
  const [info, setInfo] = useState<DesktopUninstallInfo>();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!macos) return;
    let disposed = false;
    void getDesktopUninstallInfo().then(
      (value) => {
        if (!disposed) setInfo(value);
      },
      (cause) => {
        if (!disposed) setError(errorMessage(cause));
      },
    );
    return () => {
      disposed = true;
    };
  }, [macos]);

  const uninstall = async () => {
    if (submitting.current || busy || !info?.available) return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      await uninstallDesktopApplication();
      // The native host exits after completing cleanup. Keep confirmation locked
      // while the command reply and application exit cross the bridge.
    } catch (cause) {
      setError(errorMessage(cause));
      submitting.current = false;
      setPending(false);
    }
  };

  if (!macos) return null;
  return (
    <Section title="卸载" className="settings-card">
      <p className="sp-help">将 Maa Verge 和默认安装的 MaaCore、MaaResource 一起移到废纸篓。</p>
      <p className="sp-help">直接在 Finder 中删除应用不会清理组件，请使用此入口卸载。</p>
      {info && !info.available && <p className="sp-help">{info.reason}</p>}
      {error && !open && <p role="alert">{error}</p>}
      <div className="settings-actions">
        <Button
          ref={trigger}
          variant="danger"
          disabled={busy || pending || !info?.available}
          onClick={() => {
            setError('');
            setOpen(true);
          }}
        >
          卸载 Maa Verge
        </Button>
      </div>
      {open && info && (
        <ConfirmDialog
          title="卸载 Maa Verge"
          confirmLabel={pending ? '正在卸载…' : '确认卸载'}
          danger
          busy={pending}
          confirmDisabled={busy || pending}
          cancelDisabled={pending}
          closeDisabled={pending}
          returnFocus={trigger.current}
          onClose={() => {
            if (!submitting.current) setOpen(false);
          }}
          onConfirm={() => void uninstall()}
        >
          <p>卸载将停止本地服务，并将以下应用和默认组件文件夹移到废纸篓：</p>
          <ul className="sp-help">
            {[info.application, ...info.componentDirectories].map((directory) => (
              <li key={directory}>{directory}</li>
            ))}
          </ul>
          <p className="sp-help">
            任务、执行记录和配置将保留在 {info.configurationDirectory}，自定义组件目录也会保留。
          </p>
          {pending && <p role="status">正在退出服务并清理组件，请稍候。</p>}
          {error && <p role="alert">{error}</p>}
        </ConfirmDialog>
      )}
    </Section>
  );
}
