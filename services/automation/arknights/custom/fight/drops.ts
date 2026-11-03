/** 结算目标读取只消费一张帧；按官方基线槽位绑定材料和数量，不以缺字推断数量一。 */
import { AtomicFailure } from '#automation/core/errors';
import type { AtomicBox, AtomicExecutionPort } from '#automation/core/types';
import { moveBox } from '#automation/primitives/geometry';
import { observedEvent, registerReviewedEvents } from '#automation/composites/reviewed-event';
import type { ReviewedResourceProfile } from '#automation/resources/maacore-adapter';
import { fightEntries, fightPipeline } from './definitions';
import { decodeFightFrame, fightBaselines } from './pixels';
import { fightDropTypes, type FightResourceProfile } from './resources';

export function createFightDropCapabilities(
  port: AtomicExecutionPort,
  profile: ReviewedResourceProfile,
) {
  const registrations = registerReviewedEvents(
    port,
    profile,
    [
      {
        id: 'game.fight.read_drops',
        label: '读取明确目标掉落数量',
        description: '只在成功结算页读取完整可见的基线、目标模板与数字；裁切或歧义立即停止。',
        effect: 'observe',
        rules: [
          'result',
          'failed',
          'drops.quantity',
          ...fightDropTypes.map((type) => `drops.type.${type}`),
        ],
        async run(vision, input) {
          const layout = (profile as FightResourceProfile).dropLayout;
          const ids = input.itemIds as string[];
          if (!layout || ids.some((id) => !Object.hasOwn(layout.items, id)))
            throw new AtomicFailure('目标掉落材料或基线资源尚未适配', 'unavailable');
          const frame = await vision.frame();
          if (
            (await vision.matches('failed', frame)).hit ||
            !(await vision.matches('result', frame)).hit
          )
            throw new AtomicFailure('掉落读取要求明确成功结算页');
          const baselines = fightBaselines(decodeFightFrame(frame), layout);
          const quantities = Object.fromEntries(ids.map((id) => [id, 0]));
          const evidence: { itemId: string; quantity: number; slot: AtomicBox; text: string }[] =
            [];
          for (const [groupIndex, baseline] of baselines.entries()) {
            // 基线下方的类别标题必须有唯一最佳模板证据；未知线条不能生成材料槽位。
            const types = [];
            for (const type of fightDropTypes) {
              const match = await vision.recognize(frame, vision.rule(`drops.type.${type}`), [
                baseline[0],
                baseline[1] + 2,
                baseline[2],
                25,
              ]);
              if (match.hit)
                types.push({ type, score: Math.max(...match.matches.map((item) => item.score)) });
            }
            types.sort((a, b) => b.score - a.score);
            if (!types.length || (types[1] && types[0]!.score === types[1].score))
              throw new AtomicFailure('掉落基线没有唯一明确类别，数量未知', 'unknown');
            const count = Math.floor(baseline[2] / (layout.itemOffset[2] + 10)) + 1;
            for (let ordinal = 1; ordinal <= count; ordinal++) {
              // 第一条渐变基线由右向左推槽位，其余由左向右；来源为官方 analyze_drops。
              const slot: AtomicBox = [
                groupIndex === 0
                  ? baseline[0] + baseline[2] - ordinal * layout.itemOffset[2]
                  : baseline[0] + (ordinal - 1) * layout.itemOffset[2],
                baseline[1] + layout.itemOffset[1],
                layout.itemOffset[2],
                layout.itemOffset[3],
              ];
              if (slot[0] < 0 || slot[0] + slot[2] > 1280)
                throw new AtomicFailure('掉落槽位被裁切', 'unavailable');
              const matches = [];
              for (const id of ids) {
                const result = await vision.recognize(
                  frame,
                  {
                    id: `drop.item.${id}`,
                    kind: 'template',
                    templateId: layout.items[id],
                    method: 5,
                    threshold: layout.threshold,
                    maskRange: [1, 255],
                    source: vision.rule('drops.quantity').source,
                  },
                  slot,
                );
                if (result.hit) matches.push(id);
              }
              if (matches.length > 1)
                throw new AtomicFailure('同一掉落槽位命中多个目标，数量未知', 'unknown');
              if (!matches.length) continue;
              // 数字是基线槽位偏移，而非匹配出的图标偏移；独立OCR必须唯一完整正整数。
              const quantity = await vision.recognize(
                frame,
                { ...vision.rule('drops.quantity'), onlyRec: true },
                moveBox(slot, layout.quantityOffset),
              );
              const text =
                quantity.matches.length === 1
                  ? (quantity.matches[0]!.text ?? '').replace(/\s/g, '')
                  : '';
              if (!/^[1-9]\d{0,8}$/.test(text))
                throw new AtomicFailure('目标掉落没有唯一完整数量证据', 'unknown');
              const amount = Number(text),
                id = matches[0]!;
              if (!Number.isSafeInteger(quantities[id]! + amount))
                throw new AtomicFailure('掉落数量超出安全整数', 'unknown');
              quantities[id]! += amount;
              evidence.push({ itemId: id, quantity: amount, slot, text });
            }
          }
          return observedEvent({ frameId: frame.frameId, drops: quantities, evidence, baselines });
        },
      },
    ],
    fightPipeline,
    fightEntries,
    [1280, 720],
  );
  if (!(profile as FightResourceProfile).dropLayout) {
    registrations[0]!.descriptor.available = false;
    registrations[0]!.descriptor.unavailableReason = '当前资源缺少已审阅掉落基线和数量布局';
  }
  return registrations;
}
