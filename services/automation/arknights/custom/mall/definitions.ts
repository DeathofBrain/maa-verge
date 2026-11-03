/**
 * mall 的原语入口与业务链都静态登记；JSON 不执行原 MAA 高层任务。
 * 业务链首节点保留 MallDefault.postDelay 的 500 ms，等待商店入口页稳定后才选择信用标签。
 */
import primitives from '#pipeline/mall/primitives';
import workflows from '#pipeline/mall/workflows';
import daily from '#pipeline/mall/daily';
import { registerPipeline } from '#automation/pipeline/definitions';

export const mallPipeline = registerPipeline({
  'mall/primitives.json': primitives,
  'mall/workflows.json': workflows,
  'mall/daily.json': daily,
});
export const mallEntries: Readonly<Record<string, string>> = {
  'game.mall.choose_product': 'Mall@Event@ChooseProduct',
  'game.mall.open_product': 'Mall@Event@OpenProduct',
  'game.mall.purchase_selected': 'Mall@Event@PurchaseSelected',
  'game.mall.close_reward': 'Mall@Event@CloseReward',
  'game.mall.enter_friends': 'Mall@Event@EnterFriends',
  'game.mall.open_friend_list': 'Mall@Event@OpenFriendList',
  'game.mall.visit_first': 'Mall@Event@VisitFirst',
  'game.mall.visit_next': 'Mall@Event@VisitNext',
  'game.mall.read_visit': 'Mall@Event@ReadVisit',
  'observation.mall': 'Mall@observation@mall',
  'game.mall.enter': 'Mall@game@mall@enter',
  'game.mall.open_credit_store': 'Mall@game@mall@open_credit_store',
  'game.mall.collect_credit': 'Mall@game@mall@collect_credit',
  'game.mall.buy_current': 'Mall@game@mall@buy_current',
};
