import { BookOpen, Bot, History, House, ListChecks, Wrench } from 'lucide-react';
import type { Plan } from '@maaverge/contracts';

export type Page =
  'home' | 'tasks' | 'copilot' | 'tools' | 'agent' | 'history' | 'devices' | 'settings';
export type Message = { id: string; role: 'user' | 'assistant'; text: string; plan?: Plan };
export const navigation = [
  { id: 'home', label: '主页', icon: House },
  { id: 'tasks', label: '任务', icon: ListChecks },
  { id: 'copilot', label: '作业中心', icon: BookOpen },
  { id: 'tools', label: '工具箱', icon: Wrench },
  { id: 'agent', label: 'Agent 助手', icon: Bot },
  { id: 'history', label: '执行记录', icon: History },
] as const;
export const pageNames: Record<Page, string> = {
  home: '主页',
  tasks: '任务',
  copilot: '作业中心',
  tools: '工具箱',
  agent: 'Agent 助手',
  history: '执行记录',
  devices: '设备',
  settings: '设置',
};
