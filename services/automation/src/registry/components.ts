/** 功能组件的通用登记器：组合能力 provider 与流程资源，不持有设备或游戏状态。 */
import type { AtomicExecutionPort } from '../core/types';
import type { RegisteredPipeline } from '../pipeline/definitions';
import type { CapabilityRegistration } from './types';
import { createCapabilityRegistry } from './catalog';

/** Options 由组装入口定义；通用登记器无需认识各功能的资源配置。 */
export type AutomationComponent<Options> = {
  capabilities: (port: AtomicExecutionPort, options: Options) => readonly CapabilityRegistration[];
  pipeline?: RegisteredPipeline;
};

/**
 * 先指定宿主选项类型，再登记具名组件，保留每个组件自己的精确流程类型。
 * 对象的 key 即访问缩写；新增项会自动参与能力组装，无需再维护分派列表。
 */
export function registerAutomationComponents<Options>() {
  return <const Components extends Record<string, AutomationComponent<Options>>>(
    components: Components,
  ) => {
    // 保存登记时的 provider 和流程引用；不在模块加载时创建会话或执行动作。
    const registered = Object.freeze(
      Object.fromEntries(
        Object.entries(components).map(([name, component]) => [
          name,
          Object.freeze({ ...component }),
        ]),
      ),
    ) as Readonly<Components>;
    return {
      components: registered,
      createRegistry(port: AtomicExecutionPort, options: Options) {
        // 每个宿主会话重新构造所有 provider，由目录统一拒绝跨组件的能力 ID 重名。
        const capabilities = Object.values(registered).flatMap((component) => [
          ...component.capabilities(port, options),
        ]);
        return createCapabilityRegistry(capabilities, { port });
      },
    };
  };
}
