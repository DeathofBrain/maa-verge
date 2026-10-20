import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, ListChecks, LoaderCircle, Plus, Settings2, ShieldCheck, Trash2, X } from 'lucide-react';
import { taskDefaults, taskEnabled, taskLabels, type Plan } from '@maaverge/contracts';

type Task = Plan['tasks'][number];
type Step = { key: string; task: Task; json: string };
type Field = { key: string; label: string; kind?: 'number' | 'check' | 'list' | 'numbers' | 'select'; options?: (string | [string, string])[]; min?: number; max?: number; step?: number; hint?: string };
const clients: [string, string][] = [['Official', '官服'], ['Bilibili', 'B 服'], ['YoStarEN', '国际服'], ['YoStarJP', '日服'], ['YoStarKR', '韩服'], ['txwy', '繁中服']];
const fields: Record<string, Field[]> = {
  StartUp: [{ key: 'client_type', label: '游戏客户端', kind: 'select', options: clients }, { key: 'start_game_enabled', label: '自动启动游戏', kind: 'check' }, { key: 'account_name', label: '切换账号标识' }],
  CloseDown: [{ key: 'client_type', label: '游戏客户端', kind: 'select', options: clients }],
  Fight: [{ key: 'stage', label: '作战关卡', hint: '留空使用当前关卡；剿灭请填写 Annihilation。' }, { key: 'times', label: '作战次数', kind: 'number', min: 1, max: 2147483647 }, { key: 'medicine', label: '理智药上限', kind: 'number', min: 0, max: 100 }, { key: 'stone', label: '源石上限', kind: 'number', min: 0, max: 100 }, { key: 'series', label: '连战次数', kind: 'number', min: -1, max: 10 }, { key: 'DrGrandet', label: '源石使用前等待理智恢复', kind: 'check' }, { key: 'report_to_penguin', label: '上传掉落至企鹅物流', kind: 'check' }, { key: 'report_to_yituliu', label: '上传掉落至一图流', kind: 'check' }],
  Recruit: [{ key: 'times', label: '招募次数', kind: 'number', min: 0, max: 2147483647 }, { key: 'select', label: '选择星级', kind: 'numbers', hint: '以逗号分隔，例如 4,5。' }, { key: 'confirm', label: '自动确认星级', kind: 'numbers' }, { key: 'refresh', label: '自动刷新标签', kind: 'check' }, { key: 'expedite', label: '使用加急许可', kind: 'check' }, { key: 'expedite_times', label: '加急次数（上游已弃用）', kind: 'number', min: 0, max: 100 }, { key: 'skip_robot', label: '跳过支援机械', kind: 'check' }],
  Infrast: [{ key: 'facility', label: '设施顺序', kind: 'list', hint: 'Mfg 制造站、Trade 贸易站、Power 发电站、Control 控制中枢、Reception 会客室、Office 办公室、Dorm 宿舍。以逗号分隔。' }, { key: 'drones', label: '无人机用途', kind: 'select', options: [['_NotUse', '不使用'], ['Money', '龙门币'], ['SyntheticJade', '合成玉'], ['CombatRecord', '作战记录'], ['PureGold', '赤金'], ['OriginStone', '源石碎片'], ['Chip', '芯片']] }, { key: 'threshold', label: '换班心情阈值', kind: 'number', min: 0, max: 1, step: 0.05 }, { key: 'mode', label: '换班模式', kind: 'select', options: [['0', '自动换班'], ['10000', '自定义排班'], ['20000', '轮换模式']] }, { key: 'filename', label: '自定义排班文件路径' }, { key: 'plan_index', label: '排班方案序号', kind: 'number', min: 0 }, { key: 'dorm_notstationed_enabled', label: '宿舍优先未进驻干员', kind: 'check' }, { key: 'reception_message_board', label: '领取会客室留言奖励', kind: 'check' }],
  Mall: [{ key: 'shopping', label: '购买信用商品', kind: 'check' }, { key: 'visit_friends', label: '访问好友收取信用', kind: 'check' }, { key: 'buy_first', label: '优先购买', kind: 'list' }, { key: 'blacklist', label: '购买黑名单', kind: 'list' }, { key: 'force_shopping_if_credit_full', label: '信用溢出时忽略黑名单', kind: 'check' }, { key: 'only_buy_discount', label: '只购买打折商品', kind: 'check' }, { key: 'credit_fight', label: '借助战获取信用', kind: 'check' }],
  Award: ['award:任务奖励', 'mail:邮件奖励', 'recruit:每日免费单抽', 'orundum:幸运墙', 'mining:限时开采', 'specialaccess:赠送月卡', 'signinevent:限时签到'].map((entry) => { const [key, label] = entry.split(':'); return { key, label, kind: 'check' }; }),
  SwitchTheme: [{ key: 'themes', label: '候选主题名称', kind: 'list', hint: '填写游戏内的完整名称，逗号分隔；留空跳过。' }],
  Roguelike: [{ key: 'theme', label: '集成战略主题', kind: 'select', options: [['Phantom', '傀影与猩红孤钻'], ['Mizuki', '水月与深蓝之树'], ['Sami', '探索者的银凇止境'], ['Sarkaz', '萨卡兹的无终奇语'], ['JieGarden', '岁的界园志异'], ['BlackFlow', '黑流']] }, { key: 'mode', label: '运行模式', kind: 'number', min: 0, hint: '0 刷分、1 刷源石锭；其他模式按所选主题填写。' }, { key: 'starts_count', label: '开始探索次数', kind: 'number', min: 1 }, { key: 'investment_enabled', label: '投资源石锭', kind: 'check' }, { key: 'stop_when_investment_full', label: '投资满额后停止', kind: 'check' }, { key: 'squad', label: '分队名称' }, { key: 'roles', label: '开局招募组合' }, { key: 'core_char', label: '核心干员' }, { key: 'use_support', label: '使用助战', kind: 'check' }],
  Reclamation: [{ key: 'theme', label: '生息演算主题', kind: 'select', options: [['Tales', '沙洲遗闻'], ['RelaunchAnchor', '重启锚点']] }, { key: 'mode', label: '运行模式', kind: 'number', min: 0, hint: '沙洲遗闻：0 无存档、1 有存档；重启锚点：16 / 32 / 48。' }, { key: 'tools_to_craft', label: '制造物品', kind: 'list' }, { key: 'num_craft_batches', label: '最大制造轮数', kind: 'number', min: 1 }, { key: 'clear_store', label: '完成后清空商店', kind: 'check' }],
  Copilot: [{ key: 'filename', label: '作业文件路径', hint: '使用本机作业 JSON 文件；作业列表可在高级参数中配置；使用列表时移除 filename。' }, { key: 'loop_times', label: '循环次数', kind: 'number', min: 1 }, { key: 'formation', label: '自动编队', kind: 'check' }, { key: 'formation_index', label: '编队序号', kind: 'number', min: 1, max: 4 }, { key: 'add_trust', label: '补充信赖干员', kind: 'check' }, { key: 'ignore_requirements', label: '忽略练度要求', kind: 'check' }],
  SSSCopilot: [{ key: 'filename', label: '保全作业文件路径' }, { key: 'loop_times', label: '循环次数', kind: 'number', min: 1 }],
  ParadoxCopilot: [{ key: 'filename', label: '悖论作业文件路径', hint: '多份作业可在高级参数的 list 中配置；使用列表时移除 filename。' }],
  VideoRecognition: [{ key: 'filename', label: '视频文件路径' }],
  Custom: [{ key: 'task_names', label: '资源任务入口', kind: 'list', hint: '当前仅接受已审核的入口；未审核任务会被策略拒绝。' }],
  SingleStep: [{ key: 'type', label: '任务协议', kind: 'select', options: ['copilot'] }, { key: 'subtype', label: '步骤类型', kind: 'select', options: [['stage', '设置关卡'], ['start', '开始作战'], ['action', '战斗动作']] }],
};
const createStep = (type: string): Step => {
  const params = structuredClone(taskDefaults[type] || {});
  return { key: crypto.randomUUID(), task: { type: type as Task['type'], params, enabled: true }, json: JSON.stringify(params, null, 2) };
};

