import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, rpc, type CopilotKind, type CopilotWorkspace } from '@maaverge/contracts';

/** Keep each type's edits ordered, including edits flushed while leaving the page. */
export default function useWorkspace(kind: CopilotKind) {
  const [, render] = useState(0);
  const currentKind = useRef(kind);
  currentKind.current = kind;
  const cache = useRef(new Map<CopilotKind, CopilotWorkspace>());
  const reads = useRef(new Map<CopilotKind, Promise<CopilotWorkspace>>());
  const pending = useRef(new Map<CopilotKind, CopilotWorkspace>());
  const states = useRef(new Map<CopilotKind, { state: string; error: string }>());
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const status = useCallback((target: CopilotKind, state: string, message = '') => {
    states.current.set(target, { state, error: message });
    if (mounted.current && currentKind.current === target) render((value) => value + 1);
  }, []);
  const flush = useCallback(
    async (target?: CopilotKind) => {
      if (!target || [...pending.current.keys()].every((value) => value === target))
        clearTimeout(timer.current);
      const task = chain.current
        .catch(() => {})
        .then(async () => {
          const changes = [...pending.current.values()].filter(
            (value) => !target || value.kind === target,
          );
          for (const value of changes) pending.current.delete(value.kind);
          let failure: unknown;
          for (const value of changes) {
            status(value.kind, '保存中…');
            try {
              await rpc('copilot.workspace.save', { workspace: value });
              status(value.kind, pending.current.has(value.kind) ? '等待保存' : '已保存');
            } catch (cause) {
              if (!pending.current.has(value.kind))
                pending.current.set(value.kind, cache.current.get(value.kind) ?? value);
              status(value.kind, '保存失败', errorMessage(cause));
              failure = cause;
            }
          }
          if (failure) throw failure;
        });
      chain.current = task;
      await task;
    },
    [status],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void flush().catch(() => {});
    };
  }, [flush]);
  const read = useCallback(
    (target: CopilotKind): Promise<CopilotWorkspace> => {
      const cached = cache.current.get(target);
      if (cached) return Promise.resolve(cached);
      const previous = reads.current.get(target);
      if (previous) return previous;
      const request = rpc('copilot.workspace.get', { kind: target })
        .then((value) => {
          if (!cache.current.has(target)) cache.current.set(target, value);
          status(target, pending.current.has(target) ? '等待保存' : '已保存');
          return cache.current.get(target)!;
        })
        .finally(() => {
          reads.current.delete(target);
        });
      reads.current.set(target, request);
      return request;
    },
    [status],
  );
  useEffect(() => {
    void read(kind).catch((cause) => status(kind, '读取失败', errorMessage(cause)));
  }, [kind, read, status]);
  const applyEdit = (
    target: CopilotKind,
    update: (value: CopilotWorkspace) => CopilotWorkspace,
  ) => {
    const value = cache.current.get(target);
    if (!value) return;
    const next = update(value);
    cache.current.set(next.kind, next);
    pending.current.set(next.kind, next);
    status(next.kind, '等待保存');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush().catch(() => {});
    }, 400);
  };
  const edit = (update: (value: CopilotWorkspace) => CopilotWorkspace) =>
    applyEdit(currentKind.current, update);
  const editFor = async (
    target: CopilotKind,
    update: (value: CopilotWorkspace) => CopilotWorkspace,
  ) => {
    await read(target);
    applyEdit(target, update);
  };
  const saved = states.current.get(kind);
  return {
    workspace: cache.current.get(kind),
    edit,
    editFor,
    read,
    flush,
    saveState: saved?.state ?? '',
    saveError: saved?.error ?? '',
  };
}
