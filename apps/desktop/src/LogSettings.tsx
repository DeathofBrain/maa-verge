import Select from './Select';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { acquireModalEffects } from './modal-effects';
import { Download, LoaderCircle, Trash2, X } from 'lucide-react';
import { errorMessage, rpc, type RpcResult, type Settings } from '@maaverge/contracts';
import { autoSaveLabel, useAutoSaveDraft } from './settings-autosave';
import './log-settings.css';
import './data-settings.css';

type Props = {
  settings: Settings;
  busy: boolean;
  onAction: (key: string, call: () => Promise<unknown>, success?: string) => Promise<boolean>;
  onSave: (patch: Partial<Settings>, message?: string) => Promise<boolean>;
};
type ResultDialog =
  | { kind: 'export'; result: RpcResult<'logs.export'> }
  | { kind: 'clean'; result: RpcResult<'logs.clean'> }
  | { kind: 'confirm' };
type Operation = 'export' | 'clean' | 'save';

function LogDialog({
  title,
  children,
  onClose,
  returnFocus,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const release = acquireModalEffects({
      panel: dialog,
      native: true,
      returnFocus: returnFocus.current,
    });
    return () => {
      dialog.close();
      release();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal log-settings-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-title">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭日志提示" disabled={busy} onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  return (
    warnings.length > 0 && (
      <div className="log-settings-warnings" role="status">
        <strong>部分日志未能处理</strong>
        <ul>
          {warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      </div>
    )
  );
}

export default function LogSettings({ settings, busy, onAction, onSave }: Props) {
  const [info, setInfo] = useState<RpcResult<'logs.info'>>();
  const [infoError, setInfoError] = useState('');
  const [infoRevision, setInfoRevision] = useState(0);
  const [dialog, setDialog] = useState<ResultDialog | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const operationRef = useRef<Operation | null>(null);
  const exportButton = useRef<HTMLButtonElement>(null);
  const cleanButton = useRef<HTMLButtonElement>(null);
  const { draft, setDraft, flush, status, retry } = useAutoSaveDraft(
    'log-retention',
    { days: settings.logRetentionDays ?? 7 },
    async (next) => {
      if (!begin('save')) return false;
      try {
        return await onSave({ logRetentionDays: next.days }, '');
      } finally {
        finish();
      }
    },
  );
  const disabled = busy || operation !== null || status === 'saving';

  useEffect(() => {
    let active = true;
    setInfoError('');
    void rpc('logs.info', {})
      .then((result) => {
        if (active) setInfo(result);
      })
      .catch((error: unknown) => {
        if (active) setInfoError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [infoRevision]);

  const begin = (next: Operation) => {
    if (busy || operationRef.current) return false;
    operationRef.current = next;
    setOperation(next);
    return true;
  };
  const finish = () => {
    operationRef.current = null;
    setOperation(null);
  };
  const exportLogs = async () => {
    if (!begin('export')) return;
    try {
      let result: RpcResult<'logs.export'> | undefined;
      const ok = await onAction('logs', async () => {
        result = await rpc('logs.export', {});
      });
      if (ok && result) setDialog({ kind: 'export', result });
    } finally {
      finish();
    }
  };
  const cleanLogs = async () => {
    if (!begin('clean')) return;
    setDialog(null);
    try {
      let result: RpcResult<'logs.clean'> | undefined;
      const ok = await onAction('logs', async () => {
        result = await rpc('logs.clean', {});
      });
      if (ok && result) setDialog({ kind: 'clean', result });
    } finally {
      finish();
    }
  };

  return (
    <section className="settings-card log-settings" aria-label="日志与诊断">
      <div className="data-settings-heading">
        <h3>日志与诊断</h3>
      </div>
      <form
        className="log-retention-form settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void flush();
        }}
      >
        <div className="sp-setting-row">
          <div>
            <label htmlFor="log-retention-days">
              <strong>自动清理日志</strong>
            </label>
            <p>每天清理过期日志，保留本次会话文件。</p>
          </div>
          <Select
            id="log-retention-days"
            className="text-input sp-inline-select"
            value={draft.days}
            disabled={disabled}
            onChange={(event) =>
              setDraft(
                { days: Number(event.target.value) as NonNullable<Settings['logRetentionDays']> },
                0,
              )
            }
          >
            <option value="0">关闭</option>
            <option value="7">保留 7 天</option>
            <option value="14">保留 14 天</option>
            <option value="30">保留 30 天</option>
          </Select>
        </div>
        <div className="sp-form-actions settings-actions">
          <span className="sp-help">{autoSaveLabel(status)}</span>
          {status === 'error' && (
            <button className="button secondary" type="button" disabled={disabled} onClick={retry}>
              重试保存日志设置
            </button>
          )}
        </div>
      </form>
      <div className="log-settings-diagnostics">
        <div>
          <strong>问题排查</strong>
          <p className="sp-help">导出本地服务、核心与事件日志，完成后显示保存位置。</p>
        </div>
        <div className="sp-form-actions log-settings-actions">
          <button
            ref={exportButton}
            className="button secondary"
            disabled={disabled}
            onClick={() => void exportLogs()}
          >
            {operation === 'export' ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Download size={15} />
            )}
            {operation === 'export' ? '正在导出…' : '导出日志'}
          </button>
          <button
            ref={cleanButton}
            className="button secondary log-clean-button"
            disabled={disabled}
            onClick={() => setDialog({ kind: 'confirm' })}
          >
            {operation === 'clean' ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Trash2 size={15} />
            )}
            {operation === 'clean' ? '正在清理…' : '清理日志'}
          </button>
        </div>
      </div>
      <details className="data-settings-details log-settings-directory">
        <summary>日志导出目录</summary>
        <p className="sp-mono log-settings-path">
          {info?.directory || (infoError ? '读取失败' : '正在读取…')}
        </p>
      </details>
      {infoError && (
        <p className="sp-help" role="alert">
          {infoError}
          <button
            className="text-button"
            disabled={disabled}
            onClick={() => setInfoRevision((value) => value + 1)}
          >
            重试
          </button>
        </p>
      )}
      {dialog?.kind === 'confirm' && (
        <LogDialog
          title="清理日志"
          returnFocus={cleanButton}
          busy={disabled}
          onClose={() => setDialog(null)}
        >
          <p>
            清理可删除的历史日志和已导出的日志文件。本次会话使用的日志会保留；数据库、事件记录和截图不受影响。
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={disabled}
              onClick={() => setDialog(null)}
            >
              取消
            </button>
            <button className="button danger" disabled={disabled} onClick={() => void cleanLogs()}>
              <Trash2 size={15} />
              确认清理
            </button>
          </div>
        </LogDialog>
      )}
      {dialog?.kind === 'export' && (
        <LogDialog
          title={dialog.result.warnings.length ? '日志已导出（含提示）' : '日志已导出'}
          returnFocus={exportButton}
          onClose={() => setDialog(null)}
        >
          <p>日志文件已保存到以下目录：</p>
          <dl className="log-settings-locations">
            <div>
              <dt>导出目录</dt>
              <dd>{dialog.result.directory}</dd>
            </div>
            <div>
              <dt>日志文件</dt>
              <dd>{dialog.result.path}</dd>
            </div>
          </dl>
          <Warnings warnings={dialog.result.warnings} />
          <div className="modal-actions">
            <button className="button primary" onClick={() => setDialog(null)}>
              完成
            </button>
          </div>
        </LogDialog>
      )}
      {dialog?.kind === 'clean' && (
        <LogDialog title="日志清理完成" returnFocus={cleanButton} onClose={() => setDialog(null)}>
          <p>
            已清理 {dialog.result.removedFiles} 个文件，释放{' '}
            {(dialog.result.removedBytes / 1024).toLocaleString('zh-CN', {
              maximumFractionDigits: 1,
            })}{' '}
            KiB。
          </p>
          <p>已保留 {dialog.result.skippedFiles} 个正在使用或不适合清理的日志文件。</p>
          <Warnings warnings={dialog.result.warnings} />
          <div className="modal-actions">
            <button className="button primary" onClick={() => setDialog(null)}>
              完成
            </button>
          </div>
        </LogDialog>
      )}
    </section>
  );
}
