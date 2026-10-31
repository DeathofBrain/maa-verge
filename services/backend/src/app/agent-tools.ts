import type { MaaToolHost } from '@maaverge/agent/tools';
import { RpcError } from '@backend/shared/errors';
import { parsePlan } from '@backend/modules/settings/models';
import type { Runtime } from './runtime';

type MaaToolRuntime = Pick<
  Runtime,
  'handle' | 'validatePolicy' | 'snapshot' | 'deviceClient' | 'startRun'
> & {
  copilot: Pick<Runtime['copilot'], 'workspaceGet'>;
};

/** Compare JSON semantics while retaining queue/task order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return (
      '{' +
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => JSON.stringify(key) + ':' + canonical(child))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

/** Application-owned MaaCore ports. The Agent never receives a generic RPC client. */
export function createMaaToolHost(runtime: MaaToolRuntime): MaaToolHost {
  return {
    async listDevices() {
      return runtime.snapshot().devices;
    },
    async listPlans() {
      return runtime.snapshot().plans;
    },
    preparePlan(draft) {
      const plan = parsePlan(draft);
      runtime.validatePolicy(plan);
      return plan;
    },
    deviceStatus: (params) => runtime.handle('device.availability', params),
    getFrame: (params) => runtime.handle('device.frame', params),
    click: (params) => runtime.handle('device.click', params),
    getRun: (id) => runtime.handle('run.detail', { id }),
    async startPlan(params, expectedPlan, expectedClientType) {
      const plan = runtime.snapshot().plans.find((item) => item.id === params.planId);
      if (!plan || canonical(plan) !== canonical(expectedPlan)) {
        throw new RpcError(-32011, '任务表已变更，请重新核验并授权');
      }
      if (runtime.deviceClient(params.deviceId) !== expectedClientType) {
        throw new RpcError(-32011, '设备客户端已变更，请重新核验并授权');
      }
      const boundPlan = structuredClone(expectedPlan);
      for (const task of boundPlan.tasks) {
        if (
          Object.hasOwn(task.params, 'client_type') &&
          task.params.client_type !== expectedClientType
        ) {
          throw new RpcError(-32011, '任务客户端与已授权客户端不一致');
        }
        // Bind every task in the immutable execution copy. Later task dispatch
        // must not inherit a device/profile setting changed after admission.
        task.params.client_type = expectedClientType;
      }
      // Keep the final live check and Runtime's synchronous admission in one turn.
      return runtime.startRun(params, boundPlan);
    },
    stopRun: (id) => runtime.handle('run.stop', { id }),
    startTool: (params) => runtime.handle('tool.start', params),
    getTool: (id) => runtime.handle('tool.get', { id }),
    stopTool: (id) => runtime.handle('tool.stop', { id }),
    getRecognition: (params) => runtime.handle('recognition.get', params),
    getCopilotWorkspace: (kind) => runtime.handle('copilot.workspace.get', { kind }),
    async startCopilot(params, expectedWorkspace, expectedClientType) {
      const workspace = runtime.copilot.workspaceGet({ kind: params.kind });
      if (canonical(workspace) !== canonical(expectedWorkspace)) {
        throw new RpcError(-32011, '作业工作区已变更，请重新核验并授权');
      }
      if (runtime.deviceClient(params.deviceId) !== expectedClientType) {
        throw new RpcError(-32011, '设备客户端已变更，请重新核验并授权');
      }
      // No await between comparison and the runtime's immutable execution snapshot.
      return runtime.handle('copilot.start', params);
    },
  };
}
