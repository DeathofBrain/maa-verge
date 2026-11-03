import { AtomicFailure } from '../core/errors';
import type { Vision } from '../composites/vision';
import { pipelineString, type CustomHandlers } from './runtime';

/** 可复用的单步视觉处理器；不包含游戏入口或整套业务流程。 */
export function createVisionHandlers(vision: Vision): CustomHandlers {
  return {
    // 规则点击与固定动作均复用当前功能的视觉配置、最新帧及宿主执行端口。
    async clickRule(params) {
      await vision.clickRule(pipelineString(params, 'rule'), params.optional === true);
    },
    async action(params) {
      await vision.action(pipelineString(params, 'action'));
    },
    async assertHit(params) {
      await vision.assertRule(
        pipelineString(params, 'rule'),
        true,
        pipelineString(params, 'message'),
        params.unknown === true,
      );
    },
    async assertMissing(params) {
      await vision.assertRule(
        pipelineString(params, 'rule'),
        false,
        pipelineString(params, 'message'),
      );
    },
    async clickFirst(params) {
      // 候选按 JSON 声明顺序尝试，首个命中即结束；只有显式配置才使用固定动作兜底。
      const rules = params.rules;
      if (!Array.isArray(rules) || !rules.every((rule) => typeof rule === 'string'))
        throw new AtomicFailure('Pipeline 候选规则无效');
      await vision.clickFirst(
        rules,
        typeof params.fallbackAction === 'string' ? params.fallbackAction : undefined,
      );
    },
  };
}
