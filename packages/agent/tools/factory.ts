import { Validator } from '@cfworker/json-schema';
import type { Plan, Run } from '../../contracts/src/types';
import { planAllowsDevice, planDeviceIds } from '../../contracts/src/plan-devices';
import type { CopilotWorkspace, RpcContract } from '../../contracts/src/rpc-types';
import { maaTaskCatalog } from './catalog';
import { MaaToolError } from './errors';
import {
  assertAgentCopilotWorkspace,
  assertAgentExecutablePlan,
  assertAgentToolConfig,
  prepareAgentTaskDraft,
} from './policy';
import { emptySchema, rpcToolSchema, taskProposalSchema } from './schemas';
import type {
  MaaToolAuthorization,
  MaaToolDefinition,
  MaaToolHost,
  MaaToolInvocation,
  MaaToolOptions,
  MaaToolResult,
  MaaToolSet,
  MaaToolJob,
} from './types';

type Input = Record<string, any>;
const fail = (code: string, message: string): never => {
  throw new MaaToolError(code, message);
};
const id = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 200;

function canonical(value: unknown, depth = 0): string {
  if (depth > 32) return fail('invalid_parameters', '工具参数嵌套过深');
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return JSON.stringify(value);
  if (Array.isArray(value))
    return '[' + value.map((item) => canonical(item, depth + 1)).join(',') + ']';
  if (
    value &&
    typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item, depth + 1))
        .join(',') +
      '}'
    );
  }
  return fail('invalid_parameters', '工具参数必须是有效 JSON');
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Bound the whole result tree, including nested native result objects. */
function project(value: unknown): { value: unknown; truncated: boolean } {
  let nodes = 1000,
    characters = 16000,
    truncated = false;
  function visit(item: unknown, depth: number): unknown {
    if (--nodes < 0 || depth > 10) {
      truncated = true;
      return null;
    }
    if (typeof item === 'string') {
      const text = item.slice(0, Math.min(1000, characters));
      characters -= text.length;
      if (text.length < item.length) truncated = true;
      return text;
    }
    if (Array.isArray(item)) {
      if (item.length > 50) truncated = true;
      return item.slice(0, 50).map((child) => visit(child, depth + 1));
    }
    if (item && typeof item === 'object') {
      const entries = Object.entries(item).filter(([key]) => {
        if (key.length > 200) {
          truncated = true;
          return false;
        }
        return !/(?:path|filename|password|token|secret|api.?key|^data$)/iu.test(key);
      });
      if (entries.length > 50) truncated = true;
      return Object.fromEntries(
        entries.slice(0, 50).map(([key, child]) => [key, visit(child, depth + 1)]),
      );
    }
    return item;
  }
  const projected = visit(value, 0);
  return { value: projected, truncated };
}

function runContent(run: Run) {
  const projected = project(run);
  return {
    ...(projected.value as object),
    contentTruncated: projected.truncated,
    evidenceNote: '提交或任务处理完成不等于动作成功或作业通关；请核对逐任务反馈和战斗证据。',
  };
}
function jobContent(job: MaaToolJob) {
  const projected = project(job);
  return {
    ...(projected.value as object),
    contentTruncated: projected.truncated,
    evidenceNote: '这是操作状态；识别结果以成功采集及核心空闲后提交的数据为准。',
  };
}

