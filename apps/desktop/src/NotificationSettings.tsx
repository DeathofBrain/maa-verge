import { useEffect, useState } from 'react';
import {
  desktopNotificationStatus,
  desktopPlatform,
  errorMessage,
  sendTestNotification,
  type NotificationSettings as Preferences,
  type DesktopNotificationStatus,
  type Settings,
} from '@maaverge/contracts';
import { useSettingsDraft } from './settings-draft';

type Props = {
  settings: Settings;
  busy: boolean;
  onSave: (patch: Partial<Settings>, message?: string) => Promise<boolean>;
};

const defaults: Preferences = {
  enabled: true,
  runResults: true,
  deviceErrors: true,
  updates: true,
  schedules: true,
};
const categories = [
  ['runResults', '执行结果通知', '任务表、作业和工具执行结束、失败或中断时通知。'],
  ['deviceErrors', '设备异常通知', '连接失败或连接丢失时通知；连续重试不会重复提醒。'],
  ['updates', '更新结果通知', '应用更新准备完成、组件生效或更新失败时通知。'],
  ['schedules', '定时系统通知', '按定时计划的提前提醒和强制启动倒计时设置发送通知。'],
] as const;

export default function NotificationSettings({ settings, busy, onSave }: Props) {
  const saved = settings.notifications ?? defaults;
  const [draft, setDraft] = useSettingsDraft('system-notifications', saved);
  const [status, setStatus] = useState<DesktopNotificationStatus>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const desktop = desktopPlatform() !== null;
  const dirty = (Object.keys(defaults) as (keyof Preferences)[]).some(
    (key) => saved[key] !== draft[key],
  );
  const disabled = busy || working;

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void desktopNotificationStatus().then(
      (value) => {
        if (active) setStatus(value);
      },
      (cause) => {
        if (active) setError(errorMessage(cause));
      },
    );
    return () => {
      active = false;
    };
  }, [desktop]);

  const operation = async (action: () => Promise<void>) => {
    if (disabled) return;
    setWorking(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section aria-label="系统通知设置">
      <p className="sp-help">
        Windows、macOS 和 Linux 桌面应用均支持系统通知，最小化到托盘后仍会提醒。
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void operation(async () => {
            if (await onSave({ notifications: draft }, '通知设置已保存'))
              setNotice('通知设置已保存并立即生效');
          });
        }}
      >
        <label className="sp-setting-row">
          <div>
            <strong>启用系统通知</strong>
            <p>控制所有系统通知；应用内进度和执行记录继续保留。</p>
          </div>
          <input
            type="checkbox"
            checked={draft.enabled}
            disabled={disabled}
            onChange={(event) => setDraft((value) => ({ ...value, enabled: event.target.checked }))}
          />
        </label>
        {categories.map(([key, label, description]) => (
          <label className="sp-setting-row" key={key}>
            <div>
              <strong>{label}</strong>
              <p>{description}</p>
            </div>
            <input
              type="checkbox"
              checked={draft[key]}
              disabled={disabled || !draft.enabled}
              onChange={(event) => setDraft((value) => ({ ...value, [key]: event.target.checked }))}
            />
          </label>
        ))}
        <button className="button primary" type="submit" disabled={disabled || !dirty}>
          保存通知设置
        </button>
      </form>
      <div className="sp-setting-row">
        <div>
          <strong>系统通知状态</strong>
          <p>
            {!desktop
              ? '仅桌面应用可用'
              : !status
                ? '正在检查…'
                : status.permission === 'granted'
                  ? '通知通道可用'
                  : status.permission === 'denied'
                    ? '通知通道未授权'
                    : '需要启用通知通道'}
          </p>
        </div>
        <button
          className="button secondary"
          type="button"
          disabled={disabled || !desktop}
          onClick={() =>
            void operation(async () => {
              setStatus(await desktopNotificationStatus(true));
            })
          }
        >
          检查并启用通知通道
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={
            disabled || !desktop || !saved.enabled || dirty || status?.permission !== 'granted'
          }
          onClick={() =>
            void operation(async () => {
              await sendTestNotification();
              setNotice('测试通知已提交给系统，请检查桌面通知');
            })
          }
        >
          发送测试通知
        </button>
      </div>
      <p className="sp-help">
        系统通知设置或勿扰模式可能阻止投递；通知通道可用不代表系统一定展示。未收到测试通知时，请在系统设置中允许
        Maa Verge 发送通知。
      </p>
      <p className="sp-help">
        定时系统通知还需在定时计划中开启「定时前通知」。执行结束仅表示核心流程结束，游戏结果以执行记录中的证据为准。
      </p>
      {notice && (
        <p className="sp-help" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="sp-help" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
