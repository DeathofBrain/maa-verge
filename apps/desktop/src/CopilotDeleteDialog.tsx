import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, Trash2, X } from 'lucide-react';
import './copilot-library-actions.css';

export type CopilotDeleteTarget =
  | { type: 'records'; ids: string[]; title?: string }
  | { type: 'category'; id: string; name: string }
  | { type: 'all' };

type Props = {
  target: CopilotDeleteTarget;
  deleteJsonFiles: boolean;
  busy: boolean;
  error: string;
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onConfirm: (deleteCopilots: boolean) => void;
};

export default function CopilotDeleteDialog({
  target,
  deleteJsonFiles,
  busy,
  error,
  returnFocus,
  onClose,
  onConfirm,
}: Props) {
  const [deleteCopilots, setDeleteCopilots] = useState(false);
  const container = useRef<HTMLElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const title = target.type === 'category' ? '删除分类' : '删除作业';

  useLayoutEffect(() => {
    const active =
      returnFocus ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const background = document.getElementById('root');
    const previousInert = background?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (background) background.inert = true;
    document.body.style.overflow = 'hidden';
    cancel.current?.focus();
    return () => {
      if (background) background.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      const target = active?.isConnected
        ? active
        : background?.querySelector<HTMLElement>('.cp-category-chip[aria-pressed="true"]');
      target?.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop cp-delete-backdrop" onClick={() => !busy && onClose()}>
      <section
        ref={container}
        className="modal confirm-dialog cp-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            if (!busy) onClose();
          }
          if (event.key !== 'Tab') return;
          const nodes = [
            ...(container.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled)',
            ) ?? []),
          ];
          if (!nodes.length) {
            event.preventDefault();
          } else if (event.shiftKey && document.activeElement === nodes[0]) {
            event.preventDefault();
            nodes.at(-1)?.focus();
          } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
            event.preventDefault();
            nodes[0].focus();
          }
        }}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="关闭删除确认"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {target.type === 'category' ? (
          <>
            <p>确定删除分类「{target.name}」？</p>
            <label className="cp-delete-check">
              <input
                type="checkbox"
                checked={deleteCopilots}
                disabled={busy}
                onChange={(event) => setDeleteCopilots(event.target.checked)}
              />
              同时删除分类中的作业
            </label>
            <p className="sp-help">未勾选时，分类中的作业保留在“全部”中。</p>
          </>
        ) : target.type === 'all' ? (
          <p>确定删除作业库中的全部作业？此操作包含所有分类和分页中的作业，分类名称保留。</p>
        ) : (
          <p>
            确定删除{target.title ? `「${target.title}」` : `所选的 ${target.ids.length} 份作业`}？
          </p>
        )}
        {(target.type !== 'category' || deleteCopilots) && (
          <p className="sp-help">
            {deleteJsonFiles ? '将同时删除应用保存的作业 JSON 文件。' : '作业 JSON 文件将保留。'}
            可在“设置 → 数据与诊断”中修改删除偏好。执行队列和历史记录保留。
          </p>
        )}
        {error && (
          <p className="cp-error-text" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button ref={cancel} className="button secondary" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={() => onConfirm(deleteCopilots)}
          >
            {busy ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}
            确认删除
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
