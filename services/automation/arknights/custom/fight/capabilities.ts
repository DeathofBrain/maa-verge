/** 当前关卡代理拆为单次界面事件；提交凭据只在本 provider 内短暂有效，丢失确认不会重放。 */
import type {
  AtomicCapabilityResult,
  AtomicExecutionPort,
  AtomicExecutionContext,
} from '#automation/core/types';
import { AtomicFailure } from '#automation/core/errors';
import type { ReviewedResourceProfile } from '#automation/resources/maacore-adapter';
import {
  observedEvent,
  registerReviewedEvents,
  reviewedWorkflow,
  type ReviewedEvent,
} from '#automation/composites/reviewed-event';
import { fightEntries, fightPipeline } from './definitions';
import { createFightNavigationCapabilities } from './navigation';
import { createFightReplenishmentCapabilities } from './replenish';
import { createFightSeriesCapabilities, readFightSeries } from './series';
import { createFightDropCapabilities } from './drops';
import { checkFightInputs } from './resources';

export function createFightCapabilities(
  port: AtomicExecutionPort,
  profile: ReviewedResourceProfile,
) {
  // 准备事件验证代理倍率为 1 后才能签发凭据；确认事件在任何输入前即销毁凭据。
  let preparedUntil = 0;
  let preparedRevision: number | undefined;
  let preparedRoot: object | undefined;
  let preparedSeries = 1;
  const stateRules = [
    'stage',
    'agent.active',
    'confirm',
    'running',
    'result',
    'failed',
    'medicine',
    'stone',
  ];
  const readResult = async (
    vision: Parameters<ReviewedEvent['run']>[0],
    series = 1,
  ): Promise<AtomicCapabilityResult> => {
    const observation = await vision.observe([
      'result',
      'failed',
      ...(series > 1 ? ['result.times'] : []),
    ]);
    if (observation.evidence.failed.hit)
      return { status: 'failed', verified: true, data: { ...observation, battleWon: false } };
    if (!observation.evidence.result.hit) throw new AtomicFailure('当前画面没有明确战斗结算证据');
    if (series > 1) {
      const text = observation.evidence['result.times'].matches
        .map((item) => item.text ?? '')
        .join('')
        .replace(/\s/g, '');
      const digits = text.match(/\d+/g);
      if (
        !/(连续|代理|作战|成功)/.test(text) ||
        !/^[连续代理作战成功次数已完成：:0-9]+$/.test(text) ||
        digits?.length !== 1 ||
        Number(digits[0]) !== series
      )
        throw new AtomicFailure(
          '成功结算未明确确认本批次实际完成次数；未累计且未继续开战',
          'unknown',
        );
    }
    return observedEvent({ ...observation, battleWon: true, completedRounds: series });
  };
  const registrations = registerReviewedEvents(
    port,
    profile,
    [
      {
        id: 'observation.fight',
        label: '读取当前战斗状态',
        description: '只读关卡、代理、确认、战斗与结算证据；不推断不存在的通关信息。',
        effect: 'observe',
        rules: stateRules,
        run: async (vision) => observedEvent(await vision.observe(stateRules)),
      },
      {
        id: 'game.fight.enable_agent',
        label: '开启当前关卡代理',
        description: '代理已开启时无输入；否则只点击一次并复核激活证据。',
        effect: 'input',
        rules: ['stage', 'agent', 'agent.active'],
        async run(vision) {
          const frame = await vision.frame();
          if (!(await vision.matches('stage', frame)).hit)
            throw new AtomicFailure('当前不在关卡准备页面');
          if ((await vision.matches('agent.active', frame)).hit)
            return observedEvent({ changed: false, agentEnabled: true });
          return observedEvent(await vision.clickOnce('agent', ['agent.active']));
        },
      },
      {
        id: 'game.fight.prepare',
        label: '准备一次代理战斗',
        description: '要求代理已开启且 OCR 严格确认指定倍率；点击开始行动一次，遇到药石界面停止。',
        effect: 'input',
        rules: [
          'stage',
          'agent.active',
          'series',
          'series.opened',
          'confirm',
          'medicine',
          'stone',
          'running',
          'result',
          'failed',
        ],
        async run(vision, input, context) {
          if (input.reusePrepared === true) {
            const existing = await vision.matches('confirm');
            const sameRevision =
              preparedRevision !== undefined && preparedRevision === port.getInputRevision?.();
            if (
              preparedUntil > Date.now() &&
              preparedSeries === Number(input.series ?? 1) &&
              existing.hit &&
              (preparedRevision !== undefined
                ? sameRevision
                : preparedRoot === context.rootIdentity)
            )
              return observedEvent({ prepared: true, reused: true });
          }
          // 旧凭据先失效，所有前置识别都成功后才允许签发新的单次确认资格。
          preparedUntil = 0;
          preparedRevision = undefined;
          preparedRoot = undefined;
          const frame = await vision.frame();
          // 遮罩下的关卡按钮可能仍可匹配，任何已有确认、消耗弹窗或战斗终态都阻止新的准备。
          for (const id of [
            'confirm',
            'medicine',
            'stone',
            'running',
            'result',
            'failed',
            'series.opened',
          ])
            if ((await vision.matches(id, frame)).hit)
              throw new AtomicFailure('当前已有战斗确认、补充界面或结算；未再次准备战斗');
          if (!(await vision.matches('agent.active', frame)).hit)
            throw new AtomicFailure('尚未确认代理已开启');
          const series = Number(input.series ?? 1);
          if ((await readFightSeries(vision, frame)).value !== series)
            throw new AtomicFailure('当前连战倍率不等于本次明确请求，未开始战斗', 'unavailable');
          const stage = await vision.matches('stage', frame);
          if (!stage.hit) throw new AtomicFailure('当前不在关卡准备页面');
          await vision.click(frame, stage.matches[0]!.box);
          // 理智不足页面只作为停止证据，不沿上游药品或源石任务链继续。
          const after = await vision.waitFor(['confirm', 'medicine', 'stone'], 5000);
          if (after.matched !== 'confirm') {
            if (input.allowSanityDialog === true)
              return observedEvent({ ...after, prepared: false, requiresSanity: after.matched });
            throw new AtomicFailure('当前理智不足；药与源石预算均为零，未执行补充', 'unavailable');
          }
          preparedUntil = Date.now() + 15000;
          const revision = port.getInputRevision?.();
          if (Number.isSafeInteger(revision) && Number(revision) >= 0) preparedRevision = revision;
          preparedRoot = context.rootIdentity;
          preparedSeries = series;
          return observedEvent({ ...after, series, prepared: true });
        },
      },
      {
        id: 'game.fight.start',
        label: '确认一次代理开战',
        description: '仅消费本会话刚验证的单次准备凭据；点击确认一次后只读取战斗证据。',
        effect: 'commit',
        rules: ['confirm', 'running', 'result', 'failed'],
        async run(vision, _input, context) {
          const permitted =
            preparedUntil > Date.now() &&
            (preparedRevision !== undefined
              ? preparedRevision === port.getInputRevision?.()
              : preparedRoot === context.rootIdentity);
          preparedUntil = 0;
          preparedRevision = undefined;
          preparedRoot = undefined;
          if (!permitted)
            throw new AtomicFailure('缺少未使用且未过期的单次准备凭据；请重新观察准备页');
          return observedEvent(
            await vision.clickOnce('confirm', ['running', 'result', 'failed'], {
              timeoutMs: 15000,
            }),
          );
        },
      },
      {
        id: 'game.fight.read_result',
        label: '读取战斗结算',
        description: '仅接受明确成功或失败界面；任务完成回调不能替代此证据。',
        effect: 'observe',
        rules: ['result', 'failed', 'result.times'],
        run: (vision, input) => readResult(vision, Number(input.series ?? 1)),
      },
      {
        id: 'game.fight.wait_result',
        label: '有界等待战斗结算',
        description: '只读轮询到明确成功或失败；超时结果未知且不会重开战斗。',
        effect: 'observe',
        rules: ['result', 'failed', 'running', 'result.times'],
        async run(vision, input) {
          try {
            await vision.waitFor(
              ['result', 'failed'],
              Number(input.timeoutMs ?? 90000),
              Number(input.pollMs ?? 1000),
            );
          } catch (error) {
            if (
              !(error instanceof AtomicFailure) ||
              error.status !== 'unknown' ||
              input.allowPending !== true
            )
              throw error;
            const observation = await vision.observe(['running', 'result', 'failed']);
            if (
              !observation.evidence.result.hit &&
              !observation.evidence.failed.hit &&
              observation.evidence.running.hit
            )
              return observedEvent({ ...observation, pending: true });
            if (!observation.evidence.result.hit && !observation.evidence.failed.hit) throw error;
          }
          return readResult(vision, Number(input.series ?? 1));
        },
      },
      {
        id: 'game.fight.dismiss_result',
        label: '关闭一次战斗结算',
        description: '只有明确成功结算时才点击上游安全角落，并重新确认关卡页面。',
        effect: 'input',
        rules: ['result', 'dismiss', 'stage'],
        async run(vision) {
          preparedUntil = 0;
          if (!(await vision.matches('result')).hit)
            throw new AtomicFailure('未识别到可安全关闭的成功结算');
          await vision.action('dismiss');
          return observedEvent(await vision.waitFor(['stage'], 5000, 250, ['result']));
        },
      },
    ],
    fightPipeline,
    fightEntries,
    [1280, 720],
  );
  registrations.push(...createFightSeriesCapabilities(port, profile));
  registrations.push(...createFightDropCapabilities(port, profile));
  registrations.push(
    reviewedWorkflow(
      'workflow.fight.current_stage',
      '当前关卡有界代理',
      '仅当前关卡，逐次 ×1，默认一次且最多二十次；不导航关卡、不使用药石，未知结果立即停止。',
      fightPipeline,
      'Fight@CurrentStage',
      [
        'game.fight.enable_agent',
        'game.fight.prepare',
        'game.fight.start',
        'game.fight.wait_result',
        'game.fight.dismiss_result',
      ],
      registrations,
      {
        async run(input, context) {
          if (!context.runWorkflow) throw new AtomicFailure('宿主未提供流程运行器', 'unavailable');
          const results: AtomicCapabilityResult[] = [];
          // 每场独立提交一份 JSON 根图；保留已完成场次，任何未知结果立即结束批次。
          for (let index = 0; index < Number(input.times ?? 1); index++) {
            const result = await context.runWorkflow(
              'Fight@CurrentStage',
              fightPipeline.definitions,
              { timeoutMs: input.timeoutMs ?? 90000 },
            );
            results.push(result);
            if (result.status !== 'completed' || !result.verified)
              return { ...result, data: { completedRuns: index, results } };
          }
          return observedEvent({ completedRuns: results.length, results });
        },
      },
    ),
  );
  registrations.push(...createFightReplenishmentCapabilities(port, profile));
  // 单场协调器只循环正式JSON根；准备、倍率、补充、提交与结算仍由登记L3节点执行。
  const runSingle = async (
    input: Record<string, unknown>,
    context: AtomicExecutionContext,
  ): Promise<AtomicCapabilityResult> => {
    const problems = checkFightInputs(profile, input);
    if (problems.length) throw new AtomicFailure(problems.join('；'), 'unavailable');
    if (!context.runWorkflow) throw new AtomicFailure('宿主未提供正式流程运行器', 'unavailable');
    const series = Number(input.series ?? 1);
    const start = await context.runWorkflow('Fight@StartSingle', fightPipeline.definitions, {
      medicine: input.medicine ?? 0,
      stone: input.stone ?? 0,
      series,
    });
    if (start.status !== 'completed' || !start.verified) return start;
    for (let window = 0; window < 30; window++) {
      const result = await context.runWorkflow('Fight@WaitSingle', fightPipeline.definitions, {
        series,
      });
      if (result.status !== 'completed' || !result.verified) return result;
      if ((result.data as { pending?: boolean })?.pending) {
        context.onProgress?.({
          capabilityId: 'workflow.fight.single_battle',
          message: '战斗仍在进行，继续只读等待',
          data: { readOnlyWindow: window + 1 },
        });
        continue;
      }
      if (series > 1 && (result.data as { completedRounds?: number })?.completedRounds !== series)
        throw new AtomicFailure('缺少本批次实际完成次数，未累计且未继续开战', 'unknown');
      // 读取掉落必须先于关闭；失败保留当前结算页面，绝不把未知数量带入下一场。
      const itemIds = Object.keys((input.drops ?? {}) as Record<string, number>);
      let drops: Record<string, number> | undefined;
      if (itemIds.length) {
        const read = await context.runWorkflow('Fight@ReadDrops', fightPipeline.definitions, {
          itemIds,
        });
        if (read.status !== 'completed' || !read.verified)
          return { ...read, data: { battle: result, dropRead: read } };
        drops = (read.data as { drops?: Record<string, number> })?.drops;
        if (!drops || itemIds.some((id) => !Number.isSafeInteger(drops![id]) || drops![id]! < 0))
          throw new AtomicFailure('掉落读取没有返回全部目标的明确数量', 'unknown');
      }
      const dismiss = await context.runWorkflow(
        'Fight@DismissSingle',
        fightPipeline.definitions,
        {},
      );
      if (dismiss.status !== 'completed' || !dismiss.verified)
        return { ...dismiss, data: { battle: result, close: dismiss, drops } };
      return observedEvent({
        battle: result,
        close: dismiss,
        battleWon: true,
        series,
        ...(drops ? { drops } : {}),
      });
    }
    return {
      status: 'unknown',
      verified: false,
      data: { start },
      message: '战斗超出三十分钟的只读等待；未重新开战',
    };
  };
  const singleDependencies = [
    'game.fight.enable_agent',
    'game.fight.set_series',
    'game.fight.prepare',
    'game.fight.replenish',
    'game.fight.start',
    'game.fight.wait_result',
    'game.fight.dismiss_result',
  ];
  registrations.push(
    reviewedWorkflow(
      'workflow.fight.single_battle',
      '完整单次代理与分段等待',
      '明确倍率和独立消耗额度，开战后只读等待；需要掉落时先读数量再关闭结算。',
      fightPipeline,
      'Fight@StartSingle',
      singleDependencies,
      registrations,
      { run: runSingle },
    ),
  );
  registrations.push(
    reviewedWorkflow(
      'workflow.fight.legacy_batch',
      '按次数或掉落目标执行代理',
      '按剩余次数选择明确倍率；任一目标达到即停，未知证据不重开，保留最近二十次结果。',
      fightPipeline,
      'Fight@StartSingle',
      singleDependencies,
      registrations,
      {
        async run(input, context) {
          const problems = checkFightInputs(profile, input);
          if (problems.length) throw new AtomicFailure(problems.join('；'), 'unavailable');
          const targets = (input.drops ?? {}) as Record<string, number>;
          const total = Number(input.times),
            series = Number(input.series ?? 1);
          const accumulated = Object.fromEntries(Object.keys(targets).map((id) => [id, 0]));
          const recent: AtomicCapabilityResult[] = [];
          let completedRuns = 0,
            completedBatches = 0;
          while (completedRuns < total) {
            const multiplier = Math.min(series, total - completedRuns);
            const result = await runSingle({ ...input, series: multiplier }, context);
            recent.push(result);
            if (recent.length > 20) recent.shift();
            if (result.status !== 'completed' || !result.verified)
              return {
                ...result,
                data: { completedRuns, completedBatches, drops: accumulated, recent },
              };
            completedRuns += multiplier;
            completedBatches++;
            for (const id of Object.keys(targets)) {
              const quantity = (result.data as { drops: Record<string, number> }).drops[id];
              if (
                !Number.isSafeInteger(quantity) ||
                quantity! < 0 ||
                !Number.isSafeInteger(accumulated[id]! + quantity!)
              )
                throw new AtomicFailure('累计目标掉落数量无效，未继续开战', 'unknown');
              accumulated[id] = accumulated[id]! + quantity!;
            }
            // 官方 StageDropsTaskPlugin::check_specify_quantity 为任一目标达到即停止。
            const reached = Object.keys(targets).find((id) => accumulated[id]! >= targets[id]!);
            context.onProgress?.({
              capabilityId: 'workflow.fight.legacy_batch',
              message: `已完成 ${completedRuns} 次代理`,
              data: { completedRuns, completedBatches, drops: accumulated },
            });
            if (reached)
              return observedEvent({
                completedRuns,
                completedBatches,
                drops: accumulated,
                reachedTarget: reached,
                recent,
              });
          }
          return observedEvent({ completedRuns, completedBatches, drops: accumulated, recent });
        },
      },
    ),
  );
  return [...registrations, ...createFightNavigationCapabilities(port, profile)];
}
