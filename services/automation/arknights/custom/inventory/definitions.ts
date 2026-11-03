/** inventory 的原语入口与业务链都静态登记；JSON 不执行原 MAA 高层任务。 */
import primitives from '#pipeline/inventory/primitives';
import workflows from '#pipeline/inventory/workflows';
import { registerPipeline } from '#automation/pipeline/definitions';

export const inventoryPipeline = registerPipeline({
  'inventory/primitives.json': primitives,
  'inventory/workflows.json': workflows,
});
export const inventoryEntries: Readonly<Record<string, string>> = {
  'observation.inventory.depot': 'Inventory@observation@inventory@depot',
  'observation.inventory.operators': 'Inventory@observation@inventory@operators',
  'game.inventory.enter_depot': 'Inventory@game@inventory@enter_depot',
  'game.inventory.select_materials': 'Inventory@game@inventory@select_materials',
  'game.inventory.enter_operators': 'Inventory@game@inventory@enter_operators',
};
