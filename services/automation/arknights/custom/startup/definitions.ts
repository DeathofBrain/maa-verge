/** startup 的原语入口与业务链都静态登记；JSON 不执行原 MAA 高层任务。 */
import primitives from '#pipeline/startup/primitives';
import workflows from '#pipeline/startup/workflows';
import lifecycle from '#pipeline/startup/lifecycle';
import { registerPipeline } from '#automation/pipeline/definitions';

export const startupPipeline = registerPipeline({
  'startup/primitives.json': primitives,
  'startup/workflows.json': workflows,
  'startup/lifecycle.json': lifecycle,
});
export const startupEntries: Readonly<Record<string, string>> = {
  'game.startup.return_home': 'Startup@ReturnHome',
  'observation.startup': 'Startup@observation@startup',
  'game.startup.login_step': 'Startup@game@startup@login_step',
};
