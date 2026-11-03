/** 信用商店只执行明确页面事件；购买提交前分别确认货币、价格、余额及显式信用预算。 */
import type { AtomicExecutionPort } from '#automation/core/types';
import { AtomicFailure } from '#automation/core/errors';
import type { ReviewedResourceProfile } from '#automation/resources/maacore-adapter';
import {
  observedEvent,
  registerReviewedEvents,
  reviewedWorkflow,
} from '#automation/composites/reviewed-event';
import { mallEntries, mallPipeline } from './definitions';
import { createShoppingCapabilities } from './shopping';
import { createFriendsCapabilities } from './friends';

import { number, creditPage, creditPageRules } from './observations';

export function createMallCapabilities(
  port: AtomicExecutionPort,
  profile: ReviewedResourceProfile,
) {
  const registrations = registerReviewedEvents(
    port,
    profile,
    [
      {
        id: 'observation.mall',
        label: '读取信用商店当前页',
        description: '同帧确认信用交易所选中页后读取收取按钮与余额；不购买任何物品。',
        effect: 'observe',
        rules: [...creditPageRules, 'balance'],
        async run(vision) {
          const frame = await vision.frame();
          const page = await creditPage(vision, frame);
          if (!page.active) throw new AtomicFailure('未确认信用交易所选中页；未读取余额');
          const { frame: _frame, ...balance } = await vision.matches('balance', frame);
          return observedEvent({
            frameId: frame.frameId,
            evidence: { ...page.evidence, balance },
            credit: number(balance.matches) ?? null,
          });
        },
      },
      {
        id: 'game.mall.enter',
        label: '从主页进入商店',
        description: '只点击已审阅默认主题商店入口；不自动选择付费商品。',
        effect: 'input',
        rules: ['home', 'entry', 'store'],
        async run(vision) {
          if ((await vision.matches('store')).hit) return observedEvent({ changed: false });
          if (!(await vision.matches('home')).hit)
            throw new AtomicFailure('当前不是主页或已知商店页面');
          return observedEvent(await vision.clickOnce('entry', ['store']));
        },
      },
      {
        id: 'game.mall.open_credit_store',
        label: '打开信用交易所',
        description: '只点击信用交易所标签一次，以推荐页标记消失及信用专属证据确认目标页。',
        effect: 'input',
        rules: [...creditPageRules],
        async run(vision, _input, context) {
          const frame = await vision.frame();
          const page = await creditPage(vision, frame);
          if (page.active)
            return observedEvent({ changed: false, frameId: frame.frameId, ...page });
          if (!page.evidence.store.hit) throw new AtomicFailure('未确认信用交易所标签；未执行输入');
          const target = [...page.evidence.store.matches].sort((a, b) => b.score - a.score)[0]!;
          await vision.click(frame, target.box);
          // 页面切换只输入一次；数字不能证明切页成功，后续轮询只复核同帧页面证据。
          const deadline = Math.min(Date.now() + 5000, context.deadline ?? Infinity);
          do {
            const afterFrame = await vision.frame();
            const after = await creditPage(vision, afterFrame);
            if (after.active)
              return observedEvent({ changed: true, frameId: afterFrame.frameId, ...after });
            const remaining = deadline - Date.now();
            if (remaining <= 0) break;
            await vision.wait(Math.min(250, remaining));
          } while (Date.now() <= deadline);
          throw new AtomicFailure('打开信用交易所后缺少页面证据；结果未知，禁止重放', 'unknown');
        },
      },
      {
        id: 'game.mall.collect_credit',
        label: '收取一次信用',
        description: '点击收取一次后只复读；必须出现获得物资图标或明确余额增加，确认丢失不重放。',
        effect: 'commit',
        rules: [...creditPageRules, 'balance', 'obtained'],
        async run(vision, _input, context) {
          const frame = await vision.frame();
          if ((await vision.matches('obtained', frame)).hit)
            throw new AtomicFailure('当前已有获得物资弹窗；不能归因于新的信用收取');
          const page = await creditPage(vision, frame);
          if (!page.active) throw new AtomicFailure('未确认信用交易所选中页；未读取余额或收取');
          const before = number((await vision.matches('balance', frame)).matches);
          const collect = page.evidence.collect;
          if (!collect.hit) {
            if (before === undefined) throw new AtomicFailure('收取按钮与余额证据均不存在');
            return observedEvent({ changed: false, credit: before, claimVisible: false });
          }
          await vision.click(frame, collect.matches[0]!.box);
          const deadline = Math.min(Date.now() + 5000, context.deadline ?? Infinity);
          do {
            const afterFrame = await vision.frame();
            const { frame: _frame, ...obtained } = await vision.matches('obtained', afterFrame);
            if (obtained.hit)
              return observedEvent({
                changed: true,
                before,
                credit: null,
                frameId: afterFrame.frameId,
                evidence: { obtained },
              });
            // 收取后若离开信用页，不读取其他页面同位置数字，更不能当作余额增长。
            const afterPage = await creditPage(vision, afterFrame);
            if (afterPage.active) {
              const { frame: _balanceFrame, ...balance } = await vision.matches(
                'balance',
                afterFrame,
              );
              const credit = number(balance.matches);
              if (before !== undefined && credit !== undefined && credit > before)
                return observedEvent({
                  changed: true,
                  before,
                  credit,
                  frameId: afterFrame.frameId,
                  evidence: { ...afterPage.evidence, obtained, balance },
                });
            }
            const remaining = deadline - Date.now();
            if (remaining <= 0) break;
            await vision.wait(Math.min(250, remaining));
          } while (Date.now() < deadline);
          throw new AtomicFailure('信用收取后缺少获得物资或余额增加证据；禁止重放', 'unknown');
        },
      },
      {
        id: 'game.mall.buy_current',
        label: '预算内确认当前信用商品',
        description:
          '默认预算零；只购买当前已打开确认页的一件商品，要求唯一整数价钱、信用图标及可读余额，获得物资证据确认。',
        effect: 'commit',
        rules: ['buy', 'currency', 'balance', 'obtained'],
        async run(vision, input) {
          const budget = Number(input.maxCredit ?? 0);
          if (budget <= 0)
            throw new AtomicFailure('信用购买预算默认为零；请显式提供正整数 maxCredit');
          const frame = await vision.frame();
          if ((await vision.matches('obtained', frame)).hit)
            throw new AtomicFailure('当前已有获得物资弹窗；未再次提交购买');
          const buy = await vision.matches('buy', frame);
          if (!buy.hit || !(await vision.matches('currency', frame)).hit)
            throw new AtomicFailure('未确认当前购买按钮使用信用货币');
          const roi = vision.rule('buy').roi;
          if (!roi) throw new AtomicFailure('缺少已审阅购买价格区域', 'unavailable');
          const price = number((await vision.texts(frame, roi)).matches);
          // 购买确认页由同帧购买按钮和信用货币图标确认；余额本身不承担页面识别。
          const balance = number((await vision.matches('balance', frame)).matches);
          if (price === undefined || price <= 0 || balance === undefined)
            throw new AtomicFailure('价钱或余额不是唯一完整整数；未提交购买');
          if (price > budget || price > balance)
            throw new AtomicFailure('当前信用商品超过明确预算或可用余额');
          // 只使用这张已核对货币、价钱与余额的帧提交一次；之后只有只读确认。
          await vision.click(frame, buy.matches[0]!.box);
          return observedEvent({
            price,
            maxCredit: budget,
            ...(await vision.waitFor(['obtained'], 5000)),
          });
        },
      },
    ],
    mallPipeline,
    mallEntries,
    [1280, 720],
  );
  registrations.push(
    reviewedWorkflow(
      'workflow.mall.collect_credit',
      '进入并收取信用',
      '从默认主题主页进入信用交易所，只收取免费信用，不调用购买能力。',
      mallPipeline,
      'Mall@CollectCredit',
      ['game.mall.enter', 'game.mall.open_credit_store', 'game.mall.collect_credit'],
      registrations,
    ),
  );
  return [
    ...registrations,
    ...createShoppingCapabilities(port, profile, registrations),
    ...createFriendsCapabilities(port, profile),
  ];
}
