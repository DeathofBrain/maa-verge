import { useEffect, useState } from 'react';
import type { Settings } from '@maaverge/contracts';

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
  const fingerprint = JSON.stringify(saved);
  // Keep an unsaved credential in memory; do not cache it in browser storage.
  const [draft, setDraft] = useState({ base: fingerprint, value: saved });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft((current) =>
      JSON.stringify(current.value) === current.base ||
      JSON.stringify(current.value) === fingerprint
        ? { base: fingerprint, value: saved }
        : current,
    );
  }, [fingerprint]);
  const dirty = JSON.stringify(draft.value) !== fingerprint;
  const disabled = busy || saving;
  const update = (patch: Partial<Preferences>) =>
    setDraft((current) => ({ ...current, value: { ...current.value, ...patch } }));
  return (
    <section className="sp-section" aria-label="Mirror酱设置">
      <div className="sp-section-title">
        <h2>Mirror酱</h2>
        <p>Maa Verge、MaaCore 和 MaaResource 共用一个 CDK，分别检查和更新。</p>
      </div>
      <p className="sp-help">
        Mirror酱是独立运营的分发服务，用户端高速下载需要购买有效 CDK。Maa Verge
        本身免费开源，官方免费更新来源继续可用。
      </p>
      <form
        className="sp-model-form"
        aria-label="Mirror酱配置"
        onSubmit={async (event) => {
          event.preventDefault();
          if (disabled || !dirty) return;
          setSaving(true);
          try {
            const next = { ...draft.value, cdk: draft.value.cdk.trim() };
            if (await onSave({ mirrorChyan: next }, 'Mirror酱设置已保存'))
              setDraft({ base: JSON.stringify(next), value: next });
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="sp-setting-row">
          <div>
            <strong>使用 Mirror酱</strong>
            <p>优先检查镜像；未填写 CDK、当前平台无包或服务不可用时使用官方来源。</p>
          </div>
          <button
            type="button"
            className={`toggle ${draft.value.enabled ? 'on' : ''}`}
            role="switch"
            aria-label="使用 Mirror酱"
            aria-checked={draft.value.enabled}
            disabled={disabled}
            onClick={() => update({ enabled: !draft.value.enabled })}
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
            value={draft.value.cdk}
            disabled={disabled}
            placeholder="选填，购买后在此填写"
            onChange={(event) => update({ cdk: event.target.value })}
          />
        </label>
        <p className="sp-help">
          CDK 保存在本机当前配置目录，检查和下载时发送给
          Mirror酱。请勿分享；诊断日志会脱敏。留空仍可检查版本并使用官方免费下载。
        </p>
        <div className="sp-form-actions">
          <a
            href="https://mirrorchyan.com?source=maa_verge_settings"
            target="_blank"
            rel="noopener noreferrer"
          >
            Mirror酱官网与 CDK
          </a>
          {dirty && (
            <button
              className="button secondary"
              type="button"
              disabled={disabled}
              onClick={() => setDraft({ base: fingerprint, value: saved })}
            >
              放弃修改
            </button>
          )}
          <button className="button primary" type="submit" disabled={disabled || !dirty}>
            保存 Mirror酱设置
          </button>
        </div>
      </form>
      <dl className="sp-description-list">
        <div>
          <dt>Maa Verge 应用</dt>
          <dd>使用本项目的分发版本，保留应用更新签名校验；不适配的安装包使用官方更新来源。</dd>
        </div>
        <div>
          <dt>MaaCore 核心</dt>
          <dd>对应 MAA 的核心分发，按系统和架构选择；验证后在设备空闲时生效。</dd>
        </div>
        <div>
          <dt>MaaResource 游戏资源</dt>
          <dd>对应独立资源分发，单独检查版本；核心版本相同也会检查资源更新。</dd>
        </div>
      </dl>
    </section>
  );
}
