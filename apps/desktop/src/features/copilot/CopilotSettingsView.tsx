import { Plus, Trash2 } from 'lucide-react';
import Select from '../../Select';
import type { CopilotKind, CopilotOptions } from '@maaverge/contracts';

export default function CopilotSettings({
  kind,
  count,
  options,
  change,
}: {
  kind: CopilotKind;
  count: number;
  options: CopilotOptions;
  change: (value: Partial<CopilotOptions>) => void;
}) {
  const operators: { name: string; skill: number }[] = options.additionalOperators;
  const additional = (value: { name: string; skill: number }[]) =>
    change({ additionalOperators: value as CopilotOptions['additionalOperators'] });
  return (
    <details className="cp-settings">
      <summary>执行选项</summary>
      <label className="cp-field">
        循环次数
        <input
          className="text-input"
          aria-label="作业循环次数"
          type="number"
          min={1}
          max={999}
          disabled={kind === 'ParadoxCopilot' || count > 1}
          value={options.loopTimes}
          onChange={(event) => {
            if (
              Number.isInteger(event.target.valueAsNumber) &&
              event.target.valueAsNumber >= 1 &&
              event.target.valueAsNumber <= 999
            )
              change({
                loopTimes: event.target.valueAsNumber,
                ...(event.target.valueAsNumber > 1 ? { supportUnitName: '' } : {}),
              });
          }}
        />
      </label>
      {(kind === 'ParadoxCopilot' || count > 1) && (
        <p className="sp-help">悖论及多作业列表按单次队列执行；循环仅用于单份普通或保全作业。</p>
      )}
      {kind === 'Copilot' && (
        <>
          <label className="cp-check">
            <input
              type="checkbox"
              checked={options.formation}
              onChange={(event) =>
                change({
                  formation: event.target.checked,
                  ...(!event.target.checked
                    ? {
                        supportUnitName: '',
                        additionalOperators: [],
                        addTrust: false,
                        ignoreRequirements: false,
                      }
                    : {}),
                })
              }
            />
            自动编队
          </label>
          {options.formation && (
            <>
              <p className="cp-error-text">自动编队会清空当前编队，请先确认。</p>
              <label className="cp-field">
                编队栏位
                <Select
                  className="text-input"
                  aria-label="作业编队栏位"
                  value={options.formationIndex}
                  onChange={(event) => change({ formationIndex: Number(event.target.value) })}
                >
                  {[0, 1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value === 0 ? '当前编队' : `第 ${value} 队`}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="cp-check">
                <input
                  type="checkbox"
                  checked={options.addTrust}
                  onChange={(event) => change({ addTrust: event.target.checked })}
                />
                补充低信赖干员
              </label>
              <label className="cp-check">
                <input
                  type="checkbox"
                  checked={options.ignoreRequirements}
                  onChange={(event) => change({ ignoreRequirements: event.target.checked })}
                />
                忽略练度要求
              </label>
              <label className="cp-field">
                助战干员
                <input
                  className="text-input"
                  aria-label="助战干员"
                  disabled={options.loopTimes > 1}
                  value={options.supportUnitName}
                  onChange={(event) => change({ supportUnitName: event.target.value })}
                  placeholder="留空关闭助战"
                  maxLength={80}
                />
              </label>
              {options.loopTimes > 1 && (
                <p className="sp-help">循环执行时关闭助战；使用助战请改为执行 1 次。</p>
              )}
              <div className="cp-additional">
                <strong>追加干员</strong>
                {operators.map((operator, index) => (
                  <div className="cp-additional-row" key={index}>
                    <input
                      className="text-input"
                      aria-label={`追加干员 ${index + 1}`}
                      value={operator.name}
                      maxLength={80}
                      onChange={(event) =>
                        additional(
                          operators.map((item, i) =>
                            i === index ? { ...item, name: event.target.value } : item,
                          ),
                        )
                      }
                    />
                    <Select
                      className="text-input"
                      aria-label={`追加技能 ${index + 1}`}
                      value={operator.skill}
                      onChange={(event) =>
                        additional(
                          operators.map((item, i) =>
                            i === index ? { ...item, skill: Number(event.target.value) } : item,
                          ),
                        )
                      }
                    >
                      {[1, 2, 3].map((skill) => (
                        <option key={skill} value={skill}>
                          技能 {skill}
                        </option>
                      ))}
                    </Select>
                    <button
                      className="icon-button"
                      aria-label={`删除追加干员 ${index + 1}`}
                      onClick={() => additional(operators.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  className="cp-link"
                  disabled={options.additionalOperators.length >= 12}
                  onClick={() => additional([...operators, { name: '', skill: 1 }])}
                >
                  <Plus size={14} />
                  追加干员
                </button>
              </div>
            </>
          )}
        </>
      )}
      <label className="cp-check">
        <input
          type="checkbox"
          checked={options.autoLikeOnSuccess ?? false}
          onChange={(event) => change({ autoLikeOnSuccess: event.target.checked })}
        />
        通关成功后自动点赞
      </label>
      <p className="sp-help">仅对本队列中明确确认通关的社区作业点赞，不覆盖手动点踩。默认关闭。</p>
      <p className="sp-help">
        默认执行 1 次；普通单份循环需从编队界面开始。药剂、源石与加急消耗为
        0，运行中调整仅用于下次启动。
      </p>
    </details>
  );
}
