/** 登录只推进一次已审阅输入；载入、主页稳定与输入后的确认均为有界只读等待。 */
import type {
  AtomicExecutionContext,
  AtomicExecutionPort,
  AtomicFrame,
  AtomicRecognition,
} from '#automation/core/types';
import { AtomicFailure } from '#automation/core/errors';
import type { ReviewedResourceProfile } from '#automation/resources/maacore-adapter';
import {
  observedEvent,
  registerReviewedEvents,
  reviewedWorkflow,
  type ReviewedEventVision,
} from '#automation/composites/reviewed-event';
import { startupEntries, startupPipeline } from './definitions';
import { createLifecycleCapabilities } from './lifecycle';

const buttons = ['start', 'wake', 'server'] as const;
const loadingRules = [
  'loading.icon',
  'loading.text',
  'loading.resource',
  'loading.update',
] as const;
const recognitionRules = [
  'home',
  ...buttons,
  'popup.close',
  'popup.supplies',
  'popup.title',
  ...loadingRules,
];
const popupTitles = {
  'popup.monthly': /月签到/,
  'popup.signin': /限时签到/,
  'popup.wish': /许愿墙/,
  'popup.announcement': /活动公告|系统公告|资讯速报/,
} as const;
type StartupPage = {
  frame: AtomicFrame;
  state: string;
  titles: string[];
  markers: {
    home: boolean;
    close: boolean;
    supplies: boolean;
    rawTitles: number;
    popupTitles: number;
  };
};
type StartupHomeReadiness = {
  revision(): number | undefined;
  current(): boolean;
  remember(): void;
  invalidate(): void;
};

/** 只复用同根、同输入代际的稳定等待；缓存不保存画面，也不替代每一步的新帧遮挡核验。 */
function startupHomeReadiness(
  port: AtomicExecutionPort,
  context: AtomicExecutionContext,
  cache: WeakMap<object, number>,
): StartupHomeReadiness {
  const root = context.rootIdentity;
  const revision = () => {
    try {
      const value = port.getInputRevision?.();
      return Number.isSafeInteger(value) && Number(value) >= 0 ? value : undefined;
    } catch {
      return undefined;
    }
  };
  const invalidate = () => {
    if (root) cache.delete(root);
  };
  return {
    revision,
    current() {
      const value = revision();
      if (root && value !== undefined && cache.get(root) === value) return true;
      invalidate();
      return false;
    },
    remember() {
      const value = revision();
      if (root && value !== undefined) cache.set(root, value);
      else invalidate();
    },
    invalidate,
  };
}

/** 官方 SignInEventEnter.roi 是主页活动卡片区；同帧确认主页后，卡片文字不构成弹窗标题。 */
function popupTitleMatches(title: AtomicRecognition, home: boolean) {
  if (!home) return title.matches;
  const [left, top, width, height] = [5, 21, 203, 258];
  return title.matches.filter(
    ({ box: [x, y, w, h] }) => x < left || y < top || x + w > left + width || y + h > top + height,
  );
}

/** 同帧先排除覆盖层再认主页；仅已知标题与官方关闭图标同时成立才允许关闭。 */
async function readStartupPage(vision: ReviewedEventVision): Promise<StartupPage> {
  const frame = await vision.frame();
  const title = await vision.matches('popup.title', frame);
  const closed = await vision.matches('popup.close', frame);
  const supplies = await vision.matches('popup.supplies', frame);
  const home = await vision.matches('home', frame);
  const popupMatches = popupTitleMatches(title, home.hit);
  const text = popupMatches
    .map((match) => match.text ?? '')
    .join('')
    .replace(/\s/g, '');
  const titles = Object.entries(popupTitles)
    .filter(([, pattern]) => pattern.test(text))
    .map(([id]) => id);
  // 诊断仅记录规则命中与数量，不把全屏 OCR、截图或账号文字送入进度事件。
  const markers = {
    home: home.hit,
    close: closed.hit,
    supplies: supplies.hit,
    rawTitles: title.matches.length,
    popupTitles: popupMatches.length,
  };
  const state = (value: string) => ({ frame, state: value, titles, markers });
  if (closed.hit || popupMatches.length)
    return state(closed.hit && titles.length === 1 ? titles[0]! : 'unknown');
  if (supplies.hit) return state('popup.supplies');
  if (home.hit) {
    // 联网载入遮罩可能保留主页图标，不能把遮罩后的命中累计为稳定主页。
    for (const id of loadingRules) if ((await vision.matches(id, frame)).hit) return state(id);
    return state('home');
  }
  for (const id of [...buttons, ...loadingRules])
    if ((await vision.matches(id, frame)).hit) return state(id);
  return state('unknown');
}

