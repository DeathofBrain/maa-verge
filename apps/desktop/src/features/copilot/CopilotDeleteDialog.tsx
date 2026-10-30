import Button from '@/kit/Button';
import Checkbox from '@/kit/Checkbox';
import { useState } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import Overlay from '@/kit/Overlay';
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
  const title = target.type === 'category' ? '删除分类' : '删除作业';

  return (
    <Overlay
      kind="modal"
      title={title}
      onClose={onClose}
      closeLabel="关闭删除确认"
      closeDisabled={busy}
      busy={busy}
      background={[document.getElementById('root')]}
      returnFocus={returnFocus}
      fallbackFocus={() =>
        document
          .getElementById('root')
          ?.querySelector<HTMLElement>('.cp-category-chip[aria-pressed="true"]')
      }
      initialFocusSelector="[data-autofocus]"
      layerClassName="cp-delete-backdrop"
      className="modal confirm-dialog cp-delete-dialog"
      footer={
        <div className="modal-actions">
          <Button variant="secondary" data-autofocus disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => onConfirm(deleteCopilots)}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}
            确认删除
          </Button>
        </div>
      }
    >
      {target.type === 'category' ? (
        <>
          <p>确定删除分类「{target.name}」？</p>
          <label className="cp-delete-check">
            <Checkbox
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
    </Overlay>
  );
}
