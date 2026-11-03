/** startup 只登记经过审阅的单节点规则；不解释原 MAA 高层任务或 next 链。 */
import {
  loadReviewedResourceProfile,
  type ReviewedProfileOptions,
  type ReviewedRule,
} from '#automation/resources/maacore-adapter';
import type { AtomicResourceSource } from '#automation/resources/source';

export const startupReviewedRules = [
  { id: 'navigation.back', node: 'ReturnButton' },
  {
    id: 'home',
    node: 'StartUp',
  },
  {
    id: 'start',
    node: 'GameStart',
  },
  {
    id: 'wake',
    node: 'StartToWakeUpOCR',
  },
  {
    id: 'server',
    node: 'StartLoginBServer',
  },
  // 关闭图标显式指定真实模板，不能继承 CloseAnnoBase 的 empty.png 占位图。
  {
    id: 'popup.close',
    node: 'CloseAnno',
    template: 'CloseAnno.png',
  },
  {
    id: 'popup.supplies',
    node: 'TodaysSupplies',
  },
  {
    id: 'popup.supplies.close',
    node: 'TodaysSupplies',
    actionOnly: true,
  },
  // 标题来自已审阅的冷登录页面；只借用上游 OCR 算法，不执行签到或活动领奖链。
  // 同一关闭图标会连续出现在不同弹窗，标题消失才是本次关闭的后置证据。
  {
    id: 'popup.title',
    node: 'TodaysSupplies',
    roi: [0, 0, 1280, 720],
    expected: ['月签到', '限时签到', '许愿墙', '活动公告', '系统公告', '资讯速报'],
  },
  // 载入和资源准备只贡献等待证据，绝不点击下载、确认或帐号相关区域。
  { id: 'loading.icon', node: 'LoadingIcon' },
  { id: 'loading.text', node: 'LoadingText' },
  { id: 'loading.resource', node: 'GameStartCheckResourceOCR' },
  { id: 'loading.update', node: 'GameStartUpdateOCR' },
] as const satisfies readonly ReviewedRule[];

/** 宿主注入当前不可变资源代；缺失节点分别保留不可用诊断。 */
export function loadStartupResourceProfile(
  source: AtomicResourceSource | null,
  clientType = 'Official',
  options: ReviewedProfileOptions = {},
) {
  return loadReviewedResourceProfile(
    source,
    'startup',
    startupReviewedRules,
    ['tasks/hotfix/ocr_replace.json'],
    clientType,
    options,
  );
}
