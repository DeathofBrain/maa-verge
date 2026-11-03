/** 常用主线与资源关卡导航；复用明确审阅的单节点，不解释任意上游 next/sub 表达式。 */
import { AtomicFailure } from '#automation/core/errors';
import {
  observedEvent,
  registerReviewedEvents,
  reviewedWorkflow,
  type ReviewedEventVision,
} from '#automation/composites/reviewed-event';
import type { AtomicExecutionPort } from '#automation/core/types';
import type { ReviewedResourceProfile } from '#automation/resources/maacore-adapter';
import { fightPipeline, fightEntries } from './definitions';

/** 只承诺已明确实现的路由家族；活动／剿灭／难度切换另行适配，不猜关卡入口。 */
export function legacyStageRoute(
  stage: string,
): { kind: 'episode' | 'supply'; key: string } | undefined {
  const episode = /^(?:S)?(\d{1,2})-\d{1,2}$/.exec(stage);
  if (episode && Number(episode[1]) <= 17)
    return { kind: 'episode', key: String(Number(episode[1])) };
  const supply = /^(CE|LS|CA|AP|SK|PR-[A-D])-([1-6])$/.exec(stage);
  if (
    supply &&
    (supply[1]!.startsWith('PR-')
      ? Number(supply[2]) <= 2
      : ['CE', 'LS'].includes(supply[1]!) || Number(supply[2]) <= 5)
  )
    return { kind: 'supply', key: supply[1]! };
  return;
}

const normalized = (text: string) => text.replace(/\s/g, '').toUpperCase();
async function selected(vision: ReviewedEventVision, stage: string): Promise<boolean> {
  const frame = await vision.frame();
  if (!(await vision.matches('stage', frame)).hit) return false;
  const names = (await vision.matches('navigation.selected', frame)).matches.map((item) =>
    normalized(item.text ?? ''),
  );
  return names.length === 1 && names[0] === normalized(stage);
}

/** 输入后只读核对页面文字有变化；图像动画或一次原生接受不能证明已翻到新页。 */
async function swipePage(
  vision: ReviewedEventVision,
  axis: 'episode' | 'map' | 'supplies',
  reverse = false,
) {
  const frame = await vision.frame();
  const before = (await vision.texts(frame)).matches
    .map((item) => normalized(item.text ?? ''))
    .sort()
    .join('\u0000');
  const points =
    axis === 'episode'
      ? [1250, 580, 1250, 110]
      : reverse
        ? [300, 100, 900, 100]
        : [900, 100, 300, 100];
  const receipt = (await vision.port.execute(
    'swipe',
    {
      frameId: frame.frameId,
      x1: Math.round((points[0]! * frame.width) / 1280),
      y1: Math.round((points[1]! * frame.height) / 720),
      x2: Math.round((points[2]! * frame.width) / 1280),
      y2: Math.round((points[3]! * frame.height) / 720),
      durationMs: axis === 'episode' ? 1000 : 500,
      profile: 'navigation',
      compensationDirection: 'none',
    },
    vision.context,
  )) as { accepted?: boolean };
  if (receipt?.accepted !== true)
    throw new AtomicFailure('关卡导航滑动结果未知，不重放', 'unknown');
  await vision.wait(500);
  const after = await vision.frame();
  const text = (await vision.texts(after)).matches
    .map((item) => normalized(item.text ?? ''))
    .sort()
    .join('\u0000');
  return !!before && !!text && before !== text;
}

