import { useEffect, useSyncExternalStore } from 'react';
import {
  errorMessage,
  rpc,
  type CopilotKind,
  type CopilotQueueEntry,
  type CopilotWorkspace,
  type Event,
} from '@maaverge/contracts';

// 只有明确成功的战斗结果才消费队列选择，普通任务完成通知不足以证明通关。
function victorySelection(
  event: Event,
): { kind: CopilotKind; entry: CopilotQueueEntry } | undefined {
  if (event.type !== 'run.copilot_result' || event.data.verdict !== 'success') return;
  const selection = event.data.workspaceSelection;
  if (!selection || typeof selection !== 'object') return;
  const { kind, entry } = selection as Partial<{
    kind: CopilotKind;
    entry: CopilotQueueEntry;
  }>;
  if (
    !['Copilot', 'SSSCopilot', 'ParadoxCopilot'].includes(kind ?? '') ||
    !entry ||
    typeof entry.id !== 'string' ||
    typeof entry.versionId !== 'string' ||
    typeof entry.isRaid !== 'boolean' ||
    typeof entry.navName !== 'string'
  )
    return;
  return { kind: kind!, entry };
}

/** One save chain per desktop window, including while the authoring page is closed. */
function createWorkspaceStore() {
  const cache = new Map<CopilotKind, CopilotWorkspace>();
  const reads = new Map<CopilotKind, Promise<CopilotWorkspace>>();
  const pending = new Map<CopilotKind, CopilotWorkspace>();
  const states = new Map<CopilotKind, { state: string; error: string }>();
  const unreadSelections = new Map<CopilotKind, CopilotQueueEntry[]>();
  const listeners = new Set<() => void>();
  let chain = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastEvent: number | undefined;
  let revision = 0;
  const status = (target: CopilotKind, state: string, message = '') => {
    states.set(target, { state, error: message });
    revision++;
    for (const listener of listeners) listener();
  };
  const flush = async (target?: CopilotKind) => {
    if (!target || [...pending.keys()].every((value) => value === target)) clearTimeout(timer);
    const task = chain
      .catch(() => {})
      .then(async () => {
        const changes = [...pending.values()].filter((value) => !target || value.kind === target);
        for (const value of changes) pending.delete(value.kind);
        // 先摘取本轮待保存快照；保存中新增的修改留在 pending，失败时也不覆盖较新的草稿。
        let failure: unknown;
        for (const value of changes) {
          status(value.kind, '保存中…');
          try {
            await rpc('copilot.workspace.save', { workspace: value });
            status(value.kind, pending.has(value.kind) ? '等待保存' : '已保存');
          } catch (cause) {
            if (!pending.has(value.kind)) pending.set(value.kind, cache.get(value.kind) ?? value);
            status(value.kind, '保存失败', errorMessage(cause));
            failure = cause;
          }
        }
        if (failure) throw failure;
      });
    chain = task;
    await task;
  };
  const applyVictory = (target: CopilotKind, completed: CopilotQueueEntry) => {
    const value = cache.get(target);
    if (!value) {
      unreadSelections.set(target, [...(unreadSelections.get(target) ?? []), completed]);
      return;
    }
    // 匹配条目 ID、不可变版本和难度/导航上下文，避免同一作业的另一条队列项被取消勾选。
    let matched = false;
    const queue = value.queue.map((entry) => {
      if (
        entry.id !== completed.id ||
        entry.versionId !== completed.versionId ||
        entry.isRaid !== completed.isRaid ||
        entry.navName !== completed.navName
      )
        return entry;
      matched = true;
      return { ...entry, enabled: false };
    });
    if (!matched) return;
    const next = { ...value, queue };
    cache.set(target, next);
    pending.set(target, next);
    status(target, '等待保存');
    // An older save may still contain enabled=true. Apply the exact merge after
    // that request, preserving all other edits and intentional later reselection.
    void flush(target).catch(() => {});
  };
  const read = (target: CopilotKind): Promise<CopilotWorkspace> => {
    const cached = cache.get(target);
    if (cached) return Promise.resolve(cached);
    const previous = reads.get(target);
    if (previous) return previous;
    const request = rpc('copilot.workspace.get', { kind: target })
      .then((value) => {
        if (!cache.has(target)) cache.set(target, value);
        const selections = unreadSelections.get(target) ?? [];
        unreadSelections.delete(target);
        for (const entry of selections) applyVictory(target, entry);
        status(target, pending.has(target) ? '等待保存' : '已保存');
        return cache.get(target)!;
      })
      .finally(() => {
        reads.delete(target);
      });
    reads.set(target, request);
    return request;
  };
  const edit = (target: CopilotKind, update: (value: CopilotWorkspace) => CopilotWorkspace) => {
    const value = cache.get(target);
    if (!value) return;
    const next = update(value);
    cache.set(next.kind, next);
    pending.set(next.kind, next);
    status(next.kind, '等待保存');
    clearTimeout(timer);
    timer = setTimeout(() => {
      void flush().catch(() => {});
    }, 400);
  };
  return {
    cache,
    states,
    status,
    read,
    edit,
    flush,
    editFor: async (target: CopilotKind, update: (value: CopilotWorkspace) => CopilotWorkspace) => {
      await read(target);
      edit(target, update);
    },
    reconcile: (events: readonly Event[]) => {
      // Initial history must not undo an intentional reselection from an earlier visit.
      const previous = lastEvent;
      lastEvent = Math.max(lastEvent ?? 0, ...events.map((event) => event.id));
      if (previous === undefined) return;
      for (const event of events) {
        if (event.id <= previous) continue;
        const selection = victorySelection(event);
        if (selection) applyVictory(selection.kind, selection.entry);
      }
    },
    revision: () => revision,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const store = createWorkspaceStore();

/** App keeps result reconciliation alive across page navigation and pending saves. */
export function CopilotWorkspaceSync({ events }: { events: readonly Event[] }) {
  useEffect(() => store.reconcile(events), [events]);
  return null;
}

export default function useWorkspace(kind: CopilotKind) {
  useSyncExternalStore(store.subscribe, store.revision);
  useEffect(() => {
    void store.read(kind).catch((cause) => store.status(kind, '读取失败', errorMessage(cause)));
    return () => {
      void store.flush(kind).catch(() => {});
    };
  }, [kind]);
  const saved = store.states.get(kind);
  return {
    workspace: store.cache.get(kind),
    edit: (update: (value: CopilotWorkspace) => CopilotWorkspace) => store.edit(kind, update),
    editFor: store.editFor,
    read: store.read,
    flush: store.flush,
    saveState: saved?.state ?? '',
    saveError: saved?.error ?? '',
  };
}
