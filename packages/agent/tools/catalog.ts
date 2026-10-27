import runtimeSchema from '../../contracts/schemas/runtime.schema.json';
import { taskLabels } from '../../contracts/src/tasks';
import type { Task } from '../../contracts/src/types';

export interface MaaTaskCatalogEntry {
  type: Task['type'];
  label: string;
  runtime: 'native' | 'application';
  availableVia: 'plan' | 'copilot' | 'unavailable';
  description: string;
}

const descriptions: Record<Task['type'], string> = {
  StartUp: '启动已绑定客户端；不接受切换账号参数。',
  CloseDown: '关闭已绑定客户端的游戏。',
  Fight: '按明确关卡与次数自动作战；默认一次，最多一百次，药石额度为零。',
  Recruit: '公开招募；不使用加急许可，不上传统计。',
  Infrast: '使用常规模式换班与基建操作；不接受本地排班文件。',
  Mall: '信用商店、好友访问与可配置购买；执行前需宿主授权。',
  Award: '领取已配置类别的游戏奖励；执行前需宿主授权。',
  SwitchTheme: '从指定候选中切换游戏主题。',
  Roguelike: '执行指定肉鸽主题；必须设置启动次数，草稿默认一次、最多十次。',
  Reclamation: '执行指定生息演算主题与模式；长任务须由宿主明确授权并可停止。',
  Depot: '通过原生识别采集仓库；以成功证据及核心空闲后的结果为准。',
  OperBox: '通过原生识别采集干员名单；缺失或未知字段不推断已拥有。',
  UserDataUpdate: '应用服务组合执行仓库与干员采集，不直接发送给 MaaCore。',
  Custom: '仅允许应用已审核的像素画与秘密战线资源入口；拒绝任意资源任务链。',
  Copilot: '通过已有普通作业工作区和不可变版本执行；使用作业工具，不接收文件路径。',
  SSSCopilot: '通过已有保全作业工作区和不可变版本执行；使用作业工具，不接收文件路径。',
  ParadoxCopilot: '通过已有悖论作业工作区和不可变版本执行；使用作业工具，不接收文件路径。',
  VideoRecognition: '当前 Agent 不开放本地视频文件读取与识别。',
  SingleStep: '当前 Agent 不开放原始单步战斗动作；相关核心契约与动作结果仍需单独验收。',
  OperProgress: '当前 Agent 不开放消耗材料的干员养成；尚无对应授权预算端口。',
};

/** A capability catalogue, never the UI's unbounded task defaults. */
export function maaTaskCatalog(): MaaTaskCatalogEntry[] {
  return runtimeSchema.$defs.Task.properties.type.enum.map((value): MaaTaskCatalogEntry => {
    const type = value as Task['type'];
    return {
      type,
      label: taskLabels[type],
      runtime: type === 'UserDataUpdate' ? 'application' : 'native',
      availableVia: ['Copilot', 'SSSCopilot', 'ParadoxCopilot'].includes(type)
        ? 'copilot'
        : ['VideoRecognition', 'SingleStep', 'OperProgress'].includes(type)
          ? 'unavailable'
          : 'plan',
      description: descriptions[type],
    };
  });
}
