/** 公招逐槽流程：收取、只读计算、刷新、准备和许可提交各有独立 JSON 根图与证据。 */
import { randomUUID } from 'node:crypto';
import { AtomicFailure, checkCancelled } from '#automation/core/errors';
import {
  observedEvent,
  registerReviewedEvents,
  reviewedWorkflow,
  type ReviewedEventVision,
} from '#automation/composites/reviewed-event';
import type {
  AtomicExecutionPort,
  AtomicCapabilityResult,
  AtomicFrame,
} from '#automation/core/types';
import type { RecruitResourceProfile } from './resources';
import { calculateRecruitment, type RecruitmentCombination } from './calculator';
import { recruitPipeline, recruitEntries } from './definitions';

const normalized = (text: string) => text.replace(/\s/g, '');
const slotOf = (box: readonly number[]) =>
  (box[1]! + box[3]! / 2 >= 500 ? 2 : 0) + (box[0]! + box[2]! / 2 >= 640 ? 1 : 0);
const numeric = (matches: readonly { text?: string }[]) => {
  const text = matches.map((item) => normalized(item.text ?? ''));
  return text.length === 1 && /^\d{1,6}$/.test(text[0]!) ? Number(text[0]) : undefined;
};
type Plan = {
  tags: string[];
  selected: string[];
  level: number;
  minutes: number;
  protected: boolean;
  confirm: boolean;
  permits: number;
  canRefresh: boolean;
  combinations: RecruitmentCombination[];
};

/** 标签必须完整五项；未知词、重复词和许可歧义都不转为自动招募输入。 */
async function readPlan(
  vision: ReviewedEventVision,
  profile: RecruitResourceProfile,
  input: Record<string, unknown>,
  frame?: AtomicFrame,
): Promise<Plan> {
  if (!profile.recruitment) throw new AtomicFailure('当前资源缺少有效公招计算数据', 'unavailable');
  const image = frame ?? (await vision.frame());
  const tags = (await vision.matches('tags', image)).matches.map((item) =>
    normalized(item.text ?? ''),
  );
  const combinations = calculateRecruitment(tags, profile.recruitment);
  if (!combinations.length) throw new AtomicFailure('公招标签不是完整五个已登记词，未更改设置');
  const best = combinations[0]!;
  const preserve = (input.preserveTags ?? []) as string[];
  const protectedTags =
    tags.some((tag) => preserve.some((word) => word && tag.includes(word))) ||
    (input.skipRobot !== false && tags.includes('支援机械'));
  const confirmLevels = (input.confirm ?? [3, 4]) as number[];
  const selectLevels = (input.select ?? [4]) as number[];
  const preferred =
    best.minimum === 3 &&
    tags.some((tag) =>
      ((input.firstTags ?? []) as string[]).some((word) => word && tag.includes(word)),
    );
  let selected = selectLevels.includes(best.minimum) || preferred ? [...best.tags] : [];
  if (selected.length && Number(input.extraTagsMode ?? 0) !== 0) {
    for (const candidate of combinations) {
      if (candidate.minimum !== best.minimum) continue;
      const union = [...new Set([...selected, ...candidate.tags])];
      if (
        union.length <= 3 &&
        combinations.some(
          (combination) =>
            combination.minimum >= best.minimum &&
            combination.tags.length === union.length &&
            union.every((tag) => combination.tags.includes(tag)),
        )
      )
        selected = union;
    }
  }
  const times = (input.recruitmentTime ?? {}) as Record<string, number>;
  const minutes = times[String(Math.max(3, best.minimum))] ?? 540;
  if (minutes !== 540) {
    // 低于九小时会重新纳入低星候选；不能继续使用九小时保底作为确认依据。
    const actual = calculateRecruitment(tags, profile.recruitment, minutes).find(
      (combination) =>
        combination.tags.length === best.tags.length &&
        combination.tags.every((tag) => best.tags.includes(tag)),
    );
    if (!actual || actual.minimum !== best.minimum)
      throw new AtomicFailure('此时长改变保底星级，当前不自动确认该配置', 'unavailable');
  }
  const permits = numeric((await vision.matches('permits', image)).matches);
  const noPermit = (await vision.matches('no_permit', image)).hit;
  if (permits === undefined && !noPermit)
    throw new AtomicFailure('招募许可数量缺少唯一完整数字，未消耗');
  return {
    tags,
    selected,
    level: best.minimum,
    minutes,
    protected: protectedTags,
    confirm: !protectedTags && confirmLevels.includes(best.minimum),
    permits: noPermit ? 0 : permits!,
    canRefresh:
      (await vision.matches('refresh', image)).hit &&
      !(await vision.matches('no_refresh', image)).hit,
    combinations: combinations.slice(0, 25),
  };
}

