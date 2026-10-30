import type { Settings } from '@maaverge/contracts';
import SaveStateIndicator from './kit/SaveStateIndicator';
import StatusPill from './kit/StatusPill';
import { useAutoSaveDraft } from './settings-autosave';

type Props = {
  settings: Settings;
  busy: boolean;
  onSave: (model: Settings['model']) => Promise<boolean>;
};

export default function ModelSettings({ settings, busy, onSave }: Props) {
  const { draft, setDraft, flush, status, retry } = useAutoSaveDraft(
    'model',
    settings.model,
    onSave,
    {
      isValid: (value) => {
        if (!value.baseUrl) return true;
        try {
          new URL(value.baseUrl);
          return true;
        } catch {
          return false;
        }
      },
    },
  );

  return (
    <section className="settings-card" aria-label="模型配置">
      <div className="settings-card-heading">
        <h2>模型连接</h2>
        <StatusPill label="尚未接入" />
      </div>
      <p className="sp-help">当前 Agent 使用本地规则提案，云模型与自主托管尚未开放。</p>
      <form
        className="sp-model-form settings-form"
        aria-label="模型连接设置"
        onSubmit={(event) => {
          event.preventDefault();
          void flush();
        }}
      >
        <label className="sp-field">
          模型提供商
          <input
            className="text-input"
            aria-label="模型提供商"
            placeholder="例如：openai-compatible"
            value={draft.provider}
            disabled={busy}
            onBlur={() => void flush()}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, provider: event.target.value }))
            }
          />
        </label>
        <label className="sp-field">
          API 地址
          <input
            className="text-input"
            type="url"
            aria-label="模型 API 地址"
            placeholder="https://example.com/v1"
            value={draft.baseUrl}
            disabled={busy}
            onBlur={() => void flush()}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, baseUrl: event.target.value }))
            }
          />
        </label>
        <label className="sp-field">
          模型名称
          <input
            className="text-input"
            aria-label="模型名称"
            placeholder="填写提供商支持的模型名称"
            value={draft.model}
            disabled={busy}
            onBlur={() => void flush()}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, model: event.target.value }))
            }
          />
        </label>
        <p className="sp-help">API 密钥管理尚未开放；保存配置不会发起模型请求。</p>
        <SaveStateIndicator
          className="settings-save-state"
          status={status}
          onRetry={() => void retry()}
          retryDisabled={busy}
        />
      </form>
    </section>
  );
}
