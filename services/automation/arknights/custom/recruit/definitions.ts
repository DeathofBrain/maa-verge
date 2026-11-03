/** recruit 的原语入口与业务链都静态登记；JSON 不执行原 MAA 高层任务。 */
import primitives from '#pipeline/recruit/primitives';
import workflows from '#pipeline/recruit/workflows';
import daily from '#pipeline/recruit/daily';
import { registerPipeline } from '#automation/pipeline/definitions';

export const recruitPipeline = registerPipeline({
  'recruit/primitives.json': primitives,
  'recruit/workflows.json': workflows,
  'recruit/daily.json': daily,
});
export const recruitEntries: Readonly<Record<string, string>> = {
  'game.recruit.read_slots': 'Recruit@Event@ReadSlots',
  'game.recruit.open_slot': 'Recruit@Event@OpenSlot',
  'game.recruit.read_plan': 'Recruit@Event@ReadPlan',
  'game.recruit.refresh': 'Recruit@Event@Refresh',
  'game.recruit.prepare': 'Recruit@Event@Prepare',
  'game.recruit.confirm': 'Recruit@Event@Confirm',
  'game.recruit.leave': 'Recruit@Event@Leave',
  'game.recruit.dismiss_result': 'Recruit@DismissResult',
  'observation.recruit': 'Recruit@observation@recruit',
  'game.recruit.enter': 'Recruit@game@recruit@enter',
  'game.recruit.collect_finished': 'Recruit@game@recruit@collect_finished',
  'game.recruit.skip_reveal': 'Recruit@game@recruit@skip_reveal',
  'game.recruit.read_result': 'Recruit@game@recruit@read_result',
};
