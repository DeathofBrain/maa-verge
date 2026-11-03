/** 信用页身份与数值规则集中维护；数字不单独承担页面证明。 */
import { AtomicFailure } from '#automation/core/errors';
import type { AtomicFrame } from '#automation/core/types';
import type { ReviewedEventVision } from '#automation/composites/reviewed-event';
/** 数字必须唯一且完整；不把 OCR 丢失字符、负数或多个数量合并成预算依据。 */
export const number = (texts: readonly { text?: string }[]) => {
  const values = texts.map((item) => (item.text ?? '').trim());
  return values.length === 1 && /^\d{1,4}$/.test(values[0]) ? Number(values[0]) : undefined;
};

export const creditPageRules = [
  'store',
  'recommended.active',
  'collect',
  'credit.currency',
] as const;

/** 标签在所有商店页都可见；只有推荐页退出选中态且出现信用专属证据，才允许读取余额。 */
export async function creditPage(vision: ReviewedEventVision, frame: AtomicFrame) {
  const read = async (id: string) => {
    const { frame: _frame, ...recognition } = await vision.matches(id, frame);
    return recognition;
  };
  const evidence = {
    store: await read('store'),
    'recommended.active': await read('recommended.active'),
    collect: await read('collect'),
    'credit.currency': await read('credit.currency'),
  };
  return {
    active:
      evidence.store.hit &&
      !evidence['recommended.active'].hit &&
      (evidence.collect.hit || evidence['credit.currency'].hit),
    evidence,
  };
}