/** Build a bounded, device-scoped tool session without native or storage access. */
export function createMaaTools(host: MaaToolHost, options: MaaToolOptions = {}): MaaToolSet {
  const {
    deviceId,
    clientType = 'Official',
    maxCalls = 32,
    authorize,
    sessionId = crypto.randomUUID(),
  } = options;
  if (deviceId !== undefined && !id(deviceId)) fail('invalid_scope', '宿主绑定的设备标识无效');
  if (!id(sessionId) || !Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 64)
    fail('invalid_scope', '工具会话标识或调用次数上限无效');
  const runs = new Set(options.runIds ?? []),
    jobs = new Set(options.toolJobIds ?? []);
  if ([...runs, ...jobs].some((value) => !id(value)))
    fail('invalid_scope', '宿主附加的执行标识无效');
  const frames = new Map<string, { width: number; height: number; canControl: boolean }>();
  const calls = new Map<string, { signature: string; promise: Promise<MaaToolResult> }>();
  const requireDevice = () =>
    deviceId ?? fail('device_required', '请先由宿主绑定本次 Agent 会话的设备');
  const scopedRun = async (runId: string) => {
    if (!runs.has(runId)) fail('scope_denied', '执行记录未附加到本次 Agent 会话');
    const run = await host.getRun(runId);
    if (run.deviceId !== requireDevice()) fail('scope_denied', '执行记录不属于绑定设备');
    return run;
  };
  const scopedJob = async (jobId: string) => {
    if (!jobs.has(jobId)) fail('scope_denied', '工具操作未附加到本次 Agent 会话');
    const job = await host.getTool(jobId);
    if (job.deviceId !== requireDevice() || job.clientType !== clientType)
      fail('scope_denied', '工具操作不属于绑定设备或客户端');
    return job;
  };
  type Execution = (
    input: Input,
    requestId: string,
    invocation: MaaToolInvocation,
  ) => Promise<MaaToolResult>;
  const implementations = new Map<string, Execution>();
  const definitions: MaaToolDefinition[] = [];
  function add(
    name: string,
    description: string,
    effect: MaaToolDefinition['effect'],
    schema: Record<string, unknown>,
    execute: Execution,
  ) {
    definitions.push(freeze({ name, description, effect, schema: structuredClone(schema) }));
    implementations.set(name, execute);
  }
  async function permit(
    name: string,
    effect: MaaToolAuthorization['effect'],
    action: Record<string, unknown>,
    requestId: string,
    invocation: MaaToolInvocation,
  ) {
    invocation.signal?.throwIfAborted();
    const request = freeze(
      structuredClone({
        toolName: name,
        effect,
        action,
        deviceId: requireDevice(),
        clientType,
        requestId,
      }),
    );
    if (!authorize || (await authorize(request, invocation.signal)) !== true)
      fail('permission_denied', '此操作需要宿主对具体设备与操作内容授权');
    invocation.signal?.throwIfAborted();
  }
  function attachRun(run: Run): MaaToolResult {
    if (run.deviceId !== requireDevice() || !id(run.id))
      fail('invalid_result', '宿主返回的执行记录不属于绑定设备');
    runs.add(run.id);
    return { content: runContent(run) };
  }

  add(
    'maa_task_catalog',
    '查询 MaaCore 任务目录、Agent 支持范围和执行入口；目录不代表已授权或真实通关验收。',
    'read',
    emptySchema,
    async () => ({
      content: { tasks: maaTaskCatalog(), note: '先生成草稿，用户审阅保存后再请求执行。' },
    }),
  );
  add(
    'maa_list_devices',
    '列出本机已登记设备的名称和状态；不发现或连接新设备，不返回 ADB 地址或设置。',
    'read',
    emptySchema,
    async () => ({
      content: {
        devices: (await host.listDevices())
          .slice(0, 100)
          .map(({ id, name, state, coreVersion, resourceVersion }) => ({
            id,
            name,
            state,
            coreVersion,
            resourceVersion,
          })),
      },
    }),
  );
  add(
    'maa_list_plans',
    '列出绑定设备可用的已保存任务表摘要；不读取凭据，不保存或执行任务。',
    'read',
    emptySchema,
    async () => ({
      content: {
        plans: (await host.listPlans())
          .filter((plan) => !deviceId || planAllowsDevice(plan, deviceId))
          .slice(0, 100)
          .map((plan) => ({
            id: plan.id,
            name: plan.name,
            enabled: plan.enabled,
            deviceId: plan.deviceId,
            deviceIds: planDeviceIds(plan),
            group: plan.group,
            taskTypes: plan.tasks.map((task) => task.type),
          })),
      },
    }),
  );
  add(
    'maa_propose_tasks',
    '把 MaaCore 任务列表规范化为待审阅计划；使用有限次数和零药石加急，不保存、不执行。文件作业请使用作业工作区。',
    'propose',
    taskProposalSchema,
    async (input) => {
      const plan = host.preparePlan(
        prepareAgentTaskDraft(input as { name: string; tasks: Plan['tasks'] }, clientType),
      );
      assertAgentExecutablePlan(plan, clientType);
      return { content: { plan, requiresConfirmation: true, executed: false } };
    },
  );
  add(
    'maa_device_status',
    '查询绑定设备的连接、占用和控制者；查询可用不代表后续动作已获租约。',
    'read',
    rpcToolSchema('device.availability', ['deviceId']),
    async () => ({ content: await host.deviceStatus({ deviceId: requireDevice() }) }),
  );
  add(
    'maa_get_frame',
    '获取绑定设备的当前 MaaCore 画面；需宿主授权，模型仅得到帧号和尺寸，图像保留在本机 artifact。',
    'capture',
    rpcToolSchema('device.frame', ['deviceId']),
    async (_input, requestId, invocation) => {
      await permit('maa_get_frame', 'capture', {}, requestId, invocation);
      const frame = await host.getFrame({ deviceId: requireDevice() });
      if (frame.deviceId !== requireDevice()) fail('invalid_result', '画面不属于绑定设备');
      frames.set(frame.frameId, {
        width: frame.width,
        height: frame.height,
        canControl: frame.canControl,
      });
      if (frames.size > 32) frames.delete(frames.keys().next().value!);
      const { data: _data, ...metadata } = frame;
      return { content: { ...metadata, imageLocation: 'local_artifact' }, artifact: frame };
    },
  );
  add(
    'maa_click',
    '在本会话获取的可控制画面上点击一次；需宿主授权，使用预览坐标和原帧号。过期需重新截图，结果未知不得自动重试。',
    'control',
    rpcToolSchema('device.click', ['deviceId', 'requestId']),
    async (input, requestId, invocation) => {
      const frame = frames.get(input.frameId);
      if (!frame || !frame.canControl || input.x >= frame.width || input.y >= frame.height)
        fail('invalid_frame', '请先获取可控制的当前画面，并使用画面范围内的坐标');
      const params = {
        deviceId: requireDevice(),
        frameId: input.frameId,
        x: input.x,
        y: input.y,
        requestId,
      };
      await permit('maa_click', 'control', params, requestId, invocation);
      return {
        content: {
          ...(await host.click(params)),
          evidenceNote: '点击已被接受不等于目标动作成功；应重新观察，不自动重放。',
        },
      };
    },
  );
  add(
    'maa_start_plan',
    '执行用户已保存的任务表；需宿主审阅当前完整计划授权，强制有限作战次数、零药石加急和关闭上报。返回运行标识后查询结果。',
    'execute',
    rpcToolSchema('run.start', ['deviceId', 'requestId']),
    async (input, requestId, invocation) => {
      requireDevice();
      const plan =
        (await host.listPlans()).find((plan) => plan.id === input.planId) ??
        fail('not_found', '任务表不存在');
      if (!planAllowsDevice(plan, deviceId!)) fail('scope_denied', '任务表未绑定当前设备');
      assertAgentExecutablePlan(plan, clientType);
      const expected = structuredClone(plan);
      await permit('maa_start_plan', 'execute', { plan: expected }, requestId, invocation);
      return attachRun(
        await host.startPlan(
          { planId: plan.id, deviceId: requireDevice(), requestId },
          expected,
          clientType,
        ),
      );
    },
  );
  add(
    'maa_get_run',
    '查询本会话已启动或宿主附加的执行状态及逐任务反馈；处理完成不等于作业通关。',
    'read',
    rpcToolSchema('run.detail'),
    async (input) => ({ content: runContent(await scopedRun(input.id)) }),
  );
  add(
    'maa_stop_run',
    '停止本会话的执行并清空原生队列；需宿主授权。停止不是暂停，恢复必须重新观察和发起执行。',
    'stop',
    rpcToolSchema('run.stop'),
    async (input, requestId, invocation) => {
      const run = await scopedRun(input.id);
      await permit('maa_stop_run', 'stop', { run }, requestId, invocation);
      return attachRun(await host.stopRun(input.id));
    },
  );
  add(
    'maa_start_tool',
    '启动仓库/干员识别、公招计算、库存保持、数据刷新或已审核小游戏；需宿主授权。只使用本次配置，零药石，不复用历史配置。',
    'execute',
    rpcToolSchema('tool.start', ['deviceId', 'requestId', 'clientType']),
    async (input, requestId, invocation) => {
      const config = structuredClone(input.config ?? {});
      assertAgentToolConfig(config);
      const params = { deviceId: requireDevice(), kind: input.kind, clientType, requestId, config };
      await permit('maa_start_tool', 'execute', params, requestId, invocation);
      const job = await host.startTool(params);
      if (job.deviceId !== deviceId || job.clientType !== clientType || !id(job.id))
        fail('invalid_result', '宿主返回的工具操作不属于绑定设备或客户端');
      jobs.add(job.id);
      return { content: jobContent(job) };
    },
  );
  add(
    'maa_get_tool',
    '查询本会话的独立工具操作状态和已确认结果；进行中、失败、未采集必须保持区分。',
    'read',
    rpcToolSchema('tool.get'),
    async (input) => ({ content: jobContent(await scopedJob(input.id)) }),
  );
  add(
    'maa_stop_tool',
    '停止本会话的独立工具操作；需宿主授权，不清除上次成功识别结果，不表示暂停。',
    'stop',
    rpcToolSchema('tool.stop'),
    async (input, requestId, invocation) => {
      const job = await scopedJob(input.id);
      await permit('maa_stop_tool', 'stop', { job }, requestId, invocation);
      return { content: jobContent(await host.stopTool(input.id)) };
    },
  );
  const recognitionSchema = rpcToolSchema('recognition.get', ['deviceId', 'clientType']);
  recognitionSchema.properties = {
    ...(recognitionSchema.properties as object),
    offset: { type: 'integer', minimum: 0, maximum: 100000 },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  };
  add(
    'maa_get_recognition',
    '分页读取绑定设备与客户端最近一次仓库或干员识别；保留采集时间和未知状态。缺项不推断未持有，估算数量不当成实时库存。',
    'read',
    recognitionSchema,
    async (input) => {
      const result = await host.getRecognition({
        deviceId: requireDevice(),
        clientType,
        kind: input.kind,
      });
      const { items, operators, ...metadata } = result;
      const offset = input.offset ?? 0,
        limit = input.limit ?? 50;
      return {
        content: {
          ...metadata,
          items: items.slice(offset, offset + limit),
          operators: operators.slice(offset, offset + limit),
          offset,
          totalItems: items.length,
          totalOperators: operators.length,
          hasMore: offset + limit < Math.max(items.length, operators.length),
        },
      };
    },
  );
  add(
    'maa_get_copilot_workspace',
    '查询已导入的普通、保全或悖论作业队列及不可变版本；只查看现有配置，不接受文件路径或修改队列。',
    'read',
    rpcToolSchema('copilot.workspace.get'),
    async (input) => ({ content: await host.getCopilotWorkspace(input.kind) }),
  );
  add(
    'maa_start_copilot',
    '执行用户已配置的作业工作区；需宿主审阅队列与选项授权，最多十次循环、不自动评价。返回运行状态不代表通关。',
    'execute',
    rpcToolSchema('copilot.start', ['deviceId', 'requestId']),
    async (input, requestId, invocation) => {
      requireDevice();
      const workspace = (await host.getCopilotWorkspace(input.kind)) as CopilotWorkspace;
      assertAgentCopilotWorkspace(workspace);
      const expected = structuredClone(workspace);
      await permit('maa_start_copilot', 'execute', { workspace: expected }, requestId, invocation);
      return attachRun(
        await host.startCopilot(
          { kind: workspace.kind, deviceId: requireDevice(), requestId },
          expected,
          clientType,
        ),
      );
    },
  );

  // The validator annotates its schema while resolving references.
  const validators = new Map(
    definitions.map((definition) => [
      definition.name,
      new Validator(structuredClone(definition.schema)),
    ]),
  );
  return {
    definitions: Object.freeze(definitions),
    async invoke(
      name: string,
      input: unknown,
      delivery: MaaToolInvocation,
    ): Promise<MaaToolResult> {
      const invocation = { callId: delivery.callId, signal: delivery.signal };
      invocation.signal?.throwIfAborted();
      if (!id(invocation.callId))
        fail('invalid_parameters', '宿主必须提供有效且稳定的工具调用标识');
      const execute = implementations.get(name) ?? fail('unknown_tool', '不支持的 MaaCore 工具');
      const signature = canonical({ name, input });
      if (new TextEncoder().encode(signature).byteLength > 65536)
        fail('invalid_parameters', '工具参数过大');
      const prior = calls.get(invocation.callId);
      if (prior) {
        if (prior.signature !== signature)
          fail('request_conflict', '同一工具调用标识不能用于不同参数');
        return structuredClone(await prior.promise);
      }
      if (calls.size >= maxCalls) fail('call_limit', '本次 Agent 工具调用次数已达上限');
      const submittedInput = structuredClone(input);
      // Defer work until the promise is registered, so concurrent deliveries and
      // failures share one execution. Never retry an unknown native outcome.
      const promise = Promise.resolve().then(async () => {
        if (!validators.get(name)!.validate(submittedInput).valid)
          fail('invalid_parameters', '工具参数不符合契约');
        const digest = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(sessionId + '\0' + invocation.callId),
        );
        const requestId =
          'maa-' +
          Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
            '',
          );
        invocation.signal?.throwIfAborted();
        return execute(submittedInput as Input, requestId, invocation);
      });
      calls.set(invocation.callId, { signature, promise });
      return structuredClone(await promise);
    },
  };
}
