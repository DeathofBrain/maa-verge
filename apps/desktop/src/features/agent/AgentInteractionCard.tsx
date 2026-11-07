import { useState } from 'react';
import { ShieldCheck, MessageCircleQuestion } from 'lucide-react';
import type { AgentAnswer, AgentInteraction } from '@maaverge/contracts';
import Button from '@/kit/Button';
import TextArea from '@/kit/TextArea';
import CheckField from '@/kit/CheckField';
import Select from '@/kit/Select';
import Notice from '@/kit/Notice';
import StatusPill from '@/kit/StatusPill';

type Props = {
  interaction: AgentInteraction;
  busy: boolean;
  respond: (answer: AgentAnswer) => Promise<void>;
};

export default function AgentInteractionCard({ interaction, busy, respond }: Props) {
  const [text, setText] = useState('');
  const [choices, setChoices] = useState<string[]>([]);
  // 审批与补充问题使用不同答案结构，普通回答不被当作执行许可。
  const approval =
    interaction.kind === 'approval' || (interaction.kind === 'mcp' && !interaction.inputType);
  const pending = interaction.status === 'pending';
  const minimum = interaction.minChoices ?? (interaction.required ? 1 : 0);
  const maximum = interaction.maxChoices ?? 30;
  const valid =
    interaction.inputType === 'single' || interaction.inputType === 'multiple'
      ? choices.length >= minimum &&
        choices.length <= maximum &&
        (interaction.inputType !== 'single' || choices.length <= 1)
      : !interaction.required || !!text.trim();
  return (
    <section
      className="aw-interaction"
      data-kind={interaction.kind}
      aria-label={`${approval ? '执行审批' : '补充问题'}：${interaction.title}`}
    >
      <div className="aw-row aw-between">
        <h3>
          {approval ? <ShieldCheck size={17} /> : <MessageCircleQuestion size={17} />}
          {interaction.title}
        </h3>
        <StatusPill
          tone={pending ? (approval ? 'warning' : 'info') : 'neutral'}
          label={
            pending
              ? approval
                ? '等待审批'
                : '等待回答'
              : interaction.status === 'answered'
                ? '已回应'
                : '已结束'
          }
        />
      </div>
      <p className="aw-prewrap">{interaction.prompt}</p>
      {approval ? (
        <>
          <Notice tone="warning" size="sm">
            确认后按这里展示的内容授权；普通问题的回答不会授权执行。
          </Notice>
          {interaction.snapshot && (
            <details>
              <summary>查看待执行内容</summary>
              <pre className="aw-json">{JSON.stringify(interaction.snapshot, null, 2)}</pre>
            </details>
          )}
          {pending && (
            <div className="aw-row">
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void respond({ decision: 'approve' })}
              >
                确认执行
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void respond({ decision: 'reject' })}
              >
                拒绝
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {pending && (
            <form
              className="aw-stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (valid)
                  void respond(
                    interaction.inputType === 'single' || interaction.inputType === 'multiple'
                      ? { choices }
                      : { text: text.trim() },
                  );
              }}
            >
              {interaction.snapshot && (
                <details>
                  <summary>查看问题补充说明</summary>
                  <pre className="aw-json">{JSON.stringify(interaction.snapshot, null, 2)}</pre>
                </details>
              )}
              {interaction.inputType === 'single' && (
                <Select
                  aria-label={`回答：${interaction.title}`}
                  value={choices[0] ?? ''}
                  disabled={busy}
                  onChange={(event) => setChoices(event.target.value ? [event.target.value] : [])}
                >
                  <option value="">请选择</option>
                  {(interaction.options ?? []).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {option.description ? ` · ${option.description}` : ''}
                    </option>
                  ))}
                </Select>
              )}
              {interaction.inputType === 'multiple' &&
                (interaction.options ?? []).map((option) => (
                  <CheckField
                    key={option.id}
                    label={option.label}
                    description={option.description}
                    aria-label={option.label}
                    checked={choices.includes(option.id)}
                    disabled={busy || (!choices.includes(option.id) && choices.length >= maximum)}
                    onChange={(event) =>
                      setChoices((previous) =>
                        event.target.checked
                          ? [...previous, option.id]
                          : previous.filter((id) => id !== option.id),
                      )
                    }
                  />
                ))}
              {(!interaction.inputType || interaction.inputType === 'text') && (
                <TextArea
                  aria-label={`回答：${interaction.title}`}
                  value={text}
                  maxLength={interaction.maxLength ?? 4000}
                  disabled={busy}
                  onChange={(event) => setText(event.target.value)}
                />
              )}
              <Button variant="primary" type="submit" disabled={busy || !valid}>
                提交回答
              </Button>
            </form>
          )}
          {!pending && interaction.answer && (
            <p className="aw-muted">
              已回答：
              {interaction.answer.text ??
                interaction.answer.choices
                  ?.map(
                    (id) => interaction.options?.find((option) => option.id === id)?.label ?? id,
                  )
                  .join('、') ??
                '已保存'}
            </p>
          )}
        </>
      )}
    </section>
  );
}