/** 未识别载入也只给只读宽限；旧标题仍在、同按钮仍在或期限耗尽均不授权再次输入。 */
async function waitForStartupPage(
  vision: ReviewedEventVision,
  context: AtomicExecutionContext,
  readiness: StartupHomeReadiness,
  previous?: string,
): Promise<StartupPage> {
  const startedAt = Date.now();
  // 实机冷启动在 GameStart 输入获确认后仍有超过 20 秒的标题／神经反馈过渡。
  // previous 只由已复核并完成一次输入的分支传入；仅 start 后给 60 秒只读窗口，其他仍为 20 秒。
  let windowMs = previous === 'start' ? 60000 : 20000;
  let deadline = Math.min(startedAt + windowMs, context.deadline ?? Infinity);
  let stableHome = 0;
  let inputRevision = readiness.revision();
  let diagnosticCount = 0;
  let diagnosticIdentity = '';
  // 每个等待窗口最多报告 16 次状态变化，超时另留最后状态；重复轮询不淹没 Debug 步骤。
  const report = (page: StartupPage, oldVisible: boolean, timeout = false) => {
    const identity = JSON.stringify([page.state, page.titles, page.markers, oldVisible, windowMs]);
    if (!timeout && (identity === diagnosticIdentity || diagnosticCount >= 16)) return;
    diagnosticIdentity = identity;
    diagnosticCount++;
    context.onProgress?.({
      capabilityId: 'game.startup.login_step',
      message: timeout ? '登录等待超时，保留最后页面状态' : '登录页面状态变化',
      data: {
        state: page.state,
        titles: page.titles,
        markers: page.markers,
        previous: previous ?? null,
        oldVisible,
        stableHome,
        windowMs,
        elapsedMs: Date.now() - startedAt,
        remainingMs: Math.max(0, deadline - Date.now()),
      },
    });
  };
  while (true) {
    const page = await readStartupPage(vision);
    // 等待期间也可能发生其他宿主输入；旧稳定计数与缓存都不能跨输入代际沿用。
    const currentRevision = readiness.revision();
    if (currentRevision !== inputRevision) {
      stableHome = 0;
      readiness.invalidate();
      inputRevision = currentRevision;
    }
    if (page.state !== 'home') readiness.invalidate();
    // 未审阅关闭图标／活动覆盖层不属于冷载入；一旦出现便收回额外预算，且不在消失后续期。
    if (
      windowMs === 60000 &&
      page.state === 'unknown' &&
      (page.markers.close || page.markers.popupTitles > 0)
    ) {
      windowMs = 20000;
      deadline = Math.min(deadline, startedAt + windowMs);
    }
    const oldVisible =
      previous !== undefined && (page.state === previous || page.titles.includes(previous));
    report(page, oldVisible);
    // 最后一轮识别本身也会耗时，局部窗口到期须先于已知状态返回，不能借父期限继续成功。
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      report(page, oldVisible, true);
      throw new AtomicFailure('登录页面等待超时；未识别遮挡或输入结果未知，不会重放', 'unknown');
    }
    if (!oldVisible && page.state === 'home') {
      // StartUp 的三次检查与每次 postDelay=1000 保留为只读稳定窗口，末尾再取新帧。
      // JSON 仍执行最多十步；同根已稳定时只省去重复等待，本轮新帧及覆盖层检查照常执行。
      if (readiness.current() || stableHome === 3) {
        readiness.remember();
        return page;
      }
      stableHome++;
    } else {
      stableHome = 0;
      if (!oldVisible && page.state !== 'unknown' && !page.state.startsWith('loading.'))
        return page;
    }
    const delay =
      page.state === 'loading.resource' || page.state === 'loading.update'
        ? 5000
        : page.state === 'loading.text'
          ? 2000
          : page.state === 'home'
            ? 1000
            : 250;
    await vision.wait(Math.min(delay, remaining));
  }
}

