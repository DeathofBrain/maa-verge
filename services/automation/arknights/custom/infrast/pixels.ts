/** 基建卡片的像素语义：沿用已审阅的心情条和技能亮度算法，不解析 PNG 或操作设备。 */
import type { FramePixels } from '#automation/primitives/image';
import type { AtomicBox } from '#automation/core/types';

/** 参考画布与 Framework 识别一致；双线性缩放后按 OpenCV 的整数灰度系数计算。 */
function gray(pixels: FramePixels, x: number, y: number): number {
  const px = Math.max(0, Math.min(pixels.width - 1, ((x + 0.5) * pixels.width) / 1280 - 0.5));
  const py = Math.max(0, Math.min(pixels.height - 1, ((y + 0.5) * pixels.height) / 720 - 0.5));
  const left = Math.floor(px),
    top = Math.floor(py),
    dx = px - left,
    dy = py - top;
  const channel = (x: number, y: number, c: number) => pixels.data[(y * pixels.width + x) * 4 + c]!;
  const rgb = [0, 1, 2].map((c) =>
    Math.round(
      channel(left, top, c) * (1 - dx) * (1 - dy) +
        channel(Math.min(left + 1, pixels.width - 1), top, c) * dx * (1 - dy) +
        channel(left, Math.min(top + 1, pixels.height - 1), c) * (1 - dx) * dy +
        channel(Math.min(left + 1, pixels.width - 1), Math.min(top + 1, pixels.height - 1), c) *
          dx *
          dy,
    ),
  );
  return (4899 * rgb[0]! + 9617 * rgb[1]! + 1868 * rgb[2]! + 8192) >> 14;
}

/** 官方 InfrastOperImageAnalyzer::mood_analyze 的首段最长亮条；不把 20/24 当人数。 */
export function moodProgress(
  pixels: FramePixels,
  roi: AtomicBox,
  lower: number,
  difference: number,
): number {
  let maximum = 0;
  for (let y = 0; y < roi[3]; y++) {
    let length = 0,
      previous = lower;
    for (let x = 0; x < roi[2]; x++) {
      const value = gray(pixels, roi[0] + x, roi[1] + y);
      if (value < lower || previous >= value + difference) break;
      previous = value;
      maximum = Math.max(maximum, ++length);
    }
  }
  return maximum / roi[2];
}

/** 官方 skill_analyze 使用中心圆形掩码的平均灰度，暗技能不参与设施适配。 */
export function skillBrightness(pixels: FramePixels, roi: AtomicBox): number {
  const radius = roi[3] / 2;
  let count = 0,
    sum = 0;
  for (let y = 0; y < roi[3]; y++)
    for (let x = 0; x < roi[2]; x++) {
      if ((x - radius) ** 2 + (y - radius) ** 2 > radius ** 2) continue;
      sum += gray(pixels, roi[0] + x, roi[1] + y);
      count++;
    }
  return count ? sum / count : 0;
}
