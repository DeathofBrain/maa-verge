import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, Download, ExternalLink, FileJson, FolderOpen, Info, ListOrdered, LoaderCircle, Play, Plus, RefreshCw, Search, Square, Trash2, Upload, X } from 'lucide-react';
import { rpc, taskLabels, type CopilotKind, type CopilotOptions, type CopilotPreview, type CopilotRecord, type CopilotWorkspace, type RpcResult } from '@maaverge/contracts';
import type { SupportPageProps } from './SupportPages';
import { useContextMenu } from './ContextMenu';
import './copilot-page.css';

type Props = SupportPageProps & {
  initialRunId?: string;
  initialLegacy?: { planId: string; taskIndex: number; nonce: string };
  onViewRun?: (id: string) => void;
};
type Availability = RpcResult<'device.availability'>;
type Run = RpcResult<'run.detail'>;
const kinds: { value: CopilotKind; label: string; short: string }[] = [
  { value: 'Copilot', label: '普通作业', short: '普通' },
  { value: 'SSSCopilot', label: '保全派驻', short: '保全' },
  { value: 'ParadoxCopilot', label: '悖论模拟', short: '悖论' },
];
const kindLabel = (kind: CopilotKind) => kinds.find(item => item.value === kind)?.label ?? kind;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const safeLink = (input: string) => { try { const url = new URL(input); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } };
const localSizeLimit = 480 * 1024;
let lastKind: CopilotKind = 'Copilot';
const uiSelection = (key: string) => { try { return sessionStorage.getItem('maaverge:copilot:' + key) ?? ''; } catch { return ''; } };
const saveSelection = (key: string, value: string) => { try { sessionStorage.setItem('maaverge:copilot:' + key, value); } catch { /* Selection is optional when session storage is unavailable. */ } };

function downloadJson(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const element = document.createElement('a'); element.href = url; element.download = filename; element.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Keep each type's edits ordered, including edits flushed while leaving the page. */
function useWorkspace(kind: CopilotKind) {
  const [workspace, setWorkspace] = useState<CopilotWorkspace>();
  const [saveState, setSaveState] = useState('');
  const [error, setError] = useState('');
  const currentKind = useRef(kind); currentKind.current = kind;
  const cache = useRef(new Map<CopilotKind, CopilotWorkspace>());
  const pending = useRef(new Map<CopilotKind, CopilotWorkspace>());
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const changes = [...pending.current.values()]; pending.current.clear();
    const task = chain.current.catch(() => {}).then(async () => {
      let failure: unknown;
      for (const value of changes) {
        try {
          await rpc('copilot.workspace.save', { workspace: value });
          if (mounted.current) { setError(''); setSaveState(pending.current.size ? '等待保存' : '已保存'); }
        } catch (cause) {
          if (!pending.current.has(value.kind)) pending.current.set(value.kind, cache.current.get(value.kind) ?? value);
          if (mounted.current) { setError(errorText(cause)); setSaveState('保存失败'); }
          failure = cause;
        }
      }
      if (failure) throw failure;
    });
    chain.current = task;
    await task;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; void flush().catch(() => {}); };
  }, [flush]);
  useEffect(() => {
    let cancelled = false;
    const local = cache.current.get(kind); setWorkspace(local); setError('');
    if (local) return;
    void rpc('copilot.workspace.get', { kind }).then(value => {
      if (cancelled) return;
      cache.current.set(kind, value); setWorkspace(value); setSaveState('已保存');
    }, cause => { if (!cancelled) setError(errorText(cause)); });
    return () => { cancelled = true; };
  }, [kind]);
  const edit = (update: (value: CopilotWorkspace) => CopilotWorkspace) => {
    const value = cache.current.get(currentKind.current); if (!value) return;
    const next = update(value);
    cache.current.set(next.kind, next); pending.current.set(next.kind, next); setWorkspace(next); setSaveState('等待保存'); setError('');
    clearTimeout(timer.current); timer.current = setTimeout(() => { setSaveState('保存中…'); void flush().catch(() => {}); }, 400);
  };
  return { workspace, edit, flush, saveState, saveError: error };
}

