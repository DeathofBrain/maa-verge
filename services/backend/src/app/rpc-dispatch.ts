import type { RpcContract } from '@contracts/rpc-types';
import {
  validateKnowledgeClientParams,
  validateKnowledgeSearchParams,
  validateAccountSnapshotParams,
  validateAccountSnapshotListParams,
  validateCopilotListParams,
  validateCopilotIdentityParams,
  validateCopilotExportParams,
  validateCopilotPreviewParams,
  validateCopilotImportParams,
  validateCopilotWorkspaceParams,
  validateCopilotWorkspaceSaveParams,
  validateCopilotSearchParams,
  validateCopilotRatingParams,
  validateCopilotRatingSetParams,
  validateDeviceAvailabilityParams,
  validateToolIdentity,
  validateToolConfigParams,
  validateScheduleHostParams,
  validateIdParams,
  validateEmptyParams,
  validateToolCatalogParams,
  validateLogDeleteParams,
  validateStageListParams,
  validateRecognitionParams,
  validateItemResourceParams,
  validateOperatorResourceParams,
  validateRunArtifactParams,
} from '@contracts/validators.js';
import { RpcError } from '@backend/shared/errors';
import type { AppUpdateHttp } from '@backend/modules/updates/app-update-http';
import type { Knowledge } from '@backend/modules/knowledge/knowledge';
import type { AccountKnowledge } from '@backend/modules/knowledge/account-knowledge';
import type { CopilotLibrary } from '@backend/modules/copilot/copilot';
import type { Toolbox, toolJob, toolCatalog } from '@backend/modules/tools/toolbox';
import type { Scheduler } from '@backend/modules/schedules/scheduler';
import type { Logs } from '@backend/infrastructure/logging/logs';
import type { Preview } from '@backend/modules/devices/preview';
import type { Plan, Settings } from '@backend/modules/settings/models';
import { itemResource, type Combo } from '@backend/modules/resources/item-resources';
import { operatorResource } from '@backend/modules/resources/operator-resources';

type Params = RpcContract['params'];
type Client = NonNullable<Params['stages.list']['clientType']>;
type StoredRun = Omit<RpcContract['results']['run.detail'], 'finishedAt'> &
  Partial<Pick<RpcContract['results']['run.detail'], 'finishedAt'>>;
export type UpdateOperation = 'check' | 'prepare' | 'activate' | 'rollback';

/** RPC can invoke use cases, but cannot access device ownership or lifecycle state. */
export interface RpcCapabilities {
  snapshot(): RpcContract['results']['app.snapshot'];
  hostUpdates: Pick<AppUpdateHttp, 'handle'>;
  knowledge: Pick<Knowledge, 'status' | 'search'>;
  accounts: Pick<AccountKnowledge, 'get' | 'list'>;
  copilot: Pick<
    CopilotLibrary,
    | 'list'
    | 'categoryList'
    | 'categorySave'
    | 'categoryDelete'
    | 'categoryAssign'
    | 'get'
    | 'export'
    | 'preview'
    | 'import'
    | 'delete'
    | 'storageInfo'
    | 'workspaceGet'
    | 'workspaceSave'
    | 'search'
    | 'stages'
    | 'ratingGet'
    | 'ratingSet'
  >;
  devices: {
    exists(id: string): boolean;
    client(id: string): Client;
    availability(id: string): RpcContract['results']['device.availability'];
    discover(): Promise<unknown>;
    connect(params: Params['device.connect']): Promise<unknown>;
    autoConnect(): Promise<unknown>;
    disconnect(id: string): Promise<unknown>;
    delete(params: unknown): RpcContract['results']['device.delete'];
    preview: Pick<Preview, 'frame' | 'click'>;
  };
  tools: {
    service: Pick<Toolbox, 'start' | 'config' | 'saveConfig'>;
    exists(id: string): boolean;
    get(id: string): ReturnType<typeof toolJob>;
    catalog(client?: Params['tool.catalog']['clientType']): ReturnType<typeof toolCatalog>;
  };
  schedules: {
    service: Pick<Scheduler, 'list' | 'save' | 'delete' | 'override' | 'cancel'>;
    host(wake: Params['schedule.host']['wake']): void;
  };
  logs: {
    service: Pick<Logs, 'directory' | 'diagnostics' | 'export' | 'clean'>;
    retentionDays(): number;
    deleteEvents(ids: number[]): number;
  };
  resources: {
    combo(): Combo;
    recognition(
      params: Params['recognition.get'],
    ): Promise<RpcContract['results']['recognition.get']>;
    stages(client?: Client, refresh?: boolean): Promise<RpcContract['results']['stages.list']>;
    home(params: Params['home.info']): Promise<RpcContract['results']['home.info']>;
  };
  plans: {
    save(input: unknown): Plan;
    delete(id: string): { deleted: boolean };
  };
  runs: {
    start(params: Params['run.start']): Promise<unknown>;
    startCopilot(params: Params['copilot.start']): Promise<unknown>;
    stop(id: string): Promise<unknown>;
    get(id: string): StoredRun | undefined;
    artifact(params: Params['run.artifact']): RpcContract['results']['run.artifact'];
  };
  saveSettings(input: unknown): Promise<Settings>;
  propose(message: string): unknown;
  update(operation: UpdateOperation, channel: Params['updates.check']['channel']): Promise<unknown>;
  maaFwAdb: {
    status(): RpcContract['results']['updates.maafwAdb.status'];
    prepare(): Promise<RpcContract['results']['updates.maafwAdb.prepare']>;
  };
}

