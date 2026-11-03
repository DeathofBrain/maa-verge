/** 日常、周常领奖由切页、一次领取和关闭弹窗组成；每次写入都有独立的前后证据。 */
import type { AtomicExecutionPort, AtomicFrame } from '#automation/core/types';
import { AtomicFailure } from '#automation/core/errors';
import type { ReviewedResourceProfile } from '#automation/resources/maacore-adapter';
import {
  observedEvent,
  registerReviewedEvents,
  reviewedWorkflow,
  type ReviewedEventVision,
} from '#automation/composites/reviewed-event';
import { awardEntries, awardPipeline } from './definitions';

const overlayRules = ['obtained', 'popup.close', 'popup.supplies'];

/** 同帧先排除已审阅覆盖层，不能用遮罩后仍可见的主页或标签授权输入。 */
async function assertAwardUncovered(
  vision: ReviewedEventVision,
  frame: AtomicFrame,
  allowReward = false,
) {
  for (const rule of overlayRules)
    if (rule !== 'obtained' || !allowReward)
      if ((await vision.matches(rule, frame)).hit)
        throw new AtomicFailure('任务页面存在覆盖层；未执行新的任务输入');
}

export function createAwardCapabilities(
  port: AtomicExecutionPort,
  profile: ReviewedResourceProfile,
) {
  // 只在同一 provider 的输入代际中保留“主页无邮件”分支；新输入或新进入立即作废。
  let mailEmptyRevision: number | undefined;
  const mailEmpty = () =>
    mailEmptyRevision !== undefined && mailEmptyRevision === port.getInputRevision?.();
  const registrations = registerReviewedEvents(
    port,
    profile,
    [
      {
        id: 'game.award.mail_enter',
        label: '打开普通邮件',
        description: '主页只选择已审阅邮件入口；无未领奖邮件图标时保存同代无操作证据。',
        effect: 'input',
        rules: ['home', 'mail.entry', 'mail.noaward', 'mail.claim', ...overlayRules],
        async run(vision) {
          mailEmptyRevision = undefined;
          const frame = await vision.frame();
          await assertAwardUncovered(vision, frame);
          if ((await vision.matches('mail.claim', frame)).hit)
            return observedEvent({ alreadyOpen: true });
          if (!(await vision.matches('home', frame)).hit)
            throw new AtomicFailure('当前不是已确认主页或邮件领取页');
          if (!(await vision.matches('mail.entry', frame)).hit) {
            if (!(await vision.matches('mail.noaward', frame)).hit)
              throw new AtomicFailure('主页邮件状态未识别，未点击');
            const revision = port.getInputRevision?.();
            if (!Number.isSafeInteger(revision) || Number(revision) < 0)
              throw new AtomicFailure('无可靠输入代际，不能保留无邮件分支', 'unavailable');
            mailEmptyRevision = revision;
            return observedEvent({ noUnclaimedMail: true });
          }
          return observedEvent(
            await vision.clickOnce('mail.entry', ['mail.claim'], { timeoutMs: 10000 }),
          );
        },
      },
      {
        id: 'game.award.mail_claim',
        label: '领取普通邮件物资',
        description: '只确认当前领取按钮一次，随后等待获得物资证据，不重复点击。',
        effect: 'commit',
        rules: ['mail.claim', 'obtained', 'mail.noaward', 'home', ...overlayRules],
        async run(vision) {
          if (mailEmpty()) {
            const frame = await vision.frame();
            await assertAwardUncovered(vision, frame);
            if (
              (await vision.matches('home', frame)).hit &&
              (await vision.matches('mail.noaward', frame)).hit
            )
              return observedEvent({ noUnclaimedMail: true });
          }
          mailEmptyRevision = undefined;
          const frame = await vision.frame();
          await assertAwardUncovered(vision, frame);
          return observedEvent(
            await vision.clickOnce('mail.claim', ['obtained'], { timeoutMs: 10000 }),
          );
        },
      },
      {
        id: 'game.award.mail_close',
        label: '关闭普通邮件奖励',
        description: '只在已识别物资层上关闭一次并复核邮件页；无邮件分支不输入。',
        effect: 'input',
        rules: ['mail.close', 'obtained', 'mail.claim', 'mail.noaward', 'home'],
        async run(vision) {
          if (mailEmpty()) {
            const frame = await vision.frame();
            if (
              (await vision.matches('home', frame)).hit &&
              (await vision.matches('mail.noaward', frame)).hit
            )
              return observedEvent({ noUnclaimedMail: true });
          }
          mailEmptyRevision = undefined;
          if (!(await vision.matches('obtained')).hit)
            throw new AtomicFailure('未发现邮件物资层，不盲点关闭');
          await vision.action('mail.close');
          return observedEvent(await vision.waitFor(['mail.claim'], 5000, 250, ['obtained']));
        },
      },
      {
        id: 'observation.award',
        label: '读取任务奖励当前页',
        description: '读取任务标签、可领取按钮及获得物资证据，不把页面存在当已领取。',
        effect: 'observe',
        rules: ['weekly', 'weekly.active', 'claim', 'obtained'],
        run: async (vision) =>
          observedEvent(await vision.observe(['weekly', 'weekly.active', 'claim', 'obtained'])),
      },
      {
        id: 'game.award.enter',
        label: '从主页进入任务奖励',
        description: '只支持已审阅默认主题入口，任务页已存在时不重复点击。',
        effect: 'input',
        rules: ['home', 'entry', 'weekly', 'weekly.active', ...overlayRules],
        async run(vision) {
          const frame = await vision.frame();
          await assertAwardUncovered(vision, frame);
          if (
            (await vision.matches('weekly', frame)).hit ||
            (await vision.matches('weekly.active', frame)).hit
          )
            return observedEvent({ changed: false });
          if (!(await vision.matches('home', frame)).hit)
            throw new AtomicFailure('当前不是主页或任务奖励页面');
          if (!(await vision.matches('entry', frame)).hit)
            throw new AtomicFailure('默认主页缺少已审阅任务入口');

          // 回主页动画期间入口可能已经可见；只读稳定后重新定位，仍只提交一次点击。
          await vision.wait(1000);
          const ready = await vision.frame();
          await assertAwardUncovered(vision, ready);
          if (!(await vision.matches('home', ready)).hit)
            throw new AtomicFailure('任务输入前主页状态发生变化；未执行输入');
          const entry = await vision.matches('entry', ready);
          if (!entry.hit) throw new AtomicFailure('任务输入前入口证据丢失；未执行输入');
          await vision.click(ready, entry.matches[0]!.box);
          // TaskDefault.postDelay=1000 在直接 L3 与完整流程中都生效，不靠重复点卡片补偿。
          await vision.wait(1000);
          return observedEvent({
            changed: true,
            trigger: 'entry',
            ...(await vision.waitFor(['weekly', 'weekly.active'], 5000, 250, [
              'home',
              ...overlayRules,
            ])),
          });
        },
      },
      {
        id: 'game.award.select_daily',
        label: '选择日常任务',
        description:
          '沿用已审阅 WeeklyTask→DailyTask 相对目标，只输入一次并确认周常标签退出选中态。',
        effect: 'input',
        rules: ['daily', 'weekly', 'weekly.active', ...overlayRules],
        async run(vision) {
          const frame = await vision.frame();
          await assertAwardUncovered(vision, frame);
          if ((await vision.matches('weekly', frame)).hit)
            return observedEvent({ changed: false, tab: 'daily' });
          const active = await vision.matches('weekly.active', frame);
          if (!active.hit) throw new AtomicFailure('没有可定位日常任务的任务页标签');
          const box = active.matches[0]!.box;
          // 适配器已核对 DailyTask.rectMove 原值，偏移相对当前标签而非盲点。
          await vision.click(frame, [box[0] - 150, box[1], 100, 30]);
          return observedEvent({
            tab: 'daily',
            ...(await vision.waitFor(['weekly'], 5000, 250, overlayRules)),
          });
        },
      },
      {
        id: 'game.award.select_weekly',
        label: '选择周常任务',
        description: '只点击一次未选中周常标签，并确认上游 AwardFinished 选中态模板。',
        effect: 'input',
        rules: ['weekly', 'weekly.active', ...overlayRules],
        async run(vision) {
          const frame = await vision.frame();
          await assertAwardUncovered(vision, frame);
          if ((await vision.matches('weekly.active', frame)).hit)
            return observedEvent({ changed: false, tab: 'weekly' });
          const weekly = await vision.matches('weekly', frame);
          if (!weekly.hit) throw new AtomicFailure('未确认可切换的周常任务标签');
          await vision.click(frame, weekly.matches[0]!.box);
          return observedEvent({
            tab: 'weekly',
            changed: true,
            trigger: 'weekly',
            ...(await vision.waitFor(['weekly.active'], 5000, 250, overlayRules)),
          });
        },
      },
      {
        id: 'game.award.claim_current',
        label: '领取当前任务奖励一次',
        description: '只点击当前页领取按钮一次并复核获得物资；无领取按钮时只报告当前页观察。',
        effect: 'commit',
        rules: ['weekly', 'weekly.active', 'claim', ...overlayRules],
        async run(vision) {
          // ReceiveAward.preDelay=500 必须在取可操作新帧之前，避免把等待时间算进两秒帧窗口。
          await vision.wait(500);
          const frame = await vision.frame();
          await assertAwardUncovered(vision, frame);
          if (
            !(await vision.matches('weekly', frame)).hit &&
            !(await vision.matches('weekly.active', frame)).hit
          )
            throw new AtomicFailure('未确认任务奖励页面');
          const claim = await vision.matches('claim', frame);
          if (!claim.hit)
            return observedEvent({ changed: false, claimVisible: false, frameId: frame.frameId });
          await vision.click(frame, claim.matches[0]!.box);
          return observedEvent({
            changed: true,
            ...(await vision.waitFor(['obtained'], 5000, 250, ['popup.close', 'popup.supplies'])),
          });
        },
      },
      {
        id: 'game.award.close_reward',
        label: '关闭任务奖励弹窗一次',
        description: '要求获得物资证据后点击上游固定关闭区域；不执行上游重复盲点分支。',
        effect: 'input',
        rules: ['close', 'weekly', 'weekly.active', ...overlayRules],
        async run(vision) {
          const frame = await vision.frame();
          await assertAwardUncovered(vision, frame, true);
          if (!(await vision.matches('obtained', frame)).hit) {
            if (
              (await vision.matches('weekly', frame)).hit ||
              (await vision.matches('weekly.active', frame)).hit
            )
              return observedEvent({ changed: false });
            throw new AtomicFailure('当前不是奖励弹窗或任务页');
          }
          // 识别与固定关闭区域绑定同帧，等待保留上游 CloseTaskAward.postDelay=1000。
          const action = profile.actions.close;
          if (!action?.box) throw new AtomicFailure('缺少任务奖励关闭区域', 'unavailable');
          await vision.click(frame, action.box);
          await vision.wait(action.delayMs);
          return observedEvent({
            changed: true,
            ...(await vision.waitFor(['weekly', 'weekly.active'], 5000, 250, overlayRules)),
          });
        },
      },
    ],
    awardPipeline,
    awardEntries,
    [1280, 720],
  );
  registrations.push(
    reviewedWorkflow(
      'workflow.award.mail',
      '领取普通邮件',
      '打开普通邮件，领取一次并关闭已确认的物资层；无邮件时无输入。',
      awardPipeline,
      'Award@Mail',
      ['game.award.mail_enter', 'game.award.mail_claim', 'game.award.mail_close'],
      registrations,
    ),
  );
  registrations.push(
    reviewedWorkflow(
      'workflow.award.daily_weekly',
      '日常与周常任务领奖',
      '从默认主题主页进入，分别选择日常/周常，单次领取并关闭；任何证据缺失即停止，结果保留两页领取事实。',
      awardPipeline,
      'Award@DailyWeekly',
      [
        'game.award.enter',
        'game.award.select_daily',
        'game.award.select_weekly',
        'game.award.claim_current',
        'game.award.close_reward',
      ],
      registrations,
    ),
  );
  return registrations;
}
