/** 在单个能力 provider 内签发一次性准备凭据；公开 JSON 描述不能自行构造可信房间来源。 */
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { AtomicFailure } from '#automation/core/errors';
import type { PreparedRosterEvidence } from './types';

type IssuedPreparation = {
  evidence: PreparedRosterEvidence;
  resourceIdentity: string;
  inputRevision?: number;
  signal?: AbortSignal;
  removeAbortListener: () => void;
};

/** 一个控制会话只保留一份当前准备；所有消费和失效均删除凭据，失败不能重放。 */
export class InfrastPreparations {
  private current?: IssuedPreparation;

  constructor(
    private readonly resourceIdentity: () => string,
    private readonly getInputRevision?: () => number | undefined,
  ) {}

  /** 缺失宿主输入代际时仍可返回准备证据，但无法授权跨调用确认。 */
  private inputRevision(): number | undefined {
    const revision = this.getInputRevision?.();
    return Number.isSafeInteger(revision) && revision! >= 0 ? revision : undefined;
  }

  clear() {
    const current = this.current;
    this.current = undefined;
    current?.removeAbortListener();
  }

  /** 只能传入本次实际准备的成功结果；存储和返回各自复制，防止公开对象反向改写可信来源。 */
  issue(evidence: PreparedRosterEvidence, signal?: AbortSignal): PreparedRosterEvidence {
    this.clear();
    if (signal?.aborted) throw new AtomicFailure('名单准备已取消，未签发确认凭据');
    const issued: PreparedRosterEvidence = {
      ...structuredClone(evidence),
      selected: { ...structuredClone(evidence.selected), preparationId: randomUUID() },
    };
    const abort = () => this.clear();
    signal?.addEventListener('abort', abort, { once: true });
    this.current = {
      evidence: issued,
      resourceIdentity: this.resourceIdentity(),
      inputRevision: this.inputRevision(),
      ...(signal ? { signal } : {}),
      removeAbortListener: () => signal?.removeEventListener('abort', abort),
    };
    return structuredClone(issued);
  }

  /** 尝试确认即一次性消费；精确匹配签发对象和资源代际后，才返回内部保存的可信副本。 */
  consume(evidence: PreparedRosterEvidence): PreparedRosterEvidence {
    const issued = this.current;
    this.clear();
    if (!issued) throw new AtomicFailure('确认需要本会话签发且尚未消费的完整准备凭据，未提交名单');
    const revision = this.inputRevision();
    if (issued.inputRevision === undefined || revision === undefined)
      throw new AtomicFailure('宿主缺少可靠输入代际，不能授权独立确认', 'unavailable');
    if (
      issued.signal?.aborted ||
      issued.resourceIdentity !== this.resourceIdentity() ||
      issued.inputRevision !== revision ||
      !isDeepStrictEqual(evidence, issued.evidence)
    )
      throw new AtomicFailure('确认需要本会话签发且尚未消费的完整准备凭据，未提交名单');
    return structuredClone(issued.evidence);
  }
}
