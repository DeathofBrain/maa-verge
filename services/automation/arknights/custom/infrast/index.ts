/**
 * 基建组件公开入口：按功能统一导出领域约定、页面能力、业务策略与静态 Pipeline。
 * 使用者通过组件短路径导入；内部文件继续使用相对路径，避免组件入口与实现循环依赖。
 */
// 领域输入、观察证据和驱动边界。
export * from './types';
export * from './validation';
export * from './names';
export * from './plan';
export * from './strategy';

// 当前游戏的视觉观察、页面导航及业务结果核验。
export * from './observations';
export * from './driver';
export * from './workflows';
export * from './roster';
export * from './room';
export * from './preparations';

// 资源适配与能力提供者供宿主组合；仅构造组件不会操作设备。
export * from './resources';
export { createInfrastCapabilities } from './capabilities';

// 静态 JSON 注册和具名 Custom 适配；原生流转仍由官方 Tasker 执行。
export {
  infrastPipeline,
  infrastPipelineDefinitions,
  infrastCapabilityEntries,
} from './definitions';
export { runInfrastPipeline } from './pipeline';
