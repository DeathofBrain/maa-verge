import Select from '@/kit/Select';
import Tabs from '@/kit/Tabs';
import SearchField from '@/kit/SearchField';
import IconButton from '@/kit/IconButton';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from 'react';
import {
  BookOpen,
  Check,
  ExternalLink,
  FileJson,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  errorMessage,
  openExternalUrl,
  rpc,
  RuntimeRequestError,
  taskLabels,
  type CopilotKind,
  type Plan,
  type Task,
  type Snapshot,
  type CopilotOptions,
  type CopilotPreview,
  type CopilotRecord,
  type CopilotWorkspace,
  type RpcParams,
  type RpcResult,
} from '@maaverge/contracts';
import type { ActionRunner } from '@/shared/lib/actions';
import { useContextMenu } from '@/kit/ContextMenu';
import { useCopilotRoster } from './CopilotOperators';
import SelectAll from '@/shared/ui/SelectAll';
import CopilotCommunityBrowser from './CopilotCommunityBrowser';
import CopilotDetailDrawer from './CopilotDetailDrawer';
import CopilotQueueView from './CopilotQueueView';
import CopilotImportPreview from './CopilotImportPreview';
import CopilotRunMonitor from './CopilotRunMonitor';
import CopilotLibraryList from './CopilotLibraryList';
import useWorkspace from './useCopilotWorkspace';
import CopilotDeleteDialog, { type CopilotDeleteTarget } from './CopilotDeleteDialog';
import {
  cachedCommunityPreview,
  readCopilotPreview,
  useCommunitySearch,
} from './copilot-community';
import './copilot-page.css';

type Props = {
  snapshot: Snapshot;
  selectedDevice: string;
  onSelectDevice: (id: string) => void;
  onAction: ActionRunner;
  onOpenPlan: (plan: Plan, taskType?: Task['type'], taskIndex?: number) => void;
  searchQuery?: string;
  initialRunId?: string;
  initialLegacy?: { planId: string; taskIndex: number; nonce: string };
  onViewRun?: (id: string) => void;
  onRunSelection?: (id: string | undefined) => void;
};
type Availability = RpcResult<'device.availability'>;
type Run = RpcResult<'run.detail'>;
type CommunityOrder = NonNullable<RpcParams<'copilot.search'>['orderBy']>;
const kinds: { value: CopilotKind; label: string; short: string }[] = [
  { value: 'Copilot', label: '普通作业', short: '普通' },
  { value: 'SSSCopilot', label: '保全派驻', short: '保全' },
  { value: 'ParadoxCopilot', label: '悖论模拟', short: '悖论' },
];
const kindLabel = (kind: CopilotKind) => kinds.find((item) => item.value === kind)?.label ?? kind;
const errorText = errorMessage;
const localSizeLimit = 480 * 1024;
let lastKind: CopilotKind = 'Copilot';
const uiSelection = (key: string) => {
  try {
    return sessionStorage.getItem('maaverge:copilot:' + key) ?? '';
  } catch {
    return '';
  }
};
const saveSelection = (key: string, value: string) => {
  try {
    sessionStorage.setItem('maaverge:copilot:' + key, value);
  } catch {
    /* Selection is optional when session storage is unavailable. */
  }
};
let browseSession = {
  tab: 'local' as 'local' | 'community',
  target: 'copilot' as 'copilot' | 'set',
  keyword: '',
  stage: '',
  stageFilter: '',
  orderBy: 'hot' as CommunityOrder,
  page: 1,
  query: '',
  category: '',
  localPage: 1,
  scrollTop: 0,
};