export default function PlanEditor({ plan, onClose, onSave }: { plan: Plan | 'new'; onClose: () => void; onSave: (plan: Plan) => Promise<boolean> }) {
  const [name, setName] = useState(plan === 'new' ? '' : plan.name);
  const [steps, setSteps] = useState<Step[]>(() => plan === 'new' ? ['StartUp', 'Fight', 'Award'].map(createStep) : plan.tasks.map((task) => ({ key: crypto.randomUUID(), task: { ...structuredClone(task), enabled: task.enabled !== false && task.params.enable !== false }, json: JSON.stringify(task.params, null, 2) })));
  const [selected, setSelected] = useState(() => Math.max(0, plan === 'new' ? 1 : plan.tasks.findIndex((task) => task.type === 'Fight')));
  const [addType, setAddType] = useState('Fight');
  const [enabled, setEnabled] = useState(plan === 'new' ? true : plan.enabled);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLInputElement>('#plan-name')?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const step = steps[selected];
  const jsonValid = (() => { try { const value = JSON.parse(step?.json || '{}'); return !!value && typeof value === 'object' && !Array.isArray(value); } catch { return false; } })();
  const patchTask = (index: number, patch: Partial<Task>) => setSteps((previous) => previous.map((entry, i) => {
    if (i !== index) return entry;
    let params = entry.task.params;
    if ('enable' in params && patch.enabled !== undefined) {
      try { const parsed = JSON.parse(entry.json); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) params = { ...parsed, enable: patch.enabled }; } catch { /* Preserve invalid advanced drafts. */ }
    }
    return { ...entry, task: { ...entry.task, ...patch, params }, json: params === entry.task.params ? entry.json : JSON.stringify(params, null, 2) };
  }));
  const setParam = (key: string, value: unknown) => {
    const params = { ...step.task.params, [key]: value };
    if (value === undefined) delete params[key];
    setSteps((previous) => previous.map((entry, i) => i === selected ? { ...entry, task: { ...entry.task, params }, json: JSON.stringify(params, null, 2) } : entry));
  };
  const setJson = (json: string) => setSteps((previous) => previous.map((entry, i) => {
    if (i !== selected) return entry;
    try { const params = JSON.parse(json); if (params && typeof params === 'object' && !Array.isArray(params)) return { ...entry, json, task: { ...entry.task, params } }; } catch { /* Retain invalid draft for correction. */ }
    return { ...entry, json };
  }));
  const move = (index: number, offset: number) => {
    const next = [...steps];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setSteps(next); setSelected(index + offset);
  };
  const save = async () => {
    if (!name.trim()) { setFormError('请给任务表起一个名字'); return; }
    if (!steps.length) { setFormError('请至少添加一个任务'); return; }
    const tasks: Task[] = [];
    for (let i = 0; i < steps.length; i++) {
      try {
        const params = JSON.parse(steps[i].json);
        if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error();
        tasks.push({ ...steps[i].task, params });
      } catch { setSelected(i); setFormError(`第 ${i + 1} 条任务的高级参数必须是有效 JSON 对象`); return; }
    }
    setSaving(true); setFormError('');
    try {
      const saved = await onSave({ ...(plan === 'new' ? {} : plan), id: plan === 'new' ? crypto.randomUUID() : plan.id, name: name.trim(), enabled, schedule: plan === 'new' ? null : plan.schedule, tasks: tasks as Plan['tasks'] });
      if (!saved) setFormError('保存失败，请根据提示检查任务参数与消耗预算。');
    } finally { setSaving(false); }
  };
  return <div className="modal-backdrop" onClick={() => { if (!saving) onClose(); }}><section ref={dialog} className="modal plan-editor" role="dialog" aria-modal="true" aria-label={plan === 'new' ? '创建任务表' : '编辑任务表'} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); if (!saving) onClose(); return; }
    if (event.key !== 'Tab') return;
    const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, summary') || [])];
    if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
  }}>
    <div className="modal-title"><div><div className="eyebrow">TASK CONFIGURATION</div><h2>{plan === 'new' ? '创建任务表' : '编辑任务表'}</h2><p>按顺序执行，每条任务独立设置。</p></div><button className="icon-button" aria-label="关闭编辑器" disabled={saving} onClick={onClose}><X size={21} /></button></div>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="editor-name"><label htmlFor="plan-name">任务表名称<input id="plan-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：每日任务" maxLength={80} /></label><label className="editor-enable"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />启用任务表</label></div>
      <div className="task-editor-layout"><div className="step-list-pane"><div className="step-heading"><ListChecks size={16} />任务顺序<span>{steps.length} / 30</span></div><ol className="editor-steps">{steps.map((entry, index) => <li key={entry.key} className={`${index === selected ? 'selected' : ''} ${!taskEnabled(entry.task) ? 'disabled-step' : ''}`}><input type="checkbox" aria-label={`启用第 ${index + 1} 条任务`} checked={taskEnabled(entry.task)} onChange={(event) => patchTask(index, { enabled: event.target.checked })} /><button type="button" className="step-select" aria-label={`设置第 ${index + 1} 条${taskLabels[entry.task.type] || entry.task.type}`} onClick={() => setSelected(index)}><span className="step-number">{index + 1}</span><span>{taskLabels[entry.task.type] || entry.task.type}<small>{entry.task.type === 'Fight' ? `${String(entry.task.params.stage || '当前关卡')} · ${String(entry.task.params.times ?? 1)} 次` : entry.task.type}</small></span><Settings2 size={14} /></button></li>)}</ol>
        <div className="add-step"><label className="field-label" htmlFor="task-type">添加任务类型</label><select id="task-type" className="text-input" value={addType} onChange={(event) => setAddType(event.target.value)}>{Object.entries(taskLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select><button className="button secondary" type="button" disabled={steps.length >= 30} onClick={() => { setSteps((previous) => [...previous, createStep(addType)]); setSelected(steps.length); }}><Plus size={15} />添加任务</button></div>
      </div><section className="step-settings" aria-label="单项任务设置">{step ? <><div className="step-settings-title"><div><span>第 {selected + 1} 条任务</span><h3>{taskLabels[step.task.type] || step.task.type}</h3></div><div className="step-tools"><button type="button" className="icon-button" aria-label="上移任务" disabled={selected === 0} onClick={() => move(selected, -1)}><ArrowUp size={16} /></button><button type="button" className="icon-button" aria-label="下移任务" disabled={selected === steps.length - 1} onClick={() => move(selected, 1)}><ArrowDown size={16} /></button><button type="button" className="icon-button" aria-label="复制任务" disabled={steps.length >= 30} onClick={() => { const next = [...steps]; next.splice(selected + 1, 0, { ...structuredClone(step), key: crypto.randomUUID() }); setSteps(next); setSelected(selected + 1); }}><Copy size={16} /></button><button type="button" className="icon-button danger-hover" aria-label="删除任务" onClick={() => { setSteps((previous) => previous.filter((_, i) => i !== selected)); setSelected(Math.max(0, selected - 1)); }}><Trash2 size={16} /></button></div></div>
        <fieldset className="task-fields" disabled={!jsonValid}>{(fields[step.task.type] || []).map((field) => <ParamField key={step.key + field.key} field={field} value={step.task.params[field.key]} onChange={(value) => setParam(field.key, value)} />)}</fieldset>{!jsonValid && <p role="alert" className="form-error">请先修正高级参数中的 JSON，再使用表单。</p>}
        {step.task.type === 'OperProgress' && <p className="parameter-help">在高级参数的 plans 数组中填写目标干员、精英化等级、技能等级与专精目标。此任务执行养成并消耗游戏材料，请逐项核对目标；默认计划为空。</p>}{!fields[step.task.type]?.length && step.task.type !== 'OperProgress' && <p className="parameter-help">此识别任务使用核心默认参数。识别结果目前保存在运行事件中，数据导出界面待接入。</p>}
        {step.task.type === 'Recruit' && <p className="parameter-help">招募次数填 0 可仅识别标签。当前核心无法保证加急消耗上限，开启加急会被策略拒绝。</p>}{step.task.type === 'SingleStep' && <p className="parameter-help">在高级参数中配置 details。action 使用 details.actions 数组；动作完成后仍需观察验证。</p>}
        <details className="advanced-params" key={step.key}><summary>高级参数 <span>完整 MaaCore JSON</span></summary><p>可补充上游参数；已有字段会完整保留。消耗与任务策略仍会检查。</p><label className="field-label" htmlFor="task-json">任务参数 JSON</label><textarea id="task-json" spellCheck={false} value={step.json} onChange={(event) => setJson(event.target.value)} /></details>
      </> : <div className="editor-empty"><ListChecks size={30} /><p>从左侧添加第一条任务</p></div>}</section></div>
      <div className="editor-budget"><ShieldCheck size={17} /><span>默认理智药 0 · 源石 0 · 加急许可 0<small>任务表保存与执行时均检查已配置预算。</small></span></div>
      {formError && <p role="alert" className="form-error">{formError}</p>}<div className="modal-actions"><button className="button secondary" type="button" disabled={saving} onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}保存任务表</button></div>
    </form>
  </section></div>;
}

