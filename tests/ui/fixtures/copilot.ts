// Browser-only deterministic adapter. Product code never imports this module.
import type {
  CopilotCategory,
  CopilotKind,
  CopilotOptions,
  CopilotPreview,
  CopilotRecord,
  CopilotWorkspace,
  Run,
  Snapshot,
  Task,
} from '../../../packages/contracts/src/index';

type Context = {
  key: string;
  snapshot: () => Snapshot;
  emit: (type: string, message: string, data?: Record<string, unknown>) => void;
  availability: (id: string) => { available: boolean; reason: string };
  register: (run: Run, tasks: Task[]) => void;
  requests: Map<string, string>;
};
const clone = <T>(value: T): T => structuredClone(value);
const now = () => new Date().toISOString();
const kinds: CopilotKind[] = ['Copilot', 'SSSCopilot', 'ParadoxCopilot'];
const defaultOptions = (): CopilotOptions => ({
  loopTimes: 1,
  formation: false,
  formationIndex: 0,
  addTrust: false,
  ignoreRequirements: false,
  supportUnitName: '',
  additionalOperators: [],
  autoLikeOnSuccess: false,
});
const synthetic = (id: string) => ({
  stage_name: 'main_01-07',
  difficulty: id === '102' ? 2 : 1,
  minimum_required: 'v6.0.0',
  doc: {
    title: `合成社区作业 ${id}`,
    details: '仅供界面验证的本地夹具，不访问社区',
    ...(id === '103' ? {} : { author: '合成作者' }),
  },
  opers: [{ name: '阿米娅', skill: 1, requirements: { elite: 2, level: 80 } }],
  groups: [
    {
      name: '输出备选',
      opers: [
        { name: '能天使', skill: 3 },
        { name: '合成六星干员', skill: 2 },
      ],
    },
  ],
  actions: [{ type: 'SpeedUp' }],
});
type FixtureData = {
  items: CopilotRecord[];
  versions: Record<string, { record: CopilotRecord; content: string }>;
  workspaces: Partial<Record<CopilotKind, CopilotWorkspace>>;
  categories: CopilotCategory[];
  setCategories: Record<string, string>;
};
const categoryName = (name: string) => name.trim().toLowerCase();
function setCategory(data: FixtureData, setId: string, title: string) {
  const previous = data.setCategories[setId];
  if (data.categories.some((category) => category.id === previous)) return previous;
  const name = title.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim() || `作业集 ${setId}`;
  let category = data.categories.find((item) => categoryName(item.name) === categoryName(name));
  if (!category) {
    if (data.categories.length >= 500) throw new Error('本地分类已达 500 个上限，请先整理分类');
    const timestamp = now();
    category = { id: crypto.randomUUID(), name, createdAt: timestamp, updatedAt: timestamp };
    data.categories.push(category);
  }
  data.setCategories[setId] = category.id;
  return category.id;
}