export function createStartupCapabilities(
  port: AtomicExecutionPort,
  profile: ReviewedResourceProfile,
) {
  // 每个 provider 独立持有弱引用；根结束后不保留设备画面或延长下一根的稳定证据。
  const stableHomes = new WeakMap<object, number>();
  const registrations = registerReviewedEvents(
    port,
    profile,
    [
      {
        id: 'game.startup.return_home',
        label: '从已知返回入口回到主页',
        description: '最多四层返回，每次先核对箭头并等到画面文字变化；未知确认弹窗或无变化时停止。',
        effect: 'input',
        rules: [...recognitionRules, 'navigation.back'],
        async run(vision) {
          for (let index = 0; index <= 4; index++) {
            const page = await readStartupPage(vision);
            const frame = page.frame;
            if (page.state === 'home') return observedEvent({ atHome: true, backSteps: index });
            if (page.markers.close || page.markers.supplies || page.markers.popupTitles)
              throw new AtomicFailure('当前存在覆盖层，未在遮挡页面返回');
            if (index === 4) break;
            const back = await vision.matches('navigation.back', frame);
            if (!back.hit || back.matches.length !== 1)
              throw new AtomicFailure('未知页面或确认弹窗缺少唯一的已审阅返回入口，未继续输入');
            const before = (await vision.texts(frame)).matches
              .map((item) => item.text ?? '')
              .sort()
              .join('\u0000');
            if (!before)
              throw new AtomicFailure('当前页面缺少可核对的文字身份，未返回', 'unavailable');
            await vision.click(frame, back.matches[0]!.box);
            const until = Math.min(Date.now() + 5000, vision.context.deadline ?? Infinity);
            let changed = false;
            do {
              await vision.wait(250);
              const next = await readStartupPage(vision);
              const after = next.frame;
              if (next.state === 'home')
                return observedEvent({ atHome: true, backSteps: index + 1 });
              const text = (await vision.texts(after)).matches
                .map((item) => item.text ?? '')
                .sort()
                .join('\u0000');
              if (text && text !== before) {
                changed = true;
                break;
              }
            } while (Date.now() < until);
            if (!changed)
              throw new AtomicFailure('返回后页面身份没有明确变化，不重复输入', 'unknown');
          }
          throw new AtomicFailure('有限返回后仍未确认主页，不继续操作', 'unknown');
        },
      },
      {
        id: 'observation.startup',
        label: '读取登录状态',
        effect: 'observe',
        rules: recognitionRules,
        description: '只读主页、登录、已审阅弹窗与载入证据；覆盖层存在时不报告主页已就绪。',
        async run(vision, _input, context) {
          const readiness = startupHomeReadiness(port, context, stableHomes);
          try {
            const observation = await vision.observe(recognitionRules);
            const evidence = observation.evidence;
            const home =
              evidence.home.hit &&
              !evidence['popup.close'].hit &&
              popupTitleMatches(evidence['popup.title'], evidence.home.hit).length === 0 &&
              !evidence['popup.supplies'].hit &&
              loadingRules.every((id) => !evidence[id].hit);
            if (!home) readiness.invalidate();
            return observedEvent({ ...observation, home });
          } catch (error) {
            readiness.invalidate();
            throw error;
          }
        },
      },
      {
        id: 'game.startup.login_step',
        label: '推进一次登录',
        effect: 'input',
        rules: [...recognitionRules, 'popup.supplies.close'],
        description: '最多点击一个已知登录按钮或明确关闭区域；等待不输入，不领签到或活动奖励。',
        async run(vision, _input, context) {
          const readiness = startupHomeReadiness(port, context, stableHomes);
          try {
            const before = await waitForStartupPage(vision, context, readiness);
            if (before.state === 'home')
              return observedEvent({ home: true, changed: false, frameId: before.frame.frameId });

            // 等待与多项识别可能耗尽两秒操作窗口；输入前以新帧核对同一状态与目标。
            readiness.invalidate();
            const current = await readStartupPage(vision);
            if (current.state !== before.state)
              throw new AtomicFailure('登录页面在输入前变化；未执行输入');
            const trigger = current.state;
            if (trigger === 'popup.supplies') {
              const action = profile.actions['popup.supplies.close'];
              if (!action?.box)
                throw new AtomicFailure('缺少今日配给的已审阅关闭区域', 'unavailable');
              const checked = await vision.matches('popup.supplies', current.frame);
              if (!checked.hit) throw new AtomicFailure('今日配给关闭前证据丢失');
              await vision.click(current.frame, action.box);
              await vision.wait(action.delayMs);
            } else {
              const target = trigger.startsWith('popup.') ? 'popup.close' : trigger;
              const checked = await vision.matches(target, current.frame);
              if (!checked.hit) throw new AtomicFailure('登录输入前目标证据丢失');
              await vision.click(current.frame, checked.matches[0]!.box);
              // GameStart.postDelay=3000；已审阅签到关闭 SignInEventReturn.postDelay=500。
              await vision.wait(
                trigger === 'start' ? 3000 : trigger.startsWith('popup.') ? 500 : 0,
              );
            }
            const after = await waitForStartupPage(vision, context, readiness, trigger);
            return observedEvent({
              changed: true,
              trigger,
              state: after.state,
              matched: after.state,
              home: after.state === 'home',
              frameId: after.frame.frameId,
            });
          } catch (error) {
            readiness.invalidate();
            throw error;
          }
        },
      },
    ],
    startupPipeline,
    startupEntries,
    [1280, 720],
  );
  registrations.push(
    reviewedWorkflow(
      'workflow.startup.login',
      '登录到主页',
      '最多推进十个已审阅登录或关闭步骤；载入只读等待，最终主页证据决定 verified。',
      startupPipeline,
      'Startup@Login',
      ['game.startup.login_step', 'observation.startup'],
      registrations,
      { effect: 'input' },
    ),
  );
  return [...registrations, ...createLifecycleCapabilities(registrations)];
}
