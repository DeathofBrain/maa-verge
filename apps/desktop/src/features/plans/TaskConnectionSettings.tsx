import Checkbox from '@/kit/Checkbox';
import Button from '@/kit/Button';
import TextField from '@/kit/TextField';
import ExternalLink from '@/kit/ExternalLink';
import Select from '@/kit/Select';
import { useState } from 'react';
import { errorMessage, rpc, type Settings, type ScreenFrame } from '@maaverge/contracts';
import { CaptureForm } from '@/features/settings/CaptureSettingsForm';
import { useSettingsDraft } from '@/shared/lib/settings-draft';
import '@/shared/styles/support-pages.css';

export const defaultConnectionSettings: NonNullable<Settings['connection']> = {
  adbPath: '',
  address: '',
  config: 'General',
  touchMode: 'maatouch',
  adbLite: false,
  clientType: 'Official',
};
const profiles = {
  General: '通用模式',
  BlueStacks: '蓝叠模拟器',
  MuMuEmulator12: 'MuMu 模拟器',
  MuMuArm: 'MuMu ARM',
  LDPlayer: '雷电模拟器',
  Nox: '夜神模拟器',
  XYAZ: '逍遥模拟器',
  Compatible: '兼容模式',
  SecondResolution: '第二分辨率',
  CompatMac: 'macOS 兼容模式',
  CompatPOSIXShell: 'POSIX Shell 兼容模式',
  Waydroid: 'Waydroid',
  AVD: 'Android 虚拟设备（AVD）',
  Androws: '腾讯应用宝',
  WSA: 'Windows 安卓子系统（WSA）',
} as const;

interface TaskConnectionSettingsProps {
  settings: Settings;
  onSaveSettings?: (settings: Settings) => Promise<boolean>;
  busy?: boolean;
  showAutomatic?: boolean;
  selectedDeviceId?: string;
  deviceProfileId?: string;
}

/** Remount on profile changes so unsaved drafts cannot cross instance boundaries. */
export function TaskConnectionSettings(props: TaskConnectionSettingsProps) {
  return <ConnectionSettingsBody key={props.deviceProfileId ?? 'default'} {...props} />;
}

