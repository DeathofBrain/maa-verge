/** inventory 只登记经过审阅的单节点规则；不解释原 MAA 高层任务或 next 链。 */
import {
  loadReviewedResourceProfile,
  type ReviewedProfileOptions,
  type ReviewedRule,
} from '#automation/resources/maacore-adapter';
import type { AtomicResourceSource } from '#automation/resources/source';

export const inventoryReviewedRules = [
  {
    id: 'home',
    node: 'Depot',
  },
  {
    id: 'depot.entry',
    node: 'DepotDefault',
  },
  {
    id: 'operators.entry',
    node: 'OperBoxDefault',
  },
  {
    id: 'depot',
    node: 'DepotMaterialTabClicked',
  },
  { id: 'depot.materials', node: 'DepotMaterialTab' },
  { id: 'depot.all', node: 'DepotAllTab' },
  {
    id: 'operators',
    node: 'OperBoxRoleTab',
  },
] as const satisfies readonly ReviewedRule[];

/** 宿主注入当前不可变资源代；缺失节点分别保留不可用诊断。 */
export function loadInventoryResourceProfile(
  source: AtomicResourceSource | null,
  clientType = 'Official',
  options: ReviewedProfileOptions = {},
) {
  return loadReviewedResourceProfile(
    source,
    'inventory',
    inventoryReviewedRules,
    [
      'tasks/hotfix/ocr_replace.json',
      'tasks/UiTheme/Depot.json',
      'tasks/UiTheme/OperBox.json',
      'tasks/Copilot/formation.json',
    ],
    clientType,
    options,
  );
}
