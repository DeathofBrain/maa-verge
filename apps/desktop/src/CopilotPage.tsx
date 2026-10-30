import Select from './Select';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  ExternalLink,
  FileJson,
  Flame,
  FolderOpen,
  Info,
  ListOrdered,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
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
  type CopilotOptions,
  type CopilotPreview,
  type CopilotRecord,
  type CopilotWorkspace,
  type RpcParams,
  type RpcResult,
} from '@maaverge/contracts';
import type { SupportPageProps } from './app/page-types';
import { useContextMenu } from './ContextMenu';
import CopilotOperators, { useCopilotRoster } from './CopilotOperators';
import CopilotSetOperators from './CopilotSetOperators';
import CopilotDifficulty from './CopilotDifficulty';
import CopilotSelectAll from './CopilotSelectAll';
import CopilotStageFilter from './CopilotStageFilter';
import Drawer from './kit/Drawer';
import useWorkspace from './features/copilot/useCopilotWorkspace';
import CopilotRating from './features/copilot/CopilotRating';
import Compatibility from './features/copilot/CopilotCompatibility';
import CopilotSettings from './features/copilot/CopilotSettingsView';
import CopilotDeleteDialog, { type CopilotDeleteTarget } from './CopilotDeleteDialog';
import {
  cachedCommunityPreview,
  invalidateCopilotPreview,
  readCopilotPreview,
  useCommunitySearch,
} from './copilot-community';
import './copilot-page.css';
import './copilot-community-sort.css';
import './copilot-drawer.css';

