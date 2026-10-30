import type { ComponentProps, Dispatch, SetStateAction } from 'react';
import { ChevronRight, Clock3, Eye, Flame, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import type { CopilotKind, RpcParams, RpcResult } from '@maaverge/contracts';
import Button from '@/kit/Button';
import FilterChips from '@/kit/FilterChips';
import IconButton from '@/kit/IconButton';
import SearchField from '@/kit/SearchField';
import CopilotDifficulty from './CopilotDifficulty';
import CopilotOperators from './CopilotOperators';
import CopilotSetOperators from './CopilotSetOperators';
import CopilotStageFilter from './CopilotStageFilter';
import './copilot-community-sort.css';

type CommunityOrder = NonNullable<RpcParams<'copilot.search'>['orderBy']>;
const communityOrders = [
  { value: 'hot', label: '热度', icon: Flame },
  { value: 'id', label: '最新', icon: Clock3 },
  { value: 'views', label: '访问量', icon: Eye },
] as const;

type Props = {
  target: 'copilot' | 'set';
  keyword: string;
  setKeyword: (value: string) => void;
  stage: string;
  setStage: (value: string) => void;
  setStageFilter: (value: string) => void;
  orderBy: CommunityOrder;
  setOrderBy: (value: CommunityOrder) => void;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  resourceKey: string;
  searching: boolean;
  searchResult?: RpcResult<'copilot.search'>;
  searchError: string;
  refreshSearch: () => void;
  requestPreview: (params: RpcParams<'copilot.preview'>, showDetail?: boolean) => Promise<void>;
  kindLabel: (kind: CopilotKind) => string;
  roster: ComponentProps<typeof CopilotOperators>['roster'];
  rosterHint: string;
};

export default function CopilotCommunityBrowser({
  target,
  keyword,
  setKeyword,
  stage,
  setStage,
  setStageFilter,
  orderBy,
  setOrderBy,
  page,
  setPage,
  resourceKey,
  searching,
  searchResult,
  searchError,
  refreshSearch,
  requestPreview,
  kindLabel,
  roster,
  rosterHint,
}: Props) {
  return (
    <>
      <div className="cp-community-controls">
        <div className="cp-field">
          <label htmlFor="copilot-community-keyword">关键词</label>
          <SearchField
            id="copilot-community-keyword"
            aria-label="社区搜索关键词"
            value={keyword}
            onValueChange={(value) => {
              setKeyword(value);
              setPage(1);
            }}
            placeholder={target === 'set' ? '搜索作业集名称或说明' : '搜索标题或说明'}
            className="cp-keyword-search"
          />
        </div>
        {target === 'copilot' && (
          <CopilotStageFilter
            value={stage}
            resourceKey={resourceKey}
            onChange={setStage}
            onCommit={(value) => {
              setStageFilter(value);
              setPage(1);
            }}
          />
        )}
        {target === 'copilot' && (
          <div className="cp-community-sort">
            <span>排序：</span>
            <FilterChips
              aria-label="社区作业排序"
              items={communityOrders.map(({ value, label, icon: Icon }) => ({
                id: value,
                label: (
                  <>
                    <Icon size={15} aria-hidden="true" />
                    {label}
                  </>
                ),
              }))}
              value={orderBy}
              onChange={(value) => {
                if (orderBy === value) return;
                setOrderBy(value as CommunityOrder);
                setPage(1);
              }}
            />
          </div>
        )}
        <div className="cp-search-actions">
          <p className="sp-help">
            {target === 'set'
              ? '点进作业集查看成员，可逐项选择并按原顺序加入队列。'
              : '支持用编号或链接直接导入。'}
          </p>
          <IconButton
            label="刷新社区搜索"
            title="刷新搜索结果"
            disabled={searching}
            onClick={refreshSearch}
          >
            <RefreshCw size={15} />
          </IconButton>
        </div>
      </div>
      <div className="cp-search-status" role="status">
        {searching && (
          <>
            <LoaderCircle size={15} className="spin" />
            {searchResult ? '正在更新搜索结果…' : '正在搜索…'}
          </>
        )}
      </div>
      <div className="cp-community-results" aria-busy={searching}>
        {searchError && (
          <div className="error-banner" role="alert">
            {searchError}
            <p>
              {searchResult
                ? '已保留上次搜索结果，可点击刷新重试。'
                : '可点击刷新重试，已导入的本地作业仍可使用。'}
            </p>
          </div>
        )}
        {searchResult?.items.length ? (
          <div className="cp-record-list">
            {searchResult.items.map((item) => (
              <article key={item.id} className="cp-record">
                {target === 'copilot' && <CopilotDifficulty difficulty={item.difficulty} />}
                <button
                  className="cp-record-main"
                  onClick={() =>
                    void requestPreview({ code: target === 'set' ? `s${item.id}` : item.id }, true)
                  }
                >
                  <span className="cp-stage">
                    {target === 'set' ? '作业集' : item.kind ? kindLabel(item.kind) : '社区作业'}
                    {item.stageName && ` · ${item.stageName}`} · #{item.id}
                  </span>
                  <strong>{item.title}</strong>
                  <small>作者：{item.author || item.uploader || '未标注'}</small>
                  <p>{item.description}</p>
                </button>
                {target === 'copilot' ? (
                  <CopilotOperators
                    operators={item.operators}
                    resourceKey={resourceKey}
                    roster={roster}
                    rosterHint={rosterHint}
                    compact
                  />
                ) : (
                  <CopilotSetOperators
                    setId={item.id}
                    resourceKey={resourceKey}
                    roster={roster}
                    rosterHint={rosterHint}
                  />
                )}
                <IconButton
                  className="cp-record-details"
                  label={`查看详情 ${item.title}`}
                  onClick={() =>
                    void requestPreview({ code: target === 'set' ? `s${item.id}` : item.id }, true)
                  }
                >
                  <ChevronRight size={19} />
                </IconButton>
              </article>
            ))}
          </div>
        ) : !searching && !searchError ? (
          <div className="cp-empty">
            <Search size={26} />
            <h3>没有匹配结果</h3>
            <p>调整关键词或关卡，或使用编号定位。</p>
          </div>
        ) : null}
      </div>
      <div className="cp-pagination">
        <Button
          size="sm"
          disabled={page <= 1 || searching}
          onClick={() => setPage((value) => value - 1)}
        >
          上一页
        </Button>
        <span>
          第 {page} 页{searchResult ? ` · ${searchResult.total} 条` : ''}
        </span>
        <Button
          size="sm"
          disabled={!searchResult?.hasNext || searching}
          onClick={() => setPage((value) => value + 1)}
        >
          下一页
        </Button>
      </div>
    </>
  );
}
