/** award 的原语入口与业务链都静态登记；JSON 不执行原 MAA 高层任务。 */
import primitives from '#pipeline/award/primitives';
import workflows from '#pipeline/award/workflows';
import mail from '#pipeline/award/mail';
import { registerPipeline } from '#automation/pipeline/definitions';

export const awardPipeline = registerPipeline({
  'award/primitives.json': primitives,
  'award/workflows.json': workflows,
  'award/mail.json': mail,
});
export const awardEntries: Readonly<Record<string, string>> = {
  'game.award.mail_enter': 'Award@Mail@Enter',
  'game.award.mail_claim': 'Award@Mail@Claim',
  'game.award.mail_close': 'Award@Mail@Close',
  'observation.award': 'Award@observation@award',
  'game.award.enter': 'Award@game@award@enter',
  'game.award.select_daily': 'Award@game@award@select_daily',
  'game.award.select_weekly': 'Award@game@award@select_weekly',
  'game.award.claim_current': 'Award@game@award@claim_current',
  'game.award.close_reward': 'Award@game@award@close_reward',
};
