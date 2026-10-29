import Select from './Select';
import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { Settings } from '@maaverge/contracts';
import { useSettingsDraft } from './settings-draft';
const captureLabels = {
  adb: 'ADB 默认截图',
  mumu: 'MuMu 增强截图',
  ldplayer: '雷电增强截图',
} as const;
function Section({
  title,
  children,
  description,
}: {
  title: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <section className="sp-section">
      <div className="sp-section-title">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="sp-notice">
      <Info size={17} />
      <div>{children}</div>
    </div>
  );
}
export function CaptureForm({
  settings,
  busy,
  onSave,
  draftKey = 'capture',
}: {
  settings: Settings;
  busy: boolean;
  onSave: (capture: NonNullable<Settings['capture']>) => Promise<boolean>;
  draftKey?: string;
}) {
  const saved: NonNullable<Settings['capture']> = settings.capture ?? {
    method: 'adb',
    emulatorPath: '',
    instanceIndex: 0,
  };
  const [draft, setDraft, resetDraft] = useSettingsDraft(draftKey, saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  return (
    <Section title="截图方式" description="保存后用于下一次连接；已连接设备继续使用当前截图方式。">
      <form
        className="sp-capture-form"
        onSubmit={(event) => {
          event.preventDefault();
          const capture = { ...draft, emulatorPath: draft.emulatorPath.trim() };
          void onSave(capture).then((saved) => {
            if (saved) setDraft(capture);
          });
        }}
      >
        <CaptureFields capture={draft} busy={busy} onChange={setDraft} />
        <p className="sp-help">
          保存后请先停止执行，再断开并重新连接设备。可在“实际截图方式”中核对本次连接确认的协议。
        </p>
        <div className="sp-form-actions">
          <span className="sp-help">{dirty ? '有未保存的修改' : '已保存'}</span>
          <button
            className="button secondary"
            type="button"
            disabled={busy || !dirty}
            onClick={resetDraft}
          >
            放弃修改
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            保存截图配置
          </button>
        </div>
      </form>
    </Section>
  );
}

export function CaptureFields({
  capture: draft,
  busy = false,
  onChange: setDraft,
}: {
  capture: NonNullable<Settings['capture']>;
  busy?: boolean;
  onChange: (
    update:
      | NonNullable<Settings['capture']>
      | ((previous: NonNullable<Settings['capture']>) => NonNullable<Settings['capture']>),
  ) => void;
}) {
  const automatic = draft.autoDetect ?? draft.method === 'adb';
  const enhanced = draft.method !== 'adb';
  return (
    <>
      <label className="sp-field">
        截图协议
        <Select
          className="text-input"
          aria-label="截图协议"
          value={automatic ? 'auto' : draft.method}
          disabled={busy}
          onChange={(event) => {
            const selected = event.target.value;
            setDraft((previous) => ({
              ...previous,
              method:
                selected === 'auto'
                  ? 'adb'
                  : (selected as NonNullable<Settings['capture']>['method']),
              autoDetect: selected === 'auto',
              mumuTouch: false,
              mumuBridge: false,
            }));
          }}
        >
          <option value="auto">自动识别（推荐）</option>
          {Object.entries(captureLabels).map(([method, label]) => (
            <option key={method} value={method}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      {automatic && (
        <Notice>
          {enhanced
            ? `已自动识别：${captureLabels[draft.method]}。安装目录和实例编号由连接的模拟器提供，重新连接时会再次核对。`
            : '连接时自动识别 MuMu、雷电等模拟器的增强截图能力，并为每个多开实例配置对应目录和编号。其他设备使用 ADB 截图。'}
        </Notice>
      )}
      {enhanced && (
        <>
          {!automatic && (
            <Notice>
              增强截图使用模拟器提供的快速接口，仅支持相应的 Windows
              模拟器。连接时若增强接口不可用，将明确报错，不会自动改用 ADB 截图。
            </Notice>
          )}
          <div className="sp-capture-fields">
            <label className="sp-field">
              模拟器安装目录
              <input
                className="text-input"
                aria-label="模拟器安装目录"
                placeholder="填写模拟器安装根目录"
                value={draft.emulatorPath}
                disabled={busy}
                required={!automatic}
                readOnly={automatic}
                pattern={automatic ? undefined : '.*\\S.*'}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, emulatorPath: event.target.value }))
                }
              />
              <span className="sp-help">
                {automatic
                  ? '已识别的模拟器安装根目录。选择手动截图协议可编辑。'
                  : '使用模拟器的安装根目录，不是 ADB 可执行文件路径。'}
              </span>
            </label>
            <label className="sp-field">
              模拟器实例索引
              <input
                className="text-input"
                type="number"
                aria-label="模拟器实例索引"
                min={0}
                step={1}
                required={!automatic}
                readOnly={automatic}
                value={draft.instanceIndex}
                disabled={busy}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    instanceIndex: Number(event.target.value),
                  }))
                }
              />
              <span className="sp-help">
                {automatic
                  ? '已识别的多开实例编号。每个实例独立配置。'
                  : '与模拟器多开管理器中的实例编号一致，首个实例通常为 0。'}
              </span>
            </label>
          </div>
        </>
      )}
      {draft.method === 'mumu' && !automatic && (
        <>
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.mumuTouch ?? false}
              disabled={busy}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, mumuTouch: event.target.checked }))
              }
            />
            启用 MuMu 触控增强（实验性）
          </label>
          <p className="sp-help">
            需 Windows x64 官方版 MuMu
            6.3.2+，支持后台保活；方舟专版与国际版暂不支持。核心在接口不可用时可能回退 Minitouch。
          </p>
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.mumuBridge ?? false}
              disabled={busy}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, mumuBridge: event.target.checked }))
              }
            />
            MuMu 网络桥接模式
          </label>
          <p className="sp-help">
            桥接模式使用手动连接地址与上方明确指定的本机 MuMu 实例索引。请核对截图来自预期实例。
          </p>
        </>
      )}
    </>
  );
}