function downloadJson(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const element = document.createElement('a');
  element.href = url;
  element.download = filename;
  element.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CopilotPage({
  snapshot,
  selectedDevice,
  onSelectDevice,
  onAction,
  onOpenPlan,
  searchQuery,
  initialRunId,
  initialLegacy,
  onViewRun,
  onRunSelection,
}: Props) {
  const contextMenu = useContextMenu();
  const [kind, setKindState] = useState<CopilotKind>(() =>
    kinds.some((item) => item.value === uiSelection('kind'))
      ? (uiSelection('kind') as CopilotKind)
      : lastKind,
  );
  const currentQueueKind = useRef(kind);
  currentQueueKind.current = kind;
  const [tab, setTab] = useState(browseSession.tab);
  const [query, setQuery] = useState(searchQuery ?? browseSession.query);
  const [libraries, setLibraries] = useState<Record<string, RpcResult<'copilot.list'>>>({});
  const [localPage, setLocalPage] = useState(browseSession.localPage);
  const [categoryFilter, setCategoryFilter] = useState(
    browseSession.category === 'uncategorized' ? '' : browseSession.category,
  );
  const [categories, setCategories] = useState<RpcResult<'copilot.category.list'>['items']>([]);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<CopilotDeleteTarget>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteReturnFocus = useRef<HTMLElement | null>(null);
  const [categoryQueueKind, setCategoryQueueKind] = useState<CopilotKind | ''>('');
  const [selection, setSelection] = useState<CopilotRecord>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailOrigin, setDetailOrigin] = useState<'library' | 'preview'>('library');
  const [loading, setLoading] = useState(true);
  const [finishedLibrary, setFinishedLibrary] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const openLink = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void openExternalUrl(event.currentTarget.href).catch((cause) => setError(errorText(cause)));
  };
  const [revision, setRevision] = useState(0);
  const [availability, setAvailability] = useState<{
    deviceId: string;
    result?: Availability;
    error?: string;
  }>();
  const availabilityRef = useRef(availability);
  availabilityRef.current = availability;
  const checkedDevice = useRef('');
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState('');
  const [json, setJson] = useState('');
  const [preview, setPreview] = useState<CopilotPreview>();
  const [previewSelection, setPreviewSelection] = useState<string[]>([]);
  const [setQueueKind, setSetQueueKind] = useState<CopilotKind>('Copilot');
  const [importing, setImporting] = useState(false);
  const [savingImport, setSavingImport] = useState(false);
  const [importReport, setImportReport] = useState<string[]>([]);
  const [target, setTarget] = useState(browseSession.target);
  const [keyword, setKeyword] = useState(browseSession.keyword);
  const [stage, setStage] = useState(browseSession.stage);
  const [stageFilter, setStageFilter] = useState(browseSession.stageFilter);
  const [orderBy, setOrderBy] = useState(browseSession.orderBy);
  const [page, setPage] = useState(browseSession.page);
  const [runId, setRunId] = useState(initialRunId ?? uiSelection('run'));
  const [monitorDevice, setMonitorDevice] = useState(() => uiSelection('monitor-device'));
  const [runDetail, setRunDetail] = useState<Run>();
  const [runError, setRunError] = useState('');
  const [runRevision, setRunRevision] = useState(0);
  const runNavigation = useRef(initialRunId ?? '');
  const [starting, setStarting] = useState(false);
  const [checkingQueue, setQueueChecking] = useState(false);
  // Missing keys are pending reads; null records have failed validation.
  const [queueRecords, setQueueRecords] = useState<Record<string, CopilotRecord | null>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const importPanel = useRef<HTMLDetailsElement>(null);
  const previewRequest = useRef(0);
  const previewParams = useRef<
    import('@maaverge/contracts').RpcParams<'copilot.preview'> | undefined
  >(undefined);
  const pageRoot = useRef<HTMLDivElement>(null);
  const listScroll = useRef(browseSession.scrollTop);
  const restoreScroll = useRef<number | undefined>(browseSession.scrollTop);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const runPanel = useRef<HTMLElement>(null);
  const {
    workspace,
    edit,
    editFor,
    read: readWorkspace,
    flush,
    saveState,
    saveError,
  } = useWorkspace(kind);
  const latestEvent = snapshot.events.at(-1)?.id;
  const device = snapshot.devices.find((item) => item.id === selectedDevice);
  const { roster, hint: rosterHint } = useCopilotRoster(snapshot, selectedDevice);
  const resourceKey = snapshot.updates
    .filter((channel) => channel.id !== 'app')
    .map((channel) => channel.currentVersion)
    .join(':');
  const {
    result: searchResult,
    searching,
    error: searchError,
    refresh: refreshSearch,
  } = useCommunitySearch(
    {
      target,
      keyword,
      page,
      ...(target === 'copilot' ? { orderBy } : {}),
      ...(target === 'copilot' && stageFilter ? { stage: stageFilter } : {}),
    },
    tab === 'community',
    resourceKey,
  );
  const libraryKey = `${categoryFilter}:${localPage}`;
  const localResult = libraries[libraryKey];
  const library = localResult?.items ?? [];
  const localPaging = localResult ?? { total: 0, hasNext: false };
  const libraryReady = !!localResult;
  const status = availability?.deviceId === selectedDevice ? availability : undefined;
  const liveRuns = snapshot.runs
    .filter((item) => item.source === 'copilot')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const monitoredRuns = liveRuns.filter(
    (item) => !monitorDevice || item.deviceId === monitorDevice,
  );
  const selectedSummary = liveRuns.find((item) => item.id === runId);
  const matchingSummary =
    monitoredRuns.find((item) => item.status === 'running') ?? monitoredRuns[0];
  const summary = runId ? selectedSummary : matchingSummary;
  const detailId = runId || matchingSummary?.id;
  const run = runDetail?.id === detailId ? runDetail : summary;
  const monitorDeviceIds = [
    ...new Set([
      ...snapshot.devices.map((item) => item.id),
      ...liveRuns.map((item) => item.deviceId),
      ...(run ? [run.deviceId] : []),
      ...(monitorDevice ? [monitorDevice] : []),
    ]),
  ];
  const runChoices = [
    ...monitoredRuns,
    ...(run && !monitoredRuns.some((item) => item.id === run.id) ? [run] : []),
  ].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const deviceName = (id: string) => snapshot.devices.find((item) => item.id === id)?.name ?? id;
  const events = snapshot.events.filter((event) => event.data.runId === run?.id).slice(-60);
  const enabled = workspace?.queue.filter((entry) => entry.enabled) ?? [];
  const queueChecking =
    checkingQueue ||
    !!workspace?.queue.some((entry) => queueRecords[entry.versionId] === undefined);
  const queueProblem = enabled.find(
    (entry) => queueRecords[entry.versionId]?.compatibility.status !== 'ready',
  );
  const disabledReason = !selectedDevice
    ? '请选择目标设备'
    : checking
      ? '正在检查设备占用'
      : (status?.error ??
        (!status?.result?.available
          ? (status?.result?.reason ?? '等待设备检查')
          : !workspace
            ? '正在读取队列'
            : !enabled.length
              ? '请先添加并勾选作业'
              : queueChecking
                ? '正在检查作业版本'
                : queueProblem
                  ? '队列含不可用作业，请查看原因并移除或取消勾选'
                  : saveError
                    ? '请先重试保存配置'
                    : ''));
  const setKind = (value: CopilotKind) => {
    if (value === currentQueueKind.current) return;
    // Consume external navigation without clearing the monitored runId.
    runNavigation.current = '';
    onRunSelection?.(undefined);
    lastKind = value;
    saveSelection('kind', value);
    setKindState(value);
  };

  useEffect(() => {
    browseSession = {
      ...browseSession,
      tab,
      target,
      keyword,
      stage,
      stageFilter,
      orderBy,
      page,
      query,
      category: categoryFilter,
      localPage,
    };
  }, [tab, target, keyword, stage, stageFilter, orderBy, page, query, categoryFilter, localPage]);
  useLayoutEffect(() => {
    if (restoreScroll.current === undefined || (tab === 'local' ? !libraryReady : !searchResult))
      return;
    if (pageRoot.current) pageRoot.current.scrollTop = restoreScroll.current;
    restoreScroll.current = undefined;
  }, [tab, libraryReady, searchResult]);
  useEffect(
    () => () => {
      previewRequest.current++;
    },
    [],
  );

  useEffect(() => {
    saveSelection('run', runId);
  }, [runId]);
  useEffect(() => {
    saveSelection('monitor-device', monitorDevice);
  }, [monitorDevice]);
  useEffect(() => {
    if (searchQuery !== undefined) setQuery(searchQuery);
  }, [searchQuery]);
  useEffect(() => {
    setSelectedLibraryIds([]);
  }, [categoryFilter, localPage, query]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void rpc('copilot.list', {
      page: localPage,
      ...(categoryFilter
        ? { categoryId: categoryFilter === 'uncategorized' ? null : categoryFilter }
        : {}),
    })
      .then(
        (value) => {
          if (!cancelled) setLibraries((current) => ({ ...current, [libraryKey]: value }));
        },
        (cause) => {
          if (!cancelled) setError(errorText(cause));
        },
      )
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setFinishedLibrary(libraryKey);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [categoryFilter, localPage, revision]);
  useEffect(() => {
    let cancelled = false;
    void rpc('copilot.category.list', {}).then(
      (value) => {
        if (!cancelled) setCategories(value.items);
      },
      (cause) => {
        if (!cancelled) setError(errorText(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revision]);
  useEffect(() => {
    if (!selectedDevice) {
      checkedDevice.current = '';
      setAvailability(undefined);
      setChecking(false);
      return;
    }
    const deviceKey = `${selectedDevice}:${device?.state}`;
    // Runtime events still refresh ownership, without hiding a known result.
    let cancelled = false;
    setChecking(
      checkedDevice.current !== deviceKey || availabilityRef.current?.deviceId !== selectedDevice,
    );
    void rpc('device.availability', { deviceId: selectedDevice })
      .then(
        (result) => {
          if (!cancelled) {
            checkedDevice.current = deviceKey;
            setAvailability({ deviceId: selectedDevice, result });
          }
        },
        (cause) => {
          if (!cancelled) {
            checkedDevice.current = deviceKey;
            setAvailability({ deviceId: selectedDevice, error: errorText(cause) });
          }
        },
      )
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDevice, device?.state, latestEvent, revision]);
  useEffect(() => {
    let cancelled = false;
    setQueueChecking(true);
    const versions = [...new Set(workspace?.queue.map((item) => item.versionId) ?? [])];
    void Promise.all(
      versions.map(async (versionId) => {
        try {
          return await rpc('copilot.get', { versionId });
        } catch {
          return undefined;
        }
      }),
    ).then((records) => {
      if (!cancelled) {
        setQueueRecords((current) => {
          const next = { ...current };
          versions.forEach((versionId, index) => {
            next[versionId] = records[index] ?? null;
          });
          return next;
        });
        setQueueChecking(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workspace?.queue.map((entry) => entry.versionId).join(','), resourceKey, revision]);
  useEffect(() => {
    setRunError('');
    if (!detailId) {
      setRunDetail(undefined);
      return;
    }
    let cancelled = false;
    void rpc('run.detail', { id: detailId }).then(
      (value) => {
        if (cancelled) return;
        if (value.source !== 'copilot') {
          setRunError('所选记录不属于作业执行，请选择其他记录。');
          return;
        }
        setRunDetail(value);
        // An explicit selection can be older than the snapshot's recent-run window.
        if (runNavigation.current === value.id) {
          runNavigation.current = '';
          setMonitorDevice(value.deviceId);
          if (value.copilotKind) {
            lastKind = value.copilotKind;
            saveSelection('kind', value.copilotKind);
            setKindState(value.copilotKind);
          }
        }
      },
      (cause) => {
        if (!cancelled) setRunError(errorText(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [detailId, runId, summary?.progress, summary?.status, latestEvent, runRevision]);
  useEffect(() => {
    if (initialRunId && initialRunId !== runId) {
      runNavigation.current = initialRunId;
      setRunId(initialRunId);
    }
  }, [initialRunId]);
  const selectMonitorDevice = (value: string) => {
    runNavigation.current = '';
    setMonitorDevice(value);
    setRunId('');
    setRunDetail(undefined);
    setRunError('');
    onRunSelection?.(undefined);
  };
  const selectMonitorRun = (value: string) => {
    runNavigation.current = '';
    setRunId(value);
    setRunError('');
    onRunSelection?.(value || undefined);
  };
  const requestPreview = useCallback(
    async (
      params: import('@maaverge/contracts').RpcParams<'copilot.preview'>,
      showDetail = false,
      refresh = false,
    ) => {
      const sequence = ++previewRequest.current;
      const cached = refresh ? undefined : cachedCommunityPreview(params, resourceKey);
      setImporting(!cached);
      setError('');
      setImportReport([]);
      if (!refresh) {
        detailTrigger.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        listScroll.current = pageRoot.current?.scrollTop ?? 0;
      }
      try {
        const result = cached ?? (await readCopilotPreview(params, resourceKey, refresh));
        if (sequence !== previewRequest.current) return;
        previewParams.current = params;
        setPreview(result);
        setPreviewSelection(
          result.entries.filter((entry) => entry.record && !entry.error).map((entry) => entry.id),
        );
        setSetQueueKind(result.entries.find((entry) => entry.record)?.record?.kind ?? 'Copilot');
        const record =
          showDetail && result.entries.length === 1 ? result.entries[0].record : undefined;
        setSelection(record ?? undefined);
        setDetailOrigin('preview');
        setDetailOpen(!!record);
        if (importPanel.current) importPanel.current.open = false;
      } catch (cause) {
        if (sequence === previewRequest.current) setError(errorText(cause));
      } finally {
        if (sequence === previewRequest.current) setImporting(false);
      }
    },
    [resourceKey],
  );
  useEffect(() => {
    if (!initialLegacy || uiSelection('legacy-nonce') === initialLegacy.nonce) return;
    saveSelection('legacy-nonce', initialLegacy.nonce);
    void requestPreview({ planId: initialLegacy.planId, taskIndex: initialLegacy.taskIndex });
  }, [initialLegacy?.nonce, requestPreview]);
  const readFile = async (file?: File) => {
    if (!file) return;
    if (file.size > localSizeLimit) {
      setError('这份 JSON 超过 480 KiB，请拆分后逐份导入。');
      return;
    }
    try {
      const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        await file.arrayBuffer(),
      );
      await requestPreview({ content, name: file.name });
    } catch (cause) {
      setError(errorText(cause));
    }
  };
  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    void readFile(event.target.files?.[0]);
    event.target.value = '';
  };
  const addRecords = (records: CopilotRecord[]) => {
    const matching = records;
    if (!matching.length || matching.some((record) => record.kind !== kind)) {
      setError(`请选择${kindLabel(kind)}，不同类型不能放入同一队列。`);
      return;
    }
    if (kind === 'SSSCopilot' && (matching.length > 1 || (workspace?.queue.length ?? 0) > 0)) {
      setError('保全派驻仅支持一份作业，请先移除当前队列内容。');
      return;
    }
    if ((workspace?.queue.length ?? 0) + matching.length > 100) {
      setError('每个队列最多 100 项，请先移除部分条目。');
      return;
    }
    edit((value) => ({
      ...value,
      options: {
        ...value.options,
        ...(value.queue.length + matching.length > 1 || kind === 'ParadoxCopilot'
          ? { loopTimes: 1 }
          : {}),
      },
      queue: [
        ...value.queue,
        ...matching.map((record) => ({
          id: crypto.randomUUID(),
          versionId: record.versionId,
          enabled: true,
          isRaid: false,
          navName: '',
        })),
      ],
    }));
    setQueueRecords((value) => ({
      ...value,
      ...Object.fromEntries(matching.map((record) => [record.versionId, record])),
    }));
    setNotice(`已将 ${matching.length} 项加入${kindLabel(kind)}队列`);
    setError('');
  };
  const validateQueue = (
    records: CopilotRecord[],
    targetKind: CopilotKind,
    targetWorkspace: CopilotWorkspace,
  ) => {
    if (!records.length) throw new Error('没有可加入队列的作业。');
    if (records.some((record) => record.kind !== targetKind))
      throw new Error('这些作业包含不同类型，请按类型分别加入对应队列。');
    if (targetKind === 'SSSCopilot' && (records.length !== 1 || targetWorkspace.queue.length > 0))
      throw new Error('保全派驻仅支持一份作业，请选择单项并先移除保全队列内容。');
    if (targetWorkspace.queue.length + records.length > 100)
      throw new Error('每个队列最多 100 项，请先移除部分条目。');
  };
  const appendRecords = async (records: CopilotRecord[], targetKind: CopilotKind) => {
    await editFor(targetKind, (value) => {
      validateQueue(records, targetKind, value);
      return {
        ...value,
        options: {
          ...value.options,
          ...(value.queue.length + records.length > 1 || targetKind === 'ParadoxCopilot'
            ? { loopTimes: 1 }
            : {}),
        },
        queue: [
          ...value.queue,
          ...records.map((record) => ({
            id: crypto.randomUUID(),
            versionId: record.versionId,
            enabled: true,
            isRaid: false,
            navName: '',
          })),
        ],
      };
    });
    setQueueRecords((value) => ({
      ...value,
      ...Object.fromEntries(records.map((record) => [record.versionId, record])),
    }));
    setKind(targetKind);
    try {
      await flush(targetKind);
    } catch (cause) {
      throw new Error(
        `作业已加入${kindLabel(targetKind)}队列，但队列保存失败，请在队列中重试保存：${errorText(cause)}`,
      );
    }
  };
  const saveCategory = async (rename: boolean) => {
    if (categoryBusy || !newCategoryName.trim()) return;
    setCategoryBusy(true);
    setError('');
    try {
      const category = await rpc('copilot.category.save', {
        ...(rename ? { id: categoryFilter } : {}),
        name: newCategoryName.trim(),
      });
      setCategoryFilter(category.id);
      setLocalPage(1);
      setRevision((value) => value + 1);
      setNotice(rename ? '分类已重命名' : '分类已创建');
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setCategoryBusy(false);
    }
  };
  const assignCategory = async (record: CopilotRecord, categoryId: string) => {
    if (categoryBusy) return;
    setCategoryBusy(true);
    setError('');
    try {
      await rpc('copilot.category.assign', { ids: [record.id], categoryId: categoryId || null });
      setSelection((value) =>
        value?.id === record.id ? { ...value, categoryId: categoryId || null } : value,
      );
      setRevision((value) => value + 1);
      setNotice('作业分类已更新');
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setCategoryBusy(false);
    }
  };
  const enqueueCategory = async () => {
    if (categoryBusy || !categoryFilter) return;
    setCategoryBusy(true);
    setError('');
    try {
      const params = {
        categoryId: categoryFilter === 'uncategorized' ? null : categoryFilter,
        ...(categoryQueueKind ? { kind: categoryQueueKind } : {}),
      };
      const first = await rpc('copilot.list', { ...params, page: 1 });
      if (first.total > 100) throw new Error('所选分类超过 100 份，请按类型筛选或逐项加入队列。');
      const records = [...first.items];
      let next = first;
      while (next.hasNext) {
        next = await rpc('copilot.list', { ...params, page: next.page + 1 });
        if (next.total !== first.total || next.page > 6)
          throw new Error('分类内容已变化，请刷新后重试。');
        records.push(...next.items);
      }
      if (
        records.length !== first.total ||
        new Set(records.map((record) => record.id)).size !== records.length
      )
        throw new Error('分类内容已变化，请刷新后重试。');
      if (!records.length) throw new Error('所选分类和类型下没有作业。');
      const targetKind = categoryQueueKind || records[0].kind;
      validateQueue(records, targetKind, await readWorkspace(targetKind));
      await appendRecords(records, targetKind);
      setNotice(`已将分类中的 ${records.length} 项加入${kindLabel(targetKind)}队列`);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setCategoryBusy(false);
    }
  };
  const importPreview = async (
    addToQueue: boolean,
    entryIds = previewSelection,
    targetKind?: CopilotKind,
    retainRemaining = false,
  ) => {
    if (!preview || !entryIds.length) return;
    const sequence = ++previewRequest.current;
    const keepPreview =
      retainRemaining || (detailOpen && preview.entries.length > 1 && entryIds.length === 1);
    setImporting(true);
    setSavingImport(true);
    setError('');
    try {
      const selectedRecords = preview.entries
        .filter((entry) => entryIds.includes(entry.id))
        .flatMap((entry) => (entry.record && !entry.error ? [entry.record] : []));
      const queueKind = targetKind ?? selectedRecords[0]?.kind;
      if (addToQueue) {
        if (!queueKind) throw new Error('没有可加入队列的作业。');
        validateQueue(selectedRecords, queueKind, await readWorkspace(queueKind));
      }
      let result: RpcResult<'copilot.import'>;
      let effectiveEntryIds = entryIds;
      try {
        result = await rpc('copilot.import', { previewId: preview.id, entryIds });
      } catch (cause) {
        if (
          !(cause instanceof RuntimeRequestError) ||
          cause.code !== -32004 ||
          !previewParams.current
        )
          throw cause;
        // A service preview may expire or be evicted while its UI detail is cached.
        // Re-read it once, importing only if the selected immutable versions match.
        const fresh = await readCopilotPreview(previewParams.current, resourceKey, true);
        if (sequence !== previewRequest.current) return;
        const indexes = preview.entries.flatMap((entry, index) =>
          entryIds.includes(entry.id) ? [index] : [],
        );
        const identity = (record: CopilotRecord | null | undefined) =>
          record
            ? JSON.stringify([
                record.versionId,
                record.source.kind,
                record.source.communityId,
                record.source.setId,
              ])
            : '';
        const unchanged = indexes.every(
          (index) =>
            identity(preview.entries[index].record) &&
            identity(preview.entries[index].record) === identity(fresh.entries[index]?.record) &&
            !fresh.entries[index]?.error,
        );
        const nextIds = indexes.flatMap((index) =>
          fresh.entries[index]?.record && !fresh.entries[index].error
            ? [fresh.entries[index].id]
            : [],
        );
        effectiveEntryIds = nextIds;
        setPreview(fresh);
        setPreviewSelection(
          previewSelection.flatMap((id) => {
            const index = preview.entries.findIndex((entry) => entry.id === id);
            return fresh.entries[index]?.record && !fresh.entries[index].error
              ? [fresh.entries[index].id]
              : [];
          }),
        );
        const selectedIndex = preview.entries.findIndex(
          (entry) =>
            entry.record?.id === selection?.id && entry.record?.versionId === selection?.versionId,
        );
        if (selectedIndex >= 0) setSelection(fresh.entries[selectedIndex]?.record ?? undefined);
        if (!unchanged) {
          setDetailOpen(false);
          setError('社区作业内容已更新或不可用，请核对新的预览后再导入。');
          return;
        }
        result = await rpc('copilot.import', { previewId: fresh.id, entryIds: nextIds });
      }
      if (sequence !== previewRequest.current) {
        setRevision((value) => value + 1);
        return;
      }
      setImportReport(result.errors.map((item) => item.message));
      setLocalPage(1);
      setRevision((value) => value + 1);
      setNotice(`已导入 ${result.items.length} 份作业`);
      if (addToQueue && result.items.length) {
        try {
          await appendRecords(result.items, queueKind!);
          setNotice(`已导入 ${result.items.length} 份作业并加入${kindLabel(queueKind!)}队列`);
        } catch (cause) {
          setError(`已保存 ${result.items.length} 份到作业库。${errorText(cause)}`);
          return;
        }
      }
      if (!result.errors.length && !keepPreview) {
        setPreview(undefined);
        setTab('local');
      }
      if (keepPreview)
        setPreviewSelection((value) => value.filter((id) => !effectiveEntryIds.includes(id)));
      if (result.items[0]) {
        setSelection(result.items[0]);
        setDetailOrigin(keepPreview ? 'preview' : 'library');
        setDetailOpen(!addToQueue);
      }
    } catch (cause) {
      if (sequence === previewRequest.current) setError(errorText(cause));
    } finally {
      setSavingImport(false);
      if (sequence === previewRequest.current) setImporting(false);
    }
  };
  const changeQueueSelection = (checked: boolean, id?: string) =>
    edit((value) => {
      const queue = value.queue.map((entry) =>
        !id || entry.id === id ? { ...entry, enabled: checked } : entry,
      );
      return {
        ...value,
        queue,
        options: {
          ...value.options,
          ...(queue.filter((entry) => entry.enabled).length > 1 ? { loopTimes: 1 } : {}),
        },
      };
    });
  const queueChange = (id: string, patch: Partial<CopilotWorkspace['queue'][number]>) =>
    edit((value) => ({
      ...value,
      queue: value.queue.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  const remove = (id: string) =>
    edit((value) => ({ ...value, queue: value.queue.filter((item) => item.id !== id) }));
  const move = (id: string, delta: number) =>
    edit((value) => {
      const queue = [...value.queue],
        index = queue.findIndex((item) => item.id === id),
        next = index + delta;
      if (index < 0 || next < 0 || next >= queue.length) return value;
      [queue[index], queue[next]] = [queue[next], queue[index]];
      return { ...value, queue };
    });
  const options = (patch: Partial<CopilotOptions>) =>
    edit((value) => ({ ...value, options: { ...value.options, ...patch } }));
  const openRecord = (record: CopilotRecord, origin: 'library' | 'preview' = 'library') => {
    listScroll.current = pageRoot.current?.scrollTop ?? 0;
    detailTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotice('');
    setError('');
    setSelection(record);
    setDetailOrigin(preview ? 'preview' : origin);
    setDetailOpen(true);
  };
  const closeDetail = () => {
    setDetailOpen(false);
    if (detailOrigin === 'preview' && preview?.entries.length === 1) setPreview(undefined);
  };
  const openImport = () => {
    if (importPanel.current) {
      importPanel.current.open = true;
      importPanel.current.scrollIntoView({ block: 'nearest' });
    }
  };
  const showLibrary = (source = tab) => {
    if (savingImport) return;
    previewRequest.current++;
    setImporting(false);
    setDetailOpen(false);
    setPreview(undefined);
    setTab(source);
  };
  const exportRecord = (record: CopilotRecord) =>
    onAction(
      'export-copilot-' + record.versionId,
      async () => {
        const result = await rpc('copilot.export', { id: record.id, versionId: record.versionId });
        downloadJson(result.filename, result.content);
        downloadJson(result.attribution.filename, result.attribution.content);
      },
      '作业 JSON 与来源署名说明已导出',
    );
  const requestDelete = (target: CopilotDeleteTarget) => {
    if (categoryBusy || importing || savingImport || deleting) return;
    const selector =
      target.type === 'records'
        ? target.ids.length === 1
          ? `[data-copilot-id="${CSS.escape(target.ids[0])}"]`
          : '.cp-library-delete-selected'
        : `.cp-category-chip[data-category-id="${CSS.escape(target.type === 'category' ? target.id : '')}"]`;
    deleteReturnFocus.current = pageRoot.current?.querySelector<HTMLElement>(selector) ?? null;
    setDeleteError('');
    setDeleteTarget(target);
  };
  const confirmDelete = async (deleteCopilots: boolean) => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    setCategoryBusy(true);
    setDeleteError('');
    try {
      const result =
        target.type === 'category'
          ? await rpc('copilot.category.delete', { id: target.id, deleteCopilots })
          : await rpc(
              'copilot.delete',
              target.type === 'all' ? { all: true } : { ids: target.ids },
            );
      if (target.type === 'category') {
        setCategories((items) => items.filter((item) => item.id !== target.id));
        if (categoryFilter === target.id) {
          setCategoryFilter('');
          setNewCategoryName('');
        }
      }
      setLibraries({});
      setSelectedLibraryIds([]);
      setLocalPage(1);
      setRevision((value) => value + 1);
      setSelection(undefined);
      setDetailOpen(false);
      setDeleteTarget(undefined);
      setError('');
      setNotice(
        target.type === 'category'
          ? deleteCopilots
            ? `已删除分类及其中的 ${result.deletedCount} 份作业`
            : '已删除分类，作业保留'
          : `已删除 ${result.deletedCount} 份作业`,
      );
    } catch (cause) {
      setDeleteError(errorText(cause));
      setLibraries({});
      setRevision((value) => value + 1);
    } finally {
      setDeleting(false);
      setCategoryBusy(false);
    }
  };
  const start = async () => {
    if (disabledReason || starting) return;
    setStarting(true);
    setError('');
    await onAction(
      'copilot-start-' + selectedDevice,
      async () => {
        await flush(kind);
        const result = await rpc('copilot.start', {
          kind,
          deviceId: selectedDevice,
          requestId: crypto.randomUUID(),
        });
        setMonitorDevice(result.deviceId);
        setRunId(result.id);
        onRunSelection?.(result.id);
        setRunDetail(result);
        setRevision((value) => value + 1);
        requestAnimationFrame(() => runPanel.current?.scrollIntoView({ block: 'nearest' }));
      },
      '作业执行已开始',
    );
    setStarting(false);
  };
  const filtered = (libraryReady ? library : []).filter((record) =>
    `${record.title} ${record.stageName} ${record.author || record.uploader || ''}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selectedLibraryRecords = filtered.filter((record) =>
    selectedLibraryIds.includes(record.id),
  );
  const selectedPreviewRecords =
    preview?.entries
      .filter((entry) => previewSelection.includes(entry.id))
      .map((entry) => entry.record)
      .filter((record): record is CopilotRecord => !!record) ?? [];
  const availablePreviewEntries =
    preview?.entries.filter((entry) => entry.record && !entry.error) ?? [];
  const previewKinds = kinds.filter((item) =>
    availablePreviewEntries.some((entry) => entry.record?.kind === item.value),
  );
  const wholeSetEntries = availablePreviewEntries.filter(
    (entry) => previewKinds.length < 2 || entry.record?.kind === setQueueKind,
  );
  const selectedCategory = categories.find((item) => item.id === categoryFilter);
  const legacy = useMemo(
    () =>
      snapshot.plans.flatMap((plan) =>
        plan.tasks.flatMap((task, taskIndex) =>
          ['Copilot', 'SSSCopilot', 'ParadoxCopilot', 'VideoRecognition'].includes(task.type)
            ? [{ plan, task, taskIndex }]
            : [],
        ),
      ),
    [snapshot.plans],
  );
  const current = selection;
  const currentPreviewEntry = preview?.entries.find(
    (entry) => entry.record?.versionId === current?.versionId && entry.record?.id === current?.id,
  );
  const isStored =
    !!current &&
    (queueRecords[current.versionId]?.id === current.id ||
      library.some((record) => record.id === current.id && record.versionId === current.versionId));
  const canQueue = !!workspace && (kind !== 'SSSCopilot' || !workspace.queue.length);
  const usesNavigation = kind === 'Copilot' && (workspace?.options.loopTimes ?? 1) === 1;
  const startingHint =
    kind === 'SSSCopilot'
      ? '在保全关卡详情的「开始部署」界面开始，请先手动编队。'
      : kind === 'ParadoxCopilot'
        ? '在所选干员的悖论关卡中手动选择技能，停在有「开始模拟」按钮的界面。'
        : usesNavigation
          ? `在作业所在区域的关卡地图开始，队列会自动导航，无需先进入干员选择页。${workspace?.options.formation ? '自动编队会清空并重建当前队伍。' : '请提前配好队伍与技能。'}`
          : '单份循环请停在有「开始行动」按钮的编队界面；请确认队伍与技能。';

  return (
    <div
      ref={pageRoot}
      className="sp-page copilot-page"
      onScroll={(event) => {
        if (!detailOpen && !preview) browseSession.scrollTop = event.currentTarget.scrollTop;
      }}
    >
      {deleteTarget && (
        <CopilotDeleteDialog
          target={deleteTarget}
          deleteJsonFiles={snapshot.settings.copilotStorage?.deleteJsonFiles ?? false}
          busy={deleting}
          error={deleteError}
          returnFocus={deleteReturnFocus.current}
          onClose={() => {
            if (!deleting) setDeleteTarget(undefined);
          }}
          onConfirm={(deleteCopilots) => void confirmDelete(deleteCopilots)}
        />
      )}
      <header className="sp-page-heading">
        <div>
          <h1>作业中心</h1>
          <p>找到合适的作业，确认干员要求，再加入队列执行。</p>
        </div>
        <button className="button secondary" disabled={savingImport} onClick={openImport}>
          <Upload size={16} />
          导入作业
        </button>
      </header>
      <div className="cp-content">
        <CopilotRunMonitor
          panelRef={runPanel}
          monitorDevice={monitorDevice}
          monitorDeviceIds={monitorDeviceIds}
          deviceName={deviceName}
          selectMonitorDevice={selectMonitorDevice}
          runId={runId}
          runChoices={runChoices}
          selectMonitorRun={selectMonitorRun}
          runError={runError}
          setRunRevision={setRunRevision}
          run={run}
          events={events}
          detailId={detailId}
          onAction={onAction}
          kindLabel={kindLabel}
        />
        <details
          className="cp-import sp-section"
          ref={importPanel}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (event.dataTransfer.files.length !== 1) {
              setError('请每次拖入一份 JSON，作业集可从编号导入。');
              return;
            }
            void readFile(event.dataTransfer.files[0]);
          }}
        >
          <summary>
            <Upload size={16} />
            <strong>导入本地 JSON 或社区代码</strong>
            <span>先预览，再选择要保存的作业</span>
          </summary>
          <div className="cp-import-grid">
            <div className="cp-file-drop">
              <FileJson size={25} />
              <strong>选择或拖入 JSON</strong>
              <p>保留原始内容，每次导入保存独立版本。</p>
              <button
                className="button secondary"
                disabled={importing}
                onClick={() => fileInput.current?.click()}
              >
                <FolderOpen size={15} />
                选择 JSON 文件
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={onFile}
              />
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void requestPreview({ code: code.trim() });
              }}
            >
              <label className="cp-field">
                编号或原站链接
                <input
                  className="text-input"
                  aria-label="社区作业代码"
                  value={code}
                  maxLength={2048}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="12345、s12345、maa://12345"
                />
              </label>
              <p className="sp-help">也支持 prts://12345、prts://s12345 和 PRTS Plus 原站链接。</p>
              <button className="button secondary" disabled={importing || !code.trim()}>
                <Search size={15} />
                解析代码
              </button>
              <details className="cp-json-input">
                <summary>粘贴 JSON</summary>
                <textarea
                  className="text-input"
                  aria-label="作业 JSON"
                  rows={5}
                  value={json}
                  onChange={(event) => setJson(event.target.value)}
                  placeholder='{"stage_name":"main_01-07","actions":[]}'
                />
                <button
                  type="button"
                  className="button secondary"
                  disabled={!json.trim() || importing}
                  onClick={() => {
                    if (new TextEncoder().encode(json).byteLength > localSizeLimit) {
                      setError('JSON 超过 480 KiB，请拆分后逐份导入。');
                      return;
                    }
                    void requestPreview({ content: json, name: '粘贴的作业.json' });
                  }}
                >
                  预览 JSON
                </button>
              </details>
            </form>
          </div>
        </details>

        {error && !detailOpen && (
          <div className="error-banner cp-feedback" role="alert">
            {error}
            <button className="icon-button" aria-label="关闭作业错误" onClick={() => setError('')}>
              <X size={15} />
            </button>
          </div>
        )}
        {notice && !detailOpen && (
          <p className="cp-notice" role="status">
            <Check size={15} />
            {notice}
          </p>
        )}
        {!!importReport.length && (
          <div className="error-banner" role="alert">
            {importReport.map((message, index) => (
              <p key={index}>{message}</p>
            ))}
          </div>
        )}
        <div className="cp-workspace">
          <div className="cp-main">
            {importing && (
              <p className="cp-preview-loading" role="status">
                <LoaderCircle size={16} className="spin" />
                {savingImport ? '正在保存作业…' : '正在读取作业…'}
              </p>
            )}
            {preview && (
              <CopilotImportPreview
                preview={preview}
                hidden={detailOpen && preview.entries.length === 1}
                previewParams={previewParams}
                importing={importing}
                requestPreview={requestPreview}
                onClose={() => {
                  setPreview(undefined);
                  setDetailOpen(false);
                }}
                availablePreviewEntries={availablePreviewEntries}
                previewSelection={previewSelection}
                setPreviewSelection={setPreviewSelection}
                previewKinds={previewKinds}
                queueKind={setQueueKind}
                setQueueKind={setSetQueueKind}
                wholeSetEntries={wholeSetEntries}
                importPreview={importPreview}
                selectedPreviewRecords={selectedPreviewRecords}
                resourceKey={resourceKey}
                roster={roster}
                rosterHint={rosterHint}
                openRecord={openRecord}
                kindLabel={kindLabel}
              />
            )}
            <section
              className="cp-browser"
              aria-label="作业库"
              hidden={!!preview && !(detailOpen && preview.entries.length === 1)}
            >
              <header className="cp-browser-heading">
                <h2>
                  <BookOpen size={17} />
                  作业站
                </h2>
                <span>浏览本地与社区作业</span>
              </header>
              <Tabs
                className="cp-source-tabs"
                aria-label="作业来源"
                idPrefix="copilot-source"
                value={tab === 'local' ? 'local' : target}
                items={[
                  {
                    id: 'local',
                    label: (
                      <>
                        <FolderOpen size={16} />
                        本地作业
                      </>
                    ),
                    count: localPaging.total,
                  },
                  {
                    id: 'copilot',
                    label: (
                      <>
                        <Search size={16} />
                        社区搜索
                      </>
                    ),
                  },
                  {
                    id: 'set',
                    label: (
                      <>
                        <BookOpen size={16} />
                        社区作业集
                      </>
                    ),
                  },
                ]}
                onChange={(value) => {
                  if (value === 'local') showLibrary('local');
                  else {
                    if (target !== value) setPage(1);
                    setTarget(value as 'copilot' | 'set');
                    showLibrary('community');
                  }
                }}
              />

              {tab === 'local' ? (
                <div
                  role="tabpanel"
                  id="copilot-source-panel-local"
                  aria-labelledby="copilot-source-tab-local"
                >
                  <div className="cp-library-toolbar">
                    <div className="cp-library-search">
                      <SearchField
                        className="cp-search"
                        type="search"
                        aria-label="搜索本地作业"
                        value={query}
                        onValueChange={setQuery}
                        placeholder="筛选本页标题、关卡或作者"
                      />
                      <IconButton
                        label="刷新作业库"
                        onClick={() => setRevision((value) => value + 1)}
                      >
                        <RefreshCw size={15} />
                      </IconButton>
                    </div>
                    <div className="cp-category-toolbar">
                      <div className="cp-category-chips" aria-label="本地作业分类">
                        {[{ id: '', name: '全部' }, ...categories].map((item) => (
                          <button
                            className="cp-category-chip"
                            key={item.id}
                            data-category-id={item.id}
                            aria-pressed={categoryFilter === item.id}
                            {...contextMenu('作业分类菜单', [
                              {
                                label: item.id ? '删除分类' : '删除全部作业',
                                danger: true,
                                disabled: categoryBusy || importing || savingImport,
                                action: () =>
                                  requestDelete(
                                    item.id
                                      ? { type: 'category', id: item.id, name: item.name }
                                      : { type: 'all' },
                                  ),
                              },
                            ])}
                            onClick={() => {
                              setCategoryFilter(item.id);
                              setLocalPage(1);
                              setNewCategoryName(
                                categories.find((category) => category.id === item.id)?.name ?? '',
                              );
                            }}
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                      <button
                        className="cp-link cp-category-toggle"
                        aria-expanded={categoryManagerOpen}
                        onClick={() => setCategoryManagerOpen((value) => !value)}
                      >
                        管理分类
                      </button>
                    </div>
                  </div>
                  {categoryManagerOpen && (
                    <section className="cp-category-manager" aria-label="管理本地分类">
                      <label className="cp-field">
                        分类名称
                        <input
                          className="text-input"
                          aria-label="分类名称"
                          value={newCategoryName}
                          maxLength={300}
                          onChange={(event) => setNewCategoryName(event.target.value)}
                        />
                      </label>
                      <div className="cp-category-actions">
                        <button
                          className="button secondary"
                          disabled={categoryBusy || !newCategoryName.trim()}
                          onClick={() => void saveCategory(false)}
                        >
                          新建分类
                        </button>
                        <button
                          className="button secondary"
                          disabled={categoryBusy || !selectedCategory || !newCategoryName.trim()}
                          onClick={() => void saveCategory(true)}
                        >
                          重命名分类
                        </button>
                        <button
                          className="cp-link"
                          disabled={categoryBusy || !selectedCategory}
                          onClick={() =>
                            selectedCategory &&
                            requestDelete({
                              type: 'category',
                              id: selectedCategory.id,
                              name: selectedCategory.name,
                            })
                          }
                        >
                          删除分类
                        </button>
                      </div>
                    </section>
                  )}
                  {categoryFilter && (
                    <div className="cp-category-enqueue">
                      <label>
                        入队类型
                        <Select
                          className="text-input"
                          aria-label="分类入队类型"
                          value={categoryQueueKind}
                          onChange={(event) =>
                            setCategoryQueueKind(event.target.value as CopilotKind | '')
                          }
                        >
                          <option value="">全部类型</option>
                          {kinds.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <button
                        className="button secondary"
                        disabled={categoryBusy || importing}
                        onClick={() => void enqueueCategory()}
                      >
                        <Plus size={15} />
                        整类加入队列
                      </button>
                      <p className="sp-help">
                        包含分类的全部分页；混合类型请分别选择，按库内顺序追加。
                      </p>
                    </div>
                  )}
                  <div className="cp-library-selection">
                    <SelectAll
                      label="全选本页作业"
                      text="全选本页"
                      total={filtered.length}
                      selected={selectedLibraryRecords.length}
                      disabled={loading || deleting}
                      onChange={(checked) =>
                        setSelectedLibraryIds(checked ? filtered.map((record) => record.id) : [])
                      }
                    />
                    <span className="sp-help">已选 {selectedLibraryRecords.length} 项</span>
                    <button
                      className="button secondary cp-library-delete-selected"
                      disabled={
                        !selectedLibraryRecords.length || loading || categoryBusy || importing
                      }
                      onClick={() =>
                        requestDelete({
                          type: 'records',
                          ids: selectedLibraryRecords.map((record) => record.id),
                        })
                      }
                    >
                      <Trash2 size={14} />
                      删除所选
                    </button>
                  </div>
                  <CopilotLibraryList
                    libraryReady={libraryReady}
                    finishedLibrary={finishedLibrary}
                    libraryKey={libraryKey}
                    filtered={filtered}
                    selectedLibraryIds={selectedLibraryIds}
                    setSelectedLibraryIds={setSelectedLibraryIds}
                    contextMenu={contextMenu}
                    categories={categories}
                    workspace={workspace}
                    kind={kind}
                    addRecords={addRecords}
                    assignCategory={assignCategory}
                    exportRecord={exportRecord}
                    requestDelete={requestDelete}
                    categoryBusy={categoryBusy}
                    importing={importing}
                    savingImport={savingImport}
                    loading={loading}
                    deleting={deleting}
                    kindLabel={kindLabel}
                    resourceKey={resourceKey}
                    roster={roster}
                    rosterHint={rosterHint}
                    openRecord={openRecord}
                    setKind={setKind}
                    query={query}
                    categoryFilter={categoryFilter}
                    showLibrary={showLibrary}
                    openImport={openImport}
                    localPage={localPage}
                    localPaging={localPaging}
                    setLocalPage={setLocalPage}
                  />
                </div>
              ) : (
                <div
                  role="tabpanel"
                  id={`copilot-source-panel-${target}`}
                  aria-labelledby={`copilot-source-tab-${target}`}
                >
                  <CopilotCommunityBrowser
                    target={target}
                    keyword={keyword}
                    setKeyword={setKeyword}
                    stage={stage}
                    setStage={setStage}
                    setStageFilter={setStageFilter}
                    orderBy={orderBy}
                    setOrderBy={setOrderBy}
                    page={page}
                    setPage={setPage}
                    resourceKey={resourceKey}
                    searching={searching}
                    searchResult={searchResult}
                    searchError={searchError}
                    refreshSearch={refreshSearch}
                    requestPreview={requestPreview}
                    kindLabel={kindLabel}
                    roster={roster}
                    rosterHint={rosterHint}
                  />
                </div>
              )}
              <p className="cp-community-note" aria-label="社区服务与内容归属">
                社区服务由{' '}
                <a
                  href="https://prts.plus/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={openLink}
                >
                  PRTS Plus <ExternalLink size={11} />
                </a>{' '}
                提供。作业、说明和视频权利归各权利人；转载请遵循原作者声明，不因导入而改用本项目
                AGPL。
              </p>
            </section>
            {detailOpen && current && (
              <CopilotDetailDrawer
                current={current}
                origin={detailOrigin}
                preview={preview}
                previewParams={previewParams.current}
                isStored={isStored}
                currentPreviewEntry={currentPreviewEntry}
                kind={kind}
                importing={importing}
                canQueue={canQueue}
                categoryBusy={categoryBusy}
                categories={categories}
                resourceKey={resourceKey}
                roster={roster}
                rosterHint={rosterHint}
                run={run}
                error={error}
                notice={notice}
                returnFocus={detailTrigger.current}
                onClose={closeDetail}
                onClearError={() => setError('')}
                onSelectKind={setKind}
                kindLabel={kindLabel}
                requestPreview={requestPreview}
                addRecords={addRecords}
                exportRecord={exportRecord}
                importPreview={importPreview}
                assignCategory={assignCategory}
                openLink={openLink}
              />
            )}
          </div>
          <CopilotQueueView
            kinds={kinds}
            kind={kind}
            importing={importing}
            setKind={setKind}
            enabledCount={enabled.length}
            workspace={workspace}
            edit={edit}
            changeQueueSelection={changeQueueSelection}
            savingImport={savingImport}
            showLibrary={showLibrary}
            queueRecords={queueRecords}
            contextMenu={contextMenu}
            move={move}
            addRecords={addRecords}
            remove={remove}
            openRecord={openRecord}
            usesNavigation={usesNavigation}
            queueChange={queueChange}
            options={options}
            saveState={saveState}
            saveError={saveError}
            flush={flush}
            selectedDevice={selectedDevice}
            onSelectDevice={onSelectDevice}
            snapshot={snapshot}
            checking={checking}
            availability={status}
            onViewRun={onViewRun}
            startingHint={startingHint}
            disabledReason={disabledReason}
            starting={starting}
            start={start}
          />
        </div>
        {!!legacy.length && (
          <details className="sp-section cp-legacy">
            <summary>旧任务表作业 · {legacy.length} 项</summary>
            <p className="sp-help">
              原配置保持可编辑与执行。复制会先解析预览，不删除或迁移原任务。视频识别继续使用旧入口。
            </p>
            {legacy.map(({ plan, task, taskIndex }) => (
              <div
                key={`${plan.id}:${taskIndex}`}
                className="cp-legacy-row"
                tabIndex={0}
                {...contextMenu('旧作业配置菜单', [
                  { label: '编辑作业配置', action: () => onOpenPlan(plan, task.type, taskIndex) },
                  {
                    label: '复制到作业库',
                    disabled: task.type === 'VideoRecognition',
                    action: () => {
                      void requestPreview({ planId: plan.id, taskIndex });
                    },
                  },
                ])}
              >
                <div>
                  <strong>{plan.name}</strong>
                  <span>
                    {taskLabels[task.type]} · 第 {taskIndex + 1} 条任务
                  </span>
                  <small>{String(task.params.filename ?? '作业列表')}</small>
                </div>
                <button className="cp-link" onClick={() => onOpenPlan(plan, task.type, taskIndex)}>
                  编辑原配置
                </button>
                {task.type !== 'VideoRecognition' && (
                  <button
                    className="button secondary"
                    onClick={() => void requestPreview({ planId: plan.id, taskIndex })}
                  >
                    复制到作业库
                  </button>
                )}
              </div>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}
