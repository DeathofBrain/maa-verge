/** 仓库和干员仅提供当前屏幕的只读文字证据；完整跨屏去重和结构化识别仍未迁移。 */
import type { AtomicExecutionPort } from '#automation/core/types';
import { AtomicFailure } from '#automation/core/errors';
import type { ReviewedResourceProfile } from '#automation/resources/maacore-adapter';
import {
  observedEvent,
  registerReviewedEvents,
  reviewedWorkflow,
} from '#automation/composites/reviewed-event';
import { inventoryEntries, inventoryPipeline } from './definitions';

export function createInventoryCapabilities(
  port: AtomicExecutionPort,
  profile: ReviewedResourceProfile,
) {
  const registrations = registerReviewedEvents(
    port,
    profile,
    [
      {
        id: 'observation.inventory.depot',
        label: '读取仓库当前屏文字',
        description: '只在已确认材料页读取本屏 OCR；不输出完整库存或未经配对的物品数量。',
        effect: 'observe',
        rules: ['depot'],
        async run(vision) {
          const frame = await vision.frame();
          const page = await vision.matches('depot', frame);
          if (!page.hit) throw new AtomicFailure('当前不是已确认的仓库材料页');
          return observedEvent({
            scope: 'current_screen',
            complete: false,
            frameId: frame.frameId,
            evidence: page,
            text: (await vision.texts(frame)).matches,
          });
        },
      },
      {
        id: 'observation.inventory.operators',
        label: '读取干员当前屏文字',
        description: '仅当前干员列表屏 OCR，不将姓名、等级等未配对文字当成完整干员数据。',
        effect: 'observe',
        rules: ['operators'],
        async run(vision) {
          const frame = await vision.frame();
          const page = await vision.matches('operators', frame);
          if (!page.hit) throw new AtomicFailure('当前不是已确认的干员列表');
          return observedEvent({
            scope: 'current_screen',
            complete: false,
            frameId: frame.frameId,
            evidence: page,
            text: (await vision.texts(frame)).matches,
          });
        },
      },
      {
        id: 'game.inventory.enter_depot',
        label: '从主页进入仓库',
        description: '仅已审阅默认主题；进入后确认仓库分类栏，材料页切换由独立事件负责。',
        effect: 'input',
        rules: ['home', 'depot.entry', 'depot', 'depot.materials', 'depot.all'],
        async run(vision) {
          const frame = await vision.frame();
          for (const id of ['depot', 'depot.materials', 'depot.all'])
            if ((await vision.matches(id, frame)).hit) return observedEvent({ changed: false });
          if (!(await vision.matches('home')).hit)
            throw new AtomicFailure('当前不是主页或仓库材料页');
          return observedEvent(
            await vision.clickOnce('depot.entry', ['depot', 'depot.materials', 'depot.all']),
          );
        },
      },
      {
        id: 'game.inventory.select_materials',
        label: '选择仓库材料分类',
        description: '只点击一次材料标签，确认材料页选中态后才能读取。',
        effect: 'input',
        rules: ['depot', 'depot.materials'],
        async run(vision) {
          if ((await vision.matches('depot')).hit) return observedEvent({ changed: false });
          return observedEvent(await vision.clickOnce('depot.materials', ['depot']));
        },
      },
      {
        id: 'game.inventory.enter_operators',
        label: '从主页进入干员列表',
        description: '仅已审阅默认主题，进入后必须有干员列表筛选栏证据。',
        effect: 'input',
        rules: ['home', 'operators.entry', 'operators'],
        async run(vision) {
          if ((await vision.matches('operators')).hit) return observedEvent({ changed: false });
          if (!(await vision.matches('home')).hit)
            throw new AtomicFailure('当前不是主页或干员列表');
          return observedEvent(await vision.clickOnce('operators.entry', ['operators']));
        },
      },
    ],
    inventoryPipeline,
    inventoryEntries,
    [1280, 720],
  );
  registrations.push(
    reviewedWorkflow(
      'workflow.inventory.read_depot',
      '进入并读取仓库当前屏',
      '从默认主题主页进入材料页，仅返回本屏文字，不扫描完整库存。',
      inventoryPipeline,
      'Inventory@ReadDepot',
      [
        'game.inventory.enter_depot',
        'game.inventory.select_materials',
        'observation.inventory.depot',
      ],
      registrations,
      { effect: 'input' },
    ),
  );
  registrations.push(
    reviewedWorkflow(
      'workflow.inventory.read_operators',
      '进入并读取干员当前屏',
      '从默认主题主页进入干员列表，仅返回本屏文字，不扫描完整干员库。',
      inventoryPipeline,
      'Inventory@ReadOperators',
      ['game.inventory.enter_operators', 'observation.inventory.operators'],
      registrations,
      { effect: 'input' },
    ),
  );
  return registrations;
}
