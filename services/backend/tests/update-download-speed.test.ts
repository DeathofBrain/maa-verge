import { expect, test } from 'bun:test';
import { updateFixture } from './resource-update-fixture';
test('resource download speed is cleared when staging completes', () =>
  updateFixture(async ({ service }) => {
    await service.check('resource');
    await service.prepare('resource');
    expect(service.channel('resource').status).toBe('staged');
    expect(service.channel('resource').downloadSpeedBytesPerSecond).toBeUndefined();
  }));
