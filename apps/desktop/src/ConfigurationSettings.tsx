import { useEffect, useState } from 'react';
import {
  errorMessage,
  getConfigurationLocations,
  openConfigurationDirectory,
  pickDirectory,
  saveConfigurationDirectory,
  type ConfigurationLocations,
} from '@maaverge/contracts';
import DirectoryPicker from './kit/DirectoryPicker';
import { autoSaveLabel, useAutoSaveDraft } from './settings-autosave';
import './data-settings.css';

export default function ConfigurationSettings({ busy }: { busy: boolean }) {
  const [locations, setLocations] = useState<ConfigurationLocations>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setLocations(await getConfigurationLocations());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let disposed = false;
    void getConfigurationLocations().then(
      (value) => {
        if (!disposed) {
          setLocations(value);
          setLoading(false);
        }
      },
      (cause) => {
        if (!disposed) {
          setError(errorMessage(cause));
          setLoading(false);
        }
      },
    );
    return () => {
      disposed = true;
    };
  }, []);
  return (
    <section className="settings-card data-configuration" aria-label="配置文件">
      <div className="data-settings-heading">
        <h3>配置文件</h3>
        <p className="sp-help">管理应用设置与执行记录的保存位置。</p>
      </div>
      {loading && <p className="sp-help">正在读取配置目录…</p>}
      {error && (
        <p className="sp-help" role="alert">
          {error}{' '}
          <button
            className="text-button"
            type="button"
            disabled={busy || loading}
            onClick={() => void refresh()}
          >
            重新读取配置目录
          </button>
        </p>
      )}
      {locations && (
        <ConfigurationForm locations={locations} busy={busy || loading} onSaved={setLocations} />
      )}
    </section>
  );
}

function ConfigurationForm({
  locations,
  busy,
  onSaved,
}: {
  locations: ConfigurationLocations;
  busy: boolean;
  onSaved: (value: ConfigurationLocations) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const { draft, setDraft, flush, status, retry } = useAutoSaveDraft(
    'configuration-directory',
    { directory: locations.configuredDirectory || '' },
    async (next) => {
      setError('');
      setMessage('');
      try {
        const result = await saveConfigurationDirectory(next.directory);
        onSaved(result);
        setMessage(
          result.restartRequired
            ? '配置目录已保存。请完全退出 Maa Verge 后重新打开，新目录才会生效。'
            : '配置目录设置已保存。',
        );
        return { directory: result.configuredDirectory || '' };
      } catch (cause) {
        setError(errorMessage(cause));
        return false;
      }
    },
    { normalize: (value) => ({ directory: value.directory.trim() }) },
  );
  const disabled = busy || pending || status === 'saving';
  const open = async () => {
    setPending(true);
    setError('');
    try {
      await openConfigurationDirectory();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };
  const choose = async () => {
    if (disabled || locations.overridden) return;
    setPending(true);
    setError('');
    try {
      const directory = await pickDirectory({
        defaultPath: draft.directory || locations.defaultDirectory,
      });
      if (directory !== null) setDraft({ directory }, 0);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      className="settings-form data-settings-form"
      aria-label="配置目录设置"
      onSubmit={(event) => {
        event.preventDefault();
        void flush();
      }}
    >
      <div className="data-settings-location">
        <div className="data-settings-location-copy">
          <span>当前配置目录</span>
          <code>{locations.directory}</code>
        </div>
        <button
          className="button secondary"
          type="button"
          disabled={disabled}
          onClick={() => void open()}
        >
          打开当前配置目录
        </button>
      </div>
      {locations.restartRequired && (
        <div className="data-settings-pending">
          <strong>重启后使用</strong>
          <code>{locations.nextDirectory}</code>
        </div>
      )}
      <div className="sp-field">
        <label htmlFor="configuration-directory-input">配置目录（重启后生效）</label>
        <DirectoryPicker
          className="data-settings-directory-picker"
          id="configuration-directory-input"
          label="选择配置目录"
          ariaLabel="配置目录"
          value={draft.directory}
          placeholder={locations.defaultDirectory}
          disabled={disabled || locations.overridden}
          onPick={() => void choose()}
        />
      </div>
      <p className="sp-help">重启后读取所选目录的配置；空目录会新建数据，原文件保留且不会搬移。</p>
      <details className="data-settings-details">
        <summary>存储详情与备份</summary>
        <dl className="sp-description-list">
          <div>
            <dt>配置与业务数据库</dt>
            <dd>{locations.database}</dd>
          </div>
          <div>
            <dt>配置目录设置文件</dt>
            <dd>{locations.selectorFile}</dd>
          </div>
        </dl>
        <p className="sp-help">
          备份前请完全退出应用并保留整个配置目录。核心、资源和自定义作业目录需分别备份。
        </p>
      </details>
      {locations.overridden && (
        <p className="sp-help" role="status">
          当前目录由
          {locations.source === 'environment' ? ' MAAVERGE_DATA_DIR 环境变量' : '定时启动参数'}
          指定。移除该覆盖并重新启动后，才能在此修改。
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="sp-form-actions settings-actions">
        <span className="sp-help">{autoSaveLabel(status)}</span>
        {status === 'error' && (
          <button className="button secondary" type="button" disabled={disabled} onClick={retry}>
            重试保存配置目录
          </button>
        )}
        <button
          className="button secondary"
          type="button"
          disabled={
            disabled || locations.overridden || (!locations.configuredDirectory && !draft.directory)
          }
          onClick={() => setDraft({ directory: '' }, 0)}
        >
          恢复默认配置目录
        </button>
      </div>
    </form>
  );
}