function ConnectionSettingsBody({
  settings: globalSettings,
  onSaveSettings: saveGlobalSettings,
  busy = false,
  showAutomatic = true,
  selectedDeviceId,
  deviceProfileId,
}: TaskConnectionSettingsProps) {
  const profile = globalSettings.deviceProfiles?.find((item) => item.id === deviceProfileId);
  const settings = profile
    ? { ...globalSettings, connection: profile.connection, capture: profile.capture }
    : globalSettings;
  const onSaveSettings = saveGlobalSettings
    ? async (next: Settings) => {
        if (!profile) return saveGlobalSettings(next);
        return saveGlobalSettings({
          ...globalSettings,
          autoConnect: next.autoConnect,
          deviceProfiles: globalSettings.deviceProfiles?.map((item) =>
            item.id === profile.id
              ? {
                  ...item,
                  autoDetected: false,
                  connection: next.connection ?? item.connection,
                  address: next.connection?.address ?? item.address,
                  capture: next.capture ?? item.capture,
                }
              : item,
          ),
        });
      }
    : undefined;
  const saved = settings.connection ?? defaultConnectionSettings;
  const [draft, setDraft, reset] = useSettingsDraft(
    `connection${profile ? `:${profile.id}` : ''}`,
    saved,
  );
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState('');
  const [frame, setFrame] = useState<ScreenFrame>();
  const disabled = busy || pending || !onSaveSettings;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const patch = (value: Partial<typeof draft>) =>
    setDraft((previous) => ({ ...previous, ...value }));
  const save = async () => {
    if (!onSaveSettings) return false;
    const connection = { ...draft, adbPath: draft.adbPath.trim(), address: draft.address.trim() };
    const ok = await onSaveSettings({ ...settings, connection });
    if (ok) setDraft(connection);
    return ok;
  };
  const operate = async (action: () => Promise<void>) => {
    setPending(true);
    setResult('');
    try {
      await action();
    } catch (error) {
      setResult(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="task-connection-settings">
      <section className="sp-section">
        <div className="sp-section-title">
          <h2>连接与触控设置</h2>
          <p>
            {profile
              ? `当前实例：${profile.name}。只修改此实例，重新连接后生效。`
              : '默认配置供没有独立配置的设备使用；多开实例使用各自的配置。保存后用于下一次连接。'}
          </p>
        </div>
        {showAutomatic && (
          <label className="check-field">
            <Checkbox
              checked={settings.autoConnect}
              disabled={disabled}
              onChange={(event) =>
                void onSaveSettings?.({ ...settings, autoConnect: event.target.checked })
              }
            />
            自动检测连接
          </label>
        )}
        <form
          className="sp-connection-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <ConnectionFields
            connection={draft}
            onChange={patch}
            disabled={disabled}
            addressRequired={!!profile}
          />
          <div className="sp-form-actions">
            <span className="sp-help">{dirty ? '有未保存的修改' : '已保存'}</span>
            <Button type="button" disabled={disabled || !dirty} onClick={reset}>
              放弃修改
            </Button>
            <Button variant="primary" type="submit" disabled={disabled}>
              保存连接配置
            </Button>
          </div>
        </form>
        <div className="sp-form-actions">
          <Button
            type="button"
            disabled={disabled || !draft.address.trim()}
            onClick={() =>
              void operate(async () => {
                if (!(await save())) return;
                const device = await rpc('device.connect', { address: draft.address.trim() });
                setResult(`已提交连接：${device.address}，连接完成后可进行截图测试。`);
              })
            }
          >
            连接此地址
          </Button>
          <Button
            type="button"
            disabled={busy || pending || dirty}
            onClick={() =>
              void operate(async () => {
                const snapshot = await rpc('app.snapshot', {});
                const device = snapshot.devices.find(
                  (item) =>
                    item.state !== 'offline' &&
                    (selectedDeviceId !== undefined
                      ? item.id === selectedDeviceId
                      : !saved.address || item.address === saved.address),
                );
                if (!device) throw new Error('请先连接需要测试的设备');
                const image = await rpc('device.frame', { deviceId: device.id });
                setFrame(image);
                setResult(
                  `截图成功（${device.address}）：${image.width} × ${image.height}，耗时 ${image.latencyMs} ms（${device.captureMethod || '等待核心确认截图方式'}）`,
                );
              })
            }
          >
            截图测试
          </Button>
        </div>
        {result && (
          <p className="sp-help" role="status">
            {result}
          </p>
        )}
        {frame && (
          <img
            src={`data:${frame.mimeType};base64,${frame.data}`}
            alt="连接截图测试结果"
            style={{ maxWidth: '100%', height: 'auto', marginTop: 12 }}
          />
        )}
      </section>
      <CaptureForm
        settings={settings}
        busy={disabled}
        draftKey={`capture${profile ? `:${profile.id}` : ''}`}
        onSave={(capture) =>
          onSaveSettings ? onSaveSettings({ ...settings, capture }) : Promise.resolve(false)
        }
      />
      <p className="sp-help">
        <ExternalLink href="https://docs.maa.plus/zh-cn/manual/connection.html">
          原版 MAA 连接设置说明
        </ExternalLink>
      </p>
    </div>
  );
}

export function ConnectionFields({
  connection: draft,
  onChange: patch,
  disabled = false,
  addressRequired = false,
}: {
  connection: NonNullable<Settings['connection']>;
  onChange: (value: Partial<NonNullable<Settings['connection']>>) => void;
  disabled?: boolean;
  addressRequired?: boolean;
}) {
  return (
    <>
      <label className="sp-field">
        连接配置
        <Select
          className="wb-parameter-control"
          aria-label="连接配置"
          value={draft.config}
          disabled={disabled}
          onChange={(event) => patch({ config: event.target.value as typeof draft.config })}
        >
          {Object.entries(profiles).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      <label className="sp-field">
        ADB 路径
        <TextField
          className="wb-parameter-control"
          aria-label="ADB 路径"
          value={draft.adbPath}
          maxLength={4096}
          disabled={disabled}
          placeholder="留空自动查找，或填写 ADB 可执行文件的绝对路径"
          onChange={(event) => patch({ adbPath: event.target.value })}
        />
        <span className="sp-help">
          选择模拟器自带的 adb.exe、HD-Adb.exe 或系统
          platform-tools；留空时也会使用已配置的环境变量。
        </span>
      </label>
      <label className="sp-field">
        连接地址
        <TextField
          className="wb-parameter-control"
          aria-label="连接地址"
          value={draft.address}
          maxLength={128}
          required={addressRequired}
          disabled={disabled}
          placeholder="127.0.0.1:16384 或 emulator-5554"
          onChange={(event) => patch({ address: event.target.value })}
        />
        <span className="sp-help">此地址用于手动连接；已保存实例也会按该地址自动连接。</span>
      </label>
      <label className="sp-field">
        触控模式
        <Select
          className="wb-parameter-control"
          aria-label="触控模式"
          value={draft.touchMode}
          disabled={disabled}
          onChange={(event) => patch({ touchMode: event.target.value as typeof draft.touchMode })}
        >
          <option value="minitouch">Minitouch</option>
          <option value="maatouch">MaaTouch（默认）</option>
          <option value="adb">ADB Input（兼容模式）</option>
          <option value="MaaFwAdb">MaaFwAdb（实验性）</option>
        </Select>
        <span className="sp-help">
          ADB Input 滑动较慢；MaaFwAdb 不支持额外刹车滑动，配合 AVD 连接配置可使用 AVD 增强截图。
        </span>
      </label>
      {(draft.config === 'Androws' || draft.config === 'WSA') && (
        <label className="sp-field">
          连接时的客户端
          <Select
            className="wb-parameter-control"
            aria-label="连接时的客户端"
            value={draft.clientType}
            disabled={disabled}
            onChange={(event) =>
              patch({ clientType: event.target.value as typeof draft.clientType })
            }
          >
            <option value="Official">官服</option>
            <option value="Bilibili">Bilibili 服</option>
            <option value="YoStarEN">国际服</option>
            <option value="YoStarJP">日服</option>
            <option value="YoStarKR">韩服</option>
            <option value="txwy">繁中服</option>
          </Select>
          <span className="sp-help">
            应用宝与 WSA 在连接时用游戏包名确定显示器，应与开始唤醒任务的客户端一致。
          </span>
        </label>
      )}
      <label className="check-field">
        <Checkbox
          checked={draft.adbLite}
          disabled={disabled}
          onChange={(event) => patch({ adbLite: event.target.checked })}
        />
        启用 ADB Lite
      </label>
    </>
  );
}
