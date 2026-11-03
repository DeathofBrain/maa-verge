/** fight 的原语入口与业务链都静态登记；JSON 不执行原 MAA 高层任务。 */
import primitives from '#pipeline/fight/primitives';
import workflows from '#pipeline/fight/workflows';
import navigation from '#pipeline/fight/navigation';
import battle from '#pipeline/fight/battle';
import { registerPipeline } from '#automation/pipeline/definitions';

export const fightPipeline = registerPipeline({
  'fight/primitives.json': primitives,
  'fight/workflows.json': workflows,
  'fight/navigation.json': navigation,
  'fight/battle.json': battle,
});
export const fightEntries: Readonly<Record<string, string>> = {
  'game.fight.set_series': 'Fight@SetSeries',
  'game.fight.read_drops': 'Fight@ReadDrops',
  'game.fight.open_terminal': 'Fight@Navigation@OpenTerminal',
  'game.fight.open_episode': 'Fight@Navigation@OpenEpisode',
  'game.fight.select_stage': 'Fight@Navigation@SelectStage',
  'game.fight.replenish': 'Fight@Replenish',
  'observation.fight': 'Fight@observation@fight',
  'game.fight.enable_agent': 'Fight@game@fight@enable_agent',
  'game.fight.prepare': 'Fight@game@fight@prepare',
  'game.fight.start': 'Fight@game@fight@start',
  'game.fight.read_result': 'Fight@game@fight@read_result',
  'game.fight.wait_result': 'Fight@game@fight@wait_result',
  'game.fight.dismiss_result': 'Fight@game@fight@dismiss_result',
};
