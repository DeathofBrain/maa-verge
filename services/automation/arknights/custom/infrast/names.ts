/** 将 OCR 原文与同代官方姓名集合精确核对；只允许可审计的边界标点修正，不进行模糊补全。 */
import type { AtomicResourceProfile } from './types';

export type OperatorNameEvidence = { name: string; rawName: string; nameVerified: boolean };

/** 简中客户端只使用 battle_data.json 的 name；未适配的语言与未知姓名保留原读数。 */
export function resolveOperatorName(
  profile: AtomicResourceProfile,
  rawName: string,
): OperatorNameEvidence {
  const raw = rawName.trim();
  const dictionary = ['Official', 'Bilibili'].includes(profile.clientType)
    ? profile.operatorNames?.names
    : undefined;
  if (dictionary?.includes(raw)) return { name: raw, rawName, nameVerified: true };
  // 必须先形成有限候选，再与官方名完全相等；未知内容既不删标点，也不作近似匹配。
  const candidate = raw.replace(/^[、，,。．.]+|[、，,。．.]+$/gu, '').trim();
  if (candidate !== raw && dictionary?.includes(candidate))
    return { name: candidate, rawName, nameVerified: true };
  return { name: raw, rawName, nameVerified: false };
}