function ParamField({ field, value, onChange }: { field: Field; value: unknown; onChange: (value: unknown) => void }) {
  const id = `param-${field.key}`;
  if (field.kind === 'check') return <label className="param-check" htmlFor={id}><input id={id} type="checkbox" ref={(input) => { if (input) input.indeterminate = value === undefined; }} checked={value === true} onChange={(event) => onChange(event.target.checked)} />{field.label}{value === undefined && <small>核心默认</small>}</label>;
  const textValue = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  return <div className={`param-field ${field.kind === 'list' || field.hint ? 'wide' : ''}`}><label className="field-label" htmlFor={id}>{field.label}</label>{field.kind === 'select' ? <select id={id} className="text-input" value={textValue} onChange={(event) => onChange(event.target.value === '' ? undefined : ['mode'].includes(field.key) ? Number(event.target.value) : event.target.value)}><option value="">使用核心默认值</option>{textValue && !field.options?.some((option) => (Array.isArray(option) ? option[0] : option) === textValue) && <option value={textValue}>{textValue}</option>}{field.options?.map((option) => { const [v, label] = Array.isArray(option) ? option : [option, option]; return <option key={v} value={v}>{label}</option>; })}</select> : field.kind === 'list' || field.kind === 'numbers' ? <ListInput id={id} value={textValue} numeric={field.kind === 'numbers'} onChange={onChange} /> : <input id={id} className="text-input" type={field.kind === 'number' ? 'number' : 'text'} min={field.min} max={field.max} step={field.step ?? 1} value={textValue} onChange={(event) => onChange(field.kind === 'number' ? event.target.value === '' ? undefined : Number(event.target.value) : event.target.value)} />}{field.hint && <small>{field.hint}</small>}</div>;
}

function ListInput({ id, value, numeric, onChange }: { id: string; value: string; numeric: boolean; onChange: (value: unknown) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    const canonical = (text: string) => text.split(/[,，]/).map((entry) => entry.trim()).filter(Boolean).join(',');
    setDraft((previous) => canonical(previous) === canonical(value) ? previous : value);
  }, [value]);
  return <input id={id} className="text-input" value={draft} onChange={(event) => { const next = event.target.value; setDraft(next); const entries = next.split(/[,，]/).map((entry) => entry.trim()).filter(Boolean); onChange(numeric ? entries.map(Number) : entries); }} />;
}
