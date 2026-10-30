import type { ComponentProps, Dispatch, SetStateAction } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { BookOpen, Plus, Search, Upload } from 'lucide-react';
import { type CopilotKind, type CopilotRecord, type CopilotWorkspace } from '@maaverge/contracts';
import type { MenuItem } from '@/kit/ContextMenu';
import Button from '@/kit/Button';
import CopilotDifficulty from './CopilotDifficulty';
import CopilotOperators from './CopilotOperators';
import type { CopilotDeleteTarget } from './CopilotDeleteDialog';

type ContextMenuBinding = {
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

type Props = {
  libraryReady: boolean;
  finishedLibrary: string;
  libraryKey: string;
  filtered: CopilotRecord[];
  selectedLibraryIds: string[];
  setSelectedLibraryIds: Dispatch<SetStateAction<string[]>>;
  contextMenu: (label: string, items: MenuItem[]) => ContextMenuBinding;
  categories: { id: string; name: string }[];
  workspace?: CopilotWorkspace;
  kind: CopilotKind;
  addRecords: (records: CopilotRecord[]) => void;
  assignCategory: (record: CopilotRecord, categoryId: string) => Promise<void>;
  exportRecord: (record: CopilotRecord) => Promise<boolean>;
  requestDelete: (target: CopilotDeleteTarget) => void;
  categoryBusy: boolean;
  importing: boolean;
  savingImport: boolean;
  loading: boolean;
  deleting: boolean;
  kindLabel: (kind: CopilotKind) => string;
  resourceKey: string;
  roster: ComponentProps<typeof CopilotOperators>['roster'];
  rosterHint: string;
  openRecord: (record: CopilotRecord) => void;
  setKind: (kind: CopilotKind) => void;
  query: string;
  categoryFilter: string;
  showLibrary: (source?: 'local' | 'community') => void;
  openImport: () => void;
  localPage: number;
  localPaging: { total: number; hasNext: boolean };
  setLocalPage: Dispatch<SetStateAction<number>>;
};

export default function CopilotLibraryList({
  libraryReady,
  finishedLibrary,
  libraryKey,
  filtered,
  selectedLibraryIds,
  setSelectedLibraryIds,
  contextMenu,
  categories,
  workspace,
  kind,
  addRecords,
  assignCategory,
  exportRecord,
  requestDelete,
  categoryBusy,
  importing,
  savingImport,
  loading,
  deleting,
  kindLabel,
  resourceKey,
  roster,
  rosterHint,
  openRecord,
  setKind,
  query,
  categoryFilter,
  showLibrary,
  openImport,
  localPage,
  localPaging,
  setLocalPage,
}: Props) {
  return (
    <>
      {!libraryReady && finishedLibrary !== libraryKey ? (
        <p className="cp-loading" role="status">
          正在读取作业库…
        </p>
      ) : filtered.length ? (
        <div className="cp-record-list">
          {filtered.map((record) => (
            <article
              key={record.id}
              data-copilot-id={record.id}
              className={`cp-record is-selectable${selectedLibraryIds.includes(record.id) ? ' is-marked' : ''}`}
              tabIndex={0}
              {...contextMenu('作业菜单', [
                { label: '查看作业详情', action: () => openRecord(record) },
                {
                  label: '加入执行队列',
                  action: () => addRecords([record]),
                  disabled:
                    !workspace ||
                    record.kind !== kind ||
                    (kind === 'SSSCopilot' && !!workspace.queue.length),
                },
                ...categories.map((category) => ({
                  label: `归类到 ${category.name}`,
                  action: () => {
                    void assignCategory(record, category.id);
                  },
                  disabled: categoryBusy || record.categoryId === category.id,
                })),
                {
                  label: '设为未分类',
                  action: () => {
                    void assignCategory(record, '');
                  },
                  disabled: categoryBusy || !record.categoryId,
                },
                {
                  label: '导出原始 JSON',
                  action: () => {
                    void exportRecord(record);
                  },
                },
                {
                  label: '从作业库移除',
                  danger: true,
                  action: () => {
                    requestDelete({
                      type: 'records',
                      ids: [record.id],
                      title: record.title,
                    });
                  },
                  disabled: categoryBusy || importing || savingImport,
                },
              ])}
            >
              <label className="cp-record-select">
                <input
                  type="checkbox"
                  aria-label={`选择作业 ${record.title}`}
                  checked={selectedLibraryIds.includes(record.id)}
                  disabled={loading || deleting}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelectedLibraryIds((ids) =>
                      checked ? [...ids, record.id] : ids.filter((id) => id !== record.id),
                    );
                  }}
                />
              </label>
              <CopilotDifficulty difficulty={record.difficulty} />
              <button className="cp-record-main" onClick={() => openRecord(record)}>
                <span className="cp-stage">{`${kindLabel(record.kind)}${record.stageName ? ` · ${record.stageName}` : ''}`}</span>
                <strong>{record.title}</strong>
                <small>
                  作者：{record.author || record.uploader || '未标注'} ·{' '}
                  {record.source.kind === 'community'
                    ? 'PRTS Plus'
                    : record.source.kind === 'legacy'
                      ? '旧任务表'
                      : '本地 JSON'}
                  {record.source.setId && ` · 作业集 #${record.source.setId}`}
                  {record.categoryId && (
                    <span className="cp-record-category-badge">
                      {categories.find((item) => item.id === record.categoryId)?.name ?? '已分类'}
                    </span>
                  )}
                </small>
              </button>
              <CopilotOperators
                operators={record.operators}
                resourceKey={resourceKey}
                roster={roster}
                rosterHint={rosterHint}
                compact
              />
              <Button
                className="cp-record-add"
                icon={<Plus size={15} />}
                aria-label={`加入队列 ${record.title}`}
                title={
                  record.kind !== kind
                    ? `先切换到${kindLabel(record.kind)}队列`
                    : '加入队列，可重复添加'
                }
                disabled={
                  !workspace ||
                  (record.kind === kind && kind === 'SSSCopilot' && !!workspace.queue.length)
                }
                onClick={() => (record.kind === kind ? addRecords([record]) : setKind(record.kind))}
              >
                {record.kind === kind ? '加入队列' : '切换队列'}
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <div className="cp-empty">
          <BookOpen size={29} />
          <h3>
            {query ? '没有匹配的作业' : categoryFilter ? '此分类还没有作业' : '还没有本地作业'}
          </h3>
          <p>
            {query
              ? '当前页没有匹配结果，可翻页或清除搜索。'
              : categoryFilter
                ? '在作业详情或右键菜单中归类，也可以导入社区作业集。'
                : '导入本地 JSON，或搜索社区作业。浏览和导入无需连接设备。'}
          </p>
          {!query && (
            <div className="cp-empty-actions">
              <Button
                variant="primary"
                icon={<Search size={15} />}
                onClick={() => showLibrary('community')}
              >
                去社区找作业
              </Button>
              <Button icon={<Upload size={15} />} disabled={savingImport} onClick={openImport}>
                导入本地作业
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="cp-pagination">
        <Button
          aria-label="本地作业上一页"
          disabled={localPage <= 1 || loading}
          onClick={() => setLocalPage((value) => value - 1)}
        >
          上一页
        </Button>
        <span>
          第 {localPage} 页 · 共 {localPaging.total} 份
        </span>
        <Button
          aria-label="本地作业下一页"
          disabled={!localPaging.hasNext || loading}
          onClick={() => setLocalPage((value) => value + 1)}
        >
          下一页
        </Button>
      </div>
    </>
  );
}
