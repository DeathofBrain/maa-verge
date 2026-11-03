/** fight 功能的受控公开入口；能力、静态图与资源适配分别维护。 */
export { createFightCapabilities } from './capabilities';
export { legacyStageRoute } from './navigation';
export {
  loadFightResourceProfile,
  fightReviewedRules,
  checkFightInputs,
  type FightResourceProfile,
} from './resources';
export { fightPipeline, fightEntries } from './definitions';
