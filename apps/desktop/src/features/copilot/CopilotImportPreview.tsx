import Checkbox from '@/kit/Checkbox';
import type { ComponentProps, Dispatch, RefObject, SetStateAction } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import {
  type CopilotKind,
  type CopilotPreview,
  type CopilotRecord,
  type RpcParams,
} from '@maaverge/contracts';
import Button from '@/kit/Button';
import IconButton from '@/kit/IconButton';
import Select from '@/kit/Select';
import CopilotOperators from './CopilotOperators';
import SelectAll from '@/shared/ui/SelectAll';
import Compatibility from './CopilotCompatibility';

type Props = {
  preview: CopilotPreview;
  hidden: boolean;
  previewParams: RefObject<RpcParams<'copilot.preview'> | undefined>;
  importing: boolean;
  requestPreview: (
    params: RpcParams<'copilot.preview'>,
    append?: boolean,
    force?: boolean,
  ) => Promise<void>;
  onClose: () => void;
  availablePreviewEntries: CopilotPreview['entries'];
  previewSelection: string[];
  setPreviewSelection: Dispatch<SetStateAction<string[]>>;
  previewKinds: { value: CopilotKind; label: string; short: string }[];
  queueKind: CopilotKind;
  setQueueKind: (kind: CopilotKind) => void;
  wholeSetEntries: CopilotPreview['entries'];
  importPreview: (
    queue: boolean,
    ids?: string[],
    kind?: CopilotKind,
    keepOpen?: boolean,
  ) => Promise<void>;
  selectedPreviewRecords: CopilotRecord[];
  resourceKey: string;
  roster: ComponentProps<typeof CopilotOperators>['roster'];
  rosterHint: string;
  openRecord: (record: CopilotRecord, origin?: 'library' | 'preview') => void;
  kindLabel: (kind: CopilotKind) => string;
};

export default function CopilotImportPreview({
  preview,
  hidden,
  previewParams,
  importing,
  requestPreview,
  onClose,
  availablePreviewEntries,
  previewSelection,
  setPreviewSelection,
  previewKinds,
  queueKind,
  setQueueKind,
  wholeSetEntries,
  importPreview,
  selectedPreviewRecords,
  resourceKey,
  roster,
  rosterHint,
  openRecord,
  kindLabel,
}: Props) {
  return (
    <section hidden={hidden} className="sp-section cp-preview" aria-label="导入预览">
      <header>
        <div>
          <h2>{preview.title || '导入预览'}</h2>
          <p>
            {preview.entries.length > 1
              ? `共 ${preview.entries.length} 项，按作业集原顺序排列；可逐项查看详情并选择导入。`
              : '核对类型、要求与异常条目；导入不会开始执行。'}
          </p>
        </div>
        {previewParams.current?.code && (
          <Button
            variant="text"
            icon={<RefreshCw size={14} />}
            disabled={importing}
            onClick={() => void requestPreview(previewParams.current!, false, true)}
          >
            刷新导入预览
          </Button>
        )}
        <IconButton label="关闭导入预览" onClick={onClose}>
          <X size={17} />
        </IconButton>
      </header>
      <div className="cp-preview-selection">
        <SelectAll
          label="全选可用作业"
          total={availablePreviewEntries.length}
          selected={
            availablePreviewEntries.filter((entry) => previewSelection.includes(entry.id)).length
          }
          disabled={importing}
          onChange={(checked) =>
            setPreviewSelection(checked ? availablePreviewEntries.map((entry) => entry.id) : [])
          }
        />
      </div>
      {preview.entries.length > 1 && (
        <div className="cp-set-queue">
          <div>
            <strong>整集加入队列</strong>
            <p className="sp-help">
              按作者顺序追加到对应队列；共 {availablePreviewEntries.length} 项可用
              {preview.entries.length > availablePreviewEntries.length
                ? `，${preview.entries.length - availablePreviewEntries.length} 项无效，请查看下方原因`
                : ''}
              。
              {previewKinds.length > 1
                ? '此集包含多种类型，请分类型加入，其他成员会保留在预览中。'
                : ''}
            </p>
          </div>
          {previewKinds.length > 1 && (
            <label className="cp-field">
              本次加入类型
              <Select
                className="cp-field-select"
                aria-label="作业集入队类型"
                value={queueKind}
                onChange={(event) => setQueueKind(event.target.value as CopilotKind)}
              >
                {previewKinds.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}（
                    {
                      availablePreviewEntries.filter((entry) => entry.record?.kind === item.value)
                        .length
                    }{' '}
                    项）
                  </option>
                ))}
              </Select>
            </label>
          )}
          <Button
            variant="primary"
            icon={<Plus size={15} />}
            disabled={importing || !wholeSetEntries.length}
            onClick={() =>
              void importPreview(
                true,
                wholeSetEntries.map((entry) => entry.id),
                previewKinds.length > 1 ? queueKind : previewKinds[0]?.value,
                previewKinds.length > 1 || preview.entries.length > availablePreviewEntries.length,
              )
            }
          >
            {previewKinds.length > 1
              ? `导入并加入${kindLabel(queueKind)}队列`
              : '全集导入并加入队列'}
          </Button>
        </div>
      )}
      <div className="cp-preview-list">
        {preview.entries.map((entry, index) => (
          <div className={`cp-preview-entry ${entry.error ? 'is-error' : ''}`} key={entry.id}>
            <label>
              <Checkbox
                aria-label={`选择导入 ${index + 1}`}
                checked={previewSelection.includes(entry.id)}
                disabled={importing || !entry.record || !!entry.error}
                onChange={(event) =>
                  setPreviewSelection((value) =>
                    event.target.checked
                      ? [...value, entry.id]
                      : value.filter((id) => id !== entry.id),
                  )
                }
              />
              <span className="cp-sequence">{String(index + 1).padStart(2, '0')}</span>
              <strong>{entry.record?.title ?? `无法解析的第 ${index + 1} 项`}</strong>
            </label>
            {entry.record && (
              <>
                <p>
                  {kindLabel(entry.record.kind)} · {entry.record.stageName || '未标注关卡'} · 作者：
                  {entry.record.author || entry.record.uploader || '未标注'}
                </p>
                <p className="sp-help">{entry.record.description}</p>
                <CopilotOperators
                  operators={entry.record.operators}
                  resourceKey={resourceKey}
                  roster={roster}
                  rosterHint={rosterHint}
                  compact
                />
                <Compatibility record={entry.record} />
                <Button variant="text" onClick={() => openRecord(entry.record!, 'preview')}>
                  查看干员与作业详情
                </Button>
              </>
            )}
            {entry.error && <p role="alert">{entry.error}</p>}
          </div>
        ))}
      </div>
      <div className="cp-preview-actions">
        <span>
          {previewSelection.length} / {preview.entries.length} 项已选择
        </span>
        <Button
          className="cp-preview-action"
          disabled={importing || !previewSelection.length}
          onClick={() => void importPreview(false)}
        >
          导入到作业库
        </Button>
        <Button
          className="cp-preview-action"
          variant="primary"
          icon={<Plus size={15} />}
          disabled={
            importing ||
            !selectedPreviewRecords.length ||
            selectedPreviewRecords.some((record) => record.kind !== selectedPreviewRecords[0].kind)
          }
          title={
            selectedPreviewRecords.some((record) => record.kind !== selectedPreviewRecords[0].kind)
              ? '请按类型分别选择并加入对应队列'
              : '按原顺序追加到对应类型的队列'
          }
          onClick={() => void importPreview(true)}
        >
          所选导入并加入队列
        </Button>
      </div>
    </section>
  );
}
