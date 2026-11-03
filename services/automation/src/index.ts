/**
 * 自动化能力的公共入口：通用原语、Pipeline 和能力目录独立于游戏；各游戏功能自己维护
 * 观察、驱动、策略与资源适配。backend 由此导入，并注入执行与资源读取端口；
 * 设备控制权、原生进程和业务存储的生命周期仍由宿主管理。
 */
export * from './core/types';
export * from './core/errors';
export * from './primitives/vision';
export * from './composites/capabilities';
export { moveBox, orderMatches } from './primitives/geometry';
export { decodeFramePixels, type FramePixels } from './primitives/image';
export { createPrimitiveCapabilities } from './primitives/capabilities';
export * from './pipeline/definitions';
export * from './pipeline/runtime';
export * from './pipeline/bindings';
export * from './pipeline/invocation';
export { createVisionHandlers } from './pipeline/handlers';
export * from './registry/types';
export { createCapabilityRegistry } from './registry/catalog';
export * from './registry/components';
export * from './resources/types';
export * from './resources/source';
export * from './resources/maacore-adapter';
export * from '#components/infrast';
export * from '#components/legacy';
export {
  automation,
  compileLegacyTask,
  getLegacyTaskCompatibility,
  validateCompiledLegacyTaskInputs,
  createAtomicCapabilityRegistry,
  loadAutomationResourceProfiles,
  type AutomationOptions,
  type DailyFeature,
  type DailyProfiles,
} from './registry';
