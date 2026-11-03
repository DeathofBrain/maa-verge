import type { Settings } from '@maaverge/contracts';
import NumberField from '@/kit/NumberField';
import Select from '@/kit/Select';
import TextField from '@/kit/TextField';

type FrameworkConnection = NonNullable<NonNullable<Settings['connection']>['framework']>;
type Emulator = { emulatorPath: string; instanceIndex: number };
type Props = {
  connection: FrameworkConnection | undefined;
  disabled?: boolean;
  onChange: (connection: FrameworkConnection) => void;
};

const defaultConnection: FrameworkConnection = {
  touchMode: 'maatouch',
  capture: { method: 'auto', emulatorPath: '', instanceIndex: 0 },
};

export default function FrameworkConnectionFields({
  connection,
  disabled = false,
  onChange,
}: Props) {
  const value = {
    ...defaultConnection,
    ...connection,
    capture: { ...defaultConnection.capture, ...connection?.capture },
  };
  const touchExtras = value.touchExtras ?? { emulatorPath: '', instanceIndex: 0 };
  return (
    <div className="sp-connection-form" role="group" aria-label="MaaFramework 连接设置">
      <div className="sp-section-title">
        <h3>MaaFramework 连接设置</h3>
        <p>用于设备连接、任务执行与 Debug，保存后在下次连接时生效。</p>
      </div>
      <label className="sp-field">
        MaaFramework 触控模式
        <Select
          aria-label="MaaFramework 触控模式"
          value={value.touchMode}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              touchMode: event.target.value as FrameworkConnection['touchMode'],
            })
          }
        >
          <option value="maatouch">MaaTouch（默认）</option>
          <option value="minitouch">Minitouch + ADB 按键</option>
          <option value="adb">ADB Shell</option>
          <option value="emulator-extras">模拟器增强触控（MuMu）</option>
        </Select>
        <span className="sp-help">触控模式与截图增强独立配置，自动识别截图不会改变触控模式。</span>
      </label>
      {value.touchMode === 'emulator-extras' && (
        <EmulatorFields
          purpose="触控"
          emulator={touchExtras}
          disabled={disabled}
          onChange={(touchExtras) => onChange({ ...value, touchExtras })}
        />
      )}
      <label className="sp-field">
        MaaFramework 截图增强
        <Select
          aria-label="MaaFramework 截图增强"
          value={value.capture.method}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              capture: {
                ...value.capture,
                method: event.target.value as FrameworkConnection['capture']['method'],
              },
            })
          }
        >
          <option value="auto">自动识别（推荐）</option>
          <option value="adb">ADB 默认截图</option>
          <option value="mumu">MuMu 增强截图</option>
          <option value="ldplayer">雷电增强截图</option>
          <option value="avd">AVD 增强截图</option>
        </Select>
        <span className="sp-help">
          {value.capture.method === 'auto'
            ? '连接时自动识别 MuMu、雷电与 AVD 增强截图；没有可用增强接口时使用 ADB 截图。'
            : value.capture.method === 'avd'
              ? '需要模拟器提供 AVD 增强接口，截图与触控分别选择。'
              : '截图选择单独生效，不会切换触控模式。'}
        </span>
        <span className="sp-help">MuMu、雷电增强接口仅支持相应的 Windows 模拟器。</span>
      </label>
      {(value.capture.method === 'mumu' || value.capture.method === 'ldplayer') && (
        <EmulatorFields
          purpose="截图"
          emulator={value.capture}
          disabled={disabled}
          onChange={(emulator) =>
            onChange({ ...value, capture: { ...value.capture, ...emulator } })
          }
        />
      )}
    </div>
  );
}

function EmulatorFields({
  purpose,
  emulator,
  disabled,
  onChange,
}: {
  purpose: '截图' | '触控';
  emulator: Emulator;
  disabled: boolean;
  onChange: (emulator: Emulator) => void;
}) {
  return (
    <div className="sp-capture-fields">
      <label className="sp-field">
        {purpose}模拟器安装目录
        <TextField
          aria-label={`MaaFramework ${purpose}模拟器安装目录`}
          value={emulator.emulatorPath}
          placeholder={purpose === '触控' ? '留空自动识别当前 MuMu 实例' : '填写模拟器安装根目录'}
          maxLength={4096}
          required={purpose === '截图'}
          pattern={purpose === '截图' ? '.*\\S.*' : undefined}
          disabled={disabled}
          onChange={(event) => onChange({ ...emulator, emulatorPath: event.target.value })}
        />
        {purpose === '触控' && (
          <span className="sp-help">留空时自动识别当前 MuMu 实例的安装目录与索引。</span>
        )}
      </label>
      <label className="sp-field">
        {purpose}模拟器实例索引
        <NumberField
          aria-label={`MaaFramework ${purpose}模拟器实例索引`}
          value={emulator.instanceIndex}
          min={0}
          max={65535}
          step={1}
          required
          disabled={disabled}
          onChange={(event) => onChange({ ...emulator, instanceIndex: Number(event.target.value) })}
        />
      </label>
    </div>
  );
}
