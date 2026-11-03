/** mall 只登记经过审阅的单节点规则；不解释原 MAA 高层任务或 next 链。 */
import {
  loadReviewedResourceProfile,
  type ReviewedProfileOptions,
  type ReviewedRule,
} from '#automation/resources/maacore-adapter';
import type { AtomicResourceSource } from '#automation/resources/source';

export const mallReviewedRules = [
  { id: 'reward.close', node: 'CreditShop-Bought', actionOnly: true },
  {
    id: 'product.name',
    node: 'CreditShop-ProductName',
    roi: [0, 0, 1280, 720],
    expectedRoi: [0, -30, 220, 70],
  },
  {
    id: 'product.discount',
    node: 'CreditShop-DiscountOcr',
    roi: [0, 0, 1280, 720],
    expectedRoi: [-5, 23, 65, 30],
  },
  { id: 'product.sold', node: 'CreditShop-SoldOut' },
  { id: 'product.card', node: 'CreditShop-Commodities', expectedMove: [-60, -180, 220, 220] },
  { id: 'friends.home', node: 'Visit' },
  { id: 'friends.entry', node: 'FriendsDefault' },
  { id: 'friends.list', node: 'FriendsList' },
  { id: 'friends.first', node: 'StartToVisit', rgbPureColor: true },
  { id: 'friends.next', node: 'VisitNextOcr' },
  { id: 'friends.limit', node: 'VisitLimited' },
  { id: 'friends.empty', node: 'NoFriends' },
  {
    id: 'home',
    node: 'Mall',
  },
  {
    id: 'entry',
    node: 'MallDefault',
  },
  {
    id: 'store',
    node: 'CreditStoreOcr',
  },
  {
    id: 'recommended.active',
    node: 'CreditStoreFailed',
  },
  {
    // 只复用上游全屏信用货币图标；rectMove 是商品操作偏移，不作为页面识别区域。
    id: 'credit.currency',
    node: 'CreditShop-Commodities',
  },
  {
    id: 'collect',
    node: 'CollectCredit',
  },
  {
    id: 'balance',
    node: 'CreditShop-CreditOcr',
  },
  {
    id: 'buy',
    node: 'CreditShop-BuyIt',
  },
  {
    id: 'currency',
    node: 'CreditShop-Commodities',
    roi: [800, 500, 250, 150],
  },
  {
    id: 'obtained',
    node: 'CreditShop-Bought',
  },
  {
    id: 'close',
    node: 'CloseCollectCredit',
    actionOnly: true,
  },
] as const satisfies readonly ReviewedRule[];

/** 宿主注入当前不可变资源代；缺失节点分别保留不可用诊断。 */
export function loadMallResourceProfile(
  source: AtomicResourceSource | null,
  clientType = 'Official',
  options: ReviewedProfileOptions = {},
) {
  return loadReviewedResourceProfile(
    source,
    'mall',
    mallReviewedRules,
    ['tasks/hotfix/ocr_replace.json', 'tasks/UiTheme/Mall.json', 'tasks/UiTheme/Friends.json'],
    clientType,
    options,
  );
}