export function createFightNavigationCapabilities(
  port: AtomicExecutionPort,
  profile: ReviewedResourceProfile,
) {
  const registrations = registerReviewedEvents(
    port,
    profile,
    [
      {
        id: 'game.fight.open_terminal',
        label: '打开终端',
        description: '只从已确认主页进入默认主题终端，成功以终端标签证据判断。',
        effect: 'input',
        rules: [
          'navigation.home',
          'navigation.terminal',
          'navigation.theme',
          'navigation.resource',
        ],
        async run(vision) {
          const frame = await vision.frame();
          if (
            (await vision.matches('navigation.theme', frame)).hit &&
            (await vision.matches('navigation.resource', frame)).hit
          )
            return observedEvent({ alreadyOpen: true });
          if (!(await vision.matches('navigation.home', frame)).hit)
            throw new AtomicFailure('打开终端前未确认主页');
          return observedEvent(
            await vision.clickOnce(
              'navigation.terminal',
              ['navigation.theme', 'navigation.resource'],
              { timeoutMs: 10000 },
            ),
          );
        },
      },
      {
        id: 'game.fight.open_episode',
        label: '选择常用章节或资源类别',
        description: '选择已登记主线章节或资源类别；有限浏览，缺失规则时不进入未知页面。',
        effect: 'input',
        operations: ['swipe'],
        rules: [
          'navigation.theme',
          'navigation.resource',
          'navigation.chapter',
          'navigation.chapter_overview',
          'navigation.open_time',
          'navigation.default_progress',
          'navigation.enter_episode',
        ],
        async run(vision, input) {
          const route = legacyStageRoute(String(input.stage));
          if (!route) throw new AtomicFailure('此关卡路由尚未适配', 'unavailable');
          const target = `navigation.${route.kind === 'episode' ? 'episode' : 'supply'}.${route.key}`;
          if (!profile.rules[target])
            throw new AtomicFailure('当前资源缺少目标章节或资源入口', 'unavailable');
          const tab = route.kind === 'episode' ? 'navigation.theme' : 'navigation.resource';
          const tabMatch = await vision.matches(tab);
          if (!tabMatch.hit || tabMatch.matches.length !== 1)
            throw new AtomicFailure('终端标签入口缺失或歧义');
          await vision.click(tabMatch.frame, tabMatch.matches[0]!.box);
          await vision.wait(1000);
          if (route.kind === 'episode') {
            // 新版章节总览的下拉步骤逐项独立核验；已在总览时不会重复点击其他入口。
            for (const rule of [
              'navigation.chapter',
              'navigation.chapter_overview',
              'navigation.open_time',
              'navigation.default_progress',
            ]) {
              if ((await vision.matches(target)).hit) break;
              const match = await vision.matches(rule);
              if (!match.hit) continue;
              if (match.matches.length !== 1) throw new AtomicFailure('章节总览入口有歧义');
              await vision.click(match.frame, match.matches[0]!.box);
              await vision.wait(500);
            }
          }
          for (let index = 0; index < 30; index++) {
            const match = await vision.matches(target);
            if (match.hit) {
              if (match.matches.length !== 1) throw new AtomicFailure('目标章节入口有歧义');
              await vision.click(match.frame, match.matches[0]!.box);
              await vision.wait(1000);
              if (route.kind === 'episode') {
                const enter = await vision.matches('navigation.enter_episode');
                if (!enter.hit || enter.matches.length !== 1)
                  throw new AtomicFailure('未确认前往章节入口，不继续点击', 'unknown');
                await vision.click(enter.frame, enter.matches[0]!.box);
                await vision.wait(1000);
              }
              return observedEvent({ stage: input.stage, route, selectedCategory: true });
            }
            if (!(await swipePage(vision, route.kind === 'episode' ? 'episode' : 'supplies')))
              throw new AtomicFailure('有限浏览没有发现目标且页面未变化，导航停止', 'unavailable');
          }
          throw new AtomicFailure('目标章节超出已审阅的有界浏览范围', 'unavailable');
        },
      },
      {
        id: 'game.fight.select_stage',
        label: '选择并核对目标关卡',
        description: '只点击精确关卡名，并以准备页独立关卡名复核；选错或不明确立即停止。',
        effect: 'input',
        operations: ['swipe'],
        rules: ['stage', 'navigation.names', 'navigation.selected', 'navigation.back'],
        async run(vision, input) {
          const stage = String(input.stage);
          if (!legacyStageRoute(stage)) throw new AtomicFailure('此关卡尚未适配', 'unavailable');
          if (await selected(vision, stage)) return observedEvent({ stage, alreadySelected: true });
          for (let index = 0; index < 30; index++) {
            const observation = await vision.matches('navigation.names');
            const matches = observation.matches.filter(
              (item) => normalized(item.text ?? '') === normalized(stage),
            );
            if (matches.length > 1) throw new AtomicFailure('当前屏目标关卡名重复，不猜测点击');
            if (matches.length === 1) {
              await vision.click(observation.frame, matches[0]!.box);
              await vision.wait(1000);
              if (!(await selected(vision, stage)))
                throw new AtomicFailure('点击后未独立确认目标关卡，未开战', 'unknown');
              return observedEvent({ stage, selected: true });
            }
            // 先向左浏览，边界后只允许切换一次方向；总次数有限且每次都核对新页面身份。
            const changed = await swipePage(vision, 'map', index >= 15);
            if (!changed && index >= 15) break;
            if (!changed && index < 15) index = 14;
          }
          throw new AtomicFailure('有界地图浏览未找到精确目标关卡，未开战', 'unavailable');
        },
      },
    ],
    fightPipeline,
    fightEntries,
    [1280, 720],
  );
  registrations.push(
    reviewedWorkflow(
      'workflow.fight.navigate',
      '导航常用关卡',
      '终端、章节和精确关卡选择分别由已登记 L3 完成，最终独立核对关卡名。',
      fightPipeline,
      'Fight@Navigate',
      ['game.fight.open_terminal', 'game.fight.open_episode', 'game.fight.select_stage'],
      registrations,
      { effect: 'input' },
    ),
  );
  return registrations;
}
