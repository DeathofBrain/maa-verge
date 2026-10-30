import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import {
  desktopNotificationStatus,
  desktopPlatform,
  errorMessage,
  sendTestNotification,
  type NotificationSettings as Preferences,
  type DesktopNotificationStatus,
  type Settings,
} from '@maaverge/contracts';
import { useAutoSaveDraft } from './settings-autosave';
import './notification-settings.css';

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
  ['runResults', '执行结果通知'],
  ['deviceErrors', '目标实例未就绪通知'],
  ['updates', '更新结果通知'],
  ['schedules', '定时系统通知'],
] as const;

export default function NotificationSettings({ settings, busy, onSave }: Props) {
  const saved = settings.notifications ?? defaults;
  const {
    draft,
    setDraft,
    status: saveStatus,
    retry,
  } = useAutoSaveDraft('system-notifications', saved, (next) => onSave({ notifications: next }));
  const [channelStatus, setChannelStatus] = useState<DesktopNotificationStatus>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const desktop = desktopPlatform() !== null;
  const disabled = busy || working;
  const channelState = !desktop ? 'unavailable' : (channelStatus?.permission ?? 'checking');
  const channelLabel = !desktop
    ? '仅桌面应用可用'
    : !channelStatus
      ? '正在检查…'
      : channelStatus.permission === 'granted'
        ? '通知通道可用'
        : channelStatus.permission === 'denied'
          ? '通知通道未授权'
          : '需要启用通知通道';

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void desktopNotificationStatus().then(
      (value) => {
        if (active) setChannelStatus(value);
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
    <section className="notification-settings" aria-label="系统通知设置">
      <form className="notification-settings-form" onSubmit={(event) => event.preventDefault()}>
        <div className="notification-master">
          <span className="notification-master-icon" aria-hidden="true">
            <Bell size={20} />
          </span>
          <div className="notification-copy">
            <strong id="notification-master-label">启用系统通知</strong>
            <p id="notification-master-description">关闭后仍保留应用内提醒</p>
          </div>
          <button
            className="toggle notification-switch"
            type="button"
            role="switch"
            aria-labelledby="notification-master-label"
            aria-describedby="notification-master-description"
            aria-checked={draft.enabled}
            disabled={disabled}
            onClick={() => setDraft((value) => ({ ...value, enabled: !value.enabled }), 0)}
          />
        </div>
        <fieldset className="notification-categories" disabled={disabled || !draft.enabled}>
          <legend>通知类型</legend>
          {categories.map(([key, label]) => (
            <div className="notification-row" key={key}>
              <div className="notification-copy">
                <strong id={`notification-${key}-label`}>{label}</strong>
                {key === 'schedules' && (
                  <p id="notification-schedule-description">提前提醒需在定时计划中开启</p>
                )}
              </div>
              <button
                className="toggle notification-switch"
                type="button"
                role="switch"
                aria-labelledby={`notification-${key}-label`}
                aria-describedby={
                  key === 'schedules' ? 'notification-schedule-description' : undefined
                }
                aria-checked={draft[key]}
                onClick={() => setDraft((value) => ({ ...value, [key]: !value[key] }), 0)}
              />
            </div>
          ))}
        </fieldset>
        <div className="notification-channel">
          <strong>系统通知状态</strong>
          <span className="notification-channel-badge" data-state={channelState}>
            <span aria-hidden="true" />
            {channelLabel}
          </span>
        </div>
        <div className="notification-actions">
          <div className="notification-channel-actions">
            <button
              className="button secondary"
              type="button"
              disabled={disabled || !desktop}
              onClick={() =>
                void operation(async () => {
                  setChannelStatus(await desktopNotificationStatus(true));
                })
              }
            >
              检查通知权限
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={
                disabled ||
                !desktop ||
                !saved.enabled ||
                saveStatus !== 'saved' ||
                channelStatus?.permission !== 'granted'
              }
              onClick={() =>
                void operation(async () => {
                  await sendTestNotification();
                  setNotice('测试通知已提交给系统；未收到时请检查系统通知设置或勿扰模式');
                })
              }
            >
              发送测试通知
            </button>
          </div>
          <span className="settings-save-status" aria-live="polite">
            {saveStatus === 'saved' ? '' : saveStatus === 'error' ? '保存失败' : '正在保存…'}
            {saveStatus === 'error' && (
              <button
                className="settings-retry"
                type="button"
                disabled={disabled}
                onClick={() => void retry()}
              >
                重试
              </button>
            )}
          </span>
        </div>
      </form>
      {notice && (
        <p className="notification-feedback" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="notification-feedback" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
