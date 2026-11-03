/** 领取已经完成的一个公招位置；不创建招募、不刷新、不加急，也不预测星级。 */
import type { AtomicExecutionPort } from '#automation/core/types';
import { AtomicFailure } from '#automation/core/errors';
import type { RecruitResourceProfile } from './resources';
import { createDailyRecruitCapabilities } from './daily';
import {
  observedEvent,
  registerReviewedEvents,
  reviewedWorkflow,
} from '#automation/composites/reviewed-event';
import { recruitEntries, recruitPipeline } from './definitions';

export function createRecruitCapabilities(
  port: AtomicExecutionPort,
  profile: RecruitResourceProfile,
) {
  const registrations = registerReviewedEvents(
    port,
    profile,
    [
      {
        id: 'observation.recruit',
        label: '读取公招当前页',
        description: '读取当前公招页面、完成位、标签和结果文字；不修改招募设置。',
        effect: 'observe',
        rules: ['page', 'finished', 'skip', 'result', 'tags'],
        run: async (vision) =>
          observedEvent(await vision.observe(['page', 'finished', 'skip', 'result', 'tags'])),
      },
      {
        id: 'game.recruit.enter',
        label: '从主页进入公招',
        description: '只支持已审阅默认主题入口；已经在公招页时不点击。',
        effect: 'input',
        rules: ['home', 'entry', 'page'],
        async run(vision) {
          if ((await vision.matches('page')).hit) return observedEvent({ changed: false });
          if (!(await vision.matches('home')).hit)
            throw new AtomicFailure('当前不是主页或公招页面');
          return observedEvent(await vision.clickOnce('entry', ['page']));
        },
      },
      {
        id: 'game.recruit.collect_finished',
        label: '领取一个已完成公招',
        description: '只点击一个已完成招募位置；不消费招募许可或加急许可。',
        effect: 'commit',
        rules: ['page', 'finished', 'skip', 'result'],
        async run(vision) {
          if (!(await vision.matches('page')).hit) throw new AtomicFailure('当前不在公招列表');
          return observedEvent(
            await vision.clickOnce('finished', ['skip', 'result'], { timeoutMs: 10000 }),
          );
        },
      },
      {
        id: 'game.recruit.skip_reveal',
        label: '跳过一次公招展示',
        description: '只点击可见的跳过按钮；结果页已出现时无输入，不采用盲点回退。',
        effect: 'input',
        rules: ['skip', 'result'],
        async run(vision) {
          if ((await vision.matches('result')).hit) return observedEvent({ changed: false });
          return observedEvent(await vision.clickOnce('skip', ['result'], { timeoutMs: 10000 }));
        },
      },
      {
        id: 'game.recruit.read_result',
        label: '读取公招结果文字',
        description:
          '要求当前单次获得结果页证据；返回当前屏幕原始文字，不把 OCR 猜测当完整干员资料。',
        effect: 'observe',
        rules: ['result'],
        async run(vision) {
          const frame = await vision.frame();
          const result = await vision.matches('result', frame);
          if (!result.hit) throw new AtomicFailure('没有明确公招获得结果页证据');
          const { frame: _frame, ...evidence } = result;
          return observedEvent({
            frameId: frame.frameId,
            evidence,
            text: (await vision.texts(frame)).matches,
          });
        },
      },
    ],
    recruitPipeline,
    recruitEntries,
    [1280, 720],
  );
  registrations.push(
    reviewedWorkflow(
      'workflow.recruit.collect_one',
      '领取一个已完成公招',
      '默认主题从主页进入，领取一个完成位、跳过展示并读取结果；没有完成位即停止，不开启新招募。',
      recruitPipeline,
      'Recruit@CollectOne',
      [
        'game.recruit.enter',
        'game.recruit.collect_finished',
        'game.recruit.skip_reveal',
        'game.recruit.read_result',
      ],
      registrations,
    ),
  );
  return [...registrations, ...createDailyRecruitCapabilities(port, profile, registrations)];
}
