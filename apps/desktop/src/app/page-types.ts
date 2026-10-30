import type { Plan, Snapshot, Task, UpdateChannel } from '@maaverge/contracts';

export interface SupportPageProps {
  snapshot: Snapshot;
  selectedDevice: string;
  onSelectDevice: (id: string) => void;
  busy: boolean;
  onAction: (key: string, call: () => Promise<unknown>, success?: string) => Promise<boolean>;
  onPrepareUpdate: (channel: UpdateChannel) => Promise<void>;
  preparingUpdates: ReadonlySet<UpdateChannel['id']>;
  onOpenPlan: (plan: Plan, taskType?: Task['type'], taskIndex?: number) => void;
  onCreateTaskPlan: (type: Task['type'], params?: Task['params']) => void;
  searchQuery?: string;
}
