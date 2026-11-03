/** 通用帧像素解码：只处理宿主签发的 PNG，不包含页面几何、游戏识别或设备动作。 */
import { PNG } from 'pngjs';
import type { AtomicFrame } from '#automation/core/types';
import { AtomicFailure } from '#automation/core/errors';

export type FramePixels = { width: number; height: number; data: Uint8Array };
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maxEncodedBytes = 16 * 1024 * 1024;
const maxDimension = 4096;
const maxPixels = 16 * 1024 * 1024;

/** 先限制编码和 IHDR，再让成熟 PNG 解码器校验 CRC／压缩流；输出统一为 8 位 RGBA。 */
export function decodeFramePixels(frame: AtomicFrame): FramePixels {
  const encoded = frame.data.replace(/^data:image\/png;base64,/u, '');
  if (
    encoded.length > Math.ceil(maxEncodedBytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)
  )
    throw new AtomicFailure('帧 PNG 编码无效或超出 16 MiB 上限', 'unavailable');
  const bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.length < 33 ||
    bytes.length > maxEncodedBytes ||
    !bytes.subarray(0, 8).equals(signature) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  )
    throw new AtomicFailure('帧不是有效的有界 PNG', 'unavailable');
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (
    !width ||
    !height ||
    width > maxDimension ||
    height > maxDimension ||
    width * height > maxPixels ||
    width !== frame.width ||
    height !== frame.height ||
    bytes[24] !== 8
  )
    throw new AtomicFailure('PNG 像素尺寸、位深或宿主帧身份不一致', 'unavailable');
  try {
    const image = PNG.sync.read(bytes, { checkCRC: true });
    if (
      image.width !== width ||
      image.height !== height ||
      image.data.length !== width * height * 4
    )
      throw new Error('decoded frame dimensions changed');
    return { width, height, data: image.data };
  } catch {
    throw new AtomicFailure('帧 PNG 的校验或像素解码失败', 'unavailable');
  }
}
