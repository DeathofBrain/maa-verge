/** L2 的统一登记：JSON、TS 和调试共用 Vision 的实现，资源配置由组装入口显式提供。 */
import { atomicInputSchemas, atomicCapabilityResultSchema } from '@contracts/atomic-input-schemas';
import { atomicInputValidators } from '@contracts/validators.js';
import definitions from '#common-pipeline/composites/vision';
import { AtomicFailure } from '../core/errors';
import type { AtomicBox, AtomicExecutionContext, AtomicExecutionPort } from '../core/types';
import type { CapabilityRegistration } from '../registry/types';
import type { VisionResourceProfile } from '../resources/types';
import { Vision, type VisionFrameInput, type VisionOptions } from './vision';
import { waitForDuration } from './wait';

export type CompositeProfiles = Record<
  string,
  { profile: VisionResourceProfile; options: VisionOptions }
>;

/** 默认配置由调用方指定；独立工具可显式提供任意画布，不假定具体游戏。 */
export function createCompositeCapabilities(
  port: AtomicExecutionPort,
  profiles: CompositeProfiles,
  defaultProfile?: string,
): CapabilityRegistration[] {
  const vision = (input: Record<string, unknown>, context: AtomicExecutionContext) => {
    const name = typeof input.profile === 'string' ? input.profile : defaultProfile;
    const configuration = name ? profiles[name] : undefined;
    if (!configuration) throw new AtomicFailure('未提供通用组合原语的视觉配置', 'unavailable');
    return new Vision(port, configuration.profile, configuration.options, context);
  };
  // 依赖描述对应实际调用，纯等待可脱离视觉配置和设备独立使用。
  const operations = {
    match: ['frame', 'recognize'],
    texts: ['frame', 'recognize'],
    click_box: ['frame', 'click'],
    swipe: ['frame', 'swipe'],
    press_key: ['frame', 'press_key'],
    click_rule: ['frame', 'recognize', 'click'],
    click_first: ['frame', 'recognize', 'click'],
    action: ['frame', 'click'],
    delay: [],
    assert_hit: ['frame', 'recognize'],
    assert_missing: ['frame', 'recognize'],
    wait_until: ['frame', 'recognize'],
  };
  const descriptions = [
    ['match', '匹配已登记规则', 'observe'],
    ['texts', '读取当前文字', 'observe'],
    ['click_box', '点击参考区域', 'input'],
    ['swipe', '按参考坐标滑动', 'input'],
    ['press_key', '执行返回按键', 'input'],
    ['click_rule', '识别后点击', 'input'],
    ['click_first', '点击首个命中候选', 'input'],
    ['action', '执行已登记动作', 'input'],
    ['delay', '可取消等待', 'observe'],
    ['assert_hit', '断言规则命中', 'observe'],
    ['assert_missing', '断言规则消失', 'observe'],
    ['wait_until', '等待观察条件', 'observe'],
  ] as const;
  return descriptions.map(([name, label, effect]) => {
    const id = `composite.${name}` as keyof typeof atomicInputValidators;
    const dependencies = operations[name].map((operation) => `operation.${operation}`);
    return {
      descriptor: {
        id,
        label,
        description: '组合已登记最小原语；参考尺寸、规则与等待由视觉配置明确提供。',
        layer: effect === 'observe' ? 'observation' : 'operation',
        primitiveLevel: 2,
        effect,
        pipelineEntry: `Composite@${name}`,
        inputSchema: atomicInputSchemas[id],
        resultSchema: atomicCapabilityResultSchema,
        requiredCapabilities: dependencies.map((id) => id.slice(10)),
        available: true,
      },
      dependencies,
      validate: atomicInputValidators[id],
      pipeline: { definitions, entry: `Composite@${name}` },
      async handler(input, context) {
        if (name === 'delay') {
          await waitForDuration(input.ms as number, context);
          return { status: 'completed', data: {}, verified: true };
        }
        const view = vision(input, context);
        let data: unknown = {};
        // current 在这个 JSON 根调用的 Custom 内取图；同根引用不携带 PNG，也不自动续期。
        const frame = input.frame as VisionFrameInput | undefined;
        switch (name) {
          case 'match':
            data = await view.match(input.rule as string, frame ?? 'current');
            break;
          case 'texts':
            data = await view.texts(frame ?? 'current', input.roi as AtomicBox | undefined);
            break;
          case 'click_box':
            await view.click(await view.resolveFrame(frame), input.box as AtomicBox);
            break;
          case 'swipe':
            await view.swipe(
              await view.resolveFrame(frame),
              input.from as [number, number],
              input.to as [number, number],
              input.durationMs as number | undefined,
            );
            break;
          case 'press_key':
            await view.pressKey(input.key as 'back' | 'escape');
            break;
          case 'click_rule':
            data = { clicked: await view.clickRule(input.rule as string, input.optional === true) };
            break;
          case 'click_first':
            data = {
              matched: await view.clickFirst(
                input.rules as string[],
                input.fallbackAction as string | undefined,
              ),
            };
            break;
          case 'action':
            await view.action(input.action as string);
            break;
          case 'assert_hit':
          case 'assert_missing':
            data = await view.assertRule(
              input.rule as string,
              name === 'assert_hit',
              typeof input.message === 'string' ? input.message : '观察条件不满足',
              input.unknown === true,
            );
            break;
          case 'wait_until':
            data = await view.waitUntil(
              input.rule as string,
              input.expected !== false,
              input.timeoutMs as number,
              input.pollMs as number | undefined,
            );
            break;
        }
        return {
          status: 'completed',
          data,
          verified: effect === 'observe',
          ...(effect === 'input' ? { nativeSuccess: true } : {}),
        };
      },
    } satisfies CapabilityRegistration;
  });
}
