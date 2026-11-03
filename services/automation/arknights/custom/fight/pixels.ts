/** 结算基线只读宿主帧像素；PNG安全解码复用通用原语，游戏几何单独维护。 */
import { AtomicFailure } from '#automation/core/errors';
import type { AtomicBox } from '#automation/core/types';
import { decodeFramePixels, type FramePixels } from '#automation/primitives/image';

export type FightPixels = FramePixels;
export const decodeFightFrame = decodeFramePixels;

/** 和识别原语共用 1280×720 参考坐标；双线性采样只处理基线附近需要的像素。 */
export function referencePixel(image: FightPixels, x: number, y: number, channel: number): number {
  const px = Math.max(0, Math.min(image.width - 1, ((x + 0.5) * image.width) / 1280 - 0.5));
  const py = Math.max(0, Math.min(image.height - 1, ((y + 0.5) * image.height) / 720 - 0.5));
  const x0 = Math.floor(px),
    y0 = Math.floor(py),
    x1 = Math.min(x0 + 1, image.width - 1),
    y1 = Math.min(y0 + 1, image.height - 1);
  const value = (sx: number, sy: number) => image.data[(sy * image.width + sx) * 4 + channel]!;
  return Math.round(
    (value(x0, y0) * (1 - (px - x0)) + value(x1, y0) * (px - x0)) * (1 - (py - y0)) +
      (value(x0, y1) * (1 - (px - x0)) + value(x1, y1) * (px - x0)) * (py - y0),
  );
}

/** 官方 StageDropsImageAnalyzer 的纵向导数、3×1闭运算、灰度阈值和水平分段。 */
export function fightBaselines(
  image: FightPixels,
  layout: {
    roi: AtomicBox;
    range: [number, number];
    minWidth: number;
    maxSpacing: number;
  },
): AtomicBox[] {
  const [left, top, width, height] = layout.roi;
  const rows = Array.from({ length: height }, () => new Uint8Array(width));
  // filter2D 的四行核锚点为2：[-1,+1,+1,-1]；先各通道饱和，再灰度化。
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const channel = (cx: number, c: number) =>
        Math.max(
          0,
          Math.min(
            255,
            -referencePixel(image, cx, top + y - 2, c) +
              referencePixel(image, cx, top + y - 1, c) +
              referencePixel(image, cx, top + y, c) -
              referencePixel(image, cx, top + y + 1, c),
          ),
        );
      const closed = (c: number) =>
        Math.min(
          ...[-1, 0, 1].map((dx) =>
            Math.max(
              ...[-1, 0, 1].map((ex) =>
                channel(Math.max(0, Math.min(1279, left + x + dx + ex)), c),
              ),
            ),
          ),
        );
      const gray = Math.round(closed(0) * 0.299 + closed(1) * 0.587 + closed(2) * 0.114);
      rows[y]![x] = gray >= layout.range[0] && gray <= layout.range[1] ? 1 : 0;
    }
  const active = Array.from({ length: width }, (_, x) => rows.some((row) => row[x] === 1));
  const first = active.indexOf(true),
    last = active.lastIndexOf(true);
  if (first < 0) throw new AtomicFailure('未识别到结算掉落基线', 'unknown');
  const ys = rows.map((row, y) => (row.some(Boolean) ? y : -1)).filter((y) => y >= 0);
  const result: AtomicBox[] = [];
  let start = first,
    inside = true,
    spacing = 0;
  for (let x = first; x <= last; x++) {
    if (inside && !active[x]) {
      inside = false;
      const length = x - start;
      if (length >= layout.minWidth) {
        result.push([left + start, top + ys[0]!, length, ys.at(-1)! - ys[0]! + 1]);
        spacing = 0;
      } else spacing += length;
    } else if (!inside && active[x]) {
      start = x;
      inside = true;
    } else if (!inside && ++spacing > layout.maxSpacing && start !== first) break;
  }
  if (inside && last - start >= layout.minWidth)
    result.push([left + start, top + ys[0]!, last - start, ys.at(-1)! - ys[0]! + 1]);
  // 屏幕右边裁切的材料需要上游拼接算法；当前有限端口明确阻断，不能将隐藏目标记为零。
  if (!result.length || left + last >= 1280 * 0.95)
    throw new AtomicFailure('结算掉落区域不完整，需要尚未适配的横向拼接', 'unavailable');
  return result;
}
