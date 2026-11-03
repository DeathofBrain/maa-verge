/** 静态登记同一层的基建 JSON；新增文件在此合并，节点名称可跨文件引用。 */
import base from '#pipeline/infrast/base';
import overview from '#pipeline/infrast/overview';
import trim from '#pipeline/infrast/trim';
import operators from '#pipeline/infrast/operators';
import training from '#pipeline/infrast/training';
import capabilities from '#pipeline/infrast/capabilities';
import room from '#pipeline/infrast/room';
import { registerPipeline } from '#automation/pipeline/definitions';

// 静态导入让各 JSON 随 Bun 编译嵌入；合并时拒绝节点重名、无效边和未登记目标。
export const infrastPipeline = registerPipeline({
  'infrast/base.json': base,
  'infrast/overview.json': overview,
  'infrast/trim.json': trim,
  'infrast/operators.json': operators,
  'infrast/training.json': training,
  'infrast/capabilities.json': capabilities,
  'infrast/room.json': room,
});

// 保留既有定义导出；运行时通过注册对象取得本次入口可达副本。
export const infrastPipelineDefinitions = infrastPipeline.definitions;

/** 能力 ID 与 JSON 入口一一对应；新增 L3 能力须同时提供明确的原生执行入口。 */
export const infrastCapabilityEntries = {
  'observation.trim': 'Infrast@Primitive@ReadTrim',
  'game.infrast.trim': 'Infrast@Primitive@Trim',
  'game.infrast.enter_trim': 'Infrast@Primitive@EnterTrim',
  'game.infrast.rotate_queue': 'Infrast@Primitive@RotateQueue',
  'game.infrast.read_roster': 'Infrast@Primitive@ReadRoster',
  'game.infrast.reset_filter': 'Infrast@Primitive@ResetFilter',
  'game.infrast.page_roster': 'Infrast@Primitive@PageRoster',
  'game.infrast.select_operator': 'Infrast@Primitive@SelectOperator',
  'game.infrast.clear_roster': 'Infrast@Primitive@ClearRoster',
  'game.infrast.open_roster': 'Infrast@Primitive@OpenRoster',
  'game.infrast.open_room': 'Infrast@Primitive@OpenRoom',
  'observation.base': 'Infrast@Primitive@ObserveBase',
  'observation.operators': 'Infrast@Primitive@ReadOperators',
  'observation.overview': 'Infrast@Primitive@ReadOverview',
  'observation.training': 'Infrast@Primitive@ReadTraining',
  'game.infrast.enter_overview': 'Infrast@Primitive@EnterOverview',
  'game.infrast.resolve_rooms': 'Infrast@Primitive@ResolveRooms',
  'game.infrast.enumerate_rooms': 'Infrast@Primitive@EnumerateRooms',
  'game.infrast.read_room': 'Infrast@Primitive@ReadRoom',
  'game.infrast.prepare_roster': 'Infrast@Primitive@PrepareRoster',
  'game.infrast.prepare_auto_roster': 'Infrast@Primitive@PrepareAutoRoster',
  'game.infrast.confirm': 'Infrast@Primitive@Confirm',
  'game.infrast.verify_room': 'Infrast@Primitive@VerifyRoom',
  'game.infrast.set_room': 'Infrast@Workflow@SetRoom',
  'workflow.infrast.queue_rotate': 'Infrast@Workflow@RotateQueue',
  'workflow.infrast.trim': 'Infrast@Workflow@Trim',
  'workflow.infrast.overview_shift': 'Infrast@Workflow@OverviewShift',
  'workflow.infrast.room_shift': 'Infrast@Workflow@RoomShift',
  'workflow.infrast.custom_shift': 'Infrast@Workflow@CustomShift',
  'workflow.infrast.auto_room_shift': 'Infrast@Workflow@AutoRoomShift',
  'workflow.infrast.daily': 'Infrast@Workflow@Daily',
} as const;
