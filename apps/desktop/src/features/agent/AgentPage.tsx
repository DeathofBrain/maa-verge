import Button from '@/kit/Button';
import TextArea from '@/kit/TextArea';
import Notice from '@/kit/Notice';
import {
  ArrowRight,
  Bot,
  ListChecks,
  LoaderCircle,
  Send,
  ShieldCheck,
  Monitor,
} from 'lucide-react';
import { taskEnabled, taskLabels, type Device, type Plan } from '@maaverge/contracts';
import PageHeading from '@/kit/PageHeading';
import StatusPill from '@/kit/StatusPill';

export type AgentMessage = { id: string; role: 'user' | 'assistant'; text: string; plan?: Plan };

type Props = {
  messages: AgentMessage[];
  sendMessage: (text: string) => Promise<void>;
  agentQuery: string;
  setAgentQuery: (value: string) => void;
  pending: Set<string>;
  onReviewPlan: (plan: Plan) => void;
  onOpenSettings: () => void;
  device?: Device;
};

export default function AgentPage({
  messages,
  sendMessage,
  agentQuery,
  setAgentQuery,
  pending,
  onReviewPlan,
  onOpenSettings,
  device,
}: Props) {
  return (
    <section className="agent-page">
      <PageHeading
        padding="page"
        title="Agent 助手"
        text="描述目标，检查计划，再交给任务表执行。"
        actions={
          <StatusPill
            tone="info"
            label={
              <>
                <ShieldCheck size={13} />
                审阅后执行
              </>
            }
          />
        }
      />
      <Notice tone="neutral" size="sm" className="agent-notice">
        <Bot size={17} />
        <span>当前使用本地规则生成待审阅提案；云端模型与自主托管尚未接入。</span>
      </Notice>
      <div className="agent-layout">
        <div className="chat-panel">
          <div className="chat-messages" aria-live="polite">
            {!messages.length && (
              <div className="agent-welcome">
                <span className="agent-emblem">
                  <Bot size={31} />
                </span>
                <h2>从一个具体目标开始</h2>
                <p>生成的计划可以回到日常工作台逐项调整。</p>
                <div className="prompt-list">
                  {['制定刷 6 次 1-7 的计划', '安排零消耗的日常任务', '检查我的任务配置'].map(
                    (prompt) => (
                      <button key={prompt} onClick={() => void sendMessage(prompt)}>
                        {prompt}
                        <ArrowRight size={15} />
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <div className={`chat-message ${message.role}`} key={message.id}>
                <span className="chat-role">{message.role === 'user' ? '你' : 'Agent'}</span>
                <div>
                  <p>{message.text}</p>
                  {message.plan && (
                    <div className="proposal-card">
                      <div>
                        <ListChecks size={18} />
                        <h3>{message.plan.name}</h3>
                      </div>
                      <ol>
                        {message.plan.tasks.map((task, index) => (
                          <li key={index}>
                            <span>{index + 1}</span>
                            {taskLabels[task.type] || task.type}
                            <small>
                              {task.type === 'Fight'
                                ? `${String(task.params.stage || '当前关卡')} · ${String(task.params.times || 1)} 次`
                                : taskEnabled(task)
                                  ? '已启用'
                                  : '已关闭'}
                            </small>
                          </li>
                        ))}
                      </ol>
                      <p className="muted">理智药 0 · 源石 0；请在工作台核对有效参数。</p>
                      <Button variant="primary" onClick={() => onReviewPlan(message.plan!)}>
                        检查并保存计划
                        <ArrowRight size={14} />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {pending.has('agent') && (
              <p className="thinking">
                <LoaderCircle className="spin" size={15} />
                正在整理计划…
              </p>
            )}
          </div>
          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(agentQuery);
            }}
          >
            <TextArea
              variant="embedded"
              className="agent-composer-input"
              aria-label="给 Agent 的消息"
              placeholder="例如：今晚刷 6 次 1-7，不使用理智药"
              value={agentQuery}
              onChange={(event) => setAgentQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void sendMessage(agentQuery);
                }
              }}
            />
            <Button
              variant="primary"
              type="submit"
              aria-label="发送消息"
              disabled={!agentQuery.trim() || pending.has('agent')}
            >
              <Send size={17} />
            </Button>
          </form>
        </div>
        <aside className="agent-context">
          <h3>共用同一张任务表</h3>
          <p>Agent 提案会进入工作台草稿。逐项设置、消耗校验和设备控制使用同一套规则。</p>
          <div className="context-fact">
            <Monitor size={16} />
            <span>
              当前设备<strong>{device?.name || '未连接'}</strong>
            </span>
          </div>
          <div className="context-fact">
            <ShieldCheck size={16} />
            <span>
              消耗设置<strong>由任务表内自动作战的用药与源石数量决定</strong>
            </span>
          </div>
          <Button variant="text" onClick={onOpenSettings}>
            模型设置
            <ArrowRight size={14} />
          </Button>
        </aside>
      </div>
    </section>
  );
}
