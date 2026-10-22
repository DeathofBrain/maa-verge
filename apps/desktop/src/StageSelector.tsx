import { useEffect, useId, useState } from 'react';
import { rpc, stagePresets, subscribe, type RpcParams, type RpcResult } from '@maaverge/contracts';
import './stage-selector.css';

type Catalog = RpcResult<'stages.list'>;
type ClientType = NonNullable<RpcParams<'stages.list'>['clientType']>;
export interface StageSelectorProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (stage: string) => void;
  clientType?: ClientType;
  disabled?: boolean;
}
const defaults: Catalog['stages'] = stagePresets.map(stage => ({ value: stage.value, label: stage.label, category: stage.value ? 'permanent' : 'default', available: true }));

export default function StageSelector({ id, label = '作战关卡', value, onChange, clientType = 'Official', disabled = false }: StageSelectorProps) {
  const generatedId = useId(), inputId = id ?? `stage-${generatedId}`;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [manual, setManual] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const stages = catalog?.clientType === clientType ? catalog.stages : defaults;
  const selected = stages.find(stage => stage.value === value);

  useEffect(() => subscribe(event => { if (event.type === 'update.changed') setRefresh(previous => previous + 1); }), []);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false); setError('');
    void rpc('stages.list', { clientType }).then(result => {
      if (!cancelled) { setCatalog(result); setLoaded(true); }
    }).catch(cause => {
      if (!cancelled) { setCatalog(null); setLoaded(true); setError(cause instanceof Error ? cause.message : String(cause)); }
    });
    return () => { cancelled = true; };
  }, [clientType, refresh]);
  useEffect(() => { if (loaded && !selected && value) setManual(true); }, [loaded, selected, value]);

  const toggleManual = (checked: boolean) => {
    setManual(checked);
    if (!checked && !selected) onChange('');
  };
  const activityStages = stages.filter(stage => stage.category === 'activity');
  const permanentStages = stages.filter(stage => stage.category === 'permanent');
  const option = (stage: Catalog['stages'][number]) => <option key={stage.value} value={stage.value} disabled={!stage.available}>{stage.label}{!stage.available ? `（${stage.tip || '暂不可用'}）` : ''}</option>;
  return <div className="stage-selector">
    <div className="stage-selector-heading"><label htmlFor={inputId}>{label}</label><label className="stage-selector-manual"><input type="checkbox" checked={manual} disabled={disabled} onChange={event => toggleManual(event.target.checked)} />手动输入关卡</label></div>
    {manual ? <input id={inputId} className="text-input" value={value} disabled={disabled} maxLength={200} placeholder="例如 1-7；留空使用当前 / 上次关卡" onChange={event => onChange(event.target.value)} /> : <select id={inputId} className="text-input" value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
      {stages.filter(stage => stage.category === 'default').map(option)}
      {!selected && value && <option value={value}>{value}（已保存）</option>}
      {activityStages.length > 0 && <optgroup label="资源活动关卡">{activityStages.map(option)}</optgroup>}
      <optgroup label="常驻关卡">{permanentStages.map(option)}</optgroup>
    </select>}
    <p className="stage-selector-hint" aria-live="polite">{manual ? '手动关卡使用原版 MAA 导航名称；留空使用当前 / 上次关卡。' : selected?.tip || (loaded ? catalog?.message || '显示常驻关卡' : '正在读取当前资源的关卡…')}</p>
    {error && <p className="stage-selector-error" role="status">关卡目录读取失败，仍可选择常驻关卡或手动输入。{error}</p>}
  </div>;
}
