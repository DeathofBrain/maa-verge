/** 不依赖游戏的区域组合与排序；坐标空间及容差由调用功能提供。 */
import type { AtomicBox, AtomicMatch } from '../core/types';

export const moveBox = (anchor: AtomicBox, offset: AtomicBox): AtomicBox => [
  anchor[0] + offset[0],
  anchor[1] + offset[1],
  offset[2],
  offset[3],
];

/** 按列、列内按纵坐标排序；列容差由具体页面提供。 */
export const orderMatches = (matches: AtomicMatch[], columnTolerance: number) =>
  [...matches].sort((a, b) =>
    Math.abs(a.box[0] - b.box[0]) < columnTolerance ? a.box[1] - b.box[1] : a.box[0] - b.box[0],
  );
