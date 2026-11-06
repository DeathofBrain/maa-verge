import TextField from '@/kit/TextField';
import { useEffect, useRef, useState } from 'react';
import { errorMessage, rpc, type AgentCredentialStatus, type Settings } from '@maaverge/contracts';
import Button from '@/kit/Button';
import Select from '@/kit/Select';
import ErrorBanner from '@/kit/ErrorBanner';
import NumberField from '@/kit/NumberField';
import SaveStateIndicator from '@/kit/SaveStateIndicator';
import StatusPill from '@/kit/StatusPill';
import { useAutoSaveDraft } from '@/shared/lib/settings-autosave';

type Props = {
  settings: Settings;
  busy: boolean;
  onSave: (model: Settings['model']) => Promise<boolean>;
};

export default function ModelSettings({ settings, busy, onSave }: Props) {
  const [credential, setCredential] = useState<AgentCredentialStatus>();
  const [secret, setSecret] = useState('');
  const [storage, setStorage] = useState<'keychain' | 'session'>('keychain');
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialError, setCredentialError] = useState('');
  const credentialRequest = useRef(0);
  const canStoreCredential =
    settings.model.provider !== 'none' &&
    [settings.model.provider, settings.model.baseUrl, settings.model.model].every(
      (value) => !!value.trim(),
    );
  useEffect(() => {
    const generation = ++credentialRequest.current;
    setCredential(undefined);
    setCredentialBusy(false);
    // Credential status follows the saved connection; the secret is an independent in-memory draft.
    setCredentialError('');
    if (canStoreCredential)
      void rpc('model.credential.status', {})
        .then((value) => {
          if (generation === credentialRequest.current) setCredential(value);
        })
        .catch((cause: unknown) => {
          if (generation === credentialRequest.current) setCredentialError(errorMessage(cause));
        });
    return () => {
      credentialRequest.current++;
    };
  }, [settings.model.provider, settings.model.baseUrl, settings.model.model]);
  const changeCredential = async (remove = false) => {
    if (
      busy ||
      credentialBusy ||
      !canStoreCredential ||
      !modelSaved ||
      (remove ? !currentCredential?.configured : !secret.trim())
    )
      return;
    const generation = ++credentialRequest.current;
    setCredentialBusy(true);
    setCredentialError('');
    try {
      const value = remove
        ? await rpc('model.credential.delete', {})
        : await rpc('model.credential.set', { secret, storage });
      if (generation === credentialRequest.current) {
        setCredential(value);
        setSecret('');
      }
    } catch (cause) {
      if (generation === credentialRequest.current) {
        setCredentialError(errorMessage(cause));
        try {
          const value = await rpc('model.credential.status', {});
          if (generation === credentialRequest.current) setCredential(value);
        } catch {
          if (generation === credentialRequest.current) setCredential(undefined);
        }
      }
    } finally {
      if (generation === credentialRequest.current) setCredentialBusy(false);
    }
  };
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
  const modelSaved = JSON.stringify(draft) === JSON.stringify(settings.model);
  const connectionSaved = (['provider', 'baseUrl', 'model'] as const).every(
    (field) => draft[field] === settings.model[field],
  );
  const currentCredential = connectionSaved && canStoreCredential ? credential : undefined;

  return (
    <section className="settings-card" aria-label="模型配置">
      <div className="settings-card-heading">
        <h2>模型连接</h2>
        <StatusPill
          tone={currentCredential?.configured ? 'success' : 'neutral'}
          label={currentCredential?.configured ? '已配置凭据' : '待配置凭据'}
        />
      </div>
      <p className="sp-help">Agent 使用已保存的模型连接。保存配置和密钥不会发起模型请求。</p>
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
          <TextField
            aria-label="模型提供商"
            placeholder="例如：openai-compatible"
            value={draft.provider}
            disabled={busy || credentialBusy}
            onBlur={() => void flush()}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, provider: event.target.value }))
            }
          />
        </label>
        <label className="sp-field">
          API 地址
          <TextField
            type="url"
            aria-label="模型 API 地址"
            placeholder="https://example.com/v1"
            value={draft.baseUrl}
            disabled={busy || credentialBusy}
            onBlur={() => void flush()}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, baseUrl: event.target.value }))
            }
          />
        </label>
        <label className="sp-field">
          模型名称
          <TextField
            aria-label="模型名称"
            placeholder="填写提供商支持的模型名称"
            value={draft.model}
            disabled={busy || credentialBusy}
            onBlur={() => void flush()}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, model: event.target.value }))
            }
          />
        </label>
        {(
          [
            ['softCallReminder', '模型调用提醒（次）', 1000000, 1],
            ['softTokenReminder', 'Token 用量提醒', 1000000000, 1],
            ['inputPricePerMillion', '每百万输入 Token 单价', 1000000, 0.001],
            ['outputPricePerMillion', '每百万输出 Token 单价', 1000000, 0.001],
            ['softCostReminder', '费用估算提醒', 1000000000, 0.001],
          ] as const
        ).map(([field, label, maximum, step]) => (
          <label className="sp-field" key={field}>
            {label}
            <NumberField
              aria-label={label}
              min={0}
              max={maximum}
              step={step}
              value={draft[field] ?? ''}
              placeholder="选填"
              disabled={busy}
              onBlur={() => void flush()}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  [field]: event.target.value === '' ? undefined : Number(event.target.value),
                }))
              }
            />
          </label>
        ))}
        <p className="sp-help">
          提醒不自动停止任务。费用按你填写的单价估算，单位与提供商报价一致；未提供用量时会标记未知。
        </p>
        <SaveStateIndicator
          className="settings-save-state"
          status={status}
          onRetry={() => void retry()}
          retryDisabled={busy}
        />
      </form>
      <form
        className="sp-model-form settings-form"
        aria-label="模型凭据设置"
        onSubmit={(event) => {
          event.preventDefault();
          void changeCredential();
        }}
      >
        <label className="sp-field">
          API 密钥
          <TextField
            type="password"
            aria-label="模型 API 密钥"
            autoComplete="off"
            spellCheck={false}
            value={secret}
            maxLength={8192}
            disabled={busy || credentialBusy}
            onChange={(event) => setSecret(event.target.value)}
            placeholder={
              currentCredential?.configured ? '已保存；输入新密钥以替换' : '输入模型 API 密钥'
            }
          />
        </label>
        <label className="sp-field">
          保存方式
          <Select
            aria-label="密钥保存方式"
            value={storage}
            disabled={busy || credentialBusy}
            onChange={(event) => setStorage(event.target.value as 'keychain' | 'session')}
          >
            <option value="keychain">系统凭据存储</option>
            <option value="session">仅本次桌面会话</option>
          </Select>
        </label>
        <p className="sp-help">
          {currentCredential?.configured
            ? currentCredential.storage === 'session'
              ? '本次使用临时密钥；退出后恢复系统已存密钥（如有）。'
              : '密钥保存在系统凭据存储中。'
            : '密钥按当前提供商和 API 地址隔离。'}{' '}
          系统凭据存储不可用时，可明确选择仅本次桌面会话。
        </p>
        {!connectionSaved && (
          <p className="sp-help">连接配置尚未保存，保存后再管理该连接的凭据。</p>
        )}
        {secret && (
          <p className="sp-help">
            密钥尚未保存；编辑连接配置会保留输入，点击「保存密钥」后才会应用。
          </p>
        )}
        {credentialError && <ErrorBanner>{credentialError}</ErrorBanner>}
        <div className="sp-form-actions">
          <Button
            variant="primary"
            type="submit"
            busy={credentialBusy}
            disabled={
              busy || credentialBusy || !canStoreCredential || !secret.trim() || !modelSaved
            }
          >
            保存密钥
          </Button>
          <Button
            variant="danger"
            disabled={busy || credentialBusy || !modelSaved || !currentCredential?.configured}
            onClick={() => void changeCredential(true)}
          >
            删除密钥
          </Button>
          {currentCredential && !currentCredential.available && <span>系统凭据存储暂不可用</span>}
        </div>
      </form>
    </section>
  );
}