/** Global admission gates run in Runtime before any method is dispatched. */
export function createRpcDispatcher(capabilities: RpcCapabilities) {
  return async (method: string, params: any): Promise<any> => {
    const required = (...keys: string[]) => {
      if (keys.some((key) => !(key in params))) throw new RpcError(-32602, '请求参数无效');
    };
    switch (method) {
      case 'host.updates':
        return capabilities.hostUpdates.handle(params);
      case 'app.snapshot':
        return capabilities.snapshot();
      case 'knowledge.status':
        if (!validateKnowledgeClientParams(params)) throw new RpcError(-32602, '知识索引请求无效');
        return capabilities.knowledge.status(params.clientType);
      case 'knowledge.search':
        if (!validateKnowledgeSearchParams(params)) throw new RpcError(-32602, '知识检索请求无效');
        return capabilities.knowledge.search(params);
      case 'account.snapshot.get':
      case 'account.snapshot.list': {
        if (
          !(method === 'account.snapshot.get'
            ? validateAccountSnapshotParams(params)
            : validateAccountSnapshotListParams(params))
        )
          throw new RpcError(-32602, '账号快照请求无效');
        if (!capabilities.devices.exists(params.deviceId)) throw new RpcError(-32004, '设备不存在');
        const client = params.clientType ?? capabilities.devices.client(params.deviceId);
        return method === 'account.snapshot.get'
          ? capabilities.accounts.get(params.deviceId, client, params.kind, params.snapshotId)
          : capabilities.accounts.list(
              params.deviceId,
              client,
              params.kind,
              params.offset,
              params.limit,
            );
      }
      case 'device.availability':
        if (!validateDeviceAvailabilityParams(params))
          throw new RpcError(-32602, '设备状态请求无效');
        return capabilities.devices.availability(params.deviceId);
      case 'copilot.list':
        if (!validateCopilotListParams(params)) throw new RpcError(-32602, '作业列表请求无效');
        return capabilities.copilot.list(params);
      case 'copilot.category.list':
        return capabilities.copilot.categoryList(params);
      case 'copilot.category.save':
        return capabilities.copilot.categorySave(params);
      case 'copilot.category.delete':
        return capabilities.copilot.categoryDelete(params);
      case 'copilot.category.assign':
        return capabilities.copilot.categoryAssign(params);
      case 'copilot.get':
        if (!validateCopilotIdentityParams(params)) throw new RpcError(-32602, '作业详情请求无效');
        return capabilities.copilot.get(params);
      case 'copilot.export':
        if (!validateCopilotExportParams(params)) throw new RpcError(-32602, '作业导出请求无效');
        return capabilities.copilot.export(params);
      case 'copilot.preview':
        if (!validateCopilotPreviewParams(params)) throw new RpcError(-32602, '作业预览请求无效');
        return capabilities.copilot.preview(params);
      case 'copilot.import':
        if (!validateCopilotImportParams(params)) throw new RpcError(-32602, '作业导入请求无效');
        return capabilities.copilot.import(params);
      case 'copilot.delete':
        return capabilities.copilot.delete(params);
      case 'copilot.storage.info':
        return capabilities.copilot.storageInfo(params);
      case 'copilot.workspace.get':
        if (!validateCopilotWorkspaceParams(params))
          throw new RpcError(-32602, '作业工作区请求无效');
        return capabilities.copilot.workspaceGet(params);
      case 'copilot.workspace.save':
        if (!validateCopilotWorkspaceSaveParams(params))
          throw new RpcError(-32602, '作业工作区保存请求无效');
        return capabilities.copilot.workspaceSave(params);
      case 'copilot.search':
        if (!validateCopilotSearchParams(params)) throw new RpcError(-32602, '社区搜索请求无效');
        return capabilities.copilot.search(params);
      case 'copilot.stages':
        return capabilities.copilot.stages(params);
      case 'copilot.rating.get':
        if (!validateCopilotRatingParams(params)) throw new RpcError(-32602, '社区评价请求无效');
        return capabilities.copilot.ratingGet(params);
      case 'copilot.rating.set':
        if (!validateCopilotRatingSetParams(params)) throw new RpcError(-32602, '社区评价请求无效');
        return capabilities.copilot.ratingSet(params);
      case 'copilot.start':
        return capabilities.runs.startCopilot(params);
      case 'tool.start':
        return capabilities.tools.service.start(params);
      case 'tool.get':
      case 'tool.stop': {
        if (!validateIdParams(params)) throw new RpcError(-32602, '工具标识请求无效');
        if (!capabilities.tools.exists(params.id)) throw new RpcError(-32004, '工具操作不存在');
        if (method === 'tool.stop') await capabilities.runs.stop(params.id);
        return capabilities.tools.get(params.id);
      }
      case 'tool.catalog':
        if (!validateToolCatalogParams(params)) throw new RpcError(-32602, '工具目录请求无效');
        return capabilities.tools.catalog(params.clientType);
      case 'tool.config.get':
      case 'tool.config.save': {
        if (
          !(method === 'tool.config.get'
            ? validateToolIdentity(params)
            : validateToolConfigParams(params))
        )
          throw new RpcError(-32602, '工具配置请求无效');
        if (!capabilities.devices.exists(params.deviceId)) throw new RpcError(-32004, '设备不存在');
        return method === 'tool.config.get'
          ? capabilities.tools.service.config(
              params.deviceId,
              params.clientType ?? 'Official',
              params.kind,
            )
          : capabilities.tools.service.saveConfig(
              params.deviceId,
              params.clientType ?? 'Official',
              params.kind,
              params.config,
            );
      }
      case 'schedule.list':
        if (!validateEmptyParams(params)) throw new RpcError(-32602, '定时列表请求无效');
        return capabilities.schedules.service.list();
      case 'schedule.save':
        return capabilities.schedules.service.save(params);
      case 'schedule.delete':
        if (!validateIdParams(params)) throw new RpcError(-32602, '定时标识请求无效');
        return capabilities.schedules.service.delete(params.id);
      case 'schedule.override':
        return capabilities.schedules.service.override(params);
      case 'schedule.cancel':
        if (!validateIdParams(params)) throw new RpcError(-32602, '定时标识请求无效');
        return capabilities.schedules.service.cancel(params.id);
      case 'schedule.host':
        if (!validateScheduleHostParams(params)) throw new RpcError(-32602, '桌面唤醒状态无效');
        capabilities.schedules.host(params.wake);
        return { accepted: true };
      case 'logs.info':
      case 'logs.export':
      case 'logs.clean': {
        if (Object.keys(params).length)
          throw new RpcError(-32602, '日志操作不接受自定义文件路径或参数');
        const logs = capabilities.logs.service;
        if (method === 'logs.info')
          return { directory: logs.directory, retentionDays: capabilities.logs.retentionDays() };
        try {
          if (method === 'logs.export') return logs.export();
          const result = logs.clean();
          logs.diagnostics.write('info', 'logs.manual_cleanup', result);
          return result;
        } catch (error) {
          throw new RpcError(
            -32050,
            method === 'logs.export' ? '日志导出失败' : '日志清理失败',
            `${logs.directory}：${String(error)}`,
          );
        }
      }
      case 'logs.delete': {
        if (!validateLogDeleteParams(params)) throw new RpcError(-32602, '日志删除请求参数无效');
        const result = { deleted: capabilities.logs.deleteEvents(params.ids) };
        if (result.deleted)
          capabilities.logs.service.diagnostics.write('info', 'logs.events_deleted', result);
        return result;
      }
      case 'stages.list':
        if (!validateStageListParams(params)) throw new RpcError(-32602, '关卡目录请求参数无效');
        return capabilities.resources.stages(params.clientType, params.refresh);
      case 'recognition.get':
        if (!validateRecognitionParams(params)) throw new RpcError(-32602, '识别结果请求参数无效');
        return capabilities.resources.recognition(params);
      case 'resources.item':
        if (!validateItemResourceParams(params)) throw new RpcError(-32602, '材料资源请求参数无效');
        return itemResource(capabilities.resources.combo(), params.itemId, params.clientType);
      case 'resources.operator':
        if (!validateOperatorResourceParams(params))
          throw new RpcError(-32602, '干员资源请求参数无效');
        return operatorResource(
          capabilities.resources.combo(),
          params.name,
          params.clientType,
          params.operatorId,
        );
      case 'home.info': {
        if (
          Object.keys(params).some((key) => !['deviceId', 'clientType', 'refresh'].includes(key)) ||
          (params.deviceId !== undefined &&
            (typeof params.deviceId !== 'string' ||
              !params.deviceId ||
              params.deviceId.length > 200)) ||
          (params.refresh !== undefined && typeof params.refresh !== 'boolean')
        )
          throw new RpcError(-32602, '主页信息请求参数无效');
        if (
          params.clientType !== undefined &&
          !['Official', 'Bilibili', 'YoStarEN', 'YoStarJP', 'YoStarKR', 'txwy'].includes(
            params.clientType,
          )
        )
          throw new RpcError(-32602, '游戏客户端无效');
        return capabilities.resources.home(params);
      }
      case 'device.discover':
        return capabilities.devices.discover();
      case 'device.connect':
        return capabilities.devices.connect(params);
      case 'device.auto_connect':
        return capabilities.devices.autoConnect();
      case 'device.disconnect':
        required('id');
        return capabilities.devices.disconnect(params.id);
      case 'device.delete':
        return capabilities.devices.delete(params);
      case 'device.frame':
        return capabilities.devices.preview.frame(params);
      case 'device.click':
        return capabilities.devices.preview.click(params);
      case 'plan.save':
        required('plan');
        return capabilities.plans.save(params.plan);
      case 'plan.delete':
        required('id');
        return capabilities.plans.delete(params.id);
      case 'run.start':
        required('requestId', 'planId', 'deviceId');
        return capabilities.runs.start(params);
      case 'run.stop':
        required('id');
        return capabilities.runs.stop(params.id);
      case 'run.detail': {
        if (
          Object.keys(params).some((key) => key !== 'id') ||
          typeof params.id !== 'string' ||
          !params.id ||
          params.id.length > 200
        )
          throw new RpcError(-32602, '执行详情请求参数无效');
        const run = capabilities.runs.get(params.id);
        if (!run) throw new RpcError(-32004, '执行记录不存在');
        return { finishedAt: null, ...run };
      }
      case 'run.artifact':
        if (!validateRunArtifactParams(params)) throw new RpcError(-32602, '执行截图请求参数无效');
        return capabilities.runs.artifact(params);
      case 'settings.save':
        required('settings');
        return capabilities.saveSettings(params.settings);
      case 'agent.message':
        required('message');
        return capabilities.propose(params.message);
      case 'updates.check':
      case 'updates.prepare':
      case 'updates.activate':
      case 'updates.rollback':
        if (!('channel' in params)) throw new RpcError(-32602, '缺少更新通道');
        return capabilities.update(method.slice(8) as UpdateOperation, params.channel);
      case 'updates.maafwAdb.status':
      case 'updates.maafwAdb.prepare':
        if (!validateEmptyParams(params)) throw new RpcError(-32602, 'MaaFwAdb 请求参数无效');
        return method === 'updates.maafwAdb.status'
          ? capabilities.maaFwAdb.status()
          : capabilities.maaFwAdb.prepare();
      default:
        throw new RpcError(-32601, '未知方法', { method });
    }
  };
}