export default function CopilotPage({ snapshot, selectedDevice, onSelectDevice, onAction, onOpenPlan, searchQuery, initialRunId, initialLegacy, onViewRun }: Props) {
  const contextMenu = useContextMenu();
  const [kind, setKindState] = useState<CopilotKind>(() => kinds.some(item => item.value === uiSelection('kind')) ? uiSelection('kind') as CopilotKind : lastKind);
  const [tab, setTab] = useState<'local' | 'community'>('local');
  const [query, setQuery] = useState(searchQuery ?? '');
  const [library, setLibrary] = useState<CopilotRecord[]>([]);
  const [selection, setSelection] = useState<CopilotRecord>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [availability, setAvailability] = useState<{ deviceId: string; result?: Availability; error?: string }>();
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState('');
  const [json, setJson] = useState('');
  const [preview, setPreview] = useState<CopilotPreview>();
  const [previewSelection, setPreviewSelection] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<string[]>([]);
  const [target, setTarget] = useState<'copilot' | 'set'>('copilot');
  const [keyword, setKeyword] = useState('');
  const [stage, setStage] = useState('');
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<RpcResult<'copilot.search'>>();
  const [searchError, setSearchError] = useState('');
  const [runId, setRunId] = useState(initialRunId ?? uiSelection('run'));
  const [runDetail, setRunDetail] = useState<Run>();
  const [starting, setStarting] = useState(false);
  const [queueChecking, setQueueChecking] = useState(false);
  const [queueRecords, setQueueRecords] = useState<Record<string, CopilotRecord>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const importPanel = useRef<HTMLDetailsElement>(null);
  const previewRequest = useRef(0);
  const { workspace, edit, flush, saveState, saveError } = useWorkspace(kind);
  const latestEvent = snapshot.events.at(-1)?.id;
  const device = snapshot.devices.find(item => item.id === selectedDevice);
  const status = availability?.deviceId === selectedDevice ? availability : undefined;
  const liveRuns = snapshot.runs.filter(item => item.source === 'copilot');
  const selectedSummary = liveRuns.find(item => item.id === runId);
  const matchingSummary = liveRuns.find(item => item.copilotKind === kind && item.status === 'running') ?? liveRuns.find(item => item.copilotKind === kind);
  const summary = selectedSummary?.copilotKind === kind ? selectedSummary : matchingSummary;
  const run = runDetail?.id === summary?.id ? runDetail : summary;
  const events = snapshot.events.filter(event => event.data.runId === run?.id).slice(-60);
  const enabled = workspace?.queue.filter(entry => entry.enabled) ?? [];
  const queueProblem = enabled.find(entry => !queueRecords[entry.versionId] || queueRecords[entry.versionId].compatibility.status !== 'ready');
  const disabledReason = !selectedDevice ? '请选择目标设备' : checking ? '正在检查设备占用' : status?.error ?? (!status?.result?.available ? status?.result?.reason ?? '等待设备检查' : !workspace ? '正在读取队列' : !enabled.length ? '请先添加并勾选作业' : queueChecking ? '正在检查作业版本' : queueProblem ? '队列含不可用作业，请查看原因并移除或取消勾选' : saveError ? '请先重试保存配置' : '');
  const setKind = (value: CopilotKind) => { lastKind = value; saveSelection('kind', value); setKindState(value); setDetailOpen(false); setSelection(undefined); setError(''); };

  useEffect(() => { if (runId) saveSelection('run', runId); }, [runId]);
  useEffect(() => { if (searchQuery !== undefined) setQuery(searchQuery); }, [searchQuery]);
  useEffect(() => {
    let cancelled = false; setLoading(true);
    void rpc('copilot.list', { kind }).then(value => { if (!cancelled) setLibrary(value.items); }, cause => { if (!cancelled) setError(errorText(cause)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, revision]);
  useEffect(() => {
    if (!selectedDevice) { setAvailability(undefined); setChecking(false); return; }
    let cancelled = false; setChecking(true);
    void rpc('device.availability', { deviceId: selectedDevice }).then(result => { if (!cancelled) setAvailability({ deviceId: selectedDevice, result }); }, cause => { if (!cancelled) setAvailability({ deviceId: selectedDevice, error: errorText(cause) }); }).finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [selectedDevice, device?.state, latestEvent, revision]);
  useEffect(() => {
    let cancelled = false; setQueueChecking(true);
    const versions = [...new Set(workspace?.queue.map(item => item.versionId) ?? [])];
    void Promise.all(versions.map(async versionId => { try { return await rpc('copilot.get', { versionId }); } catch { return undefined; } })).then(records => {
      if (!cancelled) { setQueueRecords(Object.fromEntries(records.filter((record): record is CopilotRecord => !!record).map(record => [record.versionId, record]))); setQueueChecking(false); }
    });
    return () => { cancelled = true; };
  }, [workspace?.queue.map(entry => entry.versionId).join(','), revision]);
  useEffect(() => {
    if (!summary?.id) { setRunDetail(undefined); return; }
    let cancelled = false;
    void rpc('run.detail', { id: summary.id }).then(value => { if (!cancelled) setRunDetail(value); }, cause => { if (!cancelled) setError(errorText(cause)); });
    return () => { cancelled = true; };
  }, [summary?.id, summary?.progress, summary?.status, latestEvent]);
  useEffect(() => {
    if (!initialRunId) return;
    let cancelled = false;
    void rpc('run.detail', { id: initialRunId }).then(value => { if (!cancelled) { setRunId(value.id); setRunDetail(value); if (value.copilotKind) { lastKind = value.copilotKind; saveSelection('kind', value.copilotKind); setKindState(value.copilotKind); } } }, cause => { if (!cancelled) setError(errorText(cause)); });
    return () => { cancelled = true; };
  }, [initialRunId]);
  useEffect(() => {
    if (tab !== 'community') return;
    let cancelled = false; setSearching(true); setSearchError('');
    const timer = setTimeout(() => {
      void rpc('copilot.search', { target, keyword, page, ...(kind === 'Copilot' && target === 'copilot' && stage.trim() ? { stage: stage.trim() } : {}) }).then(result => { if (!cancelled) setSearchResult(result); }, cause => { if (!cancelled) { setSearchError(errorText(cause)); setSearchResult(undefined); } }).finally(() => { if (!cancelled) setSearching(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tab, target, keyword, page, stage, kind]);
  const requestPreview = useCallback(async (params: import('@maaverge/contracts').RpcParams<'copilot.preview'>) => {
    const sequence = ++previewRequest.current; setImporting(true); setError(''); setImportReport([]);
    try {
      const result = await rpc('copilot.preview', params);
      if (sequence !== previewRequest.current) return;
      setPreview(result); setPreviewSelection(result.entries.filter(entry => entry.record && !entry.error).map(entry => entry.id)); setDetailOpen(true);
      if (importPanel.current) importPanel.current.open = true;
    } catch (cause) { if (sequence === previewRequest.current) setError(errorText(cause)); }
    finally { if (sequence === previewRequest.current) setImporting(false); }
  }, []);
  useEffect(() => {
    if (!initialLegacy || uiSelection('legacy-nonce') === initialLegacy.nonce) return;
    saveSelection('legacy-nonce', initialLegacy.nonce);
    void requestPreview({ planId: initialLegacy.planId, taskIndex: initialLegacy.taskIndex });
  }, [initialLegacy?.nonce, requestPreview]);
  const readFile = async (file?: File) => {
    if (!file) return;
    if (file.size > localSizeLimit) { setError('这份 JSON 超过 480 KiB，请拆分后逐份导入。'); return; }
    try { await requestPreview({ content: await file.text(), name: file.name }); } catch (cause) { setError(errorText(cause)); }
  };
  const onFile = (event: ChangeEvent<HTMLInputElement>) => { void readFile(event.target.files?.[0]); event.target.value = ''; };
  const addRecords = (records: CopilotRecord[]) => {
    const matching = records.filter(record => record.kind === kind);
    if (!matching.length) { setError(`请选择${kindLabel(kind)}，不同类型不能放入同一队列。`); return; }
    if (kind === 'SSSCopilot' && (matching.length > 1 || (workspace?.queue.length ?? 0) > 0)) { setError('保全派驻仅支持一份作业，请先移除当前队列内容。'); return; }
    if ((workspace?.queue.length ?? 0) + matching.length > 100) { setError('每个队列最多 100 项，请先移除部分条目。'); return; }
    edit(value => ({ ...value, options: { ...value.options, ...((value.queue.length + matching.length > 1 || kind === 'ParadoxCopilot') ? { loopTimes: 1 } : {}) }, queue: [...value.queue, ...matching.map(record => ({ id: crypto.randomUUID(), versionId: record.versionId, enabled: true, isRaid: false, navName: '' }))] }));
    setQueueRecords(value => ({ ...value, ...Object.fromEntries(matching.map(record => [record.versionId, record])) })); setNotice(`已将 ${matching.length} 项加入${kindLabel(kind)}队列`); setError('');
  };
  const importPreview = async (addToQueue: boolean) => {
    if (!preview || !previewSelection.length) return;
    setImporting(true); setError('');
    try {
      const result = await rpc('copilot.import', { previewId: preview.id, entryIds: previewSelection });
      setImportReport(result.errors.map(item => item.message)); setRevision(value => value + 1); setNotice(`已导入 ${result.items.length} 份作业`);
      if (addToQueue) addRecords(result.items);
      if (!result.errors.length) { setPreview(undefined); setTab('local'); }
      if (result.items[0]) { if (!addToQueue && result.items[0].kind !== kind) setKind(result.items[0].kind); setSelection(result.items[0]); }
    } catch (cause) { setError(errorText(cause)); }
    finally { setImporting(false); }
  };
  const queueChange = (id: string, patch: Partial<CopilotWorkspace['queue'][number]>) => edit(value => ({ ...value, queue: value.queue.map(item => item.id === id ? { ...item, ...patch } : item) }));
  const remove = (id: string) => edit(value => ({ ...value, queue: value.queue.filter(item => item.id !== id) }));
  const move = (id: string, delta: number) => edit(value => { const queue = [...value.queue], index = queue.findIndex(item => item.id === id), next = index + delta; if (index < 0 || next < 0 || next >= queue.length) return value; [queue[index], queue[next]] = [queue[next], queue[index]]; return { ...value, queue }; });
  const options = (patch: Partial<CopilotOptions>) => edit(value => ({ ...value, options: { ...value.options, ...patch } }));
  const openRecord = (record: CopilotRecord) => { setSelection(record); setDetailOpen(true); };
  const exportRecord = (record: CopilotRecord) => onAction('export-copilot-' + record.versionId, async () => { const result = await rpc('copilot.export', { versionId: record.versionId }); downloadJson(result.filename, result.content); }, '作业 JSON 已导出');
  const deleteRecord = (record: CopilotRecord) => onAction('delete-copilot-' + record.id, async () => { await rpc('copilot.delete', { id: record.id }); setRevision(value => value + 1); if (selection?.id === record.id) setSelection(undefined); }, '已从作业库移除，队列与历史版本保留');
  const start = async () => {
    if (disabledReason || starting) return;
    setStarting(true); setError('');
    await onAction('copilot-start-' + selectedDevice, async () => {
      await flush();
      const result = await rpc('copilot.start', { kind, deviceId: selectedDevice, requestId: crypto.randomUUID() });
      setRunId(result.id); setRunDetail(result); setRevision(value => value + 1);
    }, '作业执行已开始');
    setStarting(false);
  };
  const filtered = library.filter(record => `${record.title} ${record.stageName} ${record.author}`.toLowerCase().includes(query.toLowerCase()));
  const selectedPreviewRecords = preview?.entries.filter(entry => previewSelection.includes(entry.id)).map(entry => entry.record).filter((record): record is CopilotRecord => !!record) ?? [];
  const legacy = useMemo(() => snapshot.plans.flatMap(plan => plan.tasks.flatMap((task, taskIndex) => ['Copilot', 'SSSCopilot', 'ParadoxCopilot', 'VideoRecognition'].includes(task.type) ? [{ plan, task, taskIndex }] : [])), [snapshot.plans]);
  const current = selection ?? filtered[0];
  const startingHint = kind === 'SSSCopilot' ? '请停在保全派驻关卡选择界面。' : kind === 'ParadoxCopilot' ? '请停在悖论模拟关卡选择界面。' : enabled.length > 1 ? '请停在同一区域的地图界面；列表按顺序导航，不跨区域。' : workspace?.options.formation ? '请停在关卡的编队界面；自动编队会清空当前编队。' : '请先在游戏中选好关卡、模式与队伍，停在开始行动前的编队界面。';

  return <div className={`sp-page copilot-page ${detailOpen ? 'cp-show-detail' : ''}`}>
    <header className="sp-page-heading"><div><h1>作业中心</h1><p>导入作业，编排队列，在空闲设备上独立执行。</p></div><button className="button secondary" onClick={() => { if (importPanel.current) { importPanel.current.open = true; importPanel.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }}><Upload size={16} />导入作业</button></header>
    <div className="cp-type-bar" role="tablist" aria-label="作业类型">{kinds.map(item => <button key={item.value} role="tab" aria-selected={kind === item.value} className={kind === item.value ? 'is-selected' : ''} onClick={() => setKind(item.value)}>{item.label}</button>)}</div>
    <details className="cp-import sp-section" ref={importPanel} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (event.dataTransfer.files.length !== 1) { setError('请每次拖入一份 JSON，作业集可从编号导入。'); return; } void readFile(event.dataTransfer.files[0]); }}>
      <summary><Upload size={16} /><strong>导入本地 JSON 或社区代码</strong><span>先预览，再选择要保存的作业</span></summary>
      <div className="cp-import-grid"><div className="cp-file-drop"><FileJson size={25} /><strong>选择或拖入 JSON</strong><p>保留原始内容，每次导入保存独立版本。</p><button className="button secondary" disabled={importing} onClick={() => fileInput.current?.click()}><FolderOpen size={15} />选择 JSON 文件</button><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={onFile} /></div><form onSubmit={event => { event.preventDefault(); void requestPreview({ code: code.trim() }); }}><label className="cp-field">编号或原站链接<input className="text-input" aria-label="社区作业代码" value={code} maxLength={2048} onChange={event => setCode(event.target.value)} placeholder="12345、s12345、maa://12345" /></label><p className="sp-help">也支持 prts://12345、prts://s12345 和 PRTS Plus 原站链接。</p><button className="button secondary" disabled={importing || !code.trim()}><Search size={15} />解析代码</button><details className="cp-json-input"><summary>粘贴 JSON</summary><textarea className="text-input" aria-label="作业 JSON" rows={5} value={json} onChange={event => setJson(event.target.value)} placeholder='{"stage_name":"main_01-07","actions":[]}'/><button type="button" className="button secondary" disabled={!json.trim() || importing} onClick={() => { if (new TextEncoder().encode(json).byteLength > localSizeLimit) { setError('JSON 超过 480 KiB，请拆分后逐份导入。'); return; } void requestPreview({ content: json, name: '粘贴的作业.json' }); }}>预览 JSON</button></details></form></div>
    </details>
    {importing && <p className="cp-loading" role="status"><LoaderCircle size={16} className="spin"/>正在解析作业…</p>}
    {error && <div className="error-banner cp-feedback" role="alert">{error}<button className="icon-button" aria-label="关闭作业错误" onClick={() => setError('')}><X size={15}/></button></div>}
    {notice && <p className="cp-notice" role="status"><Check size={15}/>{notice}</p>}
    {!!importReport.length && <div className="error-banner" role="alert">{importReport.map((message, index) => <p key={index}>{message}</p>)}</div>}
    {preview && <section className="sp-section cp-preview" aria-label="导入预览"><header><div><h2>{preview.title || '导入预览'}</h2><p>核对类型、要求与异常条目；导入不会开始执行。</p></div><button className="icon-button" aria-label="关闭导入预览" onClick={() => setPreview(undefined)}><X size={17}/></button></header><div className="cp-preview-list">{preview.entries.map((entry, index) => <div className={`cp-preview-entry ${entry.error ? 'is-error' : ''}`} key={entry.id}><label><input type="checkbox" aria-label={`选择导入 ${index + 1}`} checked={previewSelection.includes(entry.id)} disabled={!entry.record || !!entry.error} onChange={event => setPreviewSelection(value => event.target.checked ? [...value, entry.id] : value.filter(id => id !== entry.id))}/><span className="cp-sequence">{String(index + 1).padStart(2, '0')}</span><strong>{entry.record?.title ?? `无法解析的第 ${index + 1} 项`}</strong></label>{entry.record && <><p>{kindLabel(entry.record.kind)} · {entry.record.stageName || '未标注关卡'} · {entry.record.author || '未标注作者'}</p><p className="sp-help">{entry.record.description}</p><Compatibility record={entry.record}/><button className="cp-link" onClick={() => openRecord(entry.record!)}>查看干员与作业详情</button></>}{entry.error && <p role="alert">{entry.error}</p>}</div>)}</div><div className="cp-preview-actions"><span>{previewSelection.length} / {preview.entries.length} 项已选择</span><button className="button secondary" disabled={importing || !previewSelection.length} onClick={() => void importPreview(false)}>导入到作业库</button><button className="button primary" disabled={importing || !selectedPreviewRecords.length || selectedPreviewRecords.some(record => record.kind !== kind) || (kind === 'SSSCopilot' && (selectedPreviewRecords.length !== 1 || !!workspace?.queue.length)) || !workspace} title={selectedPreviewRecords.some(record => record.kind !== kind) ? `先切换到${kindLabel(selectedPreviewRecords[0].kind)}，或仅导入到库` : undefined} onClick={() => void importPreview(true)}><Plus size={15}/>导入并加入当前队列</button></div></section>}
    <div className="cp-workspace"><section className="cp-browser" aria-label="作业库"><div className="cp-source-tabs" role="tablist" aria-label="作业来源"><button role="tab" aria-selected={tab === 'local'} onClick={() => setTab('local')}><FolderOpen size={16}/>本地作业<span>{library.length}</span></button><button role="tab" aria-selected={tab === 'community'} onClick={() => setTab('community')}><Search size={16}/>社区搜索</button></div>
      {tab === 'local' ? <><label className="cp-search"><Search size={16}/><input className="text-input" type="search" aria-label="搜索本地作业" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、关卡或作者"/><button className="icon-button" aria-label="刷新作业库" onClick={() => setRevision(value => value + 1)}><RefreshCw size={15}/></button></label>{loading ? <p className="cp-loading" role="status">正在读取作业库…</p> : filtered.length ? <div className="cp-record-list">{filtered.map(record => <article key={record.id} className={`cp-record ${current?.versionId === record.versionId ? 'is-selected' : ''}`} tabIndex={0} {...contextMenu('作业菜单', [{ label: '查看作业详情', action: () => openRecord(record) }, { label: '加入执行队列', action: () => addRecords([record]), disabled: !workspace || (kind === 'SSSCopilot' && !!workspace.queue.length) }, { label: '导出原始 JSON', action: () => { void exportRecord(record); } }, { label: '从作业库移除', danger: true, action: () => { void deleteRecord(record); } }])}><button className="cp-record-main" onClick={() => openRecord(record)}><span className="cp-stage">{record.stageName || kindLabel(record.kind)}</span><strong>{record.title}</strong><small>{record.author || '未标注作者'} · {record.source.kind === 'community' ? 'PRTS Plus' : record.source.kind === 'legacy' ? '旧任务表' : '本地 JSON'}</small></button><button className="icon-button" aria-label={`加入队列 ${record.title}`} title="加入队列，可重复添加" disabled={!workspace || (kind === 'SSSCopilot' && !!workspace.queue.length)} onClick={() => addRecords([record])}><Plus size={17}/></button></article>)}</div> : <div className="cp-empty"><BookOpen size={29}/><h3>{query ? '没有匹配的作业' : `还没有${kindLabel(kind)}`}</h3><p>{query ? '调整关键词，或清除搜索。' : '导入本地 JSON，或搜索社区作业。浏览和导入无需连接设备。'}</p></div>}</> : <><div className="cp-community-controls"><div className="cp-segmented" aria-label="社区搜索对象"><button aria-pressed={target === 'copilot'} onClick={() => { setTarget('copilot'); setPage(1); }}>作业</button><button aria-pressed={target === 'set'} onClick={() => { setTarget('set'); setPage(1); }}>作业集</button></div><label className="cp-field">关键词<input className="text-input" type="search" aria-label="社区搜索关键词" value={keyword} onChange={event => { setKeyword(event.target.value); setPage(1); }} placeholder="搜索标题或说明"/></label>{kind === 'Copilot' && target === 'copilot' && <label className="cp-field">关卡筛选<input className="text-input" aria-label="社区关卡筛选" value={stage} onChange={event => { setStage(event.target.value); setPage(1); }} placeholder="例如 1-7"/></label>}<p className="sp-help">默认按最新排序。输入编号或链接可从上方直接定位。</p></div>{searchError ? <div className="error-banner" role="alert">{searchError}<p>已导入的本地作业仍可使用。</p></div> : searching ? <p className="cp-loading" role="status"><LoaderCircle size={15} className="spin"/>正在搜索…</p> : searchResult?.items.length ? <div className="cp-record-list">{searchResult.items.map(item => <article key={item.id} className="cp-record"><button className="cp-record-main" onClick={() => void requestPreview({ code: target === 'set' ? `s${item.id}` : item.id })}><span className="cp-stage">{target === 'set' ? '作业集' : item.kind ? kindLabel(item.kind) : '社区作业'} · #{item.id}</span><strong>{item.title}</strong><small>{item.author || '未标注作者'}</small><p>{item.description}</p></button><button className="icon-button" aria-label={`预览 ${item.title}`} onClick={() => void requestPreview({ code: target === 'set' ? `s${item.id}` : item.id })}><Download size={17}/></button></article>)}</div> : <div className="cp-empty"><Search size={26}/><h3>没有匹配结果</h3><p>调整关键词或关卡，或使用编号定位。</p></div>}<div className="cp-pagination"><button className="button secondary" disabled={page <= 1 || searching} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} 页{searchResult ? ` · ${searchResult.total} 条` : ''}</span><button className="button secondary" disabled={!searchResult?.hasNext || searching} onClick={() => setPage(value => value + 1)}>下一页</button></div></>}
    </section>
    <aside className="cp-detail sp-section" aria-label="作业详情"><button className="cp-mobile-back button secondary" onClick={() => setDetailOpen(false)}><ArrowLeft size={15}/>返回作业列表</button>{current ? <><header className="cp-detail-heading"><span className="cp-stage">{current.stageName || '未标注关卡'}</span><h2>{current.title}</h2><p>{current.author || '未标注作者'} · {kindLabel(current.kind)}</p></header><Compatibility record={current}/><dl className="cp-meta"><div><dt>来源</dt><dd>{current.source.name || (current.source.kind === 'community' ? 'PRTS Plus' : '本地导入')}</dd></div><div><dt>最低核心版本</dt><dd>{current.minimumCoreVersion || '未声明'}</dd></div><div><dt>导入时间</dt><dd>{new Date(current.createdAt).toLocaleString('zh-CN')}</dd></div></dl>{current.description && <div className="cp-description"><h3>作业说明</h3><p>{current.description}</p></div>}<section className="cp-requirements"><h3>干员与要求</h3><p className="sp-help">来自作业内容，尚未核对当前账号练度；浏览不会触发设备识别。</p>{current.operators.length ? <ul>{current.operators.map((operator, index) => <li key={`${operator.name}-${index}`}><strong>{operator.name}</strong>{operator.skill !== undefined && <span>技能 {operator.skill}</span>}{operator.requirements && Object.keys(operator.requirements).length > 0 && <small>{Object.entries(operator.requirements).map(([name, value]) => `${name} ${String(value)}`).join(' · ')}</small>}</li>)}</ul> : <p className="sp-help">作业未声明干员要求。</p>}</section><div className="cp-detail-links">{safeLink(current.source.url) && <a href={safeLink(current.source.url)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/>查看原站</a>}{current.videos.map((video, index) => safeLink(video) && <a key={video} href={safeLink(video)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/>参考视频{index + 1}</a>)}</div><div className="cp-detail-actions"><button className="button primary" disabled={!workspace || !library.some(record => record.versionId === current.versionId) || (kind === 'SSSCopilot' && !!workspace.queue.length)} title={!library.some(record => record.versionId === current.versionId) ? '先从预览导入到作业库' : undefined} onClick={() => addRecords([current])}><Plus size={15}/>加入执行队列</button>{library.some(item => item.id === current.id) && <button className="button secondary" onClick={() => { void exportRecord(current); }}><Download size={15}/>导出 JSON</button>}</div></> : <div className="cp-empty"><FileJson size={28}/><h3>选择一份作业</h3><p>查看关卡、来源和干员要求后，再加入队列。</p></div>}</aside>
    <section className="cp-queue sp-section" aria-label="作业执行队列"><header><div><h2><ListOrdered size={18}/>{kindLabel(kind)}队列 <span>{enabled.length} / {workspace?.queue.length ?? 0}</span></h2><p>每项独立排序，可重复添加；修改只影响下次执行。</p></div><button className="cp-link" disabled={!workspace?.queue.some(entry => !entry.enabled)} onClick={() => edit(value => ({ ...value, queue: value.queue.filter(entry => entry.enabled) }))}>清除未勾选项</button></header>{!workspace ? <p role="status">正在读取队列…</p> : !workspace.queue.length ? <div className="cp-queue-empty"><Plus size={22}/><p>从作业库或导入预览中加入作业</p></div> : <ol className="cp-queue-list">{workspace.queue.map((entry, index) => { const record = queueRecords[entry.versionId]; return <li key={entry.id} className={!entry.enabled ? 'is-disabled' : ''} tabIndex={0} {...contextMenu('队列条目菜单', [{ label: entry.enabled ? '取消勾选' : '勾选执行', action: () => queueChange(entry.id, { enabled: !entry.enabled }) }, { label: '上移', action: () => move(entry.id, -1), disabled: index === 0 }, { label: '下移', action: () => move(entry.id, 1), disabled: index === workspace.queue.length - 1 }, { label: '重复添加', action: () => record && addRecords([record]), disabled: !record || kind === 'SSSCopilot' }, { label: '移除条目', action: () => remove(entry.id), danger: true }])}><div className="cp-queue-row"><input type="checkbox" aria-label={`执行队列 ${index + 1}`} checked={entry.enabled} onChange={event => queueChange(entry.id, { enabled: event.target.checked })}/><span className="cp-sequence">{String(index + 1).padStart(2, '0')}</span><button className="cp-queue-title" disabled={!record} onClick={() => record && openRecord(record)}><strong>{record?.title ?? '作业版本不可用'}</strong><small>{record?.stageName || entry.versionId.slice(0, 12)}</small></button><div className="cp-queue-actions"><button className="icon-button" aria-label={`上移作业 ${index + 1}`} disabled={index === 0} onClick={() => move(entry.id, -1)}><ArrowUp size={14}/></button><button className="icon-button" aria-label={`下移作业 ${index + 1}`} disabled={index === workspace.queue.length - 1} onClick={() => move(entry.id, 1)}><ArrowDown size={14}/></button><button className="icon-button" aria-label={`移除作业 ${index + 1}`} onClick={() => remove(entry.id)}><X size={15}/></button></div></div>{kind === 'Copilot' && <div className="cp-entry-options">{enabled.length > 1 && <label><input type="checkbox" checked={entry.isRaid} onChange={event => queueChange(entry.id, { isRaid: event.target.checked })}/>突袭</label>}{enabled.length > 1 && <label>导航关卡<input className="text-input" aria-label={`导航关卡 ${index + 1}`} value={entry.navName} onChange={event => queueChange(entry.id, { navName: event.target.value })} placeholder="沿用作业关卡" maxLength={200}/></label>}</div>}{record && record.compatibility.status !== 'ready' && <p className="cp-error-text">{record.compatibility.reasons.join('；')}</p>}{!record && <p className="cp-error-text">请移除或取消勾选此项后再执行。</p>}</li>; })}</ol>}
      {workspace && <><CopilotSettings kind={kind} count={enabled.length} options={workspace.options} change={options}/><div className="cp-save-state" role="status">{saveState}{saveError && <><span className="cp-error-text">{saveError}</span><button className="cp-link" onClick={() => void flush().catch(() => {})}>重试保存</button></>}</div></>}
      <div className="cp-launch"><label className="cp-field">目标设备<select className="text-input" aria-label="作业目标设备" value={selectedDevice} onChange={event => onSelectDevice(event.target.value)}><option value="">请选择空闲设备</option>{snapshot.devices.map(item => <option key={item.id} value={item.id}>{item.name} · {item.state === 'offline' ? '离线' : item.state === 'running' ? '执行中' : '已连接'}</option>)}</select></label><div className="cp-device-status" role="status">{checking && <LoaderCircle size={14} className="spin"/>}<span>{selectedDevice ? status?.error ?? status?.result?.reason ?? '正在检查设备…' : '浏览和导入无需连接设备'}</span>{status?.result?.ownerId && onViewRun && snapshot.runs.some(item => item.id === status.result?.ownerId) && <button className="cp-link" onClick={() => onViewRun(status.result!.ownerId!)}>查看占用</button>}</div><p className="cp-start-hint"><Info size={15}/>{startingHint}</p>{kind === 'Copilot' && <p className="sp-help">单份作业的普通、突袭和演习请在游戏内手动选择。连续作战限同一区域；助战与循环限制以核心反馈为准。不使用理智药或源石。</p>}<button className="button primary cp-start" disabled={!!disabledReason || starting} title={disabledReason || '使用已保存的队列与选项开始执行'} onClick={() => void start()}>{starting ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>}开始作业</button>{disabledReason && <p className="sp-help">{disabledReason}</p>}</div>
    </section></div>
    {run && <section className="sp-section cp-run" aria-label="作业运行状态"><header><div><span className="cp-stage">{snapshot.devices.find(item => item.id === run.deviceId)?.name ?? run.deviceId}</span><h2>{run.sourceName || run.planName || '作业执行'}</h2><p>{run.message}</p></div>{run.status === 'running' && <button className="button secondary" onClick={() => { void onAction('stop-' + run.id, () => rpc('run.stop', { id: run.id }), '正在停止作业'); }}><Square size={15}/>停止作业</button>}</header><progress max={100} value={run.progress} aria-label="作业执行进度"/><p className="sp-help">{new Date(run.startedAt).toLocaleString('zh-CN')} · {run.status === 'running' ? '运行中' : run.status === 'completed' ? '核心流程结束' : run.status === 'stopped' ? '已停止' : '执行失败'}。停止会清空核心队列，本机配置和未执行项保留。</p>{run.copilotEntries && <ol className="cp-run-entries">{run.copilotEntries.map((entry, index) => <li key={entry.id}><span className="cp-sequence">{String(index + 1).padStart(2, '0')}</span><strong>{entry.title}</strong><span className={`cp-verdict ${entry.verdict === 'failure' ? 'is-error' : ''}`}>{entry.verdict === 'success' ? '通关已确认' : entry.verdict === 'failure' ? '战斗失败' : '通关未确认'}</span><small>{entry.message || ({ waiting: '等待执行', running: '执行中', completed: '核心流程结束', failed: '失败', stopped: '已停止', skipped: '未执行' }[entry.status])}</small></li>)}</ol>}<details className="cp-run-logs"><summary>本次运行日志（{events.length}）</summary>{events.length ? <ol>{events.map(event => <li key={event.id}><time>{new Date(event.createdAt).toLocaleTimeString('zh-CN')}</time><span>{event.message}</span></li>)}</ol> : <p className="sp-help">等待本次运行事件。</p>}</details></section>}
    {!!legacy.length && <details className="sp-section cp-legacy"><summary>旧任务表作业 · {legacy.length} 项</summary><p className="sp-help">原配置保持可编辑与执行。复制会先解析预览，不删除或迁移原任务。视频识别继续使用旧入口。</p>{legacy.map(({ plan, task, taskIndex }) => <div key={`${plan.id}:${taskIndex}`} className="cp-legacy-row" tabIndex={0} {...contextMenu('旧作业配置菜单', [{ label: '编辑作业配置', action: () => onOpenPlan(plan, task.type, taskIndex) }, { label: '复制到作业库', disabled: task.type === 'VideoRecognition', action: () => { void requestPreview({ planId: plan.id, taskIndex }); } }])}><div><strong>{plan.name}</strong><span>{taskLabels[task.type]} · 第 {taskIndex + 1} 条任务</span><small>{String(task.params.filename ?? '作业列表')}</small></div><button className="cp-link" onClick={() => onOpenPlan(plan, task.type, taskIndex)}>编辑原配置</button>{task.type !== 'VideoRecognition' && <button className="button secondary" onClick={() => void requestPreview({ planId: plan.id, taskIndex })}>复制到作业库</button>}</div>)}</details>}
  </div>;
}

function Compatibility({ record }: { record: CopilotRecord }) {
  return <div className={`cp-compatibility ${record.compatibility.status === 'unsupported' ? 'is-error' : ''}`}><Info size={14}/><span>{record.compatibility.status === 'ready' ? '作业格式与当前资源已检查' : record.compatibility.status === 'unsupported' ? '当前不可执行' : '仍需核对核心与资源'}{record.compatibility.reasons.length > 0 && `：${record.compatibility.reasons.join('；')}`}</span></div>;
}

function CopilotSettings({ kind, count, options, change }: { kind: CopilotKind; count: number; options: CopilotOptions; change: (value: Partial<CopilotOptions>) => void }) {
  const operators: { name: string; skill: number }[] = options.additionalOperators;
  const additional = (value: { name: string; skill: number }[]) => change({ additionalOperators: value as CopilotOptions['additionalOperators'] });
  return <details className="cp-settings" open><summary>执行选项</summary><label className="cp-field">循环次数<input className="text-input" aria-label="作业循环次数" type="number" min={1} max={999} disabled={kind === 'ParadoxCopilot' || count > 1} value={options.loopTimes} onChange={event => { if (Number.isInteger(event.target.valueAsNumber) && event.target.valueAsNumber >= 1 && event.target.valueAsNumber <= 999) change({ loopTimes: event.target.valueAsNumber, ...(event.target.valueAsNumber > 1 ? { supportUnitName: '' } : {}) }); }}/></label>{(kind === 'ParadoxCopilot' || count > 1) && <p className="sp-help">悖论及多作业列表按单次队列执行；循环仅用于单份普通或保全作业。</p>}{kind === 'Copilot' && <><label className="cp-check"><input type="checkbox" checked={options.formation} onChange={event => change({ formation: event.target.checked, ...(!event.target.checked ? { supportUnitName: '', additionalOperators: [], addTrust: false, ignoreRequirements: false } : {}) })}/>自动编队</label>{options.formation && <><p className="cp-error-text">自动编队会清空当前编队，请先确认。</p><label className="cp-field">编队栏位<select className="text-input" aria-label="作业编队栏位" value={options.formationIndex} onChange={event => change({ formationIndex: Number(event.target.value) })}>{[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>{value === 0 ? '当前编队' : `第 ${value} 队`}</option>)}</select></label><label className="cp-check"><input type="checkbox" checked={options.addTrust} onChange={event => change({ addTrust: event.target.checked })}/>补充低信赖干员</label><label className="cp-check"><input type="checkbox" checked={options.ignoreRequirements} onChange={event => change({ ignoreRequirements: event.target.checked })}/>忽略练度要求</label><label className="cp-field">助战干员<input className="text-input" aria-label="助战干员" disabled={options.loopTimes > 1} value={options.supportUnitName} onChange={event => change({ supportUnitName: event.target.value })} placeholder="留空关闭助战" maxLength={80}/></label>{options.loopTimes > 1 && <p className="sp-help">循环执行时关闭助战；使用助战请改为执行 1 次。</p>}<div className="cp-additional"><strong>追加干员</strong>{operators.map((operator, index) => <div className="cp-additional-row" key={index}><input className="text-input" aria-label={`追加干员 ${index + 1}`} value={operator.name} maxLength={80} onChange={event => additional(operators.map((item, i) => i === index ? { ...item, name: event.target.value } : item))}/><select className="text-input" aria-label={`追加技能 ${index + 1}`} value={operator.skill} onChange={event => additional(operators.map((item, i) => i === index ? { ...item, skill: Number(event.target.value) } : item))}>{[1, 2, 3].map(skill => <option key={skill} value={skill}>技能 {skill}</option>)}</select><button className="icon-button" aria-label={`删除追加干员 ${index + 1}`} onClick={() => additional(operators.filter((_, i) => i !== index))}><Trash2 size={14}/></button></div>)}<button className="cp-link" disabled={options.additionalOperators.length >= 12} onClick={() => additional([...operators, { name: '', skill: 1 }])}><Plus size={14}/>追加干员</button></div></>}</>}<p className="sp-help">默认执行 1 次；药剂、源石与加急消耗为 0。运行中调整仅用于下次启动。</p></details>;
}
