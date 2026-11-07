import TextField from '@/kit/TextField';
import { useEffect, useRef, useState } from 'react';
import { errorMessage, rpc, type AgentCredentialStatus, type Settings } from '@maaverge/contracts';
import Button from '@/kit/Button';
import Select from '@/kit/Select';
import ErrorBanner from '@/kit/ErrorBanner';
import NumberField from '@/kit/NumberField';
import StatusPill from '@/kit/StatusPill';
import { useSettingsDraft } from '@/shared/lib/settings-draft';

type Props = {
  settings: Settings;
  busy: boolean;
  onSave: (
    model: Settings['model'],
    credential?: { secret: string; storage: 'keychain' | 'session' },
  ) => Promise<boolean>;
};

// 普通模型配置可恢复草稿，密钥仅留在组件内存，显式保存时才交给凭据接口。
export default function ModelSettings({ settings, busy, onSave }: Props) {
  const [credential, setCredential] = useState<AgentCredentialStatus>();
  const [secret, setSecret] = useState('');
  const [storage, setStorage] = useState<'keychain' | 'session'>('keychain');
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const mounted = useRef(false);
  const [saveError, setSaveError] = useState('');
  const [credentialError, setCredentialError] = useState('');
  const credentialRequest = useRef(0);
  const [draft, setDraft] = useSettingsDraft('model', settings.model);
  const canStoreCredential =
    settings.model.provider !== 'none' &&
    [settings.model.provider, settings.model.baseUrl, settings.model.model].every(
      (value) => !!value.trim(),
    );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const generation = ++credentialRequest.current;
    setCredential(undefined);
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
  const deleteCredential = async () => {
    if (
      busy ||
      saving ||
      credentialBusy ||
      !canStoreCredential ||
      !modelSaved ||
      !currentCredential?.configured
    )
      return;
    const generation = ++credentialRequest.current;
    setCredentialBusy(true);
    setCredentialError('');
    try {
      const value = await rpc('model.credential.delete', {});
      if (generation === credentialRequest.current) {
        setCredential(value);
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
      if (mounted.current) setCredentialBusy(false);
    }
  };
  const modelSaved = JSON.stringify(draft) === JSON.stringify(settings.model);
  const connectionSaved = (['provider', 'baseUrl', 'model'] as const).every(
    (field) => draft[field] === settings.model[field],
  );
  const currentCredential = connectionSaved && canStoreCredential ? credential : undefined;
  const canSaveCredential =
    draft.provider.trim().toLowerCase() !== 'none' &&
    [draft.provider, draft.baseUrl, draft.model].every((value) => !!value.trim());
  const validAddress = (() => {
    if (!draft.baseUrl) return true;
    try {
      new URL(draft.baseUrl);
      return true;
    } catch {
      return false;
    }
  })();
  const formBusy = busy || saving || credentialBusy;
  const canSave =
    validAddress &&
    (!modelSaved || !!secret.trim()) &&
    (!secret || (!!secret.trim() && canSaveCredential));
  const saveConfiguration = async () => {
    if (formBusy || saveInFlight.current || !canSave) return;
    saveInFlight.current = true;
    setSaving(true);
    setSaveError('');
    setCredentialError('');
    try {
      const saved = await onSave(draft, secret ? { secret, storage } : undefined);
      if (!mounted.current) return;
      if (!saved) {
        setSaveError('模型配置未全部保存，请重试。');
        return;
      }
      // Only a successful explicit save clears the secret, regardless of status refreshes.
      setSecret('');
      const generation = ++credentialRequest.current;
      if (canSaveCredential) {
        try {
          const value = await rpc('model.credential.status', {});
          if (generation === credentialRequest.current) setCredential(value);
        } catch (cause) {
          if (generation === credentialRequest.current) setCredentialError(errorMessage(cause));
        }
      }
    } catch (cause) {
      if (mounted.current) setSaveError(errorMessage(cause));
    } finally {
      saveInFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  };

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
          void saveConfiguration();
        }}
      >
        <label className="sp-field">
          模型提供商
          <TextField
            aria-label="模型提供商"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="例如：openai-compatible"
            value={draft.provider}
            disabled={formBusy}
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
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://example.com/v1"
            value={draft.baseUrl}
            disabled={formBusy}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, baseUrl: event.target.value }))
            }
          />
        </label>
        <label className="sp-field">
          模型名称
          <TextField
            aria-label="模型名称"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="填写提供商支持的模型名称"
            value={draft.model}
            disabled={formBusy}
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
              disabled={formBusy}
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
        <label className="sp-field">
          API 密钥
          <TextField
            type="password"
            aria-label="模型 API 密钥"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={secret}
            maxLength={8192}
            disabled={formBusy}
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
            disabled={formBusy}
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
        {!connectionSaved && <p className="sp-help">连接配置尚未保存，点击「保存配置」后应用。</p>}
        {secret && (
          <p className="sp-help">
            密钥尚未保存；编辑连接配置会保留输入，点击「保存配置」后才会应用。
          </p>
        )}
        {credentialError && <ErrorBanner>{credentialError}</ErrorBanner>}
        {saveError && <ErrorBanner>{saveError}</ErrorBanner>}
        <div className="sp-form-actions">
          <Button variant="primary" type="submit" busy={saving} disabled={formBusy || !canSave}>
            保存配置
          </Button>
          <Button
            variant="danger"
            busy={credentialBusy}
            disabled={formBusy || !modelSaved || !currentCredential?.configured}
            onClick={() => void deleteCredential()}
          >
            删除密钥
          </Button>
          {currentCredential && !currentCredential.available && <span>系统凭据存储暂不可用</span>}
        </div>
      </form>
    </section>
  );
}
