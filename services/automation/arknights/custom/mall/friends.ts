/** 好友访问只沿官方已审阅入口逐次推进；达到今日信用上限才报告完成，不把访问按钮当收益证据。 */
import { AtomicFailure, checkCancelled } from '#automation/core/errors';
import {
  observedEvent,
  registerReviewedEvents,
  reviewedWorkflow,
  type ReviewedEventVision,
} from '#automation/composites/reviewed-event';
import type { AtomicExecutionPort } from '#automation/core/types';
import type { ReviewedResourceProfile } from '#automation/resources/maacore-adapter';
import { mallPipeline, mallEntries } from './definitions';

async function visitState(vision: ReviewedEventVision) {
  const frame = await vision.frame();
  const limited = (await vision.matches('friends.limit', frame)).hit;
  const next = (await vision.matches('friends.next', frame)).hit;
  const empty = (await vision.matches('friends.empty', frame)).hit;
  const signature = (await vision.texts(frame)).matches
    .map((item) => (item.text ?? '').replace(/\s/g, ''))
    .filter(Boolean)
    .sort()
    .join('\0');
  return { limited, next, empty, signature };
}
export function createFriendsCapabilities(
  port: AtomicExecutionPort,
  profile: ReviewedResourceProfile,
) {
  const stateRules = ['friends.limit', 'friends.next', 'friends.empty'];
  const registrations = registerReviewedEvents(
    port,
    profile,
    [
      {
        id: 'game.mall.enter_friends',
        label: '从主页进入好友页',
        description: '只点击已审阅默认主题好友入口，已在好友列表时不重复输入。',
        effect: 'input',
        rules: ['friends.home', 'friends.entry', 'friends.list'],
        async run(vision) {
          if ((await vision.matches('friends.list')).hit)
            return observedEvent({ alreadyOpen: true });
          if (!(await vision.matches('friends.home')).hit)
            throw new AtomicFailure('未确认主页或好友列表');
          return observedEvent(
            await vision.clickOnce('friends.entry', ['friends.list'], { timeoutMs: 10000 }),
          );
        },
      },
      {
        id: 'game.mall.open_friend_list',
        label: '打开好友列表',
        description: '点击官方好友列表标签一次，以白色访问图标或明确无好友文字复核。',
        effect: 'input',
        rules: ['friends.list', 'friends.first', 'friends.empty'],
        async run(vision) {
          const frame = await vision.frame();
          if (
            (await vision.matches('friends.first', frame)).hit ||
            (await vision.matches('friends.empty', frame)).hit
          )
            return observedEvent({ alreadyOpen: true });
          return observedEvent(
            await vision.clickOnce('friends.list', ['friends.first', 'friends.empty'], {
              timeoutMs: 10000,
            }),
          );
        },
      },
      {
        id: 'game.mall.visit_first',
        label: '访问第一个可访问好友',
        description:
          '只使用官方RGBCount/pureColor已审阅白色访问模板，输入后确认访问下位或今日上限文字。',
        effect: 'input',
        rules: ['friends.first', ...stateRules],
        async run(vision) {
          const before = await visitState(vision);
          if (before.empty || before.limited || before.next) return observedEvent(before);
          return observedEvent({
            ...(await vision.clickOnce('friends.first', ['friends.next', 'friends.limit'], {
              timeoutMs: 10000,
            })),
            ...(await visitState(vision)),
          });
        },
      },
      {
        id: 'game.mall.read_visit',
        label: '读取好友访问状态',
        description:
          '只有今日上限、访问下位或无好友的明确文字才构成已知状态；不从Tasker结束推断信用收益。',
        effect: 'observe',
        rules: stateRules,
        async run(vision) {
          const state = await visitState(vision);
          if (!state.limited && !state.next && !state.empty)
            throw new AtomicFailure('未知好友访问页面');
          return observedEvent(state);
        },
      },
      {
        id: 'game.mall.visit_next',
        label: '访问下一位好友一次',
        description: '输入后只读等待今日上限或页面文字身份变化；原页面未变时保持未知，不重复点击。',
        effect: 'input',
        rules: stateRules,
        async run(vision, _input, context) {
          const before = await visitState(vision);
          if (before.limited || before.empty) return observedEvent(before);
          if (!before.next || !before.signature)
            throw new AtomicFailure('没有可归属的下一位好友页面');
          const target = await vision.matches('friends.next');
          if (target.matches.length !== 1) throw new AtomicFailure('访问下位按钮歧义');
          await vision.click(target.frame, target.matches[0]!.box);
          const deadline = Math.min(Date.now() + 10000, context.deadline ?? Infinity);
          do {
            await vision.wait(500);
            const after = await visitState(vision);
            if (
              after.limited ||
              (after.next && after.signature && after.signature !== before.signature)
            )
              return observedEvent(after);
          } while (Date.now() < deadline);
          throw new AtomicFailure('访问后页面身份没有明确变化，不重放', 'unknown');
        },
      },
    ],
    mallPipeline,
    mallEntries,
    [1280, 720],
  );
  registrations.push(
    reviewedWorkflow(
      'workflow.mall.visit_friends',
      '好友访问领取信用',
      '按原好友入口逐位访问，今日上限或明确无好友结束；可选宿主持久每日去重，未知不自动重访。',
      mallPipeline,
      'Mall@VisitFirst',
      [
        'game.mall.enter_friends',
        'game.mall.open_friend_list',
        'game.mall.visit_first',
        'game.mall.read_visit',
        'game.mall.visit_next',
      ],
      registrations,
      {
        effect: 'input',
        async run(input, context) {
          if (!context.runWorkflow)
            throw new AtomicFailure('宿主没有好友流程运行器', 'unavailable');
          if (input.oncePerDay === true) {
            if (!context.claimDailyAction)
              throw new AtomicFailure('宿主未提供持久每日访问去重', 'unavailable');
            if (!(await context.claimDailyAction('visit_friends')))
              return observedEvent({ skipped: true, reason: 'already_claimed_for_game_day' });
          }
          let result = await context.runWorkflow('Mall@VisitFirst', mallPipeline.definitions, {}),
            visits = 0;
          if (result.status !== 'completed' || !result.verified) return result;
          for (; visits < 20; visits++) {
            const state = result.data as { limited?: boolean; empty?: boolean };
            if (state.limited || state.empty)
              return observedEvent({
                limited: state.limited ?? false,
                empty: state.empty ?? false,
                advances: visits,
              });
            checkCancelled(context);
            result = await context.runWorkflow('Mall@VisitNext', mallPipeline.definitions, {});
            if (result.status !== 'completed' || !result.verified)
              return { ...result, data: { advances: visits } };
          }
          return {
            status: 'partial',
            verified: false,
            data: { advances: visits },
            message: '已到二十次访问边界，尚未观察到今日信用上限',
          };
        },
      },
    ),
  );
  return registrations;
}
