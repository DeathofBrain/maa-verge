import { useEffect, useState } from 'react';
import { errorMessage, rpc, type RpcResult, type Settings } from '@maaverge/contracts';
import { useSettingsDraft } from './settings-draft';
import './copilot-library-actions.css';

type Props = {
  settings: Settings;
  busy: boolean;
  onSave: (patch: Partial<Settings>, message?: string) => Promise<boolean>;
};

export default function CopilotStorageSettings({ settings, busy, onSave }: Props) {
  const saved = settings.copilotStorage ?? { directory: '', deleteJsonFiles: false };
  const [draft, setDraft, reset] = useSettingsDraft('copilot-storage', saved);
  const [info, setInfo] = useState<RpcResult<'copilot.storage.info'>>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const dirty =
    draft.directory !== saved.directory || draft.deleteJsonFiles !== saved.deleteJsonFiles;
  const disabled = busy || saving;

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

  const save = async () => {
    if (disabled) return;
    setSaving(true);
    try {
      if (await onSave({ copilotStorage: draft }, '作业存储与删除设置已保存')) {
        const snapshot = await rpc('app.snapshot', {});
        setDraft(snapshot.settings.copilotStorage ?? { directory: '', deleteJsonFiles: false });
        setRevision((value) => value + 1);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="作业存储与删除">
      <h3>作业存储与删除</h3>
      <form
        className="sp-model-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="sp-field">
          作业 JSON 存放目录
          <input
            className="text-input"
            aria-label="作业 JSON 存放目录"
            value={draft.directory}
            placeholder={info?.directory ?? '留空使用程序目录下的 cache/copilot'}
            disabled={disabled}
            onChange={(event) => setDraft((value) => ({ ...value, directory: event.target.value }))}
          />
        </label>
        <p className="sp-help">
          默认存放在程序目录下的
          cache/copilot。自定义目录请填写完整的绝对路径；留空恢复默认。更改目录用于后续导入，已有文件保留在原位置。
        </p>
        <dl className="sp-description-list">
          <div>
            <dt>当前存放目录</dt>
            <dd>{info?.directory ?? (error ? '读取失败' : '正在读取…')}</dd>
          </div>
        </dl>
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
        <label className="cp-delete-check">
          <input
            type="checkbox"
            checked={draft.deleteJsonFiles}
            disabled={disabled}
            onChange={(event) =>
              setDraft((value) => ({ ...value, deleteJsonFiles: event.target.checked }))
            }
          />
          删除作业时同时删除 JSON 文件
        </label>
        <p className="sp-help">
          默认保留 JSON。启用后，删除单份、所选、分类内或全部作业时，同时删除应用保存的对应
          JSON；你导入的原始文件保留。
        </p>
        <div className="sp-form-actions">
          <span className="sp-help">{dirty ? '有未保存的修改' : '已保存'}</span>
          <button
            type="button"
            className="button secondary"
            disabled={disabled || !draft.directory}
            onClick={() => setDraft((value) => ({ ...value, directory: '' }))}
          >
            恢复默认目录
          </button>
          <button
            type="button"
            className="button secondary"
            aria-label="放弃作业设置修改"
            disabled={disabled || !dirty}
            onClick={reset}
          >
            放弃修改
          </button>
          <button type="submit" className="button primary" disabled={disabled || !dirty}>
            保存作业设置
          </button>
        </div>
      </form>
    </section>
  );
}
