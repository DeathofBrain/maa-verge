/** award 只登记经过审阅的单节点规则；不解释原 MAA 高层任务或 next 链。 */
import {
  loadReviewedResourceProfile,
  type ReviewedProfileOptions,
  type ReviewedRule,
} from '#automation/resources/maacore-adapter';
import type { AtomicResourceSource } from '#automation/resources/source';

export const awardReviewedRules = [
  { id: 'mail.entry', node: 'Mail' },
  { id: 'mail.noaward', node: 'MailWithoutAward' },
  { id: 'mail.claim', node: 'ReceiveMail' },
  { id: 'mail.close', node: 'CloseTaskMail', actionOnly: true },
  {
    id: 'home',
    node: 'Award',
  },
  {
    id: 'entry',
    node: 'TaskDefault',
  },
  {
    id: 'weekly',
    node: 'WeeklyTask',
  },
  {
    id: 'daily',
    node: 'DailyTask',
    expectedMove: [-150, 0, 100, 30],
  },
  {
    id: 'weekly.active',
    node: 'AwardFinished',
  },
  {
    id: 'claim',
    node: 'ReceiveAward',
  },
  {
    id: 'obtained',
    node: 'CreditShop-Bought',
  },
  {
    id: 'close',
    node: 'CloseTaskAward',
    actionOnly: true,
  },
  // 主页仍会透过公告或配给覆盖层被命中；这些证据只阻止输入，不负责关闭。
  { id: 'popup.close', node: 'CloseAnno', template: 'CloseAnno.png' },
  { id: 'popup.supplies', node: 'TodaysSupplies' },
] as const satisfies readonly ReviewedRule[];

/** 宿主注入当前不可变资源代；缺失节点分别保留不可用诊断。 */
export function loadAwardResourceProfile(
  source: AtomicResourceSource | null,
  clientType = 'Official',
  options: ReviewedProfileOptions = {},
) {
  return loadReviewedResourceProfile(
    source,
    'award',
    awardReviewedRules,
    ['tasks/hotfix/ocr_replace.json', 'tasks/UiTheme/Task.json'],
    clientType,
    options,
  );
}