type Props = SupportPageProps & {
  initialRunId?: string;
  initialLegacy?: { planId: string; taskIndex: number; nonce: string };
  onViewRun?: (id: string) => void;
  onRunSelection?: (id: string | undefined) => void;
};
type Availability = RpcResult<'device.availability'>;
type Run = RpcResult<'run.detail'>;
type CommunityOrder = NonNullable<RpcParams<'copilot.search'>['orderBy']>;
const communityOrders = [
  { value: 'hot', label: '热度', icon: Flame },
  { value: 'id', label: '最新', icon: Clock3 },
  { value: 'views', label: '访问量', icon: Eye },
] as const;
const kinds: { value: CopilotKind; label: string; short: string }[] = [
  { value: 'Copilot', label: '普通作业', short: '普通' },
  { value: 'SSSCopilot', label: '保全派驻', short: '保全' },
  { value: 'ParadoxCopilot', label: '悖论模拟', short: '悖论' },
];
const kindLabel = (kind: CopilotKind) => kinds.find((item) => item.value === kind)?.label ?? kind;
const errorText = errorMessage;
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
  const detailHeading = useRef<HTMLHeadingElement>(null);
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
  useEffect(() => {
    if (detailOpen) detailHeading.current?.focus({ preventScroll: true });
  }, [detailOpen, selection?.id, selection?.versionId]);
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
    requestAnimationFrame(() => {
      if (detailTrigger.current?.isConnected) detailTrigger.current.focus({ preventScroll: true });
    });
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
        <section ref={runPanel} className="sp-section cp-run" aria-label="作业运行状态">
          <header className="cp-run-controls">
            <h2>作业执行结果</h2>
            <div className="cp-run-filters">
              <label className="cp-run-select">
                查看设备
                <Select
                  className="text-input"
                  aria-label="查看作业设备"
                  value={monitorDevice}
                  onChange={(event) => selectMonitorDevice(event.target.value)}
                >
                  <option value="">全部设备</option>
                  {monitorDeviceIds.map((id) => (
                    <option key={id} value={id}>
                      {deviceName(id)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="cp-run-select cp-run-history">
                执行记录
                <Select
                  className="text-input"
                  aria-label="查看作业记录"
                  value={runId}
                  onChange={(event) => selectMonitorRun(event.target.value)}
                >
                  <option value="">当前／最近执行</option>
                  {runId && !runChoices.some((item) => item.id === runId) && (
                    <option value={runId}>指定执行记录</option>
                  )}
                  {runChoices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {!monitorDevice ? deviceName(item.deviceId) + ' · ' : ''}
                      {item.sourceName || item.planName || '作业执行'} ·{' '}
                      {new Date(item.startedAt).toLocaleString('zh-CN')}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          </header>
          {runError && (
            <div className="cp-run-error" role="alert">
              <span>读取执行记录失败：{runError}</span>
              <button className="cp-link" onClick={() => setRunRevision((value) => value + 1)}>
                重试读取记录
              </button>
            </div>
          )}
          {run ? (
            <>
              <header className="cp-run-summary">
                <div>
                  <span className="cp-stage">
                    {run.copilotKind && `${kindLabel(run.copilotKind)} · `}
                    {snapshot.devices.find((item) => item.id === run.deviceId)?.name ??
                      run.deviceId}
                  </span>
                  <h3>{run.sourceName || run.planName || '作业执行'}</h3>
                  <p>{run.message}</p>
                </div>
                {run.status === 'running' && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      void onAction(
                        'stop-' + run.id,
                        () => rpc('run.stop', { id: run.id }),
                        '正在停止作业',
                      );
                    }}
                  >
                    <Square size={15} />
                    停止作业
                  </button>
                )}
              </header>
              <progress max={100} value={run.progress} aria-label="作业执行进度" />
              <p className="sp-help">
                {new Date(run.startedAt).toLocaleString('zh-CN')} ·{' '}
                {run.status === 'running'
                  ? '运行中'
                  : run.status === 'completed'
                    ? '核心流程结束'
                    : run.status === 'stopped'
                      ? '已停止'
                      : '执行失败'}
                。停止会清空核心队列，本机配置和未执行项保留。
              </p>
              {run.copilotEntries && (
                <ol className="cp-run-entries">
                  {run.copilotEntries.map((entry, index) => (
                    <li key={entry.id}>
                      <span className="cp-sequence">{String(index + 1).padStart(2, '0')}</span>
                      <strong>{entry.title}</strong>
                      <span
                        className={`cp-verdict ${entry.verdict === 'failure' ? 'is-error' : ''}`}
                      >
                        {entry.verdict === 'success'
                          ? '通关已确认'
                          : entry.verdict === 'failure'
                            ? '战斗失败'
                            : '通关未确认'}
                      </span>
                      <small>
                        {entry.message ||
                          {
                            waiting: '等待执行',
                            running: '执行中',
                            completed: '核心流程结束',
                            failed: '失败',
                            stopped: '已停止',
                            skipped: '未执行',
                          }[entry.status]}
                      </small>
                    </li>
                  ))}
                </ol>
              )}
              <details key={run.id} className="cp-run-logs">
                <summary>本次运行日志（{events.length}）</summary>
                {events.length ? (
                  <ol>
                    {events.map((event) => (
                      <li key={event.id}>
                        <time>{new Date(event.createdAt).toLocaleTimeString('zh-CN')}</time>
                        <span>{event.message}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="sp-help">等待本次运行事件。</p>
                )}
              </details>
            </>
          ) : detailId && !runError ? (
            <p className="cp-run-empty" role="status">
              <LoaderCircle size={15} className="spin" />
              正在读取指定执行记录…
            </p>
          ) : !runError ? (
            <p className="cp-run-empty">
              {monitorDevice ? '此设备还没有作业执行记录。' : '还没有作业执行记录。'}
            </p>
          ) : null}
        </section>
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
              <section
                hidden={detailOpen && preview.entries.length === 1}
                className="sp-section cp-preview"
                aria-label="导入预览"
              >
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
                    <button
                      className="cp-link"
                      disabled={importing}
                      onClick={() => void requestPreview(previewParams.current!, false, true)}
                    >
                      <RefreshCw size={14} />
                      刷新导入预览
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label="关闭导入预览"
                    onClick={() => {
                      setPreview(undefined);
                      setDetailOpen(false);
                    }}
                  >
                    <X size={17} />
                  </button>
                </header>
                <div className="cp-preview-selection">
                  <CopilotSelectAll
                    label="全选可用作业"
                    total={availablePreviewEntries.length}
                    selected={
                      availablePreviewEntries.filter((entry) => previewSelection.includes(entry.id))
                        .length
                    }
                    disabled={importing}
                    onChange={(checked) =>
                      setPreviewSelection(
                        checked ? availablePreviewEntries.map((entry) => entry.id) : [],
                      )
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
                          className="text-input"
                          aria-label="作业集入队类型"
                          value={setQueueKind}
                          onChange={(event) => setSetQueueKind(event.target.value as CopilotKind)}
                        >
                          {previewKinds.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}（
                              {
                                availablePreviewEntries.filter(
                                  (entry) => entry.record?.kind === item.value,
                                ).length
                              }{' '}
                              项）
                            </option>
                          ))}
                        </Select>
                      </label>
                    )}
                    <button
                      className="button primary"
                      disabled={importing || !wholeSetEntries.length}
                      onClick={() =>
                        void importPreview(
                          true,
                          wholeSetEntries.map((entry) => entry.id),
                          previewKinds.length > 1 ? setQueueKind : previewKinds[0]?.value,
                          previewKinds.length > 1 ||
                            preview.entries.length > availablePreviewEntries.length,
                        )
                      }
                    >
                      <Plus size={15} />
                      {previewKinds.length > 1
                        ? `导入并加入${kindLabel(setQueueKind)}队列`
                        : '全集导入并加入队列'}
                    </button>
                  </div>
                )}
                <div className="cp-preview-list">
                  {preview.entries.map((entry, index) => (
                    <div
                      className={`cp-preview-entry ${entry.error ? 'is-error' : ''}`}
                      key={entry.id}
                    >
                      <label>
                        <input
                          type="checkbox"
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
                            {kindLabel(entry.record.kind)} ·{' '}
                            {entry.record.stageName || '未标注关卡'} · 作者：
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
                          <button
                            className="cp-link"
                            onClick={() => openRecord(entry.record!, 'preview')}
                          >
                            查看干员与作业详情
                          </button>
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
                  <button
                    className="button secondary"
                    disabled={importing || !previewSelection.length}
                    onClick={() => void importPreview(false)}
                  >
                    导入到作业库
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      importing ||
                      !selectedPreviewRecords.length ||
                      selectedPreviewRecords.some(
                        (record) => record.kind !== selectedPreviewRecords[0].kind,
                      )
                    }
                    title={
                      selectedPreviewRecords.some(
                        (record) => record.kind !== selectedPreviewRecords[0].kind,
                      )
                        ? '请按类型分别选择并加入对应队列'
                        : '按原顺序追加到对应类型的队列'
                    }
                    onClick={() => void importPreview(true)}
                  >
                    <Plus size={15} />
                    所选导入并加入队列
                  </button>
                </div>
              </section>
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
              <div className="cp-source-tabs" role="tablist" aria-label="作业来源">
                <button
                  role="tab"
                  aria-selected={tab === 'local'}
                  onClick={() => showLibrary('local')}
                >
                  <FolderOpen size={16} />
                  本地作业<span>{localPaging.total}</span>
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'community' && target === 'copilot'}
                  onClick={() => {
                    if (target !== 'copilot') setPage(1);
                    setTarget('copilot');
                    showLibrary('community');
                  }}
                >
                  <Search size={16} />
                  社区搜索
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'community' && target === 'set'}
                  onClick={() => {
                    if (target !== 'set') setPage(1);
                    setTarget('set');
                    showLibrary('community');
                  }}
                >
                  <BookOpen size={16} />
                  社区作业集
                </button>
              </div>

              {tab === 'local' ? (
                <>
                  <div className="cp-library-toolbar">
                    <label className="cp-search">
                      <Search size={16} />
                      <input
                        className="text-input"
                        type="search"
                        aria-label="搜索本地作业"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="筛选本页标题、关卡或作者"
                      />
                      <button
                        className="icon-button"
                        aria-label="刷新作业库"
                        onClick={() => setRevision((value) => value + 1)}
                      >
                        <RefreshCw size={15} />
                      </button>
                    </label>
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
                    <CopilotSelectAll
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
                                  checked
                                    ? [...ids, record.id]
                                    : ids.filter((id) => id !== record.id),
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
                                  {categories.find((item) => item.id === record.categoryId)?.name ??
                                    '已分类'}
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
                          <button
                            className="button secondary cp-record-add"
                            aria-label={`加入队列 ${record.title}`}
                            title={
                              record.kind !== kind
                                ? `先切换到${kindLabel(record.kind)}队列`
                                : '加入队列，可重复添加'
                            }
                            disabled={
                              !workspace ||
                              (record.kind === kind &&
                                kind === 'SSSCopilot' &&
                                !!workspace.queue.length)
                            }
                            onClick={() =>
                              record.kind === kind ? addRecords([record]) : setKind(record.kind)
                            }
                          >
                            <Plus size={15} />
                            {record.kind === kind ? '加入队列' : '切换队列'}
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="cp-empty">
                      <BookOpen size={29} />
                      <h3>
                        {query
                          ? '没有匹配的作业'
                          : categoryFilter
                            ? '此分类还没有作业'
                            : '还没有本地作业'}
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
                          <button
                            className="button primary"
                            onClick={() => showLibrary('community')}
                          >
                            <Search size={15} />
                            去社区找作业
                          </button>
                          <button
                            className="button secondary"
                            disabled={savingImport}
                            onClick={openImport}
                          >
                            <Upload size={15} />
                            导入本地作业
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="cp-pagination">
                    <button
                      className="button secondary"
                      aria-label="本地作业上一页"
                      disabled={localPage <= 1 || loading}
                      onClick={() => setLocalPage((value) => value - 1)}
                    >
                      上一页
                    </button>
                    <span>
                      第 {localPage} 页 · 共 {localPaging.total} 份
                    </span>
                    <button
                      className="button secondary"
                      aria-label="本地作业下一页"
                      disabled={!localPaging.hasNext || loading}
                      onClick={() => setLocalPage((value) => value + 1)}
                    >
                      下一页
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="cp-community-controls">
                    <label className="cp-field">
                      关键词
                      <input
                        className="text-input"
                        type="search"
                        aria-label="社区搜索关键词"
                        value={keyword}
                        onChange={(event) => {
                          setKeyword(event.target.value);
                          setPage(1);
                        }}
                        placeholder={target === 'set' ? '搜索作业集名称或说明' : '搜索标题或说明'}
                      />
                    </label>
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
                      <div className="cp-community-sort" role="group" aria-label="社区作业排序">
                        <span>排序：</span>
                        {communityOrders.map(({ value, label, icon: Icon }) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={orderBy === value}
                            onClick={() => {
                              if (orderBy === value) return;
                              setOrderBy(value);
                              setPage(1);
                            }}
                          >
                            <Icon size={15} aria-hidden="true" />
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="cp-search-actions">
                      <p className="sp-help">
                        {target === 'set'
                          ? '点进作业集查看成员，可逐项选择并按原顺序加入队列。'
                          : '支持用编号或链接直接导入。'}
                      </p>
                      <button
                        className="icon-button"
                        aria-label="刷新社区搜索"
                        title="刷新搜索结果"
                        disabled={searching}
                        onClick={refreshSearch}
                      >
                        <RefreshCw size={15} />
                      </button>
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
                            {target === 'copilot' && (
                              <CopilotDifficulty difficulty={item.difficulty} />
                            )}
                            <button
                              className="cp-record-main"
                              onClick={() =>
                                void requestPreview(
                                  { code: target === 'set' ? `s${item.id}` : item.id },
                                  true,
                                )
                              }
                            >
                              <span className="cp-stage">
                                {target === 'set'
                                  ? '作业集'
                                  : item.kind
                                    ? kindLabel(item.kind)
                                    : '社区作业'}
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
                            <button
                              className="icon-button"
                              aria-label={`查看详情 ${item.title}`}
                              onClick={() =>
                                void requestPreview(
                                  { code: target === 'set' ? `s${item.id}` : item.id },
                                  true,
                                )
                              }
                            >
                              <ChevronRight size={19} />
                            </button>
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
                    <button
                      className="button secondary"
                      disabled={page <= 1 || searching}
                      onClick={() => setPage((value) => value - 1)}
                    >
                      上一页
                    </button>
                    <span>
                      第 {page} 页{searchResult ? ` · ${searchResult.total} 条` : ''}
                    </span>
                    <button
                      className="button secondary"
                      disabled={!searchResult?.hasNext || searching}
                      onClick={() => setPage((value) => value + 1)}
                    >
                      下一页
                    </button>
                  </div>
                </>
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
              <CopilotDetailDrawer onClose={closeDetail}>
                <aside className="cp-detail sp-section" aria-label="作业详情">
                  <nav className="cp-station-nav" aria-label="作业站导航">
                    <button className="cp-back cp-link" disabled={importing} onClick={closeDetail}>
                      <ArrowLeft size={15} />
                      {detailOrigin === 'preview' && preview && preview.entries.length > 1
                        ? '返回导入预览'
                        : '返回作业列表'}
                    </button>
                    <ChevronRight size={14} />
                    <span>作业详情</span>
                  </nav>
                  {error && (
                    <div className="error-banner cp-feedback" role="alert">
                      {error}
                      <button
                        className="icon-button"
                        aria-label="关闭详情错误"
                        onClick={() => setError('')}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}
                  {notice && (
                    <p className="cp-notice" role="status">
                      <Check size={15} />
                      {notice}
                    </p>
                  )}
                  <div className="cp-detail-toolbar">
                    <span>{isStored ? '已保存到本地' : '社区预览 · 尚未导入'}</span>
                    {detailOrigin === 'preview' && previewParams.current?.code && (
                      <button
                        className="cp-link"
                        disabled={importing}
                        onClick={() =>
                          void requestPreview(
                            previewParams.current!,
                            preview?.entries.length === 1,
                            true,
                          )
                        }
                      >
                        <RefreshCw size={14} />
                        {preview && preview.entries.length > 1 ? '刷新作业集' : '刷新作业详情'}
                      </button>
                    )}
                  </div>
                  <header className="cp-detail-heading">
                    <span className="cp-stage">
                      {current.stageName || '未标注关卡'} · {kindLabel(current.kind)}
                    </span>
                    <h2 ref={detailHeading} tabIndex={-1}>
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
                        if (previewParams.current)
                          invalidateCopilotPreview(previewParams.current, resourceKey);
                      }}
                    />
                  )}
                  <div className="cp-detail-actions">
                    {isStored ? (
                      <>
                        <button
                          className="button primary"
                          disabled={!canQueue || current.kind !== kind}
                          onClick={() => addRecords([current])}
                        >
                          <Plus size={15} />
                          加入执行队列
                        </button>
                        <button
                          className="button secondary"
                          title="同时导出原始 JSON 与来源署名说明"
                          onClick={() => {
                            void exportRecord(current);
                          }}
                        >
                          <Download size={15} />
                          导出 JSON
                        </button>
                      </>
                    ) : (
                      currentPreviewEntry && (
                        <>
                          <button
                            className="button primary"
                            disabled={importing || !canQueue || current.kind !== kind}
                            onClick={() => void importPreview(true, [currentPreviewEntry.id])}
                          >
                            <Plus size={15} />
                            导入并加入当前队列
                          </button>
                          <button
                            className="button secondary"
                            disabled={importing}
                            onClick={() => void importPreview(false, [currentPreviewEntry.id])}
                          >
                            <Download size={15} />
                            导入到作业库
                          </button>
                        </>
                      )
                    )}
                  </div>
                  {current.kind !== kind && (
                    <p className="cp-queue-mismatch">
                      这是{kindLabel(current.kind)}，需加入对应类型的执行队列。
                      <button
                        className="cp-link"
                        disabled={importing}
                        onClick={() => setKind(current.kind)}
                      >
                        切换到{kindLabel(current.kind)}队列
                        <ArrowRight size={14} />
                      </button>
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
                        className="text-input"
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
                      <button
                        className="cp-link"
                        disabled={importing}
                        onClick={() => void requestPreview({ code: `s${current.source.setId}` })}
                      >
                        <BookOpen size={14} />
                        查看所属作业集 #{current.source.setId}
                      </button>
                    )}
                    {safeLink(current.source.url) && (
                      <a
                        href={safeLink(current.source.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={openLink}
                      >
                        <ExternalLink size={14} />
                        查看原站
                      </a>
                    )}
                    {current.videos.map(
                      (video, index) =>
                        safeLink(video) && (
                          <a
                            key={video}
                            href={safeLink(video)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={openLink}
                          >
                            <ExternalLink size={14} />
                            参考视频{index + 1}
                          </a>
                        ),
                    )}
                  </div>
                </aside>
              </CopilotDetailDrawer>
            )}
          </div>
          <section className="cp-queue sp-section" aria-label="作业执行队列">
            <div className="cp-queue-heading">
              <h2>
                <ListOrdered size={17} />
                执行队列
              </h2>
              <div className="cp-type-bar" role="tablist" aria-label="队列类型">
                {kinds.map((item) => (
                  <button
                    key={item.value}
                    role="tab"
                    aria-selected={kind === item.value}
                    className={kind === item.value ? 'is-selected' : ''}
                    disabled={importing}
                    onClick={() => setKind(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="cp-queue-editor">
              <header>
                <div>
                  <h2>
                    {kindLabel(kind)}队列{' '}
                    <span>
                      {enabled.length} / {workspace?.queue.length ?? 0}
                    </span>
                  </h2>
                  <p>每项独立排序，可重复添加；修改只影响下次执行。</p>
                </div>
                <button
                  className="cp-link"
                  aria-label="清除未勾选项"
                  disabled={!workspace?.queue.some((entry) => !entry.enabled)}
                  onClick={() =>
                    edit((value) => ({
                      ...value,
                      queue: value.queue.filter((entry) => entry.enabled),
                    }))
                  }
                >
                  清除未选
                </button>
              </header>
              <div className="cp-preview-selection">
                <CopilotSelectAll
                  label="全选执行队列"
                  total={workspace?.queue.length ?? 0}
                  selected={enabled.length}
                  onChange={changeQueueSelection}
                />
              </div>
              {!workspace ? (
                <p role="status">正在读取队列…</p>
              ) : !workspace.queue.length ? (
                <div className="cp-queue-empty">
                  <ListOrdered size={26} />
                  <strong>还没有待执行的作业</strong>
                  <p>
                    先在左侧查看作业和干员要求，
                    <br />
                    再加入这里，按顺序执行。
                  </p>
                  <button
                    className="cp-link"
                    disabled={savingImport}
                    onClick={() => showLibrary('community')}
                  >
                    去社区找作业
                    <ArrowRight size={14} />
                  </button>
                </div>
              ) : (
                <ol className="cp-queue-list">
                  {workspace.queue.map((entry, index) => {
                    const record = queueRecords[entry.versionId];
                    return (
                      <li
                        key={entry.id}
                        className={!entry.enabled ? 'is-disabled' : ''}
                        tabIndex={0}
                        {...contextMenu('队列条目菜单', [
                          {
                            label: entry.enabled ? '取消勾选' : '勾选执行',
                            action: () => changeQueueSelection(!entry.enabled, entry.id),
                          },
                          {
                            label: '上移',
                            action: () => move(entry.id, -1),
                            disabled: index === 0,
                          },
                          {
                            label: '下移',
                            action: () => move(entry.id, 1),
                            disabled: index === workspace.queue.length - 1,
                          },
                          {
                            label: '重复添加',
                            action: () => record && addRecords([record]),
                            disabled: !record || kind === 'SSSCopilot',
                          },
                          { label: '移除条目', action: () => remove(entry.id), danger: true },
                        ])}
                      >
                        <div className="cp-queue-row">
                          <input
                            type="checkbox"
                            aria-label={`执行队列 ${index + 1}`}
                            checked={entry.enabled}
                            onChange={(event) =>
                              changeQueueSelection(event.target.checked, entry.id)
                            }
                          />
                          <span className="cp-sequence">{String(index + 1).padStart(2, '0')}</span>
                          <button
                            className="cp-queue-title"
                            disabled={!record}
                            onClick={() => record && openRecord(record)}
                          >
                            <strong>
                              {record?.title ??
                                (record === null ? '作业版本不可用' : '正在读取作业…')}
                            </strong>
                            <small>{record?.stageName || entry.versionId.slice(0, 12)}</small>
                          </button>
                          <div className="cp-queue-actions">
                            <button
                              className="icon-button"
                              aria-label={`上移作业 ${index + 1}`}
                              disabled={index === 0}
                              onClick={() => move(entry.id, -1)}
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`下移作业 ${index + 1}`}
                              disabled={index === workspace.queue.length - 1}
                              onClick={() => move(entry.id, 1)}
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`移除作业 ${index + 1}`}
                              onClick={() => remove(entry.id)}
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </div>
                        {usesNavigation && (
                          <div className="cp-entry-options">
                            {
                              <label>
                                <input
                                  type="checkbox"
                                  checked={entry.isRaid}
                                  onChange={(event) =>
                                    queueChange(entry.id, { isRaid: event.target.checked })
                                  }
                                />
                                突袭
                              </label>
                            }
                            {
                              <label>
                                导航关卡
                                <input
                                  className="text-input"
                                  aria-label={`导航关卡 ${index + 1}`}
                                  value={entry.navName}
                                  onChange={(event) =>
                                    queueChange(entry.id, { navName: event.target.value })
                                  }
                                  placeholder="沿用作业关卡"
                                  maxLength={200}
                                />
                              </label>
                            }
                          </div>
                        )}
                        {record && record.compatibility.status !== 'ready' && (
                          <p className="cp-error-text">{record.compatibility.reasons.join('；')}</p>
                        )}
                        {record === null && (
                          <p className="cp-error-text">请移除或取消勾选此项后再执行。</p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
              {workspace && (
                <>
                  <CopilotSettings
                    kind={kind}
                    count={enabled.length}
                    options={workspace.options}
                    change={options}
                  />
                  <div className="cp-save-state" role="status">
                    {saveState}
                    {saveError && (
                      <>
                        <span className="cp-error-text">{saveError}</span>
                        <button className="cp-link" onClick={() => void flush().catch(() => {})}>
                          重试保存
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="cp-launch">
              <label className="cp-field">
                目标设备
                <Select
                  className="text-input"
                  aria-label="作业目标设备"
                  value={selectedDevice}
                  onChange={(event) => onSelectDevice(event.target.value)}
                >
                  <option value="">请选择空闲设备</option>
                  {snapshot.devices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ·{' '}
                      {item.state === 'offline'
                        ? '离线'
                        : item.state === 'running'
                          ? '执行中'
                          : '已连接'}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="cp-device-status" role="status">
                {checking && <LoaderCircle size={14} className="spin" />}
                <span>
                  {selectedDevice
                    ? (status?.error ?? status?.result?.reason ?? '正在检查设备…')
                    : '浏览和导入无需连接设备'}
                </span>
                {status?.result?.ownerId &&
                  onViewRun &&
                  snapshot.runs.some((item) => item.id === status.result?.ownerId) && (
                    <button className="cp-link" onClick={() => onViewRun(status.result!.ownerId!)}>
                      查看占用
                    </button>
                  )}
              </div>
              <p className="cp-start-hint">
                <Info size={15} />
                {startingHint}
              </p>
              {kind === 'Copilot' && (
                <details className="cp-game-help">
                  <summary>游戏内准备与说明</summary>
                  <p className="sp-help">
                    队列在当前区域内按关卡导航，不支持跨区域；普通与突袭由队列条目选择。单份循环、演习请在游戏内选好关卡与模式。助战限制以核心反馈为准，不使用理智药或源石。
                  </p>
                </details>
              )}
              <button
                className="button primary cp-start"
                disabled={!!disabledReason || starting}
                title={disabledReason || '使用已保存的队列与选项开始执行'}
                onClick={() => void start()}
              >
                {starting ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}
                开始作业
              </button>
              {disabledReason && <p className="sp-help">{disabledReason}</p>}
            </div>
          </section>
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

function CopilotDetailDrawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const background = document.getElementById('root');
  const page = document.querySelector<HTMLElement>('.copilot-page');
  return (
    <Drawer
      title="作业详情弹窗"
      onClose={onClose}
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
      {children}
    </Drawer>
  );
}
