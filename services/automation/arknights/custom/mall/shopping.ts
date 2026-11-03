/** 信用购物按原优先列表、黑名单与溢出阶段选品；每次花费先持久预留，再确认一次。 */
import { randomUUID } from 'node:crypto';
import { AtomicFailure, checkCancelled } from '#automation/core/errors';
import { moveBox } from '#automation/primitives/geometry';
import {
  observedEvent,
  registerReviewedEvents,
  reviewedWorkflow,
} from '#automation/composites/reviewed-event';
import type {
  AtomicExecutionPort,
  AtomicBox,
  AtomicCapabilityResult,
} from '#automation/core/types';
import type { ReviewedResourceProfile } from '#automation/resources/maacore-adapter';
import { creditPage, creditPageRules, number } from './observations';
import { mallPipeline, mallEntries } from './definitions';

const normalized = (text: string) => text.replace(/\s/g, '');
type Product = { name: string; box: AtomicBox; discount: number; priority: number };
export function createShoppingCapabilities(
  port: AtomicExecutionPort,
  profile: ReviewedResourceProfile,
  existing: ReturnType<typeof registerReviewedEvents>,
) {
  let candidate: { product: Product; revision: number; credit: number; until: number } | undefined;
  let opened: { product: Product; revision: number; until: number } | undefined;
  let rewardRevision: number | undefined;
  const productRules = [
    ...creditPageRules,
    'balance',
    'product.name',
    'product.discount',
    'product.sold',
    'product.card',
    'obtained',
    'buy',
  ];
  const registrations = registerReviewedEvents(
    port,
    profile,
    [
      {
        id: 'game.mall.choose_product',
        label: '按旧购物策略选择信用商品',
        description:
          '同帧读取卡片名称、售罄和折扣，优先清单后黑名单，溢出阶段遵守明确开关；只准备候选，不购买。',
        effect: 'observe',
        rules: productRules,
        async run(vision, input) {
          candidate = undefined;
          opened = undefined;
          const frame = await vision.frame();
          if (
            !(await creditPage(vision, frame)).active ||
            (await vision.matches('obtained', frame)).hit ||
            (await vision.matches('buy', frame)).hit
          )
            throw new AtomicFailure('未确认无遮挡信用商品列表');
          const credit = number((await vision.matches('balance', frame)).matches);
          if (credit === undefined) throw new AtomicFailure('信用余额缺少唯一完整数字');
          const phase = String(input.phase ?? 'general');
          if (
            (phase === 'overflow' || (phase === 'general' && input.reserveMaxCredit === true)) &&
            credit <= 300
          )
            return observedEvent({ done: true, credit, reason: 'credit_reserve' });
          const buyFirst = (input.buyFirst ?? []) as string[],
            blacklist = (input.blacklist ?? []) as string[];
          const products: Product[] = [];
          const icons = (await vision.matches('product.card', frame)).matches;
          if (icons.length > 12) throw new AtomicFailure('信用商品图标数量超出已审阅单页范围');
          for (const icon of icons) {
            const box = moveBox(icon.box, [-60, -180, 220, 220]);
            if (box[0] < 0 || box[1] < 30 || box[0] + box[2] > 1280 || box[1] + box[3] > 720)
              continue;
            if ((await vision.recognize(frame, vision.rule('product.sold'), box)).hit) continue;
            const names = (
              await vision.recognize(
                frame,
                vision.rule('product.name'),
                moveBox(box, [0, -30, 220, 70]),
              )
            ).matches
              .map((item) => normalized(item.text ?? ''))
              .filter(Boolean);
            if (names.length !== 1) throw new AtomicFailure('商品名称不是唯一完整文字，未选品');
            const name = names[0]!,
              priority = buyFirst.findIndex((word) => word && name.includes(normalized(word)));
            const discountValues = (
              await vision.recognize(
                frame,
                vision.rule('product.discount'),
                moveBox(box, [-5, 23, 65, 30]),
              )
            ).matches.map((item) => (item.text ?? '').replace(/[\s%\-]/g, ''));
            const discount =
              discountValues.length === 1 && /^\d{1,2}$/.test(discountValues[0]!)
                ? Number(discountValues[0])
                : 0;
            if (phase === 'priority' && priority < 0) continue;
            if (
              phase === 'general' &&
              blacklist.some((word) => word && name.includes(normalized(word)))
            )
              continue;
            if (phase !== 'priority' && input.onlyDiscount === true && discount <= 0) continue;
            products.push({ name, box, priority, discount });
          }
          products.sort((a, b) =>
            phase === 'priority'
              ? a.priority - b.priority || a.box[1] - b.box[1] || a.box[0] - b.box[0]
              : a.box[1] - b.box[1] || a.box[0] - b.box[0],
          );
          if (!products.length) return observedEvent({ done: true, credit, phase });
          const revision = port.getInputRevision?.();
          if (!Number.isSafeInteger(revision) || Number(revision) < 0)
            throw new AtomicFailure('缺少可靠输入修订号，未授权商品导航', 'unavailable');
          candidate = {
            product: products[0]!,
            revision: revision!,
            credit,
            until: Date.now() + 15000,
          };
          return observedEvent({ done: false, credit, phase, product: products[0] });
        },
      },
      {
        id: 'game.mall.open_product',
        label: '打开已核对信用商品',
        description: '消费短期候选，重新核对同一位置的名称和售罄状态后只打开一次，不按旧坐标重试。',
        effect: 'input',
        rules: productRules,
        async run(vision) {
          const receipt = candidate;
          candidate = undefined;
          opened = undefined;
          if (
            !receipt ||
            receipt.until <= Date.now() ||
            receipt.revision !== port.getInputRevision?.()
          )
            throw new AtomicFailure('商品候选缺失、过期或已被其他输入失效');
          const frame = await vision.frame();
          if (
            !(await creditPage(vision, frame)).active ||
            (await vision.matches('obtained', frame)).hit
          )
            throw new AtomicFailure('当前不是无遮挡信用列表');
          const names = (
            await vision.recognize(
              frame,
              vision.rule('product.name'),
              moveBox(receipt.product.box, [0, -30, 220, 70]),
            )
          ).matches.map((item) => normalized(item.text ?? ''));
          if (
            names.length !== 1 ||
            names[0] !== receipt.product.name ||
            (await vision.recognize(frame, vision.rule('product.sold'), receipt.product.box)).hit
          )
            throw new AtomicFailure('商品名称或售罄状态变化，未打开');
          await vision.click(frame, receipt.product.box);
          await vision.waitFor(['buy'], 5000);
          opened = {
            product: receipt.product,
            revision: port.getInputRevision?.() ?? -1,
            until: Date.now() + 15000,
          };
          const selected = await vision.frame(),
            roi = vision.rule('buy').roi;
          if (!roi) throw new AtomicFailure('购买价格区域不可用', 'unavailable');
          const price = number((await vision.texts(selected, roi)).matches),
            balance = number((await vision.matches('balance', selected)).matches);
          if (price === undefined || price <= 0 || balance === undefined)
            throw new AtomicFailure('选定商品的价格或余额歧义');
          return observedEvent({ product: receipt.product, price, balance });
        },
      },
      {
        id: 'game.mall.purchase_selected',
        label: '按总信用额度购买选定商品',
        description:
          '只确认本次已打开的商品；严格价格、信用货币与余额证据，持久预留后重读一致，未知不重放。',
        effect: 'commit',
        rules: ['buy', 'currency', 'balance', 'obtained'],
        async run(vision, input, context) {
          const receipt = opened;
          opened = undefined;
          if (
            !receipt ||
            receipt.until <= Date.now() ||
            receipt.revision !== port.getInputRevision?.()
          )
            throw new AtomicFailure('缺少未过期的已选商品凭据');
          const read = async () => {
            const frame = await vision.frame(),
              buy = await vision.matches('buy', frame),
              currency = await vision.matches('currency', frame);
            if (
              buy.matches.length !== 1 ||
              !currency.hit ||
              (await vision.matches('obtained', frame)).hit
            )
              throw new AtomicFailure('未确认唯一信用购买页');
            const roi = vision.rule('buy').roi;
            if (!roi) throw new AtomicFailure('缺少购买价格区域', 'unavailable');
            const price = number((await vision.texts(frame, roi)).matches),
              balance = number((await vision.matches('balance', frame)).matches);
            if (price === undefined || price <= 0 || balance === undefined)
              throw new AtomicFailure('价格或余额不是唯一完整正整数');
            return { frame, buy, price, balance };
          };
          const before = await read(),
            limit = Number(input.maxCredit ?? 0);
          if (limit <= 0 || before.price > limit || before.price > before.balance)
            throw new AtomicFailure('购买超出明确总信用额度或可用余额', 'unavailable');
          if (!context.reserveConsumable)
            throw new AtomicFailure('宿主未提供持久信用预留', 'unavailable');
          const operationId = randomUUID();
          await context.reserveConsumable('credit', before.price, limit, operationId);
          if (receipt.revision !== port.getInputRevision?.())
            throw new AtomicFailure('预留期间出现其他输入，保留额度且未购买', 'unknown');
          const after = await read();
          if (after.price !== before.price || after.balance !== before.balance)
            throw new AtomicFailure('预留后价格或余额变化，保留预留且未购买', 'unknown');
          await vision.click(after.frame, after.buy.matches[0]!.box);
          const result = await vision.waitFor(['obtained'], 5000);
          rewardRevision = port.getInputRevision?.();
          return observedEvent({
            product: receipt.product,
            price: before.price,
            operationId,
            ...result,
          });
        },
      },
      {
        id: 'game.mall.close_reward',
        label: '关闭已确认信用奖励',
        description:
          '仅存在获得物资证据时使用官方安全关闭区域一次；没有奖励时要求信用页，完成后奖励必须消失。',
        effect: 'input',
        rules: [...creditPageRules, 'obtained', 'close', 'reward.close'],
        async run(vision) {
          candidate = undefined;
          opened = undefined;
          const frame = await vision.frame();
          if (!(await vision.matches('obtained', frame)).hit) {
            if (!(await creditPage(vision, frame)).active)
              throw new AtomicFailure('没有奖励弹窗或明确信用页');
            return observedEvent({ changed: false });
          }
          if (rewardRevision !== undefined && rewardRevision !== port.getInputRevision?.())
            throw new AtomicFailure('已购奖励关闭资格被其他输入失效');
          const action = rewardRevision === undefined ? 'close' : 'reward.close';
          rewardRevision = undefined;
          await vision.action(action);
          await vision.waitFor(['store'], 5000, 250, ['obtained']);
          if (!(await creditPage(vision, await vision.frame())).active)
            throw new AtomicFailure('关闭奖励后未确认信用页', 'unknown');
          return observedEvent({ changed: true });
        },
      },
    ],
    mallPipeline,
    mallEntries,
    [1280, 720],
  );
  const all = [...existing, ...registrations];
  const workflow = reviewedWorkflow(
    'workflow.mall.shopping',
    '按策略购买信用商品',
    '在明确总信用预算内逐件购买，保留原优先购买、黑名单、仅折扣与溢出信用策略。',
    mallPipeline,
    'Mall@ChooseProduct',
    [
      'game.mall.choose_product',
      'game.mall.open_product',
      'game.mall.purchase_selected',
      'game.mall.close_reward',
    ],
    all,
    {
      async run(input, context) {
        if (!context.runWorkflow) throw new AtomicFailure('宿主没有购物流程运行器', 'unavailable');
        if (Number(input.maxCredit ?? 0) <= 0)
          throw new AtomicFailure('购物总信用额度为零', 'unavailable');
        const run = (entry: string, value: Record<string, unknown>) =>
          context.runWorkflow!(entry, mallPipeline.definitions, value);
        const results: AtomicCapabilityResult[] = [];
        let spent = 0,
          purchases = 0;
        for (const phase of [
          'priority',
          'general',
          ...(input.forceShoppingIfCreditFull === true ? ['overflow'] : []),
        ]) {
          for (let index = 0; index < 10; index++) {
            checkCancelled(context);
            const selected = await run('Mall@ChooseProduct', {
              phase,
              buyFirst: input.buyFirst ?? [],
              blacklist: input.blacklist ?? [],
              onlyDiscount: input.onlyDiscount ?? false,
              reserveMaxCredit: input.reserveMaxCredit ?? false,
            });
            if (selected.status !== 'completed' || !selected.verified)
              return { ...selected, data: { spent, purchases, results } };
            if ((selected.data as { done?: boolean }).done) break;
            const open = await run('Mall@OpenProduct', {});
            if (open.status !== 'completed' || !open.verified)
              return { ...open, data: { spent, purchases, results } };
            const preview = open.data as { price: number; balance: number };
            if (preview.price > Number(input.maxCredit) - spent || preview.price > preview.balance)
              return observedEvent({ spent, purchases, results, stopped: 'credit_limit' });
            const result = await run('Mall@PurchaseSelected', { maxCredit: input.maxCredit });
            results.push(result);
            if (result.status !== 'completed' || !result.verified)
              return { ...result, data: { spent, purchases, results } };
            const price = Number((result.data as { price?: number }).price);
            if (!Number.isFinite(price) || price <= 0)
              throw new AtomicFailure('购买结果没有可归属价格', 'unknown');
            spent += price;
            purchases++;
            if (results.length > 20) results.shift();
            if (purchases >= 10 || spent >= Number(input.maxCredit))
              return observedEvent({ spent, purchases, results });
          }
        }
        return observedEvent({ spent, purchases, results });
      },
    },
  );
  return [...registrations, workflow];
}
