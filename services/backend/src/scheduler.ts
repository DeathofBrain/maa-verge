import { createHash, randomUUID } from 'node:crypto';
import type { RpcContract } from '../../../packages/contracts/src/rpc-types';
import { planAllowsDevice } from '../../../packages/contracts/src/plan-devices';
import {
  validateScheduleOverrideParams,
  validateScheduleSaveParams,
} from '../../../packages/contracts/src/validators.js';
import { RpcError } from './errors';
import { parseSettings } from './models';
import type { Store } from './storage';

type Schedule = RpcContract['results']['schedule.save'];
export const defaultScheduler = () => ({
  forceScheduledStart: false,
  showWindowBeforeForceScheduledStart: false,
  notifyBeforeScheduledStart: false,
  notificationMinutes: 5,
  scheduledWakeUp: false,
});
const day = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const active = (status: string) => ['countdown', 'stopping', 'starting'].includes(status);
interface Host {
  store: Store;
  emit(type: string, message: string, data?: any): unknown;
  availability(id: string, occurrence?: string): RpcContract['results']['device.availability'];
  stopDevice(id: string): Promise<void>;
  prepareDevice(id: string): Promise<void>;
  start(plan: any, deviceId: string, requestId: string, occurrence: any): Promise<any>;
}

export class Scheduler {
  private overrides = new Map<string, 'enable' | 'skip'>();
  private pending = new Set<string>();
  private stopped = false;
  constructor(
    private host: Host,
    private clock: () => Date = () => new Date(),
  ) {
    for (const item of host.store.all('schedule_occurrence'))
      if (active(item.status)) {
        item.status = 'failed';
        item.message = '上次调度被中断，结果未知，不自动重放';
        host.store.put('schedule_occurrence', item.id, item);
      }
    for (const item of host.store.all('schedule_occurrence'))
      if (item.status === 'started') {
        const run = item.runId && host.store.get('run', item.runId);
        if (!run || run.status !== 'running')
          this.finish(
            item,
            run?.status ?? 'failed',
            run?.message ?? '上次执行结果未知，不自动重放',
          );
      }
  }
  owner(deviceId: string) {
    return this.host.store
      .all('schedule_occurrence')
      .find((item) => item.deviceId === deviceId && active(item.status));
  }
  settings() {
    return {
      ...defaultScheduler(),
      ...parseSettings(this.host.store.get('settings', 'main')).scheduler,
    };
  }
  list(): RpcContract['results']['schedule.list'] {
    this.invalidate();
    const now = this.clock();
    const schedules = this.host.store.all<Schedule>('schedule').map((item) => {
      const enabled = this.overrides.get(item.id) === 'enable' || item.enabled;
      const next = new Date(now);
      next.setHours(item.hour, item.minute, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      if (this.overrides.get(item.id) === 'skip' && item.enabled) next.setDate(next.getDate() + 1);
      const last = this.host.store
        .recent('schedule_occurrence', 500)
        .find((occurrence) => occurrence.scheduleId === item.id);
      return {
        ...item,
        override: this.overrides.get(item.id) ?? null,
        nextAt: enabled && !item.disabledReason ? next.toISOString() : null,
        last: last ? this.publicOccurrence(last) : null,
      };
    });
    return {
      schedules,
      occurrences: this.host.store
        .recent('schedule_occurrence', 100)
        .map((item) => this.publicOccurrence(item)),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      wake: this.host.store.get('scheduler_host', 'wake', {
        supported: false,
        status: 'unavailable',
        message: '尚未收到桌面唤醒状态',
      }),
    };
  }
  save(params: RpcContract['params']['schedule.save']) {
    if (!validateScheduleSaveParams(params))
      throw new RpcError(-32602, '定时设置无效', validateScheduleSaveParams.errors);
    const { planId, deviceId, hour, minute, enabled } = params.schedule;
    const plan = this.host.store.get('plan', planId),
      device = this.host.store.get('device', deviceId);
    if (!plan || !device) throw new RpcError(-32004, '请选择存在的任务表和设备');
    if (!planAllowsDevice(plan, deviceId))
      throw new RpcError(-32011, '定时设备必须在任务表绑定范围内');
    const item: Schedule = {
      id: params.schedule.id || 'schedule-' + randomUUID(),
      planId,
      deviceId,
      hour,
      minute,
      enabled,
      disabledReason: null,
    };
    this.host.store.put('schedule', item.id, item);
    this.changed();
    return item;
  }
  delete(id: string) {
    this.host.store.delete('schedule', id);
    this.overrides.delete(id);
    for (const item of this.host.store.all('schedule_occurrence'))
      if (item.scheduleId === id && active(item.status)) this.cancel(item.id);
    this.changed();
    return { deleted: true };
  }
  override(params: RpcContract['params']['schedule.override']) {
    if (!validateScheduleOverrideParams(params)) throw new RpcError(-32602, '临时定时设置无效');
    const schedule = this.host.store.get<Schedule>('schedule', params.id);
    if (!schedule) throw new RpcError(-32004, '定时项不存在');
    if (params.mode === 'clear') this.overrides.delete(params.id);
    else this.overrides.set(params.id, params.mode);
    this.changed();
    return { ...schedule, override: this.overrides.get(params.id) ?? null };
  }
  cancel(id: string) {
    const item = this.host.store.get('schedule_occurrence', id);
    if (!item || !active(item.status) || item.startCommitted) return { cancelled: false };
    this.finish(item, 'cancelled', '本次定时已取消');
    return { cancelled: true };
  }
  invalidate() {
    for (const schedule of this.host.store.all<Schedule>('schedule')) {
      const plan = this.host.store.get('plan', schedule.planId),
        device = this.host.store.get('device', schedule.deviceId);
      const reason = !plan
        ? '关联任务表已删除'
        : !device
          ? '关联设备已删除'
          : !planAllowsDevice(plan, schedule.deviceId)
            ? '定时设备不在任务表绑定范围内'
            : device.connectionProfileId &&
                !parseSettings(this.host.store.get('settings', 'main')).deviceProfiles?.some(
                  (profile) => profile.id === device.connectionProfileId,
                )
              ? '设备连接配置已删除'
              : null;
      if (reason && (schedule.enabled || schedule.disabledReason !== reason)) {
        Object.assign(schedule, { enabled: false, disabledReason: reason });
        this.host.store.put('schedule', schedule.id, schedule);
        this.overrides.delete(schedule.id);
        for (const item of this.host.store.all('schedule_occurrence'))
          if (item.scheduleId === schedule.id && active(item.status))
            this.finish(item, 'cancelled', reason);
        this.changed();
      }
    }
  }
  private changed() {
    this.host.emit('schedule.changed', '定时设置已更新');
  }
  private finish(item: any, status: string, message: string, extra = {}) {
    Object.assign(item, { status, message, finishedAt: this.clock().toISOString(), ...extra });
    this.host.store.put('schedule_occurrence', item.id, item);
    this.host.emit('schedule.' + status, message, { occurrence: this.publicOccurrence(item) });
  }
  private publicOccurrence(item: any) {
    const { planSnapshot: _, ...summary } = item;
    return summary;
  }
  runFinished(run: any) {
    if (!run.scheduleId) return;
    const item = this.host.store
      .all('schedule_occurrence')
      .find((item) => item.scheduleId === run.scheduleId && item.scheduledFor === run.scheduledFor);
    if (item && ['started', 'starting'].includes(item.status))
      this.finish(item, run.status, run.message, { runId: run.id });
  }
  tick() {
    if (this.stopped) return;
    this.invalidate();
    const current = this.clock(),
      settings = this.settings();
    for (const item of this.host.store.all('schedule_occurrence'))
      if (active(item.status)) this.drive(item, current);
    const claimed = new Set<string>();
    for (const schedule of this.host.store.all<Schedule>('schedule')) {
      const override = this.overrides.get(schedule.id);
      if (
        override === 'skip' &&
        current.getHours() === schedule.hour &&
        current.getMinutes() === schedule.minute
      ) {
        const key = `${schedule.id}:${day(current)}:${schedule.hour}:${schedule.minute}`;
        if (!this.host.store.get('schedule_occurrence', key)) {
          this.overrides.delete(schedule.id);
          this.changed();
          this.finish(
            {
              id: key,
              scheduleId: schedule.id,
              deviceId: schedule.deviceId,
              scheduledFor: current.toISOString(),
            },
            'skipped',
            '仅本次跳过',
          );
        }
        continue;
      }
      if (
        schedule.disabledReason ||
        override === 'skip' ||
        (!schedule.enabled && override !== 'enable')
      )
        continue;
      const target = new Date(current);
      target.setHours(schedule.hour, schedule.minute, 0, 0);
      if (target.getTime() < current.getTime() - 60_000) target.setDate(target.getDate() + 1);
      const key = `${schedule.id}:${day(target)}:${schedule.hour}:${schedule.minute}`;
      const advance = (minutes: number) => {
        const when = new Date(current);
        when.setMinutes(when.getMinutes() + minutes);
        return when.getHours() === schedule.hour && when.getMinutes() === schedule.minute;
      };
      if (
        settings.notifyBeforeScheduledStart &&
        advance(settings.notificationMinutes) &&
        !this.host.store.get('schedule_stage', key + ':notify')
      ) {
        this.host.store.put('schedule_stage', key + ':notify', true);
        this.host.emit(
          'schedule.notice',
          `定时任务将在 ${settings.notificationMinutes} 分钟后开始`,
          {
            scheduleId: schedule.id,
            deviceId: schedule.deviceId,
            scheduledFor: target.toISOString(),
          },
        );
      }
      if (advance(2) && !this.host.store.get('schedule_stage', key + ':prepare')) {
        this.host.store.put('schedule_stage', key + ':prepare', true);
        this.host.emit('schedule.preparing', '定时任务提前两分钟准备目标连接', {
          scheduleId: schedule.id,
          deviceId: schedule.deviceId,
        });
        if (this.host.availability(schedule.deviceId).owner === 'none')
          this.launch(key + ':prepare', async () => {
            await this.host.prepareDevice(schedule.deviceId);
          });
      }
      if (current.getHours() !== schedule.hour || current.getMinutes() !== schedule.minute)
        continue;
      if (this.host.store.get('schedule_occurrence', key)) {
        claimed.add(schedule.deviceId);
        continue;
      }
      const plan = this.host.store.get('plan', schedule.planId),
        availability = this.host.availability(schedule.deviceId);
      const item: any = {
        id: key,
        scheduleId: schedule.id,
        deviceId: schedule.deviceId,
        planId: schedule.planId,
        scheduledFor: target.toISOString(),
        createdAt: current.toISOString(),
        force: settings.forceScheduledStart,
        status: settings.forceScheduledStart ? 'countdown' : 'starting',
        deadline: current.getTime() + 60_000,
        countdownUntil: current.getTime() + 10_000,
        planSnapshot: structuredClone(plan),
        message: '等待定时启动',
      };
      this.host.store.put('schedule_occurrence', key, item);
      if (override) {
        this.overrides.delete(schedule.id);
        this.host.store.put('schedule_stage', key + ':override-consumed', true);
        this.changed();
      }
      if (!plan) this.finish(item, 'skipped', '关联任务表已删除');
      else if (claimed.has(schedule.deviceId))
        this.finish(item, 'skipped', '同一设备同刻存在更靠前的定时项');
      else if (!settings.forceScheduledStart && availability.owner !== 'none')
        this.finish(item, 'skipped', availability.reason);
      else if (settings.forceScheduledStart)
        this.host.emit('schedule.countdown', '强制定时将在 10 秒后停止当前操作并启动', {
          occurrence: this.publicOccurrence(item),
          showWindow: settings.showWindowBeforeForceScheduledStart,
        });
      claimed.add(schedule.deviceId);
      this.drive(item, current);
    }
  }
  private drive(item: any, current: Date) {
    if (this.stopped || !active(item.status) || this.pending.has(item.id)) return;
    if (current.getTime() > item.deadline) {
      this.finish(item, 'failed', '等待设备安全空闲或连接超时，本次未继续');
      return;
    }
    if (item.status === 'countdown') {
      if (current.getTime() < item.countdownUntil) return;
      item.status = 'stopping';
      this.host.store.put('schedule_occurrence', item.id, item);
      this.host.emit('schedule.stopping', '正在停止目标设备当前操作', {
        occurrence: this.publicOccurrence(item),
      });
      this.launch(item.id, async () => {
        try {
          await this.host.stopDevice(item.deviceId);
        } catch (error) {
          if (!this.stopped && active(this.host.store.get('schedule_occurrence', item.id)?.status))
            this.finish(
              item,
              'failed',
              '停止当前操作失败，本次定时未继续：' + String(error).slice(0, 800),
            );
        }
      });
      return;
    }
    if (item.status === 'stopping') {
      const available = this.host.availability(item.deviceId, item.id);
      if (available.owner !== 'none') return;
      item.status = 'starting';
      this.host.store.put('schedule_occurrence', item.id, item);
      this.host.emit('schedule.starting', '正在准备定时任务', {
        occurrence: this.publicOccurrence(item),
      });
    }
    if (item.status === 'starting')
      this.launch(item.id, async () => {
        try {
          await this.host.prepareDevice(item.deviceId);
          if (this.stopped || !active(this.host.store.get('schedule_occurrence', item.id)?.status))
            return;
          item.startCommitted = true;
          this.host.store.put('schedule_occurrence', item.id, item);
          const requestId = 'schedule-' + createHash('sha256').update(item.id).digest('hex');
          const run = await this.host.start(item.planSnapshot, item.deviceId, requestId, item);
          if (run.status === 'running')
            this.finish(item, 'started', '定时任务已启动', { runId: run.id });
          else this.finish(item, run.status, run.message, { runId: run.id });
        } catch (error) {
          if (!this.stopped && active(this.host.store.get('schedule_occurrence', item.id)?.status))
            this.finish(item, 'failed', String(error).slice(0, 1000));
        }
      });
  }
  private launch(key: string, action: () => Promise<void>) {
    if (this.pending.has(key)) return;
    this.pending.add(key);
    void action()
      .catch((error) => {
        if (!this.stopped) this.host.emit('schedule.prepare_failed', String(error).slice(0, 1000));
      })
      .finally(() => this.pending.delete(key));
  }
  close() {
    this.stopped = true;
  }
}
