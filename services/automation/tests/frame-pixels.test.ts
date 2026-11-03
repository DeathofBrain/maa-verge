/** PNG 解析验证编码、资源上限与帧身份；不加载界面、不作外观断言。 */
import { expect, test } from 'bun:test';
import { PNG } from 'pngjs';
import { decodeFramePixels } from '@maaverge/automation';

function frame() {
  const image = new PNG({ width: 2, height: 1 });
  image.data.set([1, 2, 3, 255, 200, 201, 202, 255]);
  return {
    frameId: 'synthetic',
    width: 2,
    height: 1,
    data: PNG.sync.write(image).toString('base64'),
  };
}
test('valid bounded PNG data retains the host frame dimensions and RGBA samples', () => {
  const input = frame();
  const decoded = decodeFramePixels(input);
  expect([...decoded.data]).toEqual([1, 2, 3, 255, 200, 201, 202, 255]);
  expect(decodeFramePixels({ ...input, data: `data:image/png;base64,${input.data}` })).toEqual(
    decoded,
  );
});
test('forged frame dimensions, malformed PNG and a corrupt CRC never become pixel evidence', () => {
  expect(() => decodeFramePixels({ ...frame(), width: 3 })).toThrow('身份');
  expect(() => decodeFramePixels({ ...frame(), data: 'arbitrary' })).toThrow('PNG');
  const input = frame(),
    bytes = Buffer.from(input.data, 'base64');
  bytes[32] = bytes[32]! ^ 1;
  expect(() => decodeFramePixels({ ...input, data: bytes.toString('base64') })).toThrow('校验');
});
test('oversized IHDR is rejected before decompression', () => {
  const input = frame(),
    bytes = Buffer.from(input.data, 'base64');
  bytes.writeUInt32BE(100000, 16);
  expect(() =>
    decodeFramePixels({ ...input, width: 100000, data: bytes.toString('base64') }),
  ).toThrow('尺寸');
});
