import { useEffect, useRef, useState } from 'react';
import { errorMessage, type CopilotPreview } from '@maaverge/contracts';
import CopilotOperators from './CopilotOperators';
import CopilotDifficulty, { summarizeSetDifficulty } from './CopilotDifficulty';
import type { OperatorRoster } from './copilot-operators';
import { cachedCommunityPreview, readCopilotPreview } from './copilot-community';
import './copilot-set-operators.css';

// Each set preview may already read several members in parallel on the service.
// Bound card reads separately, and remove queued work when its card is hidden.
let activeReads = 0;
const waitingReads: { run: () => void }[] = [];
function drainReads() {
  while (activeReads < 2 && waitingReads.length) waitingReads.shift()!.run();
}
function scheduleRead(setId: string, resourceKey: string) {
  let started = false;
  let cancel = () => {};
  const promise = new Promise<CopilotPreview | undefined>((resolve, reject) => {
    const entry = { run: () => {
      started = true;
      activeReads++;
      void Promise.resolve().then(() => readCopilotPreview({ code: `s${setId}` }, resourceKey))
        .then(resolve, reject).finally(() => { activeReads--; drainReads(); });
    } };
    waitingReads.push(entry);
    cancel = () => {
      if (started) return;
      const index = waitingReads.indexOf(entry);
      if (index >= 0) waitingReads.splice(index, 1);
      resolve(undefined);
    };
  });
  drainReads();
  return { promise, cancel };
}

type Props = {
  setId: string;
  resourceKey: string;
  roster?: OperatorRoster;
  rosterHint?: string;
  preview?: CopilotPreview;
};

/** Keep requirements scoped to their member; identical group names can mean different roles. */
export default function CopilotSetOperators({ setId, resourceKey, roster, rosterHint, preview }: Props) {
  const element = useRef<HTMLDetailsElement>(null);
  const key = JSON.stringify([resourceKey, setId]);
  const [expanded, setExpanded] = useState<{ key: string; open: boolean }>();
  const [showAllKey, setShowAllKey] = useState<string>();
  const [visibleKey, setVisibleKey] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; attempt: number; preview?: CopilotPreview; pending: boolean; error: string }>();
  const open = expanded?.key === key && expanded.open;
  const current = loaded?.key === key ? loaded : undefined;
  const result = preview ?? current?.preview ?? cachedCommunityPreview({ code: `s${setId}` }, resourceKey);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setVisibleKey(key);
      else setVisibleKey(value => value === key ? undefined : value);
    }, { rootMargin: '120px' });
    // Read metadata as soon as the card header appears, even if its details
    // section is still clipped by a scrolling ancestor below the viewport.
    const target = element.current?.closest('article.cp-record') ?? element.current;
    if (target) observer.observe(target);
    return () => observer.disconnect();
  }, [key]);

  useEffect(() => {
    if (visibleKey !== key || preview) return;
    const cached = cachedCommunityPreview({ code: `s${setId}` }, resourceKey);
    if (cached) { setLoaded({ key, attempt, preview: cached, pending: false, error: '' }); return; }
    // Opening a failed card reveals its retry control without issuing another read.
    if (current?.error && current.attempt === attempt) return;
    let cancelled = false;
    setLoaded({ key, attempt, pending: true, error: '' });
    const scheduled = scheduleRead(setId, resourceKey);
    void scheduled.promise.then(value => {
      if (!cancelled && value) setLoaded({ key, attempt, preview: value, pending: false, error: '' });
    }, cause => {
      if (!cancelled) setLoaded({ key, attempt, pending: false, error: errorMessage(cause) });
    });
    return () => { cancelled = true; scheduled.cancel(); };
  }, [key, visibleKey, preview, attempt, open]);

  const showAll = showAllKey === key;
  const entries = result?.entries.slice(0, showAll ? undefined : 3) ?? [];
  const additional = Math.max(0, (result?.entries.length ?? 0) - 3);
  return <>{result && <CopilotDifficulty summary={summarizeSetDifficulty(result.entries)}/>}<details ref={element} className="cp-set-operators" aria-label={`作业集 #${setId} 干员要求`} open={open} onToggle={event => setExpanded({ key, open: event.currentTarget.open })}>
    <summary>干员要求{result && <span>{result.entries.length} 项作业</span>}</summary>
    {open && <div className="cp-set-operator-content">
      <p className="cp-set-operator-note">按成员分别核对，各关卡要求以作业详情为准。</p>
      {!result && <p className="cp-set-operator-note" role="status">{current?.error ? '干员要求读取失败，可重试或查看作业集详情。' : '正在读取作业集干员要求…'}</p>}
      {current?.error && <><p className="cp-set-operator-error">{current.error}</p><button type="button" className="cp-link" onClick={() => setAttempt(value => value + 1)}>重试读取干员要求</button></>}
      {entries.map((entry, index) => <section key={entry.id} className="cp-set-operator-member" aria-label={`作业 ${index + 1} 干员要求`}>
        <h4>{String(index + 1).padStart(2, '0')} · {entry.record?.title ?? '无法读取的作业'}</h4>
        {entry.record ? <><p className="cp-set-operator-stage">{entry.record.stageName}</p><CopilotOperators operators={entry.record.operators} resourceKey={resourceKey} roster={roster} rosterHint={rosterHint} compact/></> : <p className="cp-set-operator-error">{entry.error || '无法读取干员要求，请查看详情核对。'}</p>}
      </section>)}
      {result && !entries.length && <p className="cp-set-operator-note">作业集暂无成员，无法核对干员要求。</p>}
      {additional > 0 && <button type="button" className="cp-link cp-set-operator-more" aria-expanded={showAll} onClick={() => setShowAllKey(showAll ? undefined : key)}>{showAll ? '收起更多作业' : `显示其余 ${additional} 项作业`}</button>}
    </div>}
  </details></>;
}
