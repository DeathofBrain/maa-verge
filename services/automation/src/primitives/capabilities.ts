import {
  atomicInputSchemas,
  atomicCapabilityResultSchema,
  atomicPrimitiveDataSchemas,
} from '@contracts/atomic-input-schemas';
import {
  atomicInputValidators,
  validateAtomicFrameData,
  validateAtomicRecognitionData,
  validateAtomicAcknowledgementData,
} from '@contracts/validators.js';
import type { AtomicExecutionPort, AtomicOperation } from '../core/types';
import { AtomicFailure } from '../core/errors';
import type { CapabilityRegistration } from '../registry/types';
import definitions from '#common-pipeline/primitives/operations';

/** 基础原语与画面观察独立登记，不读取任何游戏资源或业务配置。 */
export function createPrimitiveCapabilities(port: AtomicExecutionPort): CapabilityRegistration[] {
  const registrations: CapabilityRegistration[] = [];
  // 结果信封之外也校验设备事实；损坏截图、识别或回执不能作为 verified 的下层证据。
  const contracts = {
    frame: validateAtomicFrameData,
    recognize: validateAtomicRecognitionData,
    input: validateAtomicAcknowledgementData,
  };
  const resultSchema = (kind: keyof typeof contracts) => ({
    allOf: [
      atomicCapabilityResultSchema,
      {
        if: { properties: { status: { const: 'completed' } }, required: ['status'] },
        then: { properties: { data: atomicPrimitiveDataSchemas[kind] } },
      },
    ],
  });
  const operations = [
    ['frame', '读取画面'],
    ['click', '点击'],
    ['swipe', '滑动'],
    ['press_key', '按键'],
    ['long_press', '长按'],
    ['drag', '拖拽'],
    ['recognize', '画面识别'],
    ['start_app', '启动应用'],
    ['stop_app', '关闭应用'],
  ] as const satisfies readonly (readonly [AtomicOperation, string])[];
  // 每个原语绑定权威 Schema，但不绑定任何游戏资源；宿主在执行时检查设备控制权。
  for (const [operation, label] of operations) {
    const id = `operation.${operation}` as const;
    const kind = operation === 'frame' || operation === 'recognize' ? operation : 'input';
    registrations.push({
      descriptor: {
        id,
        label,
        layer: 'operation',
        primitiveLevel: 1,
        effect: operation === 'frame' || operation === 'recognize' ? 'observe' : 'input',
        pipelineEntry: `Primitive@${operation}`,
        description: '调用当前 MaaFramework 会话；输入动作只报告原生接受状态，业务结果需另行观察。',
        inputSchema: atomicInputSchemas[id],
        resultSchema: resultSchema(kind),
        requiredCapabilities: [...new Set(['frame', operation])],
        available: true,
      },
      validate: atomicInputValidators[id],
      validateResult: (result) => {
        const value = result as { status?: string; data?: unknown };
        return value.status !== 'completed' || contracts[kind](value.data);
      },
      pipeline: { definitions, entry: `Primitive@${operation}` },
      async handler(input, context) {
        const data = await port.execute(operation, input, context);
        if (!contracts[kind](data))
          throw new AtomicFailure('设备原语返回数据不符合结果 Schema', 'unknown');
        const accepted =
          data !== null && typeof data === 'object' && 'accepted' in data && data.accepted === true;
        // 只读操作返回观察事实；输入操作的 accepted 仅表示原生接受，不能标成业务已验证。
        const readOnly = operation === 'frame' || operation === 'recognize';
        return {
          status: readOnly || accepted ? 'completed' : 'unknown',
          data,
          verified: readOnly,
          ...(!readOnly ? { nativeSuccess: accepted } : {}),
        };
      },
    });
  }
  // 保留只读观察层的统一画面入口，使用者无需安装游戏功能也可单独组合它。
  registrations.push({
    descriptor: {
      id: 'observation.frame',
      label: '读取画面',
      layer: 'observation',
      primitiveLevel: 1,
      effect: 'observe',
      pipelineEntry: 'Observation@frame',
      description: '读取当前 MaaFramework 会话的实际画面。',
      inputSchema: atomicInputSchemas['observation.frame'],
      resultSchema: resultSchema('frame'),
      requiredCapabilities: ['frame'],
      available: true,
    },
    validate: atomicInputValidators['observation.frame'],
    pipeline: { definitions, entry: 'Observation@frame' },
    validateResult: (result) => {
      const value = result as { status?: string; data?: unknown };
      return value.status !== 'completed' || validateAtomicFrameData(value.data);
    },
    handler: async (_input, context) => {
      const data = await port.execute('frame', {}, context);
      if (!validateAtomicFrameData(data))
        throw new AtomicFailure('设备未返回有效截图结果', 'unknown');
      return { status: 'completed', data, verified: true };
    },
  });
  return registrations;
}
