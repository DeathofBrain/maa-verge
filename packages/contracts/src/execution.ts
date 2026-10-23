import { taskLabels } from './tasks';

const labels: Record<string, string> = {
  ...taskLabels, Start: '开始', ProcessTask: '流程任务', StartButton1: '准备作战', StartButton2: '开始作战',
  EndOfAction: '作战结算', EndOfActionAnnihilation: '剿灭结算', MedicineConfirm: '使用理智药', StoneConfirm: '使用源石',
  RecruitRefreshConfirm: '刷新招募标签', RecruitConfirm: '确认招募', RecruitNowConfirm: '使用加急许可',
  InfrastDormDoubleConfirmButton: '确认基建干员调换', StartExplore: '开始探索', StageDrops: '作战掉落',
  EnterFacility: '进入基建设施', ProductOfFacility: '基建设施产物', InfrastConfirmButton: '确认基建换班',
};
/** Translate protocol identifiers only; preserve unknown diagnostics for review. */
export function localizeExecutionMessage(message: string): string {
  return message.replace(/[A-Za-z][A-Za-z0-9]*(?:@[A-Za-z][A-Za-z0-9]*)?/g, token => token.split('@').map(part => labels[part] ?? part).join(' · '));
}