export function createCopilotFixture(context: Context) {
  const storageKey = context.key + ':copilot';
  const restored = (() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || 'null');
    } catch {
      return null;
    }
  })();
  const data: FixtureData = {
    items: [],
    versions: {},
    workspaces: {},
    ...restored,
    categories: restored?.categories ?? [],
    setCategories: restored?.setCategories ?? {},
  };
  const previews = new Map<string, { preview: CopilotPreview; content: Map<string, string> }>();
  const ratings = new Map<
    string,
    { communityId: string; likes: number; dislikes: number; rating: 'none' | 'like' | 'dislike' }
  >();
  const persist = () => localStorage.setItem(storageKey, JSON.stringify(data));
  const workspace = (kind: CopilotKind): CopilotWorkspace =>
    clone(data.workspaces[kind] ?? { kind, queue: [], options: defaultOptions() });
  async function record(
    content: string,
    name: string,
    source: CopilotRecord['source'],
  ): Promise<CopilotRecord> {
    if (new TextEncoder().encode(content).length > 700_000)
      throw new Error('作业文件过大，请分批导入');
    const json = JSON.parse(content.replace(/^\uFEFF/u, ''));
    if (
      !json ||
      typeof json !== 'object' ||
      Array.isArray(json) ||
      (!Array.isArray(json.actions) && !Array.isArray(json.stages))
    )
      throw new Error('无法识别作业内容，需要 actions 或 stages');
    const kind: CopilotKind =
      json.type === 'SSS' || Array.isArray(json.stages)
        ? 'SSSCopilot'
        : json.type === 'Paradox' || /^mem_/u.test(json.stage_name || '')
          ? 'ParadoxCopilot'
          : 'Copilot';
    const versionId = [
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))),
    ]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    return {
      ...([0, 1, 2, 3].includes(json.difficulty) ? { difficulty: json.difficulty } : {}),
      id: source.communityId ? `community-${source.communityId}` : versionId,
      versionId,
      kind,
      title: json.doc?.title || name || json.stage_name || '未命名作业',
      stageName: json.stage_name || json.stage_name_override || '保全派驻',
      author:
        typeof json.author === 'string'
          ? json.author
          : typeof json.doc?.author === 'string'
            ? json.doc.author
            : '',
      ...(source.kind === 'community' ? { uploader: '合成上传者' } : {}),
      description: String(json.doc?.details || ''),
      minimumCoreVersion: json.minimum_required || '',
      operators: [
        ...(json.opers || []),
        ...(json.groups || []).flatMap((group: { name: string; opers: object[] }) =>
          group.opers.map((operator) => ({ ...operator, group: group.name })),
        ),
      ],
      videos: [],
      source,
      createdAt: now(),
      compatibility: { status: 'ready', reasons: [] },
    };
  }
  return async function copilotRpc(method: string, params: Record<string, any>): Promise<unknown> {
    const state = context.snapshot();
    switch (method) {
      case 'copilot.list': {
        const items = data.items.filter(
            (item) =>
              (!params.kind || item.kind === params.kind) &&
              (params.categoryId === undefined || (item.categoryId ?? null) === params.categoryId),
          ),
          page = Number(params.page || 1);
        return {
          items: clone(items.slice((page - 1) * 20, page * 20)),
          page,
          total: items.length,
          hasNext: page * 20 < items.length,
        };
      }
      case 'copilot.category.list':
        return { items: clone(data.categories) };
      case 'copilot.category.save': {
        if (
          typeof params.name !== 'string' ||
          params.name.length > 300 ||
          !params.name.trim() ||
          /[\u0000-\u001f\u007f]/u.test(params.name)
        )
          throw new Error('分类名称不能为空或含控制字符');
        const name = params.name.trim();
        const existing = params.id
          ? data.categories.find((item) => item.id === params.id)
          : undefined;
        if (params.id && !existing) throw new Error('分类不存在，请刷新后重试');
        if (
          data.categories.some(
            (item) => item.id !== existing?.id && categoryName(item.name) === categoryName(name),
          )
        )
          throw new Error('分类名称已存在');
        if (!existing && data.categories.length >= 500)
          throw new Error('本地分类已达 500 个上限，请先整理分类');
        const timestamp = now();
        const category = {
          id: existing?.id ?? crypto.randomUUID(),
          name,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
        if (existing)
          data.categories = data.categories.map((item) =>
            item.id === existing.id ? category : item,
          );
        else data.categories.push(category);
        persist();
        context.emit('copilot.changed', existing ? '作业分类已重命名' : '作业分类已创建');
        return clone(category);
      }
      case 'copilot.category.delete': {
        const deleted = data.categories.some((item) => item.id === params.id);
        const deletedCount = params.deleteCopilots
          ? data.items.filter((item) => item.categoryId === params.id).length
          : 0;
        data.items = params.deleteCopilots
          ? data.items.filter((item) => item.categoryId !== params.id)
          : data.items.map((item) =>
              item.categoryId === params.id ? { ...item, categoryId: null } : item,
            );
        data.setCategories = Object.fromEntries(
          Object.entries(data.setCategories).filter(([, id]) => id !== params.id),
        );
        data.categories = data.categories.filter((item) => item.id !== params.id);
        persist();
        context.emit(
          'copilot.changed',
          params.deleteCopilots ? '分类与作业已删除' : '分类已删除，作业保留在未分类中',
        );
        return { deleted, deletedCount };
      }
      case 'copilot.category.assign': {
        if (
          !Array.isArray(params.ids) ||
          !params.ids.length ||
          params.ids.length > 100 ||
          new Set(params.ids).size !== params.ids.length
        )
          throw new Error('作业分类请求无效');
        if (
          params.categoryId !== null &&
          !data.categories.some((item) => item.id === params.categoryId)
        )
          throw new Error('分类不存在，请刷新后重试');
        if (params.ids.some((id: string) => !data.items.some((item) => item.id === id)))
          throw new Error('部分作业已删除，分类未修改，请刷新后重试');
        data.items = data.items.map((item) =>
          params.ids.includes(item.id) ? { ...item, categoryId: params.categoryId } : item,
        );
        persist();
        context.emit('copilot.changed', '作业分类已更新');
        return { updated: params.ids.length };
      }
      case 'copilot.get': {
        const value = params.versionId
          ? data.versions[params.versionId]?.record
          : data.items.find((item) => item.id === params.id);
        if (!value) throw new Error('作业不存在');
        return clone(value);
      }
      case 'copilot.rating.get':
      case 'copilot.rating.set': {
        const record = [
          ...data.items,
          ...[...previews.values()].flatMap((value) =>
            value.preview.entries.flatMap((entry) => (entry.record ? [entry.record] : [])),
          ),
        ].find(
          (record) =>
            record.versionId === params.versionId &&
            (!params.recordId || record.id === params.recordId),
        );
        const communityId = record?.source.communityId;
        if (!communityId) throw new Error('本地作业不支持社区评价');
        const value = ratings.get(communityId) ?? {
          communityId,
          likes: 12,
          dislikes: 1,
          rating: 'none' as const,
        };
        if (method === 'copilot.rating.set') {
          if (value.rating === 'like') value.likes--;
          if (value.rating === 'dislike') value.dislikes--;
          value.rating = params.rating;
          if (value.rating === 'like') value.likes++;
          if (value.rating === 'dislike') value.dislikes++;
        }
        ratings.set(communityId, value);
        return clone(value);
      }
      case 'copilot.export': {
        const value = data.versions[params.versionId];
        if (!value) throw new Error('作业版本不存在');
        const record = params.id
          ? data.items.find((item) => item.id === params.id && item.versionId === params.versionId)
          : value.record;
        if (!record) throw new Error('作业与版本不匹配');
        const attribution = {
          formatVersion: 1,
          contentFile: record.title + '.json',
          versionId: record.versionId,
          title: record.title,
          author: record.author,
          ...(record.uploader !== undefined ? { uploader: record.uploader } : {}),
          source: record.source,
          licenseStatus: 'unverified',
          licenseNotice:
            '未发现已核实的统一内容许可；未声明的许可视为未知，不推定适用 Maa Verge 的 AGPL-3.0-only。具体版权与许可文字以原始 JSON（包括 doc.details）中的声明为准。此来源记录不代表已经获得转载或再分发许可。',
        };
        return {
          filename: record.title + '.json',
          content: value.content,
          attribution: {
            filename: record.title + '.attribution.json',
            content: JSON.stringify(attribution, null, 2) + '\n',
          },
        };
      }
      case 'copilot.delete': {
        const selected = (id: string) =>
          params.all === true || params.id === id || params.ids?.includes(id);
        const deletedCount = data.items.filter((item) => selected(item.id)).length;
        data.items = data.items.filter((item) => !selected(item.id));
        persist();
        context.emit('copilot.changed', '作业已从库中移除，已引用的版本保留');
        return { deleted: deletedCount > 0, deletedCount };
      }
      case 'copilot.storage.info':
        return {
          directory:
            state.settings.copilotStorage?.directory ||
            (navigator.platform.startsWith('Win')
              ? 'C:\\Maa Verge\\cache\\copilot'
              : '/synthetic/Maa Verge/cache/copilot'),
        };
      case 'copilot.workspace.get':
        return workspace(params.kind);
      case 'copilot.workspace.save': {
        const value = params.workspace as CopilotWorkspace;
        if (
          !kinds.includes(value.kind) ||
          value.queue.length > 100 ||
          new Set(value.queue.map((item) => item.id)).size !== value.queue.length
        )
          throw new Error('作业队列参数无效');
        if (value.kind === 'SSSCopilot' && value.queue.filter((item) => item.enabled).length > 1)
          throw new Error('保全派驻仅支持单份作业');
        data.workspaces[value.kind] = clone(value);
        persist();
        return clone(value);
      }
      case 'copilot.search': {
        const page = Number(params.page || 1);
        const target = params.target === 'set' ? 'set' : 'copilot';
        return {
          items: [
            {
              id: target === 'set' ? '12' : String(page * 100 + 1),
              title: target === 'set' ? '合成有序作业集' : `合成社区作业 ${page}`,
              description: '此结果来自测试夹具',
              author: '',
              uploader: '合成上传者',
              url: `https://prts.plus/${target === 'set' ? 'set' : 'copilot'}/${target === 'set' ? 12 : page * 100 + 1}`,
              kind: 'Copilot',
              ...(target === 'copilot'
                ? { difficulty: synthetic(String(page * 100 + 1)).difficulty }
                : {}),
              ...(target === 'copilot'
                ? {
                    operators: [
                      ...synthetic(String(page * 100 + 1)).opers,
                      ...synthetic(String(page * 100 + 1)).groups.flatMap((group) =>
                        group.opers.map((operator) => ({ ...operator, group: group.name })),
                      ),
                    ],
                  }
                : {}),
            },
          ],
          page,
          hasNext: page < 2,
          total: 2,
        };
      }
      case 'copilot.preview': {
        const preview: CopilotPreview = { id: crypto.randomUUID(), title: '导入预览', entries: [] };
        const content = new Map<string, string>();
        const inputs: {
          content: string;
          name: string;
          source: CopilotRecord['source'];
          error?: string;
        }[] = [];
        if (typeof params.content === 'string')
          inputs.push({
            content: params.content,
            name: params.name || '本地作业',
            source: { kind: 'local', name: params.name || '本地 JSON', url: '' },
          });
        else if (params.planId) {
          const plan = state.plans.find((item) => item.id === params.planId),
            task = plan?.tasks[Number(params.taskIndex)];
          if (!task || !kinds.includes(task.type as CopilotKind))
            throw new Error('旧作业任务不存在');
          const entries =
            typeof task.params.filename === 'string'
              ? [task.params.filename]
              : task.params.copilot_list || task.params.list || [];
          for (const entry of entries as any[]) {
            const filename = typeof entry === 'string' ? entry : entry.filename;
            const value: any = synthetic('legacy');
            value.doc.title = filename;
            if (task.type === 'SSSCopilot') {
              delete value.actions;
              value.stages = [
                { stage_name: 'main_01-07', strategies: [], draw_as_possible: false, actions: [] },
              ];
              value.tool_men = {};
              value.type = 'SSS';
            }
            if (task.type === 'ParadoxCopilot') value.type = 'Paradox';
            inputs.push({
              content: JSON.stringify(value),
              name: filename,
              source: { kind: 'legacy', name: plan!.name, url: '' },
            });
          }
        } else if (params.code) {
          const code = String(params.code).trim();
          if (/evil|invalid|404/u.test(code)) throw new Error('作业已删除或编号无效');
          const id = code.match(/(?:s)?(\d+)\/?$/u)?.[1];
          if (!id) throw new Error('请输入作业编号或 PRTS Plus 链接');
          const isSet = /^s|^prts:\/\/s|\/set\//u.test(code);
          const ids = isSet ? ['101', '102', '404'] : [id];
          preview.title = isSet ? '合成有序作业集' : `合成社区作业 ${id}`;
          for (const member of ids)
            inputs.push({
              content: JSON.stringify(synthetic(member)),
              name: `作业 ${member}`,
              source: {
                kind: 'community',
                name: 'PRTS Plus',
                url: `https://prts.plus/copilot/${member}`,
                communityId: member,
                ...(isSet ? { setId: id } : {}),
              },
              ...(member === '404' ? { error: '作业 404 已删除' } : {}),
            });
        } else throw new Error('请选择导入内容');
        for (const input of inputs) {
          const id = crypto.randomUUID();
          try {
            if (input.error) throw new Error(input.error);
            preview.entries.push({
              id,
              record: await record(input.content, input.name, input.source),
              error: null,
            });
            content.set(id, input.content);
          } catch (error) {
            preview.entries.push({
              id,
              record: null,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        previews.set(preview.id, { preview, content });
        return clone(preview);
      }
      case 'copilot.import': {
        const preview = previews.get(params.previewId);
        if (!preview) throw new Error('预览已失效，请重新解析');
        const entries = preview.preview.entries.filter(
          (item) => !params.entryIds || params.entryIds.includes(item.id),
        );
        const items: CopilotRecord[] = [],
          errors: { id: string; message: string }[] = [];
        const next = {
          ...data,
          items: [...data.items],
          versions: { ...data.versions },
          categories: clone(data.categories),
          setCategories: { ...data.setCategories },
        };
        for (const entry of entries) {
          if (!entry.record) {
            errors.push({ id: entry.id, message: entry.error || '作业无效' });
            continue;
          }
          const value = clone(entry.record);
          const existing = next.items.find((item) => item.id === value.id);
          next.versions[value.versionId] = {
            record: clone(value),
            content: preview.content.get(entry.id)!,
          };
          if (existing && Object.hasOwn(existing, 'categoryId'))
            value.categoryId = existing.categoryId;
          else if (value.source.kind === 'community' && value.source.setId)
            value.categoryId = setCategory(next, value.source.setId, preview.preview.title);
          next.items = next.items.filter((item) => item.id !== value.id);
          next.items.push(value);
          items.push(value);
        }
        Object.assign(data, next);
        persist();
        context.emit('copilot.changed', '作业已导入');
        return { items, errors };
      }
      case 'copilot.start': {
        const existing = context.requests.get(params.requestId);
        if (existing) {
          const run = state.runs.find((item) => item.id === existing)!;
          if (
            run.source !== 'copilot' ||
            run.copilotKind !== params.kind ||
            run.deviceId !== params.deviceId
          )
            throw new Error('同一请求标识不能用于不同执行');
          return clone(run);
        }
        const available = context.availability(params.deviceId);
        if (!available.available) throw new Error(available.reason);
        const current = workspace(params.kind),
          entries = current.queue.filter((item) => item.enabled);
        if (!entries.length) throw new Error('请至少勾选一份作业');
        if (current.kind === 'SSSCopilot' && entries.length !== 1)
          throw new Error('保全派驻仅支持单份作业');
        for (const entry of entries)
          if (
            !data.versions[entry.versionId] ||
            data.versions[entry.versionId].record.kind !== current.kind
          )
            throw new Error('作业版本不存在或类型不匹配');
        const title = `${data.versions[entries[0].versionId].record.title}${entries.length > 1 ? ` 等 ${entries.length} 项` : ''}`;
        const run: Run = {
          id: crypto.randomUUID(),
          source: 'copilot',
          sourceName: title,
          planId: null,
          planName: title,
          copilotKind: current.kind,
          copilotEntries: entries.map((entry, index) => ({
            id: entry.id,
            versionId: entry.versionId,
            title: data.versions[entry.versionId].record.title,
            nativeId: index + 1,
            status: index === 0 ? 'running' : 'waiting',
            verdict: 'unknown',
            message: index === 0 ? '正在加载作业；通关未确认' : '等待执行',
          })),
          tasks: [
            {
              index: 0,
              type: current.kind,
              status: 'running',
              startedAt: now(),
              finishedAt: null,
              message: '合成作业执行',
              drops: [],
              infrastructure: [],
              artifacts: [],
            },
          ],
          deviceId: params.deviceId,
          status: 'running',
          progress: 0,
          message: '合成作业执行，未操作真实设备',
          startedAt: now(),
          finishedAt: null,
        };
        context.requests.set(params.requestId, run.id);
        context.register(run, [
          { type: current.kind, enabled: true, params: { filename: 'synthetic-immutable.json' } },
        ]);
        state.runs.unshift(run);
        state.devices.find((item) => item.id === params.deviceId)!.state = 'running';
        context.emit('run.started', '合成作业已开始', { run });
        return clone(run);
      }
      default:
        throw new Error(`未知作业方法：${method}`);
    }
  };
}
