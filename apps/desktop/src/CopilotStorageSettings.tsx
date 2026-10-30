import { useEffect, useState } from 'react';
import {
  errorMessage,
  pickDirectory,
  rpc,
  type RpcResult,
  type Settings,
} from '@maaverge/contracts';
import { autoSaveLabel, useAutoSaveDraft } from './settings-autosave';
import './copilot-library-actions.css';
import './data-settings.css';

type Props = {
  settings: Settings;
  busy: boolean;
  onSave: (patch: Partial<Settings>, message?: string) => Promise<boolean>;
};

export default function CopilotStorageSettings({ settings, busy, onSave }: Props) {
  const saved = settings.copilotStorage ?? { directory: '', deleteJsonFiles: false };
  const [info, setInfo] = useState<RpcResult<'copilot.storage.info'>>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const { draft, setDraft, flush, status, retry } = useAutoSaveDraft(
    'copilot-storage',
    saved,
    async (next) => {
      try {
        const completed = await onSave({ copilotStorage: next }, '');
        if (!completed) return false;
        const snapshot = await rpc('app.snapshot', {});
        setRevision((value) => value + 1);
        return snapshot.settings.copilotStorage ?? { directory: '', deleteJsonFiles: false };
      } catch (cause) {
        setError(errorMessage(cause));
        return false;
      }
    },
    { normalize: (value) => ({ ...value, directory: value.directory.trim() }) },
  );
  const disabled = busy || status === 'saving' || selecting;

  useEffect(() => {
    let active = true;
    setError('');
    void rpc('copilot.storage.info', {}).then(
      (value) => {
        if (active) setInfo(value);
      },
      (cause) => {
        if (active) setError(errorMessage(cause));
      },
    );
    return () => {
      active = false;
    };
  }, [saved.directory, revision]);

  const choose = async () => {
    if (disabled) return;
    setSelecting(true);
    setError('');
    try {
      const directory = await pickDirectory({ defaultPath: draft.directory || info?.directory });
      if (directory !== null) setDraft((value) => ({ ...value, directory }), 0);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSelecting(false);
    }
  };

  return (
    <section className="settings-card data-copilot-storage" aria-label="作业存储与删除">
      <div className="data-settings-heading">
        <h3>作业存储与删除</h3>
      </div>
      <form
        className="settings-form data-settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void flush();
        }}
      >
        <div className="sp-field">
          <label htmlFor="copilot-storage-directory-input">作业 JSON 存放目录</label>
          <div className="data-settings-directory-picker">
            <input
              id="copilot-storage-directory-input"
              className="text-input"
              aria-label="作业 JSON 存放目录"
              value={draft.directory}
              placeholder={info?.directory ?? '留空使用程序目录下的 cache/copilot'}
              disabled={disabled}
              readOnly
            />
            <button
              className="button secondary"
              type="button"
              disabled={disabled}
              onClick={() => void choose()}
            >
              选择作业目录
            </button>
          </div>
        </div>
        <p className="sp-help">所选目录仅用于后续导入，已有文件不会搬移。</p>
        <div className="data-settings-location">
          <div className="data-settings-location-copy">
            <span>当前存放目录</span>
            <code>{info?.directory ?? (error ? '读取失败' : '正在读取…')}</code>
          </div>
        </div>
        {error && (
          <p className="sp-help" role="alert">
            {error}
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => setRevision((value) => value + 1)}
            >
              重试
            </button>
          </p>
        )}
        <div className="data-settings-switch-row">
          <div>
            <strong id="copilot-delete-json-label">删除作业时同时删除 JSON 文件</strong>
            <p className="sp-help" id="copilot-delete-json-description">
              删除应用保存的作业文件，导入的原始文件保留。
            </p>
          </div>
          <button
            className="toggle"
            type="button"
            role="switch"
            aria-labelledby="copilot-delete-json-label"
            aria-describedby="copilot-delete-json-description"
            aria-checked={draft.deleteJsonFiles}
            disabled={disabled}
            onClick={() =>
              setDraft((value) => ({ ...value, deleteJsonFiles: !value.deleteJsonFiles }), 0)
            }
          />
        </div>
        <div className="sp-form-actions settings-actions">
          <span className="sp-help">{autoSaveLabel(status)}</span>
          {status === 'error' && (
            <button className="button secondary" type="button" disabled={disabled} onClick={retry}>
              重试保存作业设置
            </button>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={disabled || !draft.directory}
            onClick={() => setDraft((value) => ({ ...value, directory: '' }), 0)}
          >
            恢复默认目录
          </button>
        </div>
      </form>
    </section>
  );
}
