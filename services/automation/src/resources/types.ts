import type { AtomicBox } from '../core/types';

/** 已适配规则与资源的来源，可由各游戏功能附加原文件摘要。 */
export type AtomicSource = {
  repository: string;
  ref: string;
  path: string;
  node?: string;
  sha256?: string;
};

/** 通用识别参数；不解释任何游戏的任务图或页面语义。 */
export type AtomicRule = {
  id: string;
  kind: 'template' | 'ocr' | 'color';
  roi?: AtomicBox;
  templateId?: string;
  threshold?: number;
  maskRange?: [number, number];
  expected?: string[];
  replace?: [string, string][];
  onlyRec?: boolean;
  lower?: number[];
  upper?: number[];
  method?: number | 'RGBCount';
  pureColor?: boolean;
  colorScales?: [number[], number[]][];
  colorWithClose?: boolean;
  nmsDistance?: number;
  count?: number;
  source: AtomicSource;
};

/** 视觉原语只需要识别规则与固定动作，不依赖游戏布局或业务状态。 */
export type VisionResourceProfile = {
  rules: Record<string, AtomicRule>;
  actions: Record<string, { box?: AtomicBox; delayMs: number }>;
};
