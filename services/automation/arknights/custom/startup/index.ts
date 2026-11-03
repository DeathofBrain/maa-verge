/** startup 功能的受控公开入口；能力、静态图与资源适配分别维护。 */
export { createStartupCapabilities } from './capabilities';
export { loadStartupResourceProfile, startupReviewedRules } from './resources';
export { startupPipeline, startupEntries } from './definitions';
