/** 为基建 JSON 绑定当前资源和具名 Custom；流转由官方 Tasker 执行，复杂业务由 workflows 编排。 */
import { AtomicFailure, checkCancelled } from '#automation/core/errors';
import { createVisionHandlers } from '#automation/pipeline/handlers';
import { runPipeline, type CustomHandlers } from '#automation/pipeline/runtime';
import { infrastPipeline } from './definitions';
import type { AtomicRule } from '#automation/resources/types';
import type { AtomicVision } from './observations';

/** 将已登记的主页标记映射为原生模板识别；特殊掩码和 MaaCore 算法须另行适配。 */
function baseRecognition(rule: AtomicRule): Record<string, unknown> {
  if (
    rule.kind !== 'template' ||
    !rule.templateId ||
    rule.maskRange ||
    rule.method === 'RGBCount' ||
    rule.pureColor
  )
    throw new AtomicFailure('基建主页标记不能安全映射为标准 Pipeline 模板节点', 'unavailable');
  return {
    recognition: 'TemplateMatch',
    template: [rule.templateId],
    threshold: rule.threshold ?? 0.8,
    method: rule.method ?? 5,
    ...(rule.roi ? { roi: rule.roi } : {}),
  };
}

/** entry 必须来自静态定义；只提交独立可达子图，handlers 绑定本次具名功能步骤，不递归运行 Pipeline。 */
export async function runInfrastPipeline(
  vision: AtomicVision,
  entry: keyof typeof infrastPipeline.definitions,
  handlers: CustomHandlers = {},
): Promise<void> {
  checkCancelled(vision.context);
  // 每次复制再绑定，避免某个设备的资源参数污染静态定义或另一并发调用。
  const pipeline = infrastPipeline.subgraph(entry);
  // 五次有限返回分支使用同一份当前主页规则，其他入口保留各自 JSON 定义。
  if (entry === 'Infrast@Base') {
    const recognition = baseRecognition(vision.rule('base.entered'));
    for (let attempt = 1; attempt <= 5; attempt++)
      Object.assign(pipeline[`Infrast@Base@Ready${attempt}`], recognition);
  }
  // 原生识别分支同样要求已适配的游戏坐标空间。
  await vision.frame();
  // 公共处理器负责单步视觉能力，功能处理器只补语义；共享运行器严格核对已提交参数。
  await runPipeline(
    vision.port,
    entry,
    pipeline,
    {
      ...createVisionHandlers(vision),
      async failBase() {
        throw new AtomicFailure('未能返回基建主页；不会自动从主界面运行其他任务');
      },
      ...handlers,
    },
    vision.context,
    'game.infrast',
  );
}
