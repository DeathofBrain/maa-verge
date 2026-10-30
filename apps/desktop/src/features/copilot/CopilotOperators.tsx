import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import { matchingDeviceProfile, rpc, type Snapshot } from '@maaverge/contracts';
import OperatorBadge, { readOperator } from '@/shared/game/OperatorBadge';
import {
  assessOperator,
  requirementLabels,
  type OperatorAssessment,
  type OperatorRequirement,
  type OperatorRoster,
} from './copilot-operators';
import './copilot-operator-groups.css';

export function useCopilotRoster(snapshot: Snapshot, deviceId?: string) {
  const device = snapshot.devices.find((item) => item.id === deviceId);
  const profile =
    snapshot.settings.deviceProfiles?.find((item) => item.id === device?.connectionProfileId) ??
    (device ? matchingDeviceProfile(snapshot.settings, device.address) : undefined);
  const accountEvent = snapshot.events
    .filter((event) => event.type === 'device.account_changed' && event.data.deviceId === deviceId)
    .at(-1)?.id;
  const syncEvent = snapshot.events
    .filter((event) => event.type === 'device.data_synced' && event.data.deviceId === deviceId)
    .at(-1)?.id;
  const runs = snapshot.runs
    .filter((run) => run.deviceId === deviceId)
    .map((run) => `${run.id}:${run.status}`)
    .join(',');
  const jobs = snapshot.toolJobs
    ?.filter((job) => job.deviceId === deviceId)
    .map((job) => `${job.id}:${job.status}`)
    .join(',');
  const key = JSON.stringify([
    deviceId,
    profile?.connection?.clientType,
    snapshot.settings.connection?.clientType,
    accountEvent,
  ]);
  const revision = JSON.stringify([device?.dataSync?.operatorsAt, syncEvent, runs, jobs]);
  const [loaded, setLoaded] = useState<{
    key: string;
    roster?: OperatorRoster;
    failed?: boolean;
  }>();
  useEffect(() => {
    let cancelled = false;
    if (!deviceId) return;
    // Let the service resolve the device's current client, including account switches.
    void rpc('recognition.get', { deviceId, kind: 'operators' }).then(
      (roster) => {
        if (!cancelled && roster.deviceId === deviceId && roster.kind === 'operators')
          setLoaded({ key, roster });
      },
      () => {
        if (!cancelled) setLoaded({ key, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [deviceId, key, revision]);
  const current = loaded?.key === key ? loaded : undefined;
  const roster =
    current?.roster?.collectedAt && current.roster.operators.length ? current.roster : undefined;
  const hint = !deviceId
    ? '选择目标设备后可核对本地干员。'
    : !current
      ? '正在读取所选设备的干员识别结果…'
      : current.failed
        ? '干员数据读取失败，持有状态未核验；请重试或在工具箱执行干员识别。'
        : !roster
          ? '尚无所选设备的干员识别数据，请在工具箱执行「干员识别」；仓库识别仅更新材料。'
          : `本地干员数据：${new Date(roster.collectedAt!).toLocaleString('zh-CN')}；名单缺项仍需重新识别核对。`;
  return { roster, hint };
}

function useAssessments(
  operators: OperatorRequirement[],
  resourceKey: string,
  roster: OperatorRoster | undefined,
  element: RefObject<HTMLDivElement | null>,
) {
  const [resolved, setResolved] = useState<{ key: string; ids: Map<string, string | null> }>();
  const names = [...new Set(operators.map((operator) => operator.name))];
  const key = JSON.stringify([resourceKey, roster?.clientType ?? 'Official', names]);
  useEffect(() => {
    if (!roster) return;
    const aliases = names.filter(
      (name) => roster.operators.filter((item) => item.name === name).length !== 1,
    );
    if (!aliases.length) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void Promise.allSettled(
          aliases.map(async (name) => {
            const value = await readOperator(
              JSON.stringify([resourceKey, roster.clientType, name]),
              name,
              roster.clientType,
            );
            return [name, value.id] as const;
          }),
        ).then((results) => {
          if (!cancelled)
            setResolved({
              key,
              ids: new Map(
                results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
              ),
            });
        });
      },
      { rootMargin: '160px' },
    );
    if (element.current) observer.observe(element.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [key, roster]);
  return operators.map((operator) =>
    assessOperator(
      operator,
      roster,
      resolved?.key === key ? resolved.ids.get(operator.name) : undefined,
    ),
  );
}

function Operator({
  operator,
  resourceKey,
  roster,
  compact,
  assessment,
}: {
  operator: OperatorRequirement;
  resourceKey: string;
  roster?: OperatorRoster;
  compact?: boolean;
  assessment: OperatorAssessment;
}) {
  const requirements = requirementLabels(operator.requirements);
  const skill = operator.skill ? `技能 ${operator.skill}` : '未指定技能';
  return (
    <li
      className={compact ? 'cp-operator-tag' : 'cp-operator-card'}
      data-status={assessment.status}
      title={`${operator.name} · ${skill}${requirements.length ? ` · ${requirements.join(' · ')}` : ''}\n${assessment.detail}`}
    >
      {compact ? (
        <strong>{operator.name}</strong>
      ) : (
        <>
          <OperatorBadge
            name={operator.name}
            resourceKey={resourceKey}
            clientType={roster?.clientType}
          />
          <div className="cp-operator-requirement">
            <span className="cp-skill">{skill}</span>
            <p>{requirements.length ? requirements.join(' · ') : '未声明练度要求'}</p>
          </div>
          <small className="cp-operator-state">{assessment.detail}</small>
        </>
      )}
    </li>
  );
}

export default function CopilotOperators({
  operators,
  resourceKey,
  roster,
  rosterHint,
  compact,
}: {
  operators?: OperatorRequirement[];
  resourceKey: string;
  roster?: OperatorRoster;
  rosterHint?: string;
  compact?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const groupId = useId();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const assessments = useAssessments(operators ?? [], resourceKey, roster, element);
  if (!operators?.length)
    return (
      <p className="sp-help">
        {operators ? '作业未声明干员要求。' : '干员信息未提供，查看详情核对。'}
      </p>
    );
  const groups = new Map<string, number[]>();
  for (const [index, operator] of operators.entries()) {
    const group = operator.group ?? '';
    groups.set(group, [...(groups.get(group) ?? []), index]);
  }
  const renderOperator = (index: number) => (
    <Operator
      key={`${operators[index].name}-${index}`}
      operator={operators[index]}
      assessment={assessments[index]}
      resourceKey={resourceKey}
      roster={roster}
      compact={compact}
    />
  );
  if (compact) {
    const alternatives = [...groups]
      .filter(([group]) => group)
      .map(([group, members], order) => {
        const verified = members.filter((index) => assessments[index].eligible);
        const pending = members.filter(
          (index) => assessments[index].status === 'owned' && !assessments[index].eligible,
        );
        const selected = [...verified, ...pending].slice(0, 3);
        const status: OperatorAssessment['status'] = selected.length
          ? 'owned'
          : members.some((index) => assessments[index].status === 'unknown')
            ? 'unknown'
            : members.some((index) => assessments[index].status === 'insufficient')
              ? 'insufficient'
              : 'missing';
        const hint = verified.length
          ? '有已确认满足要求的候选'
          : pending.length
            ? '有已拥有候选，部分练度待核验'
            : status === 'missing'
              ? '本地明确未拥有本组候选'
              : status === 'insufficient'
                ? '暂无符合已知要求的干员'
                : '尚未确认可用干员';
        return { group, members, selected, status, hint, panelId: `${groupId}-${order}` };
      });
    return (
      <div ref={element} className="cp-operator-summary" aria-label="作业干员">
        {!roster && (
          <p className="cp-roster-hint">
            {rosterHint ?? '尚无干员识别数据，请在工具箱执行干员识别。'}
          </p>
        )}
        <ul className="cp-operator-tags cp-requirement-tags">
          {(groups.get('') ?? []).map(renderOperator)}
          {alternatives.map(({ group, status, hint, panelId }) => (
            <li key={group} className="cp-group-option">
              <button
                type="button"
                className="cp-operator-tag cp-group-toggle"
                data-status={status}
                title={`${group} · 组内任选一位\n${hint}`}
                aria-expanded={expandedGroup === group}
                aria-controls={panelId}
                onClick={() => setExpandedGroup((value) => (value === group ? null : group))}
              >
                {group}
                <ChevronDown size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {alternatives.map(({ group, members, selected, hint, panelId }) => (
          <section
            key={group}
            id={panelId}
            className="cp-group-panel"
            aria-label={`${group}备选干员`}
            hidden={expandedGroup !== group}
          >
            <h4>
              {group}
              <span>组内任选一位</span>
            </h4>
            {selected.length ? (
              <ul className="cp-operator-tags">{selected.map(renderOperator)}</ul>
            ) : (
              <p className="cp-group-unverified">
                {members.length} 位备选 · {hint}，查看详情
              </p>
            )}
          </section>
        ))}
      </div>
    );
  }
  return (
    <div ref={element} className="cp-operator-groups" aria-label="作业干员">
      {[...groups].map(([group, members]) => {
        return (
          <div key={group}>
            {group && (
              <h4>
                {group}
                <span>组内任选一位</span>
              </h4>
            )}
            <ul className="cp-operator-grid">{members.map(renderOperator)}</ul>
          </div>
        );
      })}
    </div>
  );
}
