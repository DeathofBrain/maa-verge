/** 游戏生命周期只选择已审阅客户端包名；应用启动与登录就绪是两个独立证据阶段。 */
import { atomicInputSchemas, atomicCapabilityResultSchema } from '@contracts/atomic-input-schemas';
import { atomicInputValidators } from '@contracts/validators.js';
import { AtomicFailure } from '#automation/core/errors';
import type { CapabilityRegistration } from '#automation/registry/types';
import { reviewedWorkflow } from '#automation/composites/reviewed-event';
import { startupPipeline } from './definitions';

// 来源：官方 MAA resource/config.json 的 packageName；不接受用户传入包名或命令。
const packages: Record<string, string> = {
  Official: 'com.hypergryph.arknights',
  Bilibili: 'com.hypergryph.arknights.bilibili',
};

export function createLifecycleCapabilities(
  registrations: readonly CapabilityRegistration[],
): CapabilityRegistration[] {
  const entries: CapabilityRegistration[] = [];
  for (const action of ['launch', 'close'] as const) {
    const id = `game.startup.${action}` as const;
    const operation = action === 'launch' ? 'operation.start_app' : 'operation.stop_app';
    entries.push({
      descriptor: {
        id,
        label: action === 'launch' ? '启动指定客户端' : '关闭指定客户端',
        description:
          '只操作已审阅客户端包名；启动后另行验证主页，关闭使用独立 controller force-stop 成功回执。',
        layer: 'game',
        primitiveLevel: 3,
        effect: 'input',
        pipelineEntry: `Startup@${action === 'launch' ? 'Launch' : 'Close'}`,
        dependencies: [operation],
        inputSchema: atomicInputSchemas[id],
        resultSchema: atomicCapabilityResultSchema,
        available: true,
      },
      dependencies: [operation],
      validate: atomicInputValidators[id],
      pipeline: {
        definitions: startupPipeline.definitions,
        entry: `Startup@${action === 'launch' ? 'Launch' : 'Close'}`,
      },
      async handler(input, context) {
        const appId = packages[String(input.clientType)];
        if (!appId || !context.invoke)
          throw new AtomicFailure('当前客户端没有受控生命周期适配', 'unavailable');
        if (action === 'launch' && input.startGame === false)
          return {
            status: 'completed',
            verified: true,
            data: { launched: false, clientType: input.clientType },
          };
        const result = await context.invoke(operation, { appId });
        if (result.status !== 'completed' || !result.nativeSuccess) return result;
        // 启动仍须登录图验证主页；关闭由宿主独立等待 controller stop_app 成功，不使用 Tasker 完成消息。
        return {
          status: 'completed',
          verified: action === 'close',
          nativeSuccess: true,
          data: {
            appId,
            requested: action,
            ...(action === 'close'
              ? { completionEvidence: 'controller.stop_app.status-succeeded' }
              : {}),
          },
        };
      },
    });
  }
  const all = [...registrations, ...entries];
  entries.push(
    reviewedWorkflow(
      'workflow.startup.start',
      '启动并登录游戏',
      '按客户端启动后由已审阅登录事件确认稳定主页；不切换账号。',
      startupPipeline,
      'Startup@Start',
      ['game.startup.launch', 'game.startup.login_step', 'observation.startup'],
      all,
      { effect: 'input' },
    ),
  );
  entries.push(
    reviewedWorkflow(
      'workflow.startup.close',
      '关闭游戏',
      '提交一次已审阅客户端关闭请求，以独立 controller force-stop 成功回执确认；不声称进程 PID 复核。',
      startupPipeline,
      'Startup@CloseGame',
      ['game.startup.close'],
      all,
      { effect: 'input' },
    ),
  );
  return entries;
}
