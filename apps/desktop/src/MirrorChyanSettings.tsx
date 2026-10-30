import type { Settings } from '@maaverge/contracts';
import { useAutoSaveDraft } from './settings-autosave';

type Preferences = NonNullable<Settings['mirrorChyan']>;
export default function MirrorChyanSettings({
  settings,
  busy,
  onSave,
}: {
  settings: Settings;
  busy: boolean;
  onSave: (patch: Partial<Settings>, message?: string) => Promise<boolean>;
}) {
  const saved: Preferences = settings.mirrorChyan ?? { enabled: true, cdk: '' };
  // Keep an unsaved credential in memory; do not cache it in browser storage.
  const {
    draft,
    setDraft,
    flush,
    status: saveStatus,
    retry,
  } = useAutoSaveDraft(null, saved, (next) => onSave({ mirrorChyan: next }), {
    memoryKey: 'mirrorchyan',
    normalize: (value) => ({ ...value, cdk: value.cdk.trim() }),
  });
  return (
    <section className="sp-section settings-card" aria-label="Mirror酱设置">
      <div className="sp-section-title">
        <h2>Mirror酱</h2>
      </div>
      <p className="sp-help">
        Mirror酱高速下载需要购买有效 CDK。Maa Verge 免费开源，官方免费更新来源继续可用。
      </p>
      <form
        className="settings-form"
        aria-label="Mirror酱配置"
        onSubmit={(event) => {
          event.preventDefault();
          void flush();
        }}
      >
        <div className="sp-setting-row settings-master">
          <div>
            <strong>使用 Mirror酱</strong>
          </div>
          <button
            type="button"
            className={`toggle ${draft.enabled ? 'on' : ''}`}
            role="switch"
            aria-label="使用 Mirror酱"
            aria-checked={draft.enabled}
            disabled={busy}
            onClick={() => setDraft((value) => ({ ...value, enabled: !value.enabled }), 0)}
          >
            <i />
          </button>
        </div>
        <label className="sp-field">
          Mirror酱 CDK
          <input
            className="text-input"
            aria-label="Mirror酱 CDK"
            type="password"
            autoComplete="off"
            spellCheck={false}
            maxLength={256}
            value={draft.cdk}
            disabled={busy}
            placeholder="选填，购买后在此填写"
            onChange={(event) => setDraft((value) => ({ ...value, cdk: event.target.value }))}
            onBlur={() => void flush()}
          />
        </label>
        <p className="sp-help">CDK 保存在本机，检查和下载时发送给 Mirror酱，诊断日志会脱敏。</p>
        <div className="sp-form-actions settings-actions">
          <a
            href="https://mirrorchyan.com?source=maa_verge_settings"
            target="_blank"
            rel="noopener noreferrer"
          >
            Mirror酱官网与 CDK
          </a>
          <span className="settings-save-status" aria-live="polite">
            {saveStatus === 'saved'
              ? '已自动保存'
              : saveStatus === 'error'
                ? '保存失败'
                : '正在保存…'}
            {saveStatus === 'error' && (
              <button
                className="settings-retry"
                type="button"
                disabled={busy}
                onClick={() => void retry()}
              >
                重试
              </button>
            )}
          </span>
        </div>
      </form>
    </section>
  );
}
