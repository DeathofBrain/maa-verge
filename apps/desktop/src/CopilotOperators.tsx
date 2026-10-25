import { useEffect, useRef, useState, type RefObject } from 'react';
import { matchingDeviceProfile, rpc, type Snapshot } from '@maaverge/contracts';
import OperatorBadge, { readOperator } from './OperatorBadge';
import { assessOperator, requirementLabels, type OperatorAssessment, type OperatorRequirement, type OperatorRoster } from './copilot-operators';

export function useCopilotRoster(snapshot: Snapshot, deviceId?: string) {
  const device = snapshot.devices.find(item => item.id === deviceId);
  const profile = snapshot.settings.deviceProfiles?.find(item => item.id === device?.connectionProfileId) ?? (device ? matchingDeviceProfile(snapshot.settings, device.address) : undefined);
  const accountEvent = snapshot.events.filter(event => event.type === 'device.account_changed' && event.data.deviceId === deviceId).at(-1)?.id;
  const syncEvent = snapshot.events.filter(event => event.type === 'device.data_synced' && event.data.deviceId === deviceId).at(-1)?.id;
  const runs = snapshot.runs.filter(run => run.deviceId === deviceId).map(run => `${run.id}:${run.status}`).join(',');
  const jobs = snapshot.toolJobs?.filter(job => job.deviceId === deviceId).map(job => `${job.id}:${job.status}`).join(',');
  const key = JSON.stringify([deviceId, profile?.connection?.clientType, snapshot.settings.connection?.clientType, accountEvent]);
  const revision = JSON.stringify([device?.dataSync?.operatorsAt, syncEvent, runs, jobs]);
  const [loaded, setLoaded] = useState<{ key: string; roster: OperatorRoster }>();
  useEffect(() => {
    let cancelled = false;
    if (!deviceId) return;
    // Let the service resolve the device's current client, including account switches.
    void rpc('recognition.get', { deviceId, kind: 'operators' }).then(roster => {
      if (!cancelled && roster.deviceId === deviceId && roster.kind === 'operators') setLoaded({ key, roster });
    }, () => { if (!cancelled) setLoaded(undefined); });
    return () => { cancelled = true; };
  }, [deviceId, key, revision]);
  return loaded?.key === key && loaded.roster.collectedAt && loaded.roster.operators.length ? loaded.roster : undefined;
}

function useAssessments(operators: OperatorRequirement[], resourceKey: string, roster: OperatorRoster | undefined, element: RefObject<HTMLDivElement | null>) {
  const [resolved, setResolved] = useState<{ key: string; ids: Map<string, string | null> }>();
  const names = [...new Set(operators.map(operator => operator.name))];
  const key = JSON.stringify([resourceKey, roster?.clientType ?? 'Official', names]);
  useEffect(() => {
    if (!roster) return;
    const aliases = names.filter(name => roster.operators.filter(item => item.name === name).length !== 1);
    if (!aliases.length) return;
    let cancelled = false;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void Promise.allSettled(aliases.map(async name => {
        const value = await readOperator(JSON.stringify([resourceKey, roster.clientType, name]), name, roster.clientType);
        return [name, value.id] as const;
      })).then(results => {
        if (!cancelled) setResolved({ key, ids: new Map(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])) });
      });
    }, { rootMargin: '160px' });
    if (element.current) observer.observe(element.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [key, roster]);
  return operators.map(operator => assessOperator(operator, roster, resolved?.key === key ? resolved.ids.get(operator.name) : undefined));
}

function Operator({ operator, resourceKey, roster, compact, assessment }: { operator: OperatorRequirement; resourceKey: string; roster?: OperatorRoster; compact?: boolean; assessment: OperatorAssessment }) {
  const requirements = requirementLabels(operator.requirements);
  const skill = operator.skill ? `技能 ${operator.skill}` : '未指定技能';
  return <li className={compact ? 'cp-operator-tag' : 'cp-operator-card'} data-status={assessment.status} title={`${operator.name} · ${skill}${requirements.length ? ` · ${requirements.join(' · ')}` : ''}\n${assessment.detail}`}>
    {compact ? <><strong>{operator.name}</strong>{assessment.label && <small>{assessment.label}</small>}</> : <>
      <OperatorBadge name={operator.name} resourceKey={resourceKey} clientType={roster?.clientType}/>
      <div className="cp-operator-requirement"><span className="cp-skill">{skill}</span><p>{requirements.length ? requirements.join(' · ') : '未声明练度要求'}</p></div>
      {roster && <small className="cp-operator-state">{assessment.detail}</small>}
    </>}
  </li>;
}

export default function CopilotOperators({ operators, resourceKey, roster, compact }: { operators?: OperatorRequirement[]; resourceKey: string; roster?: OperatorRoster; compact?: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const assessments = useAssessments(operators ?? [], resourceKey, roster, element);
  if (!operators?.length) return <p className="sp-help">{operators ? '作业未声明干员要求。' : '干员信息未提供，查看详情核对。'}</p>;
  const groups = new Map<string, number[]>();
  for (const [index, operator] of operators.entries()) {
    const group = operator.group ?? '';
    groups.set(group, [...(groups.get(group) ?? []), index]);
  }
  return <div ref={element} className={compact ? 'cp-operator-summary' : 'cp-operator-groups'} aria-label="作业干员">{[...groups].map(([group, members]) => {
    const selected = compact && group ? members.filter(index => assessments[index].eligible).slice(0, 1) : members;
    return <div key={group}>
    {group && <h4>{group}<span>组内任选一位</span></h4>}
    {selected.length ? <ul className={compact ? 'cp-operator-tags' : 'cp-operator-grid'}>{selected.map(index => <Operator key={`${operators[index].name}-${index}`} operator={operators[index]} assessment={assessments[index]} resourceKey={resourceKey} roster={roster} compact={compact}/>)}</ul> : <p className="cp-group-unverified">{members.length} 位备选 · {roster && members.every(index => ['missing', 'insufficient'].includes(assessments[index].status)) ? '暂无符合已知要求的干员' : '尚未确认可用干员'}，查看详情</p>}
  </div>;
  })}</div>;
}
