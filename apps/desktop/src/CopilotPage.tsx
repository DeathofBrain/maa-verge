import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, ChevronRight, Download, ExternalLink, FileJson, FolderOpen, Info, ListOrdered, LoaderCircle, Play, Plus, RefreshCw, Search, Square, ThumbsDown, ThumbsUp, Trash2, Upload, X } from 'lucide-react';
import { errorMessage, rpc, RuntimeRequestError, taskLabels, type CopilotKind, type CopilotOptions, type CopilotPreview, type CopilotRecord, type CopilotWorkspace, type RpcResult } from '@maaverge/contracts';
import type { SupportPageProps } from './SupportPages';
import { useContextMenu } from './ContextMenu';
import CopilotOperators, { useCopilotRoster } from './CopilotOperators';
import { cachedCommunityPreview, invalidateCopilotPreview, readCopilotPreview, useCommunitySearch } from './copilot-community';
import './copilot-page.css';

type Props = SupportPageProps & {
  initialRunId?: string;
  initialLegacy?: { planId: string; taskIndex: number; nonce: string };
  onViewRun?: (id: string) => void;
  onRunSelection?: (id: string | undefined) => void;
};
type Availability = RpcResult<'device.availability'>;
type Run = RpcResult<'run.detail'>;
const kinds: { value: CopilotKind; label: string; short: string }[] = [
  { value: 'Copilot', label: '普通作业', short: '普通' },
  { value: 'SSSCopilot', label: '保全派驻', short: '保全' },
  { value: 'ParadoxCopilot', label: '悖论模拟', short: '悖论' },
];
const kindLabel = (kind: CopilotKind) => kinds.find(item => item.value === kind)?.label ?? kind;
const errorText = errorMessage;
const safeLink = (input: string) => { try { const url = new URL(input); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } };
const localSizeLimit = 480 * 1024;
let lastKind: CopilotKind = 'Copilot';
const uiSelection = (key: string) => { try { return sessionStorage.getItem('maaverge:copilot:' + key) ?? ''; } catch { return ''; } };
const saveSelection = (key: string, value: string) => { try { sessionStorage.setItem('maaverge:copilot:' + key, value); } catch { /* Selection is optional when session storage is unavailable. */ } };
let browseSession = { tab: 'local' as 'local' | 'community', target: 'copilot' as 'copilot' | 'set', keyword: '', stage: '', page: 1, query: '', localPage: 1, scrollTop: 0 };

function downloadJson(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const element = document.createElement('a'); element.href = url; element.download = filename; element.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Keep each type's edits ordered, including edits flushed while leaving the page. */
function useWorkspace(kind: CopilotKind) {
  const [, render] = useState(0);
  const currentKind = useRef(kind); currentKind.current = kind;
  const cache = useRef(new Map<CopilotKind, CopilotWorkspace>());
  const pending = useRef(new Map<CopilotKind, CopilotWorkspace>());
  const states = useRef(new Map<CopilotKind, { state: string; error: string }>());
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const status = useCallback((target: CopilotKind, state: string, message = '') => {
    states.current.set(target, { state, error: message });
    if (mounted.current && currentKind.current === target) render(value => value + 1);
  }, []);
  const flush = useCallback(async (target?: CopilotKind) => {
    if (!target) clearTimeout(timer.current);
    const task = chain.current.catch(() => {}).then(async () => {
      const changes = [...pending.current.values()].filter(value => !target || value.kind === target);
      for (const value of changes) pending.current.delete(value.kind);
      let failure: unknown;
      for (const value of changes) {
        status(value.kind, '保存中…');
        try {
          await rpc('copilot.workspace.save', { workspace: value });
          status(value.kind, pending.current.has(value.kind) ? '等待保存' : '已保存');
        } catch (cause) {
          if (!pending.current.has(value.kind)) pending.current.set(value.kind, cache.current.get(value.kind) ?? value);
          status(value.kind, '保存失败', errorText(cause));
          failure = cause;
        }
      }
      if (failure) throw failure;
    });
    chain.current = task;
    await task;
  }, [status]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; void flush().catch(() => {}); };
  }, [flush]);
  useEffect(() => {
    let cancelled = false;
    if (cache.current.has(kind)) return;
    void rpc('copilot.workspace.get', { kind }).then(value => {
      if (cancelled) return;
      cache.current.set(kind, value); status(kind, '已保存');
    }, cause => { if (!cancelled) status(kind, '读取失败', errorText(cause)); });
    return () => { cancelled = true; };
  }, [kind, status]);
  const edit = (update: (value: CopilotWorkspace) => CopilotWorkspace) => {
    const value = cache.current.get(currentKind.current); if (!value) return;
    const next = update(value);
    cache.current.set(next.kind, next); pending.current.set(next.kind, next); status(next.kind, '等待保存');
    clearTimeout(timer.current); timer.current = setTimeout(() => { void flush().catch(() => {}); }, 400);
  };
  const saved = states.current.get(kind);
  return { workspace: cache.current.get(kind), edit, flush, saveState: saved?.state ?? '', saveError: saved?.error ?? '' };
}

