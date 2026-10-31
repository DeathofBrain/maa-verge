import ErrorBanner from '@/kit/ErrorBanner';
import ExternalLink from '@/kit/ExternalLink';
import IconButton from '@/kit/IconButton';
import Button from '@/kit/Button';
import { useEffect, useRef, type ComponentProps } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import type {
  CopilotKind,
  CopilotPreview,
  CopilotRecord,
  RpcParams,
  RpcResult,
} from '@maaverge/contracts';
import Drawer from '@/kit/Drawer';
import Select from '@/kit/Select';
import CopilotOperators from './CopilotOperators';
import CopilotRating from './CopilotRating';
import Compatibility from './CopilotCompatibility';
import { invalidateCopilotPreview } from './copilot-community';
import './copilot-drawer.css';

const safeLink = (input: string) => {
  try {
    const url = new URL(input);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

type Props = {
  current: CopilotRecord;
  origin: 'library' | 'preview';
  preview?: CopilotPreview;
  previewParams?: RpcParams<'copilot.preview'>;
  isStored: boolean;
  currentPreviewEntry?: CopilotPreview['entries'][number];
  kind: CopilotKind;
  importing: boolean;
  canQueue: boolean;
  categoryBusy: boolean;
  categories: RpcResult<'copilot.category.list'>['items'];
  resourceKey: string;
  roster: ComponentProps<typeof CopilotOperators>['roster'];
  rosterHint: string;
  run?: RpcResult<'run.detail'>;
  error: string;
  notice: string;
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onClearError: () => void;
  onSelectKind: (kind: CopilotKind) => void;
  kindLabel: (kind: CopilotKind) => string;
  requestPreview: (
    params: RpcParams<'copilot.preview'>,
    showDetail?: boolean,
    refresh?: boolean,
  ) => Promise<void>;
  addRecords: (records: CopilotRecord[]) => void;
  exportRecord: (record: CopilotRecord) => Promise<boolean>;
  importPreview: (queue: boolean, ids?: string[]) => Promise<void>;
  assignCategory: (record: CopilotRecord, categoryId: string) => Promise<void>;
  onOpenError: (cause: unknown) => void;
};

export default function CopilotDetailDrawer({
  current,
  origin,
  preview,
  previewParams,
  isStored,
  currentPreviewEntry,
  kind,
  importing,
  canQueue,
  categoryBusy,
  categories,
  resourceKey,
  roster,
  rosterHint,
  run,
  error,
  notice,
  returnFocus,
  onClose,
  onClearError,
  onSelectKind,
  kindLabel,
  requestPreview,
  addRecords,
  exportRecord,
  importPreview,
  assignCategory,
  onOpenError,
}: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const background = document.getElementById('root');
  const page = document.querySelector<HTMLElement>('.copilot-page');
  const sourceUrl = safeLink(current.source.url);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [current.id, current.versionId]);
  return (
    <Drawer
      title="作业详情弹窗"
      onClose={onClose}
      returnFocus={returnFocus}
      closeLabel="关闭作业详情弹窗"
      backdropLabel="关闭作业详情"
      header={false}
      width="md"
      bodyScroll={false}
      layerClassName="cp-drawer-layer"
      className="cp-drawer-panel"
      backdropClassName="cp-drawer-backdrop"
      background={[background]}
      ariaHidden={[background]}
      scroll={page ? [{ element: page, property: 'overflow-y' }] : []}
      initialFocusSelector="h2[tabindex]"
    >
      <aside className="cp-detail sp-section" aria-label="作业详情">
        <nav className="cp-station-nav" aria-label="作业站导航">
          <Button variant="text" className="cp-back" disabled={importing} onClick={onClose}>
            <ArrowLeft size={15} />
            {origin === 'preview' && preview && preview.entries.length > 1
              ? '返回导入预览'
              : '返回作业列表'}
          </Button>
          <ChevronRight size={14} />
          <span>作业详情</span>
        </nav>
        {error && (
          <ErrorBanner as="div" className="error-banner cp-feedback">
            {error}
            <IconButton label="关闭详情错误" onClick={() => onClearError()}>
              <X size={15} />
            </IconButton>
          </ErrorBanner>
        )}
        {notice && (
          <p className="cp-notice" role="status">
            <Check size={15} />
            {notice}
          </p>
        )}
        <div className="cp-detail-toolbar">
          <span>{isStored ? '已保存到本地' : '社区预览 · 尚未导入'}</span>
          {origin === 'preview' && previewParams?.code && (
            <Button
              variant="text"
              disabled={importing}
              onClick={() =>
                void requestPreview(previewParams!, preview?.entries.length === 1, true)
              }
            >
              <RefreshCw size={14} />
              {preview && preview.entries.length > 1 ? '刷新作业集' : '刷新作业详情'}
            </Button>
          )}
        </div>
        <header className="cp-detail-heading">
          <span className="cp-stage">
            {current.stageName || '未标注关卡'} · {kindLabel(current.kind)}
          </span>
          <h2 ref={heading} tabIndex={-1}>
            {current.title}
          </h2>
          <p>作者：{current.author || current.uploader || '未标注'}</p>
        </header>
        <Compatibility record={current} />
        {current.source.kind === 'community' && (
          <CopilotRating
            key={`${current.id}:${current.versionId}:${preview?.id ?? 'stored'}`}
            record={current}
            refreshKey={`${run?.id}:${run?.status}`}
            onSourceExpired={() => {
              if (previewParams) invalidateCopilotPreview(previewParams, resourceKey);
            }}
          />
        )}
        <div className="cp-detail-actions">
          {isStored ? (
            <>
              <Button
                variant="primary"
                size="sm"
                className="cp-detail-action"
                disabled={!canQueue || current.kind !== kind}
                onClick={() => addRecords([current])}
              >
                <Plus size={15} />
                加入执行队列
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="cp-detail-action"
                title="同时导出原始 JSON 与来源署名说明"
                onClick={() => {
                  void exportRecord(current);
                }}
              >
                <Download size={15} />
                导出 JSON
              </Button>
            </>
          ) : (
            currentPreviewEntry && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  className="cp-detail-action"
                  disabled={importing || !canQueue || current.kind !== kind}
                  onClick={() => void importPreview(true, [currentPreviewEntry.id])}
                >
                  <Plus size={15} />
                  导入并加入当前队列
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="cp-detail-action"
                  disabled={importing}
                  onClick={() => void importPreview(false, [currentPreviewEntry.id])}
                >
                  <Download size={15} />
                  导入到作业库
                </Button>
              </>
            )
          )}
        </div>
        {current.kind !== kind && (
          <p className="cp-queue-mismatch">
            这是{kindLabel(current.kind)}，需加入对应类型的执行队列。
            <Button variant="text" disabled={importing} onClick={() => onSelectKind(current.kind)}>
              切换到{kindLabel(current.kind)}队列
              <ArrowRight size={14} />
            </Button>
          </p>
        )}
        {current.description && (
          <section className="cp-description">
            <h3>作业说明</h3>
            <p>{current.description}</p>
          </section>
        )}
        <section className="cp-requirements">
          <div className="cp-section-heading">
            <h3>干员与要求</h3>
            <span>{current.operators.length} 位</span>
          </div>
          <p className="sp-help">
            {rosterHint}{' '}
            {roster
              ? '绿色已拥有，红色未拥有，黄色缺少练度。技能专精、模组与同名干员形态请手动核对；缺少识别记录时保持未核验。'
              : '以下为作者要求，持有与练度请手动核对。'}
          </p>
          <CopilotOperators
            operators={current.operators}
            resourceKey={resourceKey}
            roster={roster}
            rosterHint={rosterHint}
          />
        </section>
        {isStored && (
          <label className="cp-drawer-category cp-field">
            本地分类
            <Select
              className="cp-field-select"
              aria-label="详情作业分类"
              value={current.categoryId ?? ''}
              disabled={categoryBusy}
              onChange={(event) => void assignCategory(current, event.target.value)}
            >
              <option value="">未分类</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <dl className="cp-meta">
          <div>
            <dt>来源</dt>
            <dd>
              {current.source.name ||
                (current.source.kind === 'community' ? 'PRTS Plus' : '本地导入')}
            </dd>
          </div>
          <div>
            <dt>最低核心版本</dt>
            <dd>{current.minimumCoreVersion || '未声明'}</dd>
          </div>
          <div>
            <dt>{isStored ? '导入时间' : '解析时间'}</dt>
            <dd>{new Date(current.createdAt).toLocaleString('zh-CN')}</dd>
          </div>
        </dl>
        <div className="cp-detail-links">
          {current.source.setId && (
            <Button
              variant="text"
              disabled={importing}
              onClick={() => void requestPreview({ code: `s${current.source.setId}` })}
            >
              <BookOpen size={14} />
              查看所属作业集 #{current.source.setId}
            </Button>
          )}
          {sourceUrl && (
            <ExternalLink href={sourceUrl} onOpenError={onOpenError}>
              查看原站
            </ExternalLink>
          )}
          {current.videos.map((video, index) => {
            const href = safeLink(video);
            return (
              href && (
                <ExternalLink key={video} href={href} onOpenError={onOpenError}>
                  参考视频{index + 1}
                </ExternalLink>
              )
            );
          })}
        </div>
      </aside>
    </Drawer>
  );
}
