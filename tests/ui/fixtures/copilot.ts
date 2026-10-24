// Browser-only deterministic adapter. Product code never imports this module.
import type { CopilotKind, CopilotOptions, CopilotPreview, CopilotRecord, CopilotWorkspace, Run, Snapshot, Task } from '../../../packages/contracts/src/index';

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
const defaultOptions = (): CopilotOptions => ({ loopTimes: 1, formation: false, formationIndex: 0, addTrust: false, ignoreRequirements: false, supportUnitName: '', additionalOperators: [] });
const synthetic = (id: string) => ({ stage_name: 'main_01-07', minimum_required: 'v6.0.0', doc: { title: `合成社区作业 ${id}`, details: '仅供界面验证的本地夹具，不访问社区', author: '合成作者' }, opers: [{ name: '阿米娅', skill: 1 }], actions: [{ type: 'SpeedUp' }] });

export function createCopilotFixture(context: Context) {
  const storageKey = context.key + ':copilot';
  const restored = (() => { try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; } })();
  const data: { items: CopilotRecord[]; versions: Record<string, { record: CopilotRecord; content: string }>; workspaces: Partial<Record<CopilotKind, CopilotWorkspace>> } = restored ?? { items: [], versions: {}, workspaces: {} };
  const previews = new Map<string, { preview: CopilotPreview; content: Map<string, string> }>();
  const persist = () => localStorage.setItem(storageKey, JSON.stringify(data));
  const workspace = (kind: CopilotKind): CopilotWorkspace => clone(data.workspaces[kind] ?? { kind, queue: [], options: defaultOptions() });
  async function record(content: string, name: string, source: CopilotRecord['source']): Promise<CopilotRecord> {
    if (new TextEncoder().encode(content).length > 700_000) throw new Error('作业文件过大，请分批导入');
    const json = JSON.parse(content.replace(/^\uFEFF/u, ''));
    if (!json || typeof json !== 'object' || Array.isArray(json) || !Array.isArray(json.actions) && !Array.isArray(json.stages)) throw new Error('无法识别作业内容，需要 actions 或 stages');
    const kind: CopilotKind = json.type === 'SSS' || Array.isArray(json.stages) ? 'SSSCopilot' : json.type === 'Paradox' || /^mem_/u.test(json.stage_name || '') ? 'ParadoxCopilot' : 'Copilot';
    const versionId = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)))].map(value => value.toString(16).padStart(2, '0')).join('');
    return { id: source.communityId ? `community-${source.communityId}` : versionId, versionId, kind, title: json.doc?.title || name || json.stage_name || '未命名作业', stageName: json.stage_name || json.stage_name_override || '保全派驻', author: String(json.doc?.author || ''), description: String(json.doc?.details || ''), minimumCoreVersion: json.minimum_required || '', operators: json.opers || [], videos: [], source, createdAt: now(), compatibility: { status: 'ready', reasons: [] } };
  }
  return async function copilotRpc(method: string, params: Record<string, any>): Promise<unknown> {
    const state = context.snapshot();
    switch (method) {
      case 'copilot.list': {
        const items = data.items.filter(item => !params.kind || item.kind === params.kind), page = Number(params.page || 1);
        return { items: clone(items.slice((page - 1) * 20, page * 20)), page, total: items.length, hasNext: page * 20 < items.length };
      }
      case 'copilot.get': {
        const value = params.versionId ? data.versions[params.versionId]?.record : data.items.find(item => item.id === params.id);
        if (!value) throw new Error('作业不存在');
        return clone(value);
      }
      case 'copilot.export': {
        const value = data.versions[params.versionId];
        if (!value) throw new Error('作业版本不存在');
        return { filename: value.record.title + '.json', content: value.content };
      }
      case 'copilot.delete': data.items = data.items.filter(item => item.id !== params.id); persist(); context.emit('copilot.changed', '作业已从库中移除，已引用的版本保留'); return { deleted: true };
      case 'copilot.workspace.get': return workspace(params.kind);
      case 'copilot.workspace.save': {
        const value = params.workspace as CopilotWorkspace;
        if (!kinds.includes(value.kind) || value.queue.length > 100 || new Set(value.queue.map(item => item.id)).size !== value.queue.length) throw new Error('作业队列参数无效');
        if (value.kind === 'SSSCopilot' && value.queue.filter(item => item.enabled).length > 1) throw new Error('保全派驻仅支持单份作业');
        data.workspaces[value.kind] = clone(value); persist(); return clone(value);
      }
      case 'copilot.search': {
        const page = Number(params.page || 1);
        const target = params.target === 'set' ? 'set' : 'copilot';
        return { items: [{ id: target === 'set' ? '12' : String(page * 100 + 1), title: target === 'set' ? '合成有序作业集' : `合成社区作业 ${page}`, description: '此结果来自测试夹具', author: '合成作者', url: `https://prts.plus/${target === 'set' ? 'set' : 'copilot'}/${target === 'set' ? 12 : page * 100 + 1}`, kind: 'Copilot' }], page, hasNext: page < 2, total: 2 };
      }
      case 'copilot.preview': {
        const preview: CopilotPreview = { id: crypto.randomUUID(), title: '导入预览', entries: [] };
        const content = new Map<string, string>();
        const inputs: { content: string; name: string; source: CopilotRecord['source']; error?: string }[] = [];
        if (typeof params.content === 'string') inputs.push({ content: params.content, name: params.name || '本地作业', source: { kind: 'local', name: params.name || '本地 JSON', url: '' } });
        else if (params.planId) {
          const plan = state.plans.find(item => item.id === params.planId), task = plan?.tasks[Number(params.taskIndex)];
          if (!task || !kinds.includes(task.type as CopilotKind)) throw new Error('旧作业任务不存在');
          const entries = typeof task.params.filename === 'string' ? [task.params.filename] : task.params.copilot_list || task.params.list || [];
          for (const entry of entries as any[]) {
            const filename = typeof entry === 'string' ? entry : entry.filename;
            const value: any = synthetic('legacy'); value.doc.title = filename; if (task.type === 'SSSCopilot') { delete value.actions; value.stages = [{ stage_name: 'main_01-07', strategies: [], draw_as_possible: false, actions: [] }]; value.tool_men = {}; value.type = 'SSS'; } if (task.type === 'ParadoxCopilot') value.type = 'Paradox';
            inputs.push({ content: JSON.stringify(value), name: filename, source: { kind: 'legacy', name: plan!.name, url: '' } });
          }
        } else if (params.code) {
          const code = String(params.code).trim();
          if (/evil|invalid|404/u.test(code)) throw new Error('作业已删除或编号无效');
          const id = code.match(/(?:s)?(\d+)\/?$/u)?.[1];
          if (!id) throw new Error('请输入作业编号或 PRTS Plus 链接');
          const isSet = /^s|^prts:\/\/s|\/set\//u.test(code);
          const ids = isSet ? ['101', '102', '404'] : [id];
          preview.title = isSet ? '合成有序作业集' : `合成社区作业 ${id}`;
          for (const member of ids) inputs.push({ content: JSON.stringify(synthetic(member)), name: `作业 ${member}`, source: { kind: 'community', name: 'PRTS Plus', url: `https://prts.plus/copilot/${member}`, communityId: member, ...(isSet ? { setId: id } : {}) }, ...(member === '404' ? { error: '作业 404 已删除' } : {}) });
        } else throw new Error('请选择导入内容');
        for (const input of inputs) {
          const id = crypto.randomUUID();
          try {
            if (input.error) throw new Error(input.error);
            preview.entries.push({ id, record: await record(input.content, input.name, input.source), error: null }); content.set(id, input.content);
          } catch (error) { preview.entries.push({ id, record: null, error: error instanceof Error ? error.message : String(error) }); }
        }
        previews.set(preview.id, { preview, content }); return clone(preview);
      }
      case 'copilot.import': {
        const preview = previews.get(params.previewId);
        if (!preview) throw new Error('预览已失效，请重新解析');
        const entries = preview.preview.entries.filter(item => !params.entryIds || params.entryIds.includes(item.id));
        const items: CopilotRecord[] = [], errors: { id: string; message: string }[] = [];
        for (const entry of entries) {
          if (!entry.record) { errors.push({ id: entry.id, message: entry.error || '作业无效' }); continue; }
          const value = clone(entry.record);
          data.versions[value.versionId] = { record: value, content: preview.content.get(entry.id)! };
          data.items = data.items.filter(item => item.id !== value.id); data.items.push(value); items.push(value);
        }
        persist(); context.emit('copilot.changed', '作业已导入'); return { items, errors };
      }
      case 'copilot.start': {
        const existing = context.requests.get(params.requestId);
        if (existing) { const run = state.runs.find(item => item.id === existing)!; if (run.source !== 'copilot' || run.copilotKind !== params.kind || run.deviceId !== params.deviceId) throw new Error('同一请求标识不能用于不同执行'); return clone(run); }
        const available = context.availability(params.deviceId); if (!available.available) throw new Error(available.reason);
        const current = workspace(params.kind), entries = current.queue.filter(item => item.enabled);
        if (!entries.length) throw new Error('请至少勾选一份作业');
        if (current.kind === 'SSSCopilot' && entries.length !== 1) throw new Error('保全派驻仅支持单份作业');
        for (const entry of entries) if (!data.versions[entry.versionId] || data.versions[entry.versionId].record.kind !== current.kind) throw new Error('作业版本不存在或类型不匹配');
        const title = `${data.versions[entries[0].versionId].record.title}${entries.length > 1 ? ` 等 ${entries.length} 项` : ''}`;
        const run: Run = { id: crypto.randomUUID(), source: 'copilot', sourceName: title, planId: null, planName: title, copilotKind: current.kind, copilotEntries: entries.map((entry, index) => ({ id: entry.id, versionId: entry.versionId, title: data.versions[entry.versionId].record.title, nativeId: index + 1, status: index === 0 ? 'running' : 'waiting', verdict: 'unknown', message: index === 0 ? '正在加载作业；通关未确认' : '等待执行' })), tasks: [{ index: 0, type: current.kind, status: 'running', startedAt: now(), finishedAt: null, message: '合成作业执行', drops: [], infrastructure: [], artifacts: [] }], deviceId: params.deviceId, status: 'running', progress: 0, message: '合成作业执行，未操作真实设备', startedAt: now(), finishedAt: null };
        context.requests.set(params.requestId, run.id); context.register(run, [{ type: current.kind, enabled: true, params: { filename: 'synthetic-immutable.json' } }]);
        state.runs.unshift(run); state.devices.find(item => item.id === params.deviceId)!.state = 'running'; context.emit('run.started', '合成作业已开始', { run }); return clone(run);
      }
      default: throw new Error(`未知作业方法：${method}`);
    }
  };
}