export default function CopilotPage({ snapshot, selectedDevice, onSelectDevice, onAction, onOpenPlan, searchQuery, initialRunId, initialLegacy, onViewRun, onRunSelection }: Props) {
  const contextMenu = useContextMenu();
  const [kind, setKindState] = useState<CopilotKind>(() => kinds.some(item => item.value === uiSelection('kind')) ? uiSelection('kind') as CopilotKind : lastKind);
  const [tab, setTab] = useState(browseSession.tab);
  const [query, setQuery] = useState(searchQuery ?? browseSession.query);
  const [libraries, setLibraries] = useState<Record<string, RpcResult<'copilot.list'>>>({});
  const [localPage, setLocalPage] = useState(browseSession.localPage);
  const [selection, setSelection] = useState<CopilotRecord>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailOrigin, setDetailOrigin] = useState<'library' | 'preview'>('library');
  const [loading, setLoading] = useState(true);
  const [finishedLibrary, setFinishedLibrary] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [availability, setAvailability] = useState<{ deviceId: string; result?: Availability; error?: string }>();
  const availabilityRef = useRef(availability); availabilityRef.current = availability;
  const checkedDevice = useRef('');
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState('');
  const [json, setJson] = useState('');
  const [preview, setPreview] = useState<CopilotPreview>();
  const [previewSelection, setPreviewSelection] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [savingImport, setSavingImport] = useState(false);
  const [importReport, setImportReport] = useState<string[]>([]);
  const [target, setTarget] = useState(browseSession.target);
  const [keyword, setKeyword] = useState(browseSession.keyword);
  const [stage, setStage] = useState(browseSession.stage);
  const [page, setPage] = useState(browseSession.page);
  const [runId, setRunId] = useState(initialRunId ?? uiSelection('run'));
  const [runDetail, setRunDetail] = useState<Run>();
  const runNavigation = useRef(initialRunId ?? '');
  const [starting, setStarting] = useState(false);
  const [checkingQueue, setQueueChecking] = useState(false);
  // Missing keys are pending reads; null records have failed validation.
  const [queueRecords, setQueueRecords] = useState<Record<string, CopilotRecord | null>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const importPanel = useRef<HTMLDetailsElement>(null);
  const previewRequest = useRef(0);
  const previewParams = useRef<import('@maaverge/contracts').RpcParams<'copilot.preview'> | undefined>(undefined);
  const activeKind = useRef(kind); activeKind.current = kind;
  const pageRoot = useRef<HTMLDivElement>(null);
  const listScroll = useRef(browseSession.scrollTop);
  const restoreScroll = useRef<number | undefined>(browseSession.scrollTop);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const runPanel = useRef<HTMLElement>(null);
  const { workspace, edit, flush, saveState, saveError } = useWorkspace(kind);
  const latestEvent = snapshot.events.at(-1)?.id;
  const device = snapshot.devices.find(item => item.id === selectedDevice);
  const roster = useCopilotRoster(snapshot, selectedDevice);
  const resourceKey = snapshot.updates.filter(channel => channel.id !== 'app').map(channel => channel.currentVersion).join(':');
  const { result: searchResult, searching, error: searchError, refresh: refreshSearch } = useCommunitySearch({ target, keyword, page, ...(kind === 'Copilot' && target === 'copilot' && stage.trim() ? { stage: stage.trim() } : {}) }, tab === 'community', `${kind}:${resourceKey}`);
  const libraryKey = `${kind}:${localPage}`;
  const localResult = libraries[libraryKey];
  const library = localResult?.items ?? [];
  const localPaging = localResult ?? { total: 0, hasNext: false };
  const libraryReady = !!localResult;
  const status = availability?.deviceId === selectedDevice ? availability : undefined;
  const liveRuns = snapshot.runs.filter(item => item.source === 'copilot');
  const selectedSummary = liveRuns.find(item => item.id === runId);
  const matchingSummary = liveRuns.find(item => item.status === 'running') ?? liveRuns[0];
  const summary = runId ? selectedSummary : matchingSummary;
  const detailId = runId || matchingSummary?.id;
  const run = runDetail?.id === detailId ? runDetail : summary;
  const events = snapshot.events.filter(event => event.data.runId === run?.id).slice(-60);
  const enabled = workspace?.queue.filter(entry => entry.enabled) ?? [];
  const queueChecking = checkingQueue || !!workspace?.queue.some(entry => queueRecords[entry.versionId] === undefined);
  const queueProblem = enabled.find(entry => queueRecords[entry.versionId]?.compatibility.status !== 'ready');
  const disabledReason = !selectedDevice ? '请选择目标设备' : checking ? '正在检查设备占用' : status?.error ?? (!status?.result?.available ? status?.result?.reason ?? '等待设备检查' : !workspace ? '正在读取队列' : !enabled.length ? '请先添加并勾选作业' : queueChecking ? '正在检查作业版本' : queueProblem ? '队列含不可用作业，请查看原因并移除或取消勾选' : saveError ? '请先重试保存配置' : '');
  const setKind = (value: CopilotKind) => {
    if (value === kind) return;
    // Consume external navigation without clearing the monitored runId.
    runNavigation.current = ''; onRunSelection?.(undefined);
    previewRequest.current++; setImporting(false); lastKind = value; saveSelection('kind', value); setKindState(value); setLocalPage(1); setDetailOpen(false); setSelection(undefined); setPreview(undefined); setError('');
  };

  useEffect(() => { browseSession = { ...browseSession, tab, target, keyword, stage, page, query, localPage }; }, [tab, target, keyword, stage, page, query, localPage]);
  useLayoutEffect(() => {
    if (restoreScroll.current === undefined || (tab === 'local' ? !libraryReady : !searchResult)) return;
    if (pageRoot.current) pageRoot.current.scrollTop = restoreScroll.current;
    restoreScroll.current = undefined;
  }, [tab, libraryReady, searchResult]);
  useEffect(() => { if (detailOpen) { detailHeading.current?.focus({ preventScroll: true }); if (pageRoot.current) pageRoot.current.scrollTop = 0; } }, [detailOpen, selection?.id, selection?.versionId]);
  useEffect(() => () => { previewRequest.current++; }, []);

  useEffect(() => { saveSelection('run', runId); }, [runId]);
  useEffect(() => { if (searchQuery !== undefined) setQuery(searchQuery); }, [searchQuery]);
  useEffect(() => {
    let cancelled = false; setLoading(true);
    void rpc('copilot.list', { kind, page: localPage }).then(value => { if (!cancelled) setLibraries(current => ({ ...current, [libraryKey]: value })); }, cause => { if (!cancelled) setError(errorText(cause)); }).finally(() => { if (!cancelled) { setLoading(false); setFinishedLibrary(libraryKey); } });
    return () => { cancelled = true; };
  }, [kind, localPage, revision]);
  useEffect(() => {
    if (!selectedDevice) { checkedDevice.current = ''; setAvailability(undefined); setChecking(false); return; }
    const deviceKey = `${selectedDevice}:${device?.state}`;
    // Runtime events still refresh ownership, without hiding a known result.
    let cancelled = false; setChecking(checkedDevice.current !== deviceKey || availabilityRef.current?.deviceId !== selectedDevice);
    void rpc('device.availability', { deviceId: selectedDevice }).then(result => { if (!cancelled) { checkedDevice.current = deviceKey; setAvailability({ deviceId: selectedDevice, result }); } }, cause => { if (!cancelled) { checkedDevice.current = deviceKey; setAvailability({ deviceId: selectedDevice, error: errorText(cause) }); } }).finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [selectedDevice, device?.state, latestEvent, revision]);
  useEffect(() => {
    let cancelled = false; setQueueChecking(true);
    const versions = [...new Set(workspace?.queue.map(item => item.versionId) ?? [])];
    void Promise.all(versions.map(async versionId => { try { return await rpc('copilot.get', { versionId }); } catch { return undefined; } })).then(records => {
      if (!cancelled) {
        setQueueRecords(current => {
          const next = { ...current };
          versions.forEach((versionId, index) => { next[versionId] = records[index] ?? null; });
          return next;
        });
        setQueueChecking(false);
      }
    });
    return () => { cancelled = true; };
  }, [workspace?.queue.map(entry => entry.versionId).join(','), resourceKey, revision]);
  useEffect(() => {
    if (!detailId) { setRunDetail(undefined); return; }
    let cancelled = false;
    void rpc('run.detail', { id: detailId }).then(value => {
      if (cancelled) return;
      setRunDetail(value);
      // An explicit selection can be older than the snapshot's recent-run window.
      if (runNavigation.current === value.id) {
        runNavigation.current = '';
        if (value.copilotKind) { lastKind = value.copilotKind; saveSelection('kind', value.copilotKind); setKindState(value.copilotKind); setLocalPage(1); }
      }
    }, cause => { if (!cancelled) setError(errorText(cause)); });
    return () => { cancelled = true; };
  }, [detailId, runId, summary?.progress, summary?.status, latestEvent]);
  useEffect(() => { if (initialRunId && initialRunId !== runId) { runNavigation.current = initialRunId; setRunId(initialRunId); } }, [initialRunId]);
  const requestPreview = useCallback(async (params: import('@maaverge/contracts').RpcParams<'copilot.preview'>, showDetail = false, refresh = false) => {
    const sequence = ++previewRequest.current;
    const cached = refresh ? undefined : cachedCommunityPreview(params, resourceKey);
    setImporting(!cached); setError(''); setImportReport([]);
    if (!refresh) {
      detailTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      listScroll.current = pageRoot.current?.scrollTop ?? 0;
    }
    try {
      const result = cached ?? await readCopilotPreview(params, resourceKey, refresh);
      if (sequence !== previewRequest.current) return;
      previewParams.current = params;
      setPreview(result); setPreviewSelection(result.entries.filter(entry => entry.record && !entry.error).map(entry => entry.id));
      const record = showDetail && result.entries.length === 1 ? result.entries[0].record : undefined;
      setSelection(record ?? undefined); setDetailOrigin('preview'); setDetailOpen(!!record);
      if (importPanel.current) importPanel.current.open = false;
    } catch (cause) { if (sequence === previewRequest.current) setError(errorText(cause)); }
    finally { if (sequence === previewRequest.current) setImporting(false); }
  }, [resourceKey]);
  useEffect(() => {
    if (!initialLegacy || uiSelection('legacy-nonce') === initialLegacy.nonce) return;
    saveSelection('legacy-nonce', initialLegacy.nonce);
    void requestPreview({ planId: initialLegacy.planId, taskIndex: initialLegacy.taskIndex });
  }, [initialLegacy?.nonce, requestPreview]);
  const readFile = async (file?: File) => {
    if (!file) return;
    if (file.size > localSizeLimit) { setError('这份 JSON 超过 480 KiB，请拆分后逐份导入。'); return; }
    try { const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer()); await requestPreview({ content, name: file.name }); } catch (cause) { setError(errorText(cause)); }
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
  const importPreview = async (addToQueue: boolean, entryIds = previewSelection) => {
    if (!preview || !entryIds.length) return;
    const sequence = ++previewRequest.current;
    const keepPreview = detailOpen && preview.entries.length > 1 && entryIds.length === 1;
    setImporting(true); setSavingImport(true); setError('');
    try {
      let result: RpcResult<'copilot.import'>;
      let effectiveEntryIds = entryIds;
      try { result = await rpc('copilot.import', { previewId: preview.id, entryIds }); }
      catch (cause) {
        if (!(cause instanceof RuntimeRequestError) || cause.code !== -32004 || !previewParams.current) throw cause;
        // A service preview may expire or be evicted while its UI detail is cached.
        // Re-read it once, importing only if the selected immutable versions match.
        const fresh = await readCopilotPreview(previewParams.current, resourceKey, true);
        if (sequence !== previewRequest.current || activeKind.current !== kind) return;
        const indexes = preview.entries.flatMap((entry, index) => entryIds.includes(entry.id) ? [index] : []);
        const identity = (record: CopilotRecord | null | undefined) => record ? JSON.stringify([record.versionId, record.source.kind, record.source.communityId, record.source.setId]) : '';
        const unchanged = indexes.every(index => identity(preview.entries[index].record) && identity(preview.entries[index].record) === identity(fresh.entries[index]?.record) && !fresh.entries[index]?.error);
        const nextIds = indexes.flatMap(index => fresh.entries[index]?.record && !fresh.entries[index].error ? [fresh.entries[index].id] : []);
        effectiveEntryIds = nextIds;
        setPreview(fresh); setPreviewSelection(previewSelection.flatMap(id => { const index = preview.entries.findIndex(entry => entry.id === id); return fresh.entries[index]?.record && !fresh.entries[index].error ? [fresh.entries[index].id] : []; }));
        const selectedIndex = preview.entries.findIndex(entry => entry.record?.id === selection?.id && entry.record?.versionId === selection?.versionId);
        if (selectedIndex >= 0) setSelection(fresh.entries[selectedIndex]?.record ?? undefined);
        if (!unchanged) { setDetailOpen(false); setError('社区作业内容已更新或不可用，请核对新的预览后再导入。'); return; }
        result = await rpc('copilot.import', { previewId: fresh.id, entryIds: nextIds });
      }
      if (sequence !== previewRequest.current || activeKind.current !== kind) { setRevision(value => value + 1); return; }
      setImportReport(result.errors.map(item => item.message)); setLocalPage(1); setRevision(value => value + 1); setNotice(`已导入 ${result.items.length} 份作业`);
      if (addToQueue) addRecords(result.items);
      if (!result.errors.length && !keepPreview) { setPreview(undefined); setTab('local'); }
      if (keepPreview) setPreviewSelection(value => value.filter(id => !effectiveEntryIds.includes(id)));
      if (result.items[0]) { if (!addToQueue && result.items[0].kind !== kind) setKind(result.items[0].kind); setSelection(result.items[0]); setDetailOrigin(keepPreview ? 'preview' : 'library'); setDetailOpen(!addToQueue); }
    } catch (cause) { if (sequence === previewRequest.current) setError(errorText(cause)); }
    finally { setSavingImport(false); if (sequence === previewRequest.current) setImporting(false); }
  };
  const queueChange = (id: string, patch: Partial<CopilotWorkspace['queue'][number]>) => edit(value => ({ ...value, queue: value.queue.map(item => item.id === id ? { ...item, ...patch } : item) }));
  const remove = (id: string) => edit(value => ({ ...value, queue: value.queue.filter(item => item.id !== id) }));
  const move = (id: string, delta: number) => edit(value => { const queue = [...value.queue], index = queue.findIndex(item => item.id === id), next = index + delta; if (index < 0 || next < 0 || next >= queue.length) return value; [queue[index], queue[next]] = [queue[next], queue[index]]; return { ...value, queue }; });
  const options = (patch: Partial<CopilotOptions>) => edit(value => ({ ...value, options: { ...value.options, ...patch } }));
  const openRecord = (record: CopilotRecord, origin: 'library' | 'preview' = 'library') => { listScroll.current = pageRoot.current?.scrollTop ?? 0; detailTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSelection(record); setDetailOrigin(preview ? 'preview' : origin); setDetailOpen(true); };
  const closeDetail = () => { setDetailOpen(false); if (detailOrigin === 'preview' && preview?.entries.length === 1) setPreview(undefined); requestAnimationFrame(() => { if (pageRoot.current) pageRoot.current.scrollTop = listScroll.current; if (detailTrigger.current?.isConnected) detailTrigger.current.focus({ preventScroll: true }); }); };
  const openImport = () => { if (importPanel.current) { importPanel.current.open = true; importPanel.current.scrollIntoView({ block: 'nearest' }); } };
  const showLibrary = (source = tab) => { if (savingImport) return; previewRequest.current++; setImporting(false); setDetailOpen(false); setPreview(undefined); setTab(source); };
  const exportRecord = (record: CopilotRecord) => onAction('export-copilot-' + record.versionId, async () => { const result = await rpc('copilot.export', { id: record.id, versionId: record.versionId }); downloadJson(result.filename, result.content); downloadJson(result.attribution.filename, result.attribution.content); }, '作业 JSON 与来源署名说明已导出');
  const deleteRecord = (record: CopilotRecord) => onAction('delete-copilot-' + record.id, async () => { await rpc('copilot.delete', { id: record.id }); setLocalPage(1); setRevision(value => value + 1); if (selection?.id === record.id) { setSelection(undefined); setDetailOpen(false); } }, '已从作业库移除，队列与历史版本保留');
  const start = async () => {
    if (disabledReason || starting) return;
    setStarting(true); setError('');
    await onAction('copilot-start-' + selectedDevice, async () => {
      await flush(kind);
      const result = await rpc('copilot.start', { kind, deviceId: selectedDevice, requestId: crypto.randomUUID() });
      setRunId(result.id); onRunSelection?.(result.id); setRunDetail(result); setRevision(value => value + 1);
      requestAnimationFrame(() => runPanel.current?.scrollIntoView({ block: 'nearest' }));
    }, '作业执行已开始');
    setStarting(false);
  };
  const filtered = (libraryReady ? library : []).filter(record => `${record.title} ${record.stageName} ${record.author}`.toLowerCase().includes(query.toLowerCase()));
  const selectedPreviewRecords = preview?.entries.filter(entry => previewSelection.includes(entry.id)).map(entry => entry.record).filter((record): record is CopilotRecord => !!record) ?? [];
  const legacy = useMemo(() => snapshot.plans.flatMap(plan => plan.tasks.flatMap((task, taskIndex) => ['Copilot', 'SSSCopilot', 'ParadoxCopilot', 'VideoRecognition'].includes(task.type) ? [{ plan, task, taskIndex }] : [])), [snapshot.plans]);
  const current = selection;
  const currentPreviewEntry = preview?.entries.find(entry => entry.record?.versionId === current?.versionId && entry.record?.id === current?.id);
  const isStored = !!current && (queueRecords[current.versionId]?.id === current.id || library.some(record => record.id === current.id && record.versionId === current.versionId));
  const canQueue = !!workspace && (kind !== 'SSSCopilot' || !workspace.queue.length);
  const usesNavigation = kind === 'Copilot' && (workspace?.options.loopTimes ?? 1) === 1;
  const startingHint = kind === 'SSSCopilot' ? '在保全关卡详情的「开始部署」界面开始，请先手动编队。' : kind === 'ParadoxCopilot' ? '在所选干员的悖论关卡中手动选择技能，停在有「开始模拟」按钮的界面。' : usesNavigation ? `在作业所在区域的关卡地图开始，队列会自动导航，无需先进入干员选择页。${workspace?.options.formation ? '自动编队会清空并重建当前队伍。' : '请提前配好队伍与技能。'}` : '单份循环请停在有「开始行动」按钮的编队界面；请确认队伍与技能。';

  return <div ref={pageRoot} className="sp-page copilot-page" onScroll={event => { if (!detailOpen && !preview) browseSession.scrollTop = event.currentTarget.scrollTop; }}>
    <header className="sp-page-heading"><div><h1>作业中心</h1><p>找到合适的作业，确认干员要求，再加入队列执行。</p></div><button className="button secondary" disabled={savingImport} onClick={openImport}><Upload size={16} />导入作业</button></header>
    <div className="cp-type-bar" role="tablist" aria-label="作业类型">{kinds.map(item => <button key={item.value} role="tab" aria-selected={kind === item.value} className={kind === item.value ? 'is-selected' : ''} disabled={importing} onClick={() => setKind(item.value)}>{item.label}</button>)}</div>
    <div className="cp-content">
    <details className="cp-import sp-section" ref={importPanel} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (event.dataTransfer.files.length !== 1) { setError('请每次拖入一份 JSON，作业集可从编号导入。'); return; } void readFile(event.dataTransfer.files[0]); }}>
      <summary><Upload size={16} /><strong>导入本地 JSON 或社区代码</strong><span>先预览，再选择要保存的作业</span></summary>
      <div className="cp-import-grid"><div className="cp-file-drop"><FileJson size={25} /><strong>选择或拖入 JSON</strong><p>保留原始内容，每次导入保存独立版本。</p><button className="button secondary" disabled={importing} onClick={() => fileInput.current?.click()}><FolderOpen size={15} />选择 JSON 文件</button><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={onFile} /></div><form onSubmit={event => { event.preventDefault(); void requestPreview({ code: code.trim() }); }}><label className="cp-field">编号或原站链接<input className="text-input" aria-label="社区作业代码" value={code} maxLength={2048} onChange={event => setCode(event.target.value)} placeholder="12345、s12345、maa://12345" /></label><p className="sp-help">也支持 prts://12345、prts://s12345 和 PRTS Plus 原站链接。</p><button className="button secondary" disabled={importing || !code.trim()}><Search size={15} />解析代码</button><details className="cp-json-input"><summary>粘贴 JSON</summary><textarea className="text-input" aria-label="作业 JSON" rows={5} value={json} onChange={event => setJson(event.target.value)} placeholder='{"stage_name":"main_01-07","actions":[]}'/><button type="button" className="button secondary" disabled={!json.trim() || importing} onClick={() => { if (new TextEncoder().encode(json).byteLength > localSizeLimit) { setError('JSON 超过 480 KiB，请拆分后逐份导入。'); return; } void requestPreview({ content: json, name: '粘贴的作业.json' }); }}>预览 JSON</button></details></form></div>
    </details>

    {error && <div className="error-banner cp-feedback" role="alert">{error}<button className="icon-button" aria-label="关闭作业错误" onClick={() => setError('')}><X size={15}/></button></div>}
    {notice && <p className="cp-notice" role="status"><Check size={15}/>{notice}</p>}
    {!!importReport.length && <div className="error-banner" role="alert">{importReport.map((message, index) => <p key={index}>{message}</p>)}</div>}
    <div className="cp-workspace"><div className="cp-main">
    {importing && <p className="cp-preview-loading" role="status"><LoaderCircle size={16} className="spin"/>{savingImport ? '正在保存作业…' : '正在读取作业…'}</p>}
    {preview && <section hidden={detailOpen} className="sp-section cp-preview" aria-label="导入预览"><header><div><h2>{preview.title || '导入预览'}</h2><p>{preview.entries.length > 1 ? `共 ${preview.entries.length} 项，按作业集原顺序排列；可逐项查看详情并选择导入。` : '核对类型、要求与异常条目；导入不会开始执行。'}</p></div>{previewParams.current?.code && <button className="cp-link" disabled={importing} onClick={() => void requestPreview(previewParams.current!, false, true)}><RefreshCw size={14}/>刷新导入预览</button>}<button className="icon-button" aria-label="关闭导入预览" onClick={() => { setPreview(undefined); setDetailOpen(false); }}><X size={17}/></button></header>{preview.entries.length > 1 && <div className="cp-preview-selection"><button className="cp-link" onClick={() => setPreviewSelection(preview.entries.filter(entry => entry.record && !entry.error).map(entry => entry.id))}>全选可用作业</button><button className="cp-link" onClick={() => setPreviewSelection([])}>取消全选</button></div>}<div className="cp-preview-list">{preview.entries.map((entry, index) => <div className={`cp-preview-entry ${entry.error ? 'is-error' : ''}`} key={entry.id}><label><input type="checkbox" aria-label={`选择导入 ${index + 1}`} checked={previewSelection.includes(entry.id)} disabled={!entry.record || !!entry.error} onChange={event => setPreviewSelection(value => event.target.checked ? [...value, entry.id] : value.filter(id => id !== entry.id))}/><span className="cp-sequence">{String(index + 1).padStart(2, '0')}</span><strong>{entry.record?.title ?? `无法解析的第 ${index + 1} 项`}</strong></label>{entry.record && <><p>{kindLabel(entry.record.kind)} · {entry.record.stageName || '未标注关卡'} · 作者：{entry.record.author || '未标注'}</p>{entry.record.source.kind === 'community' && <p className="sp-help">上传者：{entry.record.uploader || '未标注'}</p>}<p className="sp-help">{entry.record.description}</p><CopilotOperators operators={entry.record.operators} resourceKey={resourceKey} roster={roster} compact/><Compatibility record={entry.record}/><button className="cp-link" onClick={() => openRecord(entry.record!, 'preview')}>查看干员与作业详情</button></>}{entry.error && <p role="alert">{entry.error}</p>}</div>)}</div><div className="cp-preview-actions"><span>{previewSelection.length} / {preview.entries.length} 项已选择</span><button className="button secondary" disabled={importing || !previewSelection.length} onClick={() => void importPreview(false)}>导入到作业库</button><button className="button primary" disabled={importing || !selectedPreviewRecords.length || selectedPreviewRecords.some(record => record.kind !== kind) || (kind === 'SSSCopilot' && (selectedPreviewRecords.length !== 1 || !!workspace?.queue.length)) || !workspace} title={selectedPreviewRecords.some(record => record.kind !== kind) ? `先切换到${kindLabel(selectedPreviewRecords[0].kind)}，或仅导入到库` : undefined} onClick={() => void importPreview(true)}><Plus size={15}/>导入并加入当前队列</button></div></section>}
    <section className="cp-browser" aria-label="作业库" hidden={detailOpen || !!preview}><div className="cp-source-tabs" role="tablist" aria-label="作业来源"><button role="tab" aria-selected={tab === 'local'} onClick={() => showLibrary('local')}><FolderOpen size={16}/>本地作业<span>{localPaging.total}</span></button><button role="tab" aria-selected={tab === 'community' && target === 'copilot'} onClick={() => { if (target !== 'copilot') setPage(1); setTarget('copilot'); showLibrary('community'); }}><Search size={16}/>社区搜索</button><button role="tab" aria-selected={tab === 'community' && target === 'set'} onClick={() => { if (target !== 'set') setPage(1); setTarget('set'); showLibrary('community'); }}><BookOpen size={16}/>社区作业集</button></div>

      {tab === 'local' ? <><label className="cp-search"><Search size={16}/><input className="text-input" type="search" aria-label="搜索本地作业" value={query} onChange={event => setQuery(event.target.value)} placeholder="筛选本页标题、关卡或作者"/><button className="icon-button" aria-label="刷新作业库" onClick={() => setRevision(value => value + 1)}><RefreshCw size={15}/></button></label>{!libraryReady && finishedLibrary !== libraryKey ? <p className="cp-loading" role="status">正在读取作业库…</p> : filtered.length ? <div className="cp-record-list">{filtered.map(record => <article key={record.id} className="cp-record" tabIndex={0} {...contextMenu('作业菜单', [{ label: '查看作业详情', action: () => openRecord(record) }, { label: '加入执行队列', action: () => addRecords([record]), disabled: !workspace || (kind === 'SSSCopilot' && !!workspace.queue.length) }, { label: '导出原始 JSON', action: () => { void exportRecord(record); } }, { label: '从作业库移除', danger: true, action: () => { void deleteRecord(record); } }])}><button className="cp-record-main" onClick={() => openRecord(record)}><span className="cp-stage">{record.stageName || kindLabel(record.kind)}</span><strong>{record.title}</strong><small>作者：{record.author || '未标注'}{record.source.kind === 'community' && ` · 上传者：${record.uploader || '未标注'}`} · {record.source.kind === 'community' ? 'PRTS Plus' : record.source.kind === 'legacy' ? '旧任务表' : '本地 JSON'}{record.source.setId && ` · 作业集 #${record.source.setId}`}</small></button><CopilotOperators operators={record.operators} resourceKey={resourceKey} roster={roster} compact/><button className="button secondary cp-record-add" aria-label={`加入队列 ${record.title}`} title="加入队列，可重复添加" disabled={!workspace || (kind === 'SSSCopilot' && !!workspace.queue.length)} onClick={() => addRecords([record])}><Plus size={15}/>加入队列</button></article>)}</div> : <div className="cp-empty"><BookOpen size={29}/><h3>{query ? '没有匹配的作业' : `还没有${kindLabel(kind)}`}</h3><p>{query ? '当前页没有匹配结果，可翻页或清除搜索。' : '导入本地 JSON，或搜索社区作业。浏览和导入无需连接设备。'}</p>{!query && <div className="cp-empty-actions"><button className="button primary" onClick={() => showLibrary('community')}><Search size={15}/>去社区找作业</button><button className="button secondary" disabled={savingImport} onClick={openImport}><Upload size={15}/>导入本地作业</button></div>}</div>}<div className="cp-pagination"><button className="button secondary" aria-label="本地作业上一页" disabled={localPage <= 1 || loading} onClick={() => setLocalPage(value => value - 1)}>上一页</button><span>第 {localPage} 页 · 共 {localPaging.total} 份</span><button className="button secondary" aria-label="本地作业下一页" disabled={!localPaging.hasNext || loading} onClick={() => setLocalPage(value => value + 1)}>下一页</button></div></> : <><div className="cp-community-controls"><label className="cp-field">关键词<input className="text-input" type="search" aria-label="社区搜索关键词" value={keyword} onChange={event => { setKeyword(event.target.value); setPage(1); }} placeholder={target === 'set' ? '搜索作业集名称或说明' : '搜索标题或说明'}/></label>{kind === 'Copilot' && target === 'copilot' && <label className="cp-field">关卡筛选<input className="text-input" aria-label="社区关卡筛选" value={stage} onChange={event => { setStage(event.target.value); setPage(1); }} placeholder="例如 1-7"/></label>}<div className="cp-search-actions"><p className="sp-help">{target === 'set' ? '点进作业集查看成员，可逐项选择并按原顺序加入队列。' : '默认按最新排序，也可以用编号或链接直接导入。'}</p><button className="icon-button" aria-label="刷新社区搜索" title="刷新搜索结果" disabled={searching} onClick={refreshSearch}><RefreshCw size={15}/></button></div></div><div className="cp-search-status" role="status">{searching && <><LoaderCircle size={15} className="spin"/>{searchResult ? '正在更新搜索结果…' : '正在搜索…'}</>}</div><div className="cp-community-results" aria-busy={searching}>{searchError && <div className="error-banner" role="alert">{searchError}<p>{searchResult ? '已保留上次搜索结果，可点击刷新重试。' : '可点击刷新重试，已导入的本地作业仍可使用。'}</p></div>}{searchResult?.items.length ? <div className="cp-record-list">{searchResult.items.map(item => <article key={item.id} className="cp-record"><button className="cp-record-main" onClick={() => void requestPreview({ code: target === 'set' ? `s${item.id}` : item.id }, true)}><span className="cp-stage">{target === 'set' ? '作业集' : item.kind ? kindLabel(item.kind) : '社区作业'} · #{item.id}</span><strong>{item.title}</strong><small>上传者：{item.uploader || '未标注'} · 作者：{item.author || '未标注'}</small><p>{item.description}</p></button>{target === 'copilot' && <CopilotOperators operators={item.operators} resourceKey={resourceKey} roster={roster} compact/>}<button className="icon-button" aria-label={`查看详情 ${item.title}`} onClick={() => void requestPreview({ code: target === 'set' ? `s${item.id}` : item.id }, true)}><ChevronRight size={19}/></button></article>)}</div> : !searching && !searchError ? <div className="cp-empty"><Search size={26}/><h3>没有匹配结果</h3><p>调整关键词或关卡，或使用编号定位。</p></div> : null}</div><div className="cp-pagination"><button className="button secondary" disabled={page <= 1 || searching} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} 页{searchResult ? ` · ${searchResult.total} 条` : ''}</span><button className="button secondary" disabled={!searchResult?.hasNext || searching} onClick={() => setPage(value => value + 1)}>下一页</button></div></>}
      <p className="cp-community-note" aria-label="社区服务与内容归属">社区服务由 <a href="https://prts.plus/" target="_blank" rel="noopener noreferrer">PRTS Plus <ExternalLink size={11}/></a> 提供。作业、说明和视频权利归各权利人；转载请遵循原作者声明，不因导入而改用本项目 AGPL。</p>
    </section>
    {detailOpen && current && <aside className="cp-detail sp-section" aria-label="作业详情">
      <div className="cp-detail-toolbar"><button className="cp-back cp-link" disabled={importing} onClick={closeDetail}><ArrowLeft size={15}/>{detailOrigin === 'preview' && preview && preview.entries.length > 1 ? '返回导入预览' : '返回作业列表'}</button><span>{isStored ? '已保存到本地' : '社区预览 · 尚未导入'}</span>{detailOrigin === 'preview' && previewParams.current?.code && <button className="cp-link" disabled={importing} onClick={() => void requestPreview(previewParams.current!, preview?.entries.length === 1, true)}><RefreshCw size={14}/>{preview && preview.entries.length > 1 ? '刷新作业集' : '刷新作业详情'}</button>}</div>
      <header className="cp-detail-heading"><span className="cp-stage">{current.stageName || '未标注关卡'} · {kindLabel(current.kind)}</span><h2 ref={detailHeading} tabIndex={-1}>{current.title}</h2><p>作者：{current.author || '未标注'}{current.source.kind === 'community' && ` · 上传者：${current.uploader || '未标注'}`}</p></header>
      <Compatibility record={current}/>
      {current.source.kind === 'community' && <CopilotRating key={`${current.id}:${current.versionId}:${preview?.id ?? 'stored'}`} record={current} refreshKey={`${run?.id}:${run?.status}`} onSourceExpired={() => { if (previewParams.current) invalidateCopilotPreview(previewParams.current, resourceKey); }}/>}
      <div className="cp-detail-actions">
        {isStored ? <><button className="button primary" disabled={!canQueue || current.kind !== kind} onClick={() => addRecords([current])}><Plus size={15}/>加入执行队列</button><button className="button secondary" title="同时导出原始 JSON 与来源署名说明" onClick={() => { void exportRecord(current); }}><Download size={15}/>导出 JSON</button></> : currentPreviewEntry && <><button className="button primary" disabled={importing || !canQueue || current.kind !== kind} onClick={() => void importPreview(true, [currentPreviewEntry.id])}><Plus size={15}/>导入并加入当前队列</button><button className="button secondary" disabled={importing} onClick={() => void importPreview(false, [currentPreviewEntry.id])}><Download size={15}/>导入到作业库</button></>}
      </div>
      {current.kind !== kind && <p className="sp-help">这是{kindLabel(current.kind)}，可先导入到对应作业库。</p>}
      {current.description && <section className="cp-description"><h3>作业说明</h3><p>{current.description}</p></section>}
      <section className="cp-requirements"><div className="cp-section-heading"><h3>干员与要求</h3><span>{current.operators.length} 位</span></div><p className="sp-help">{roster ? `已按${device?.name ?? '所选设备'}的本地干员数据标注（${new Date(roster.collectedAt!).toLocaleString('zh-CN')}）：绿色已拥有，红色未拥有，黄色缺少练度。技能专精与模组尚无本地数据，同名干员的具体形态也请手动核对；未识别的干员保留原色。` : '暂无所选设备的本地干员数据，保留原色；以下为作者要求，请手动核对。'}</p><CopilotOperators operators={current.operators} resourceKey={resourceKey} roster={roster}/></section>
      <dl className="cp-meta">{current.source.kind === 'community' && <div><dt>上传者</dt><dd>{current.uploader || '未标注'}</dd></div>}<div><dt>来源</dt><dd>{current.source.name || (current.source.kind === 'community' ? 'PRTS Plus' : '本地导入')}</dd></div><div><dt>最低核心版本</dt><dd>{current.minimumCoreVersion || '未声明'}</dd></div><div><dt>{isStored ? '导入时间' : '解析时间'}</dt><dd>{new Date(current.createdAt).toLocaleString('zh-CN')}</dd></div></dl>
      <div className="cp-detail-links">{current.source.setId && <button className="cp-link" disabled={importing} onClick={() => void requestPreview({ code: `s${current.source.setId}` })}><BookOpen size={14}/>查看所属作业集 #{current.source.setId}</button>}{safeLink(current.source.url) && <a href={safeLink(current.source.url)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/>查看原站</a>}{current.videos.map((video, index) => safeLink(video) && <a key={video} href={safeLink(video)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/>参考视频{index + 1}</a>)}</div>
    </aside>}
    </div>
    <section className="cp-queue sp-section" aria-label="作业执行队列"><div className="cp-queue-editor"><header><div><h2><ListOrdered size={18}/>{kindLabel(kind)}队列 <span>{enabled.length} / {workspace?.queue.length ?? 0}</span></h2><p>每项独立排序，可重复添加；修改只影响下次执行。</p></div><button className="cp-link" aria-label="清除未勾选项" disabled={!workspace?.queue.some(entry => !entry.enabled)} onClick={() => edit(value => ({ ...value, queue: value.queue.filter(entry => entry.enabled) }))}>清除未选</button></header>{!workspace ? <p role="status">正在读取队列…</p> : !workspace.queue.length ? <div className="cp-queue-empty"><ListOrdered size={26}/><strong>还没有待执行的作业</strong><p>先在左侧查看作业和干员要求，<br/>再加入这里，按顺序执行。</p><button className="cp-link" disabled={savingImport} onClick={() => showLibrary('community')}>去社区找作业<ArrowRight size={14}/></button></div> : <ol className="cp-queue-list">{workspace.queue.map((entry, index) => { const record = queueRecords[entry.versionId]; return <li key={entry.id} className={!entry.enabled ? 'is-disabled' : ''} tabIndex={0} {...contextMenu('队列条目菜单', [{ label: entry.enabled ? '取消勾选' : '勾选执行', action: () => queueChange(entry.id, { enabled: !entry.enabled }) }, { label: '上移', action: () => move(entry.id, -1), disabled: index === 0 }, { label: '下移', action: () => move(entry.id, 1), disabled: index === workspace.queue.length - 1 }, { label: '重复添加', action: () => record && addRecords([record]), disabled: !record || kind === 'SSSCopilot' }, { label: '移除条目', action: () => remove(entry.id), danger: true }])}><div className="cp-queue-row"><input type="checkbox" aria-label={`执行队列 ${index + 1}`} checked={entry.enabled} onChange={event => queueChange(entry.id, { enabled: event.target.checked })}/><span className="cp-sequence">{String(index + 1).padStart(2, '0')}</span><button className="cp-queue-title" disabled={!record} onClick={() => record && openRecord(record)}><strong>{record?.title ?? (record === null ? '作业版本不可用' : '正在读取作业…')}</strong><small>{record?.stageName || entry.versionId.slice(0, 12)}</small></button><div className="cp-queue-actions"><button className="icon-button" aria-label={`上移作业 ${index + 1}`} disabled={index === 0} onClick={() => move(entry.id, -1)}><ArrowUp size={14}/></button><button className="icon-button" aria-label={`下移作业 ${index + 1}`} disabled={index === workspace.queue.length - 1} onClick={() => move(entry.id, 1)}><ArrowDown size={14}/></button><button className="icon-button" aria-label={`移除作业 ${index + 1}`} onClick={() => remove(entry.id)}><X size={15}/></button></div></div>{usesNavigation && <div className="cp-entry-options">{<label><input type="checkbox" checked={entry.isRaid} onChange={event => queueChange(entry.id, { isRaid: event.target.checked })}/>突袭</label>}{<label>导航关卡<input className="text-input" aria-label={`导航关卡 ${index + 1}`} value={entry.navName} onChange={event => queueChange(entry.id, { navName: event.target.value })} placeholder="沿用作业关卡" maxLength={200}/></label>}</div>}{record && record.compatibility.status !== 'ready' && <p className="cp-error-text">{record.compatibility.reasons.join('；')}</p>}{record === null && <p className="cp-error-text">请移除或取消勾选此项后再执行。</p>}</li>; })}</ol>}
      {workspace && <><CopilotSettings kind={kind} count={enabled.length} options={workspace.options} change={options}/><div className="cp-save-state" role="status">{saveState}{saveError && <><span className="cp-error-text">{saveError}</span><button className="cp-link" onClick={() => void flush().catch(() => {})}>重试保存</button></>}</div></>}
      </div><div className="cp-launch"><label className="cp-field">目标设备<select className="text-input" aria-label="作业目标设备" value={selectedDevice} onChange={event => onSelectDevice(event.target.value)}><option value="">请选择空闲设备</option>{snapshot.devices.map(item => <option key={item.id} value={item.id}>{item.name} · {item.state === 'offline' ? '离线' : item.state === 'running' ? '执行中' : '已连接'}</option>)}</select></label><div className="cp-device-status" role="status">{checking && <LoaderCircle size={14} className="spin"/>}<span>{selectedDevice ? status?.error ?? status?.result?.reason ?? '正在检查设备…' : '浏览和导入无需连接设备'}</span>{status?.result?.ownerId && onViewRun && snapshot.runs.some(item => item.id === status.result?.ownerId) && <button className="cp-link" onClick={() => onViewRun(status.result!.ownerId!)}>查看占用</button>}</div><p className="cp-start-hint"><Info size={15}/>{startingHint}</p>{kind === 'Copilot' && <details className="cp-game-help"><summary>游戏内准备与说明</summary><p className="sp-help">队列在当前区域内按关卡导航，不支持跨区域；普通与突袭由队列条目选择。单份循环、演习请在游戏内选好关卡与模式。助战限制以核心反馈为准，不使用理智药或源石。</p></details>}<button className="button primary cp-start" disabled={!!disabledReason || starting} title={disabledReason || '使用已保存的队列与选项开始执行'} onClick={() => void start()}>{starting ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>}开始作业</button>{disabledReason && <p className="sp-help">{disabledReason}</p>}</div>
    </section></div>
    {run && <section ref={runPanel} className="sp-section cp-run" aria-label="作业运行状态"><header><div><span className="cp-stage">{run.copilotKind && `${kindLabel(run.copilotKind)} · `}{snapshot.devices.find(item => item.id === run.deviceId)?.name ?? run.deviceId}</span><h2>{run.sourceName || run.planName || '作业执行'}</h2><p>{run.message}</p></div>{run.status === 'running' && <button className="button secondary" onClick={() => { void onAction('stop-' + run.id, () => rpc('run.stop', { id: run.id }), '正在停止作业'); }}><Square size={15}/>停止作业</button>}</header><progress max={100} value={run.progress} aria-label="作业执行进度"/><p className="sp-help">{new Date(run.startedAt).toLocaleString('zh-CN')} · {run.status === 'running' ? '运行中' : run.status === 'completed' ? '核心流程结束' : run.status === 'stopped' ? '已停止' : '执行失败'}。停止会清空核心队列，本机配置和未执行项保留。</p>{run.copilotEntries && <ol className="cp-run-entries">{run.copilotEntries.map((entry, index) => <li key={entry.id}><span className="cp-sequence">{String(index + 1).padStart(2, '0')}</span><strong>{entry.title}</strong><span className={`cp-verdict ${entry.verdict === 'failure' ? 'is-error' : ''}`}>{entry.verdict === 'success' ? '通关已确认' : entry.verdict === 'failure' ? '战斗失败' : '通关未确认'}</span><small>{entry.message || ({ waiting: '等待执行', running: '执行中', completed: '核心流程结束', failed: '失败', stopped: '已停止', skipped: '未执行' }[entry.status])}</small></li>)}</ol>}<details className="cp-run-logs"><summary>本次运行日志（{events.length}）</summary>{events.length ? <ol>{events.map(event => <li key={event.id}><time>{new Date(event.createdAt).toLocaleTimeString('zh-CN')}</time><span>{event.message}</span></li>)}</ol> : <p className="sp-help">等待本次运行事件。</p>}</details></section>}
    {!!legacy.length && <details className="sp-section cp-legacy"><summary>旧任务表作业 · {legacy.length} 项</summary><p className="sp-help">原配置保持可编辑与执行。复制会先解析预览，不删除或迁移原任务。视频识别继续使用旧入口。</p>{legacy.map(({ plan, task, taskIndex }) => <div key={`${plan.id}:${taskIndex}`} className="cp-legacy-row" tabIndex={0} {...contextMenu('旧作业配置菜单', [{ label: '编辑作业配置', action: () => onOpenPlan(plan, task.type, taskIndex) }, { label: '复制到作业库', disabled: task.type === 'VideoRecognition', action: () => { void requestPreview({ planId: plan.id, taskIndex }); } }])}><div><strong>{plan.name}</strong><span>{taskLabels[task.type]} · 第 {taskIndex + 1} 条任务</span><small>{String(task.params.filename ?? '作业列表')}</small></div><button className="cp-link" onClick={() => onOpenPlan(plan, task.type, taskIndex)}>编辑原配置</button>{task.type !== 'VideoRecognition' && <button className="button secondary" onClick={() => void requestPreview({ planId: plan.id, taskIndex })}>复制到作业库</button>}</div>)}</details>}
    </div>
  </div>;
}

function CopilotRating({ record, refreshKey, onSourceExpired }: { record: CopilotRecord; refreshKey: string; onSourceExpired: () => void }) {
  const [value, setValue] = useState<RpcResult<'copilot.rating.get'>>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const writing = useRef(false);
  const refreshPending = useRef(false);
  const expired = useRef(onSourceExpired); expired.current = onSourceExpired;
  const checkSource = (cause: unknown) => { if (cause instanceof RuntimeRequestError && cause.code === -32602 && cause.message.includes('作业来源已过期')) expired.current(); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (writing.current) { refreshPending.current = true; return; }
    const request = ++sequence.current;
    setLoading(true); setLoadError('');
    void rpc('copilot.rating.get', { versionId: record.versionId, recordId: record.id }).then(result => {
      if (request === sequence.current) setValue(result);
    }, cause => { if (request === sequence.current) { checkSource(cause); setLoadError(errorText(cause)); } }).finally(() => { if (request === sequence.current) setLoading(false); });
    return () => { sequence.current++; };
  }, [record.versionId, record.id, refreshKey, revision]);
  const rate = async (rating: 'like' | 'dislike') => {
    if (writing.current) return;
    writing.current = true; sequence.current++;
    setSubmitting(true); setLoading(false); setError(''); setLoadError('');
    try {
      const result = await rpc('copilot.rating.set', { versionId: record.versionId, recordId: record.id, rating: value?.rating === rating ? 'none' : rating });
      if (mounted.current) setValue(result);
    } catch (cause) { if (mounted.current) { checkSource(cause); setError(errorText(cause)); } }
    finally {
      writing.current = false;
      if (mounted.current) { setSubmitting(false); if (refreshPending.current) { refreshPending.current = false; setRevision(previous => previous + 1); } }
    }
  };
  return <section className="cp-rating" aria-label="社区作业评价">
    <div className="cp-rating-controls"><span>作业评价</span><button className="button secondary" aria-label="点赞作业" aria-pressed={value?.rating === 'like'} disabled={loading || submitting || !value} onClick={() => void rate('like')}><ThumbsUp size={15}/>{value?.rating === 'like' ? '已点赞' : '点赞'}{value && <span>{value.likes}</span>}</button><button className="button secondary" aria-label="点踩作业" aria-pressed={value?.rating === 'dislike'} disabled={loading || submitting || !value} onClick={() => void rate('dislike')}><ThumbsDown size={15}/>{value?.rating === 'dislike' ? '已点踩' : '点踩'}{value && <span>{value.dislikes}</span>}</button>{(loading || submitting) && <LoaderCircle size={15} className="spin"/>}</div>
    <p className="sp-help">评价会提交至 PRTS Plus；匿名评价按网络地址识别。点踩仅由你手动操作。</p>
    {(error || loadError) && <div className="cp-rating-error" role="alert"><span>{error || loadError}</span><button className="cp-link" disabled={loading || submitting} onClick={() => setRevision(previous => previous + 1)}>重新读取评价</button></div>}
  </section>;
}

function Compatibility({ record }: { record: CopilotRecord }) {
  return <div className={`cp-compatibility ${record.compatibility.status === 'unsupported' ? 'is-error' : ''}`}><Info size={14}/><span>{record.compatibility.status === 'ready' ? '作业格式与当前资源已检查' : record.compatibility.status === 'unsupported' ? '当前不可执行' : '仍需核对核心与资源'}{record.compatibility.reasons.length > 0 && `：${record.compatibility.reasons.join('；')}`}</span></div>;
}

function CopilotSettings({ kind, count, options, change }: { kind: CopilotKind; count: number; options: CopilotOptions; change: (value: Partial<CopilotOptions>) => void }) {
  const operators: { name: string; skill: number }[] = options.additionalOperators;
  const additional = (value: { name: string; skill: number }[]) => change({ additionalOperators: value as CopilotOptions['additionalOperators'] });
  return <details className="cp-settings"><summary>执行选项</summary><label className="cp-field">循环次数<input className="text-input" aria-label="作业循环次数" type="number" min={1} max={999} disabled={kind === 'ParadoxCopilot' || count > 1} value={options.loopTimes} onChange={event => { if (Number.isInteger(event.target.valueAsNumber) && event.target.valueAsNumber >= 1 && event.target.valueAsNumber <= 999) change({ loopTimes: event.target.valueAsNumber, ...(event.target.valueAsNumber > 1 ? { supportUnitName: '' } : {}) }); }}/></label>{(kind === 'ParadoxCopilot' || count > 1) && <p className="sp-help">悖论及多作业列表按单次队列执行；循环仅用于单份普通或保全作业。</p>}{kind === 'Copilot' && <><label className="cp-check"><input type="checkbox" checked={options.formation} onChange={event => change({ formation: event.target.checked, ...(!event.target.checked ? { supportUnitName: '', additionalOperators: [], addTrust: false, ignoreRequirements: false } : {}) })}/>自动编队</label>{options.formation && <><p className="cp-error-text">自动编队会清空当前编队，请先确认。</p><label className="cp-field">编队栏位<select className="text-input" aria-label="作业编队栏位" value={options.formationIndex} onChange={event => change({ formationIndex: Number(event.target.value) })}>{[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>{value === 0 ? '当前编队' : `第 ${value} 队`}</option>)}</select></label><label className="cp-check"><input type="checkbox" checked={options.addTrust} onChange={event => change({ addTrust: event.target.checked })}/>补充低信赖干员</label><label className="cp-check"><input type="checkbox" checked={options.ignoreRequirements} onChange={event => change({ ignoreRequirements: event.target.checked })}/>忽略练度要求</label><label className="cp-field">助战干员<input className="text-input" aria-label="助战干员" disabled={options.loopTimes > 1} value={options.supportUnitName} onChange={event => change({ supportUnitName: event.target.value })} placeholder="留空关闭助战" maxLength={80}/></label>{options.loopTimes > 1 && <p className="sp-help">循环执行时关闭助战；使用助战请改为执行 1 次。</p>}<div className="cp-additional"><strong>追加干员</strong>{operators.map((operator, index) => <div className="cp-additional-row" key={index}><input className="text-input" aria-label={`追加干员 ${index + 1}`} value={operator.name} maxLength={80} onChange={event => additional(operators.map((item, i) => i === index ? { ...item, name: event.target.value } : item))}/><select className="text-input" aria-label={`追加技能 ${index + 1}`} value={operator.skill} onChange={event => additional(operators.map((item, i) => i === index ? { ...item, skill: Number(event.target.value) } : item))}>{[1, 2, 3].map(skill => <option key={skill} value={skill}>技能 {skill}</option>)}</select><button className="icon-button" aria-label={`删除追加干员 ${index + 1}`} onClick={() => additional(operators.filter((_, i) => i !== index))}><Trash2 size={14}/></button></div>)}<button className="cp-link" disabled={options.additionalOperators.length >= 12} onClick={() => additional([...operators, { name: '', skill: 1 }])}><Plus size={14}/>追加干员</button></div></>}</>}<label className="cp-check"><input type="checkbox" checked={options.autoLikeOnSuccess ?? false} onChange={event => change({ autoLikeOnSuccess: event.target.checked })}/>通关成功后自动点赞</label><p className="sp-help">仅对本队列中明确确认通关的社区作业点赞，不覆盖手动点踩。默认关闭。</p><p className="sp-help">默认执行 1 次；普通单份循环需从编队界面开始。药剂、源石与加急消耗为 0，运行中调整仅用于下次启动。</p></details>;
}
