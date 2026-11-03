/** 理智补充是独立提交事件；同帧数量证据与宿主持久预留全部成立后才允许确认一次。 */
import { randomUUID } from 'node:crypto';
import { AtomicFailure } from '#automation/core/errors';
import { moveBox } from '#automation/primitives/geometry';
import { observedEvent, registerReviewedEvents } from '#automation/composites/reviewed-event';
import type { AtomicExecutionPort } from '#automation/core/types';
import type { ReviewedResourceProfile } from '#automation/resources/maacore-adapter';
import { fightPipeline, fightEntries } from './definitions';

export function createFightReplenishmentCapabilities(
  port: AtomicExecutionPort,
  profile: ReviewedResourceProfile,
) {
  return registerReviewedEvents(
    port,
    profile,
    [
      {
        id: 'game.fight.replenish',
        label: '按明确额度补充一次理智',
        description:
          '药品要求唯一已选项且数量严格为一；宿主持久预留后只确认一次，未知不退预算也不重放。',
        effect: 'commit',
        rules: [
          'medicine',
          'medicine.confirm',
          'medicine.selected',
          'medicine.count',
          'stone',
          'stone.confirm',
          'sanity',
          'stage',
          'confirm',
        ],
        async run(vision, input, context) {
          const frame = await vision.frame();
          const medicine = await vision.matches('medicine', frame),
            stone = await vision.matches('stone', frame);
          if (!medicine.hit && !stone.hit) {
            if ((await vision.matches('confirm', frame)).hit)
              return observedEvent({ consumed: false });
            throw new AtomicFailure('当前既没有本次战斗确认，也没有明确理智补充弹窗，未输入');
          }
          if (medicine.hit && stone.hit) throw new AtomicFailure('药品与源石弹窗证据冲突，未消耗');
          const kind = medicine.hit ? 'medicine' : 'stone';
          const limit = Number(input[kind] ?? 0);
          if (!Number.isSafeInteger(limit) || limit <= 0)
            throw new AtomicFailure(
              `${kind === 'medicine' ? '理智药' : '源石'}额度为零，未消耗`,
              'unavailable',
            );
          if (!context.reserveConsumable)
            throw new AtomicFailure('宿主未提供持久消耗预留，未消耗', 'unavailable');
          const sanity = async (image: typeof frame) => {
            const values = (await vision.matches('sanity', image)).matches.map((item) =>
              (item.text ?? '').replace(/\s/g, ''),
            );
            const match = values.length === 1 ? /^(\d{1,4})\/(\d{1,3})$/.exec(values[0]!) : null;
            if (!match)
              throw new AtomicFailure(
                '当前理智数值缺少唯一完整 current/max 证据，未确认消耗',
                'unavailable',
              );
            return { current: Number(match[1]), maximum: Number(match[2]) };
          };
          const beforeSanity = await sanity(frame);
          if (kind === 'medicine') {
            const selected = await vision.matches('medicine.selected', frame);
            if (selected.matches.length !== 1)
              throw new AtomicFailure('无法严格确认唯一已选药品，未消耗', 'unavailable');
            const count = await vision.recognize(
              frame,
              vision.rule('medicine.count'),
              moveBox(selected.matches[0]!.box, [-95, 28, 105, 60]),
            );
            const values = count.matches.map((item) => (item.text ?? '').replace(/\s/g, ''));
            if (values.length !== 1 || !/^(?:×|x|X)?1$/.test(values[0]!))
              throw new AtomicFailure('当前已选药品数量不是明确的一，未消耗', 'unavailable');
          }
          const confirmation = await vision.matches(`${kind}.confirm`, frame);
          if (!confirmation.hit || confirmation.matches.length !== 1)
            throw new AtomicFailure('理智补充确认按钮缺失或有歧义');
          // 先落预留再提交；预留失败不点击，点击或回执未知时保留预留，不以迟到消息退回额度。
          const operationId = randomUUID();
          await context.reserveConsumable(kind, 1, limit, operationId);
          const fresh = await vision.frame();
          const modal = await vision.matches(kind, fresh),
            target = await vision.matches(`${kind}.confirm`, fresh);
          if (!modal.hit || target.matches.length !== 1)
            throw new AtomicFailure('持久预留后补充弹窗变化，保留额度且未点击', 'unknown');
          if (kind === 'medicine') {
            const selected = await vision.matches('medicine.selected', fresh);
            if (selected.matches.length !== 1)
              throw new AtomicFailure('预留后已选药品发生变化，保留额度且未点击', 'unknown');
            const count = await vision.recognize(
              fresh,
              vision.rule('medicine.count'),
              moveBox(selected.matches[0]!.box, [-95, 28, 105, 60]),
            );
            if (
              count.matches.length !== 1 ||
              !/^(?:×|x|X)?1$/.test((count.matches[0]!.text ?? '').replace(/\s/g, ''))
            )
              throw new AtomicFailure('预留后药品数量未能复核，保留额度且未点击', 'unknown');
          }
          await vision.click(fresh, target.matches[0]!.box);
          const after = await vision.waitFor(['stage'], 10000, 250, ['medicine', 'stone']);
          const afterSanity = await sanity(await vision.frame());
          if (
            afterSanity.maximum !== beforeSanity.maximum ||
            afterSanity.current <= beforeSanity.current
          )
            throw new AtomicFailure('补充后理智未明确增加，保留额度且不重放', 'unknown');
          return observedEvent({
            kind,
            amount: 1,
            operationId,
            beforeSanity,
            afterSanity,
            ...after,
          });
        },
      },
    ],
    fightPipeline,
    fightEntries,
    [1280, 720],
  );
}
