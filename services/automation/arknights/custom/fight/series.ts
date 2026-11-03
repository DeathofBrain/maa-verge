/** 连战倍率只调整准备页的明确选项；开战仍由独立单次凭据提交。 */
import { AtomicFailure } from '#automation/core/errors';
import { moveBox } from '#automation/primitives/geometry';
import {
  observedEvent,
  registerReviewedEvents,
  type ReviewedEventVision,
} from '#automation/composites/reviewed-event';
import type { AtomicExecutionPort, AtomicFrame } from '#automation/core/types';
import type { ReviewedResourceProfile } from '#automation/resources/maacore-adapter';
import { fightEntries, fightPipeline } from './definitions';

export async function readFightSeries(vision: ReviewedEventVision, frame: AtomicFrame) {
  const series = await vision.matches('series', frame);
  const text = [...series.matches]
    .sort((a, b) => a.box[0] - b.box[0])
    .map((item) => item.text ?? '')
    .join('')
    .replace(/\s/g, '');
  const match = /^[×xX]([1-6])$/.exec(text);
  if (!match) throw new AtomicFailure('未严格识别当前连战倍率 ×1…×6', 'unavailable');
  return { value: Number(match[1]), evidence: series };
}

export function createFightSeriesCapabilities(
  port: AtomicExecutionPort,
  profile: ReviewedResourceProfile,
) {
  return registerReviewedEvents(
    port,
    profile,
    [
      {
        id: 'game.fight.set_series',
        label: '设置明确连战倍率',
        description: '只在准备页识别当前倍率和列表数字，选择一次并复核；不自动消耗药石。',
        effect: 'input',
        rules: ['stage', 'agent.active', 'series', 'series.opened', 'series.list', 'series.number'],
        async run(vision, input) {
          const target = Number(input.series),
            frame = await vision.frame();
          if (
            !(await vision.matches('stage', frame)).hit ||
            !(await vision.matches('agent.active', frame)).hit
          )
            throw new AtomicFailure('设置倍率要求已开启代理的关卡准备页');
          const before = await readFightSeries(vision, frame);
          if (before.value === target && !(await vision.matches('series.opened', frame)).hit)
            return observedEvent({ series: target, changed: false });
          if (!(await vision.matches('series.opened', frame)).hit) {
            const first = [...before.evidence.matches].sort((a, b) => a.box[0] - b.box[0])[0]!;
            await vision.click(frame, first.box);
            await vision.waitFor(['series.opened'], 5000);
          }
          // 每个数字必须绑定同帧乘号的相对区域；不能按列表顺序猜测1…6。
          const listFrame = await vision.frame();
          const options = await vision.matches('series.list', listFrame);
          const candidates = [];
          for (const option of options.matches) {
            const number = await vision.recognize(
              listFrame,
              vision.rule('series.number'),
              moveBox(option.box, [25, 13, 32, 25]),
            );
            const text = number.matches.map((item) => (item.text ?? '').replace(/\s/g, ''));
            if (text.length === 1 && text[0] === String(target)) candidates.push(option);
          }
          if (candidates.length !== 1)
            throw new AtomicFailure('倍率列表没有唯一目标数字，未选择', 'unavailable');
          await vision.click(listFrame, moveBox(candidates[0]!.box, [0, -1, 75, 45]));
          await vision.wait(300);
          const after = await vision.frame();
          const opened = await vision.matches('series.opened', after);
          if (opened.hit) {
            if (opened.matches.length !== 1)
              throw new AtomicFailure('倍率列表关闭入口有歧义', 'unknown');
            await vision.click(after, opened.matches[0]!.box);
            await vision.wait(300);
          }
          const verified = await vision.frame();
          if (
            (await vision.matches('series.opened', verified)).hit ||
            (await readFightSeries(vision, verified)).value !== target
          )
            throw new AtomicFailure('倍率选择后未明确复核，未开始战斗', 'unknown');
          return observedEvent({ series: target, changed: true, frameId: verified.frameId });
        },
      },
    ],
    fightPipeline,
    fightEntries,
    [1280, 720],
  );
}