export function createDailyRecruitCapabilities(
  port: AtomicExecutionPort,
  profile: RecruitResourceProfile,
  existing: ReturnType<typeof registerReviewedEvents>,
) {
  let openSlot: number | undefined;
  let prepared: { slot: number; plan: Plan; revision: number; until: number } | undefined;
  const policyRules = ['tags', 'permits', 'no_permit', 'refresh', 'no_refresh'];
  const readSlots = async (vision: ReviewedEventVision) => {
    const image = await vision.frame();
    if (
      !(await vision.matches('page', image)).hit ||
      (await vision.matches('tags', image)).matches.length >= 4 ||
      (await vision.matches('result', image)).hit
    )
      throw new AtomicFailure('未确认无遮挡公招列表');
    const finished = (await vision.matches('finished', image)).matches.map((item) =>
      slotOf(item.box),
    );
    const empty = (await vision.matches('start', image)).matches.map((item) => slotOf(item.box));
    if (new Set(empty).size !== empty.length || new Set(finished).size !== finished.length)
      throw new AtomicFailure('公招位置识别有歧义');
    return { finished: finished.sort(), empty: empty.sort() };
  };
  const registrations = registerReviewedEvents(
    port,
    profile,
    [
      {
        id: 'game.recruit.read_slots',
        label: '读取公招四个位置',
        description: '只识别可见完成位和明确开始招募位；进行中或未开放位置不当作空位。',
        effect: 'observe',
        rules: ['page', 'tags', 'result', 'finished', 'start'],
        run: async (vision) => observedEvent(await readSlots(vision)),
      },
      {
        id: 'game.recruit.open_slot',
        label: '打开明确空公招位',
        description: '只接受列表中开始招募的位置；不打开继续招募或进行中位置。',
        effect: 'input',
        rules: ['page', 'start', 'tags'],
        async run(vision, input) {
          prepared = undefined;
          openSlot = undefined;
          const frame = await vision.frame();
          if (
            !(await vision.matches('page', frame)).hit ||
            (await vision.matches('tags', frame)).matches.length >= 4
          )
            throw new AtomicFailure('当前不在无遮挡公招列表');
          const targets = (await vision.matches('start', frame)).matches.filter(
            (item) => slotOf(item.box) === input.slot,
          );
          if (targets.length !== 1) throw new AtomicFailure('目标位置不是唯一明确开始招募位');
          await vision.click(frame, targets[0]!.box);
          await vision.waitFor(['confirm'], 5000);
          const plan = await readPlan(vision, profile, {});
          openSlot = Number(input.slot);
          return observedEvent({ slot: openSlot, tags: plan.tags });
        },
      },
      {
        id: 'game.recruit.read_plan',
        label: '计算当前公招标签',
        description:
          '本地根据当前不可变资源计算所有一至三个标签组合；保护词条与许可不足不触发输入。',
        effect: 'observe',
        rules: policyRules,
        run: async (vision, input) => observedEvent(await readPlan(vision, profile, input)),
      },
      {
        id: 'game.recruit.refresh',
        label: '刷新当前公招标签一次',
        description:
          '要求已打开的新空位、非保护标签与刷新证据；确认后标签集合必须实际变化，未知不重复刷新。',
        effect: 'commit',
        rules: [...policyRules, 'refresh.confirm'],
        async run(vision) {
          prepared = undefined;
          if (openSlot === undefined) throw new AtomicFailure('没有本次打开的空位，未刷新');
          const before = await readPlan(vision, profile, {});
          if (
            before.tags.some((tag) => ['高级资深干员', '资深干员', '支援机械'].includes(tag)) ||
            !before.canRefresh
          )
            throw new AtomicFailure('特殊标签或没有可用刷新，未刷新');
          await vision.clickOnce('refresh', ['refresh.confirm']);
          const confirm = await vision.matches('refresh.confirm');
          if (confirm.matches.length !== 1) throw new AtomicFailure('刷新确认歧义', 'unknown');
          await vision.click(confirm.frame, confirm.matches[0]!.box);
          await vision.wait(500);
          const after = await readPlan(vision, profile, {});
          if ([...before.tags].sort().join('\0') === [...after.tags].sort().join('\0'))
            throw new AtomicFailure('刷新后标签没有明确变化；不重放', 'unknown');
          return observedEvent({ slot: openSlot, before: before.tags, tags: after.tags });
        },
      },
      {
        id: 'game.recruit.prepare',
        label: '准备当前公招时间与标签',
        description:
          '只设置本次新打开位置；时间按每次减量输入后的数值复核，标签输入一次，签发一次性确认凭据。',
        effect: 'input',
        rules: [...policyRules, 'timer.buttons', 'timer.hour', 'timer.minute', 'confirm'],
        async run(vision, input) {
          prepared = undefined;
          if (openSlot === undefined) throw new AtomicFailure('没有本次新打开的公招位置');
          const plan = await readPlan(vision, profile, input);
          if (plan.protected || !plan.confirm) return observedEvent({ skipped: true, plan });
          // 招募页面从 StartRecruit 新建入口进入；不复用中途退出的继续招募选择状态。
          const readTime = async () => {
            const image = await vision.frame();
            const hour = numeric((await vision.matches('timer.hour', image)).matches),
              minute = numeric((await vision.matches('timer.minute', image)).matches);
            if (
              hour === undefined ||
              minute === undefined ||
              hour < 1 ||
              hour > 9 ||
              minute < 0 ||
              minute > 50 ||
              minute % 10 !== 0
            )
              throw new AtomicFailure('公招计时器不是完整小时与十分位数值');
            return { hour, minute, frame: image };
          };
          let time = await readTime();
          if (input.setTime !== false && time.minute !== 0)
            throw new AtomicFailure('新建公招计时器不是整小时，未猜测重置');
          if (input.setTime === false && time.hour * 60 + time.minute !== plan.minutes)
            throw new AtomicFailure('禁用设置时间且当前时间与目标不同，未确认');
          for (
            let attempt = 0;
            time.hour * 60 + time.minute !== plan.minutes && attempt < 16;
            attempt++
          ) {
            const buttons = (await vision.matches('timer.buttons', time.frame)).matches.sort(
              (a, b) => a.box[0] - b.box[0],
            );
            if (buttons.length !== 2) throw new AtomicFailure('公招时间减量按钮不是明确两项');
            const adjustHour = time.hour !== Math.ceil(plan.minutes / 60) && time.minute === 0,
              button = buttons[adjustHour ? 0 : 1]!;
            const before = time;
            await vision.click(time.frame, button.box);
            await vision.wait(150);
            time = await readTime();
            const expectedMinutes = adjustHour
              ? (before.hour === 1 ? 9 : before.hour - 1) * 60 + before.minute
              : before.hour * 60 + before.minute - 10;
            if (time.hour * 60 + time.minute !== expectedMinutes)
              throw new AtomicFailure('时间输入后的数值不符合单次减量，不重复输入', 'unknown');
          }
          if (time.hour * 60 + time.minute !== plan.minutes)
            throw new AtomicFailure('时间设置超出有限步数');
          for (const tag of plan.selected) {
            const frame = await vision.frame(),
              tags = (await vision.matches('tags', frame)).matches;
            if (
              tags.length !== 5 ||
              tags.some((item) => !plan.tags.includes(normalized(item.text ?? '')))
            )
              throw new AtomicFailure('准备期间标签集合变化，未确认', 'unknown');
            const match = tags.filter((item) => normalized(item.text ?? '') === tag);
            if (match.length !== 1) throw new AtomicFailure('待选公招标签歧义');
            await vision.click(frame, match[0]!.box);
            await vision.wait(150);
          }
          const revision = port.getInputRevision?.();
          if (!Number.isSafeInteger(revision) || Number(revision) < 0)
            throw new AtomicFailure('宿主没有可靠输入修订号，未授权许可提交', 'unavailable');
          prepared = { slot: openSlot, plan, revision: revision!, until: Date.now() + 15000 };
          return observedEvent({ prepared: true, slot: openSlot, plan });
        },
      },
      {
        id: 'game.recruit.confirm',
        label: '按许可限额确认当前公招',
        description:
          '消费一次性准备凭据，先持久预留一张许可再确认；成功要求同一位置出现立即招募且空位消失。',
        effect: 'commit',
        rules: [
          ...policyRules,
          'confirm',
          'page',
          'start',
          'running',
          'timer.hour',
          'timer.minute',
        ],
        async run(vision, input, context) {
          const receipt = prepared;
          prepared = undefined;
          openSlot = undefined;
          if (
            !receipt ||
            receipt.until <= Date.now() ||
            receipt.revision !== port.getInputRevision?.()
          )
            throw new AtomicFailure('公招准备凭据缺失、过期或已被输入失效');
          const image = await vision.frame(),
            plan = await readPlan(vision, profile, {}, image);
          if (
            plan.tags.join('\0') !== receipt.plan.tags.join('\0') ||
            plan.permits < 1 ||
            (receipt.plan.level === 3 && plan.permits <= Number(input.reservePermits ?? 0))
          )
            throw new AtomicFailure('标签或许可保留线不满足，未确认');
          const hour = numeric((await vision.matches('timer.hour', image)).matches),
            minute = numeric((await vision.matches('timer.minute', image)).matches);
          if (
            hour === undefined ||
            minute === undefined ||
            hour * 60 + minute !== receipt.plan.minutes
          )
            throw new AtomicFailure('许可提交前时间复核失败，未确认');
          if (!context.reserveConsumable)
            throw new AtomicFailure('宿主未提供持久许可预留', 'unavailable');
          const operationId = randomUUID();
          await context.reserveConsumable('recruit', 1, Number(input.maxPermits ?? 0), operationId);
          if (receipt.revision !== port.getInputRevision?.())
            throw new AtomicFailure('预留期间出现其他输入，保留预留且未提交', 'unknown');
          const fresh = await vision.frame(),
            freshPlan = await readPlan(vision, profile, {}, fresh);
          const freshHour = numeric((await vision.matches('timer.hour', fresh)).matches),
            freshMinute = numeric((await vision.matches('timer.minute', fresh)).matches);
          if (
            freshPlan.tags.join('\0') !== receipt.plan.tags.join('\0') ||
            freshPlan.permits !== plan.permits ||
            freshHour === undefined ||
            freshMinute === undefined ||
            freshHour * 60 + freshMinute !== receipt.plan.minutes
          )
            throw new AtomicFailure('预留后标签、时间或许可变化，保留预留且未提交', 'unknown');
          const confirm = await vision.matches('confirm', fresh);
          if (confirm.matches.length !== 1)
            throw new AtomicFailure('预留后确认入口歧义，保留预留', 'unknown');
          await vision.click(confirm.frame, confirm.matches[0]!.box);
          await vision.wait(500);
          const after = await vision.frame();
          const page = (await vision.matches('page', after)).hit,
            tags = (await vision.matches('tags', after)).matches;
          const running = (await vision.matches('running', after)).matches.filter(
            (item) => slotOf(item.box) === receipt.slot,
          );
          const empty = (await vision.matches('start', after)).matches.filter(
            (item) => slotOf(item.box) === receipt.slot,
          );
          if (!page || tags.length >= 4 || running.length !== 1 || empty.length)
            throw new AtomicFailure(
              '确认后未独立观察同一招募位进入运行；保留许可预留，不重放',
              'unknown',
            );
          return observedEvent({
            slot: receipt.slot,
            operationId,
            permitConsumed: 1,
            selectedTags: receipt.plan.selected,
            minutes: receipt.plan.minutes,
            minimum: receipt.plan.level,
          });
        },
      },
      {
        id: 'game.recruit.leave',
        label: '离开当前公招标签页',
        description: '只使用已审阅返回按钮退出标签页并复核公招列表；保护标签不自动招募。',
        effect: 'input',
        rules: ['tags', 'back', 'page', 'result', 'finished', 'start'],
        async run(vision) {
          prepared = undefined;
          openSlot = undefined;
          if (!(await vision.matches('tags')).matches.length)
            throw new AtomicFailure('当前不是标签页');
          const back = await vision.matches('back');
          if (back.matches.length !== 1) throw new AtomicFailure('标签页返回按钮歧义');
          await vision.click(back.frame, back.matches[0]!.box);
          await vision.wait(500);
          return observedEvent(await readSlots(vision));
        },
      },
      {
        id: 'game.recruit.dismiss_result',
        label: '关闭已读取公招结果',
        description: '只点击明确获得结果屏的官方目标一次，之后复核公招列表，不采用无按钮连点。',
        effect: 'input',
        rules: ['result', 'page', 'tags', 'finished', 'start'],
        async run(vision) {
          const result = await vision.matches('result');
          if (!result.hit) throw new AtomicFailure('没有公招获得结果屏');
          await vision.click(result.frame, result.matches[0]!.box);
          await vision.wait(500);
          return observedEvent(await readSlots(vision));
        },
      },
    ],
    recruitPipeline,
    recruitEntries,
    [1280, 720],
  );
  const all = [...existing, ...registrations];
  const dependencies = all
    .map((item) => item.descriptor.id)
    .filter((id) => id.startsWith('game.recruit.'));
  const daily = reviewedWorkflow(
    'workflow.recruit.daily',
    '公招逐槽日常',
    '先领取已完成招募，再按完整标签组合、时间、许可保留和显式限额处理至多四个新空位；不加急、不上传。',
    recruitPipeline,
    'Recruit@EnterList',
    dependencies,
    all,
    {
      async run(input, context) {
        if (!context.runWorkflow) throw new AtomicFailure('宿主没有公招流程运行器', 'unavailable');
        const run = (entry: string, params: Record<string, unknown> = {}) =>
          context.runWorkflow!(entry, recruitPipeline.definitions, params);
        const policy = Object.fromEntries(
          [
            'select',
            'confirm',
            'setTime',
            'recruitmentTime',
            'extraTagsMode',
            'preserveTags',
            'firstTags',
            'skipRobot',
          ]
            .filter((key) => input[key] !== undefined)
            .map((key) => [key, input[key]]),
        );
        const results: AtomicCapabilityResult[] = [];
        let collected = 0,
          confirmed = 0;
        let result = await run('Recruit@EnterList');
        if (result.status !== 'completed' || !result.verified) return result;
        // 完成位最多四个；任何一次领取确认丢失均停止，不自动重新提交同位。
        for (let attempt = 0; attempt < 4; attempt++) {
          const slots = result.data as { finished: number[]; empty: number[] };
          if (!slots.finished.length) break;
          result = await run('Recruit@CollectAndClose');
          results.push(result);
          if (result.status !== 'completed' || !result.verified)
            return { ...result, data: { collected, confirmed, results } };
          collected++;
        }
        const visited = new Set<number>();
        while (visited.size < 4 && confirmed < Number(input.times ?? 4)) {
          checkCancelled(context);
          const slots = result.data as { finished: number[]; empty: number[] },
            slot = slots.empty.find((value) => !visited.has(value));
          if (slot === undefined) break;
          visited.add(slot);
          result = await run('Recruit@OpenSlot', { slot });
          if (result.status !== 'completed' || !result.verified)
            return { ...result, data: { collected, confirmed, results } };
          let plan: Plan;
          for (let refresh = 0; ; refresh++) {
            result = await run('Recruit@ReadPlan', policy);
            if (result.status !== 'completed' || !result.verified) return result;
            plan = result.data as Plan;
            if (!(
              input.refresh === true &&
              plan.canRefresh &&
              plan.level === 3 &&
              !plan.protected &&
              (plan.permits > 0 || input.forceRefresh === true)
            ))
              break;
            if (refresh >= 3)
              throw new AtomicFailure('单槽刷新达到三次有限上限，未继续消费', 'unavailable');
            result = await run('Recruit@Refresh');
            if (result.status !== 'completed' || !result.verified) return result;
          }
          if (
            plan.protected ||
            !plan.confirm ||
            plan.permits < 1 ||
            (plan.level === 3 && plan.permits <= Number(input.reservePermits ?? 0))
          ) {
            result = await run('Recruit@Leave');
          } else {
            result = await run('Recruit@Prepare', policy);
            if (result.status !== 'completed' || !result.verified) return result;
            result = await run('Recruit@Confirm', {
              maxPermits: input.maxPermits ?? 0,
              reservePermits: input.reservePermits ?? 0,
            });
            results.push(result);
            if (result.status !== 'completed' || !result.verified)
              return { ...result, data: { collected, confirmed, results } };
            confirmed++;
            result = await run('Recruit@ReadSlots');
          }
          if (result.status !== 'completed' || !result.verified) return result;
        }
        return observedEvent({ collected, confirmed, visited: [...visited], results });
      },
    },
  );
  if (!profile.recruitment) {
    daily.descriptor.available = false;
    daily.descriptor.unavailableReason = '当前资源缺少有效公招干员与标签数据';
  }
  return [...registrations, daily];
}
