import { useEffect, useState } from 'react';
import {
  errorMessage,
  getConfigurationLocations,
  openConfigurationDirectory,
  saveConfigurationDirectory,
  type ConfigurationLocations,
} from '@maaverge/contracts';
import { useSettingsDraft } from './settings-draft';

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
    <div className="sp-component-path">
      <h3>配置文件</h3>
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
    </div>
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
  const [draft, setDraft, reset] = useSettingsDraft('configuration-directory', {
    directory: locations.configuredDirectory || '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const disabled = busy || pending;
  const dirty = draft.directory !== (locations.configuredDirectory || '');
  const save = async (directory: string) => {
    setPending(true);
    setError('');
    setMessage('');
    try {
      const result = await saveConfigurationDirectory(directory);
      onSaved(result);
      setDraft({ directory: result.configuredDirectory || '' });
      setMessage(
        result.restartRequired
          ? '配置目录已保存。请完全退出 Maa Verge 后重新打开，新目录才会生效。'
          : '配置目录设置已保存。',
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };
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
  return (
    <form
      aria-label="配置目录设置"
      onSubmit={(event) => {
        event.preventDefault();
        void save(draft.directory);
      }}
    >
      <dl className="sp-description-list">
        <div>
          <dt>当前配置目录</dt>
          <dd>{locations.directory}</dd>
        </div>
        <div>
          <dt>配置与业务数据库</dt>
          <dd>{locations.database}</dd>
        </div>
        <div>
          <dt>配置目录设置文件</dt>
          <dd>{locations.selectorFile}</dd>
        </div>
        {locations.restartRequired && (
          <div>
            <dt>重启后使用</dt>
            <dd>{locations.nextDirectory}</dd>
          </div>
        )}
      </dl>
      <button
        className="button secondary"
        type="button"
        disabled={disabled}
        onClick={() => void open()}
      >
        打开当前配置目录
      </button>
      <label className="sp-field">
        配置目录（重启后生效）
        <input
          className="text-input"
          aria-label="配置目录"
          value={draft.directory}
          placeholder={locations.defaultDirectory}
          disabled={disabled || locations.overridden}
          onChange={(event) => setDraft({ directory: event.target.value })}
        />
      </label>
      <p className="sp-help">
        留空使用默认目录。切换后读取目标目录已有配置；空目录会创建新的配置和记录。原目录保留，文件不会自动搬移。
      </p>
      <p className="sp-help">
        备份配置前请完全退出应用，保留整个配置目录。MaaCore、游戏资源和自定义作业目录分别管理。
      </p>
      {locations.overridden && (
        <p className="sp-help" role="status">
          当前目录由
          {locations.source === 'environment' ? ' MAAVERGE_DATA_DIR 环境变量' : '定时启动参数'}
          指定。移除该覆盖并重新启动后，才能在此修改。
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="sp-form-actions">
        <button
          className="button secondary"
          type="button"
          disabled={disabled || locations.overridden || !locations.configuredDirectory}
          onClick={() => void save('')}
        >
          恢复默认配置目录
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={disabled || !dirty}
          onClick={reset}
        >
          放弃修改
        </button>
        <button
          className="button primary"
          type="submit"
          disabled={disabled || locations.overridden || !dirty}
        >
          保存配置目录
        </button>
      </div>
    </form>
  );
}
