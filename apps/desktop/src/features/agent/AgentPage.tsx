import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Plus, Send, ShieldCheck } from 'lucide-react';
import {
  errorMessage,
  rpc,
  subscribe,
  type AgentMode,
  type AgentSession,
  type AgentSessionDetail,
  type AgentTurnProgress,
  type AgentUsage,
  type Device,
  type Plan,
} from '@maaverge/contracts';
import Button from '@/kit/Button';
import TextArea from '@/kit/TextArea';
import TextField from '@/kit/TextField';
import Select from '@/kit/Select';
import Tabs from '@/kit/Tabs';
import PageHeading from '@/kit/PageHeading';
import StatusPill from '@/kit/StatusPill';
import ErrorBanner from '@/kit/ErrorBanner';
import Notice from '@/kit/Notice';
import ConfirmDialog from '@/kit/ConfirmDialog';
import AgentInteractionCard from './AgentInteractionCard';
import AgentMemoryPanel from './AgentMemoryPanel';
import AgentExtensionsPanel from './AgentExtensionsPanel';
import AgentMissionPanel from './AgentMissionPanel';
import './agent-workspace.css';

type Props = {
  onReviewPlan: (plan: Plan) => void;
  onOpenSettings: () => void;
  device?: Device;
  plans: Plan[];
};
const turnLabels = {
  queued: '等待处理',
  running: '正在处理',
  waiting: '等待你的回应',
  completed: '已完成',
  cancelled: '已取消',
  failed: '处理失败',
  interrupted: '已中断，可恢复',
};
const sessionLabels = { idle: '就绪', running: '处理中', waiting: '待回应', archived: '已归档' };
const progressLabels: Record<AgentTurnProgress['status'], string> = {
  waiting: '等待模型响应',
  generating: '正在生成回复',
  tool_call: '正在准备工具调用',
};
const tabs = [
  { id: 'chat', label: '对话' },
  { id: 'memory', label: '长期记忆' },
  { id: 'missions', label: '托管授权' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
];
const describeUsage = (usage: AgentUsage) =>
  `${usage.modelCalls} 次模型调用 · 输入 ${usage.inputTokens} / 输出 ${usage.outputTokens} / 合计 ${usage.totalTokens} Token${usage.estimatedCost !== undefined ? ` · 费用估算 ${usage.estimatedCost.toFixed(4)}` : ''}${usage.incomplete ? '（部分用量未知）' : ''}`;

export default function AgentPage({ onReviewPlan, onOpenSettings, device, plans }: Props) {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const sessionPages = useRef(1);
  const [detail, setDetail] = useState<AgentSessionDetail>();
  const selected = useRef('');
  const [sessionId, setSessionId] = useState('');
  const revision = useRef(0);
  const offset = useRef<number | undefined>(undefined);
  const [tab, setTab] = useState('chat');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<AgentMode>('plan');
  const [title, setTitle] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [deleting, setDeleting] = useState(false);
  const request = useRef<{ sessionId: string; text: string; id: string } | undefined>(undefined);
  const chatLog = useRef<HTMLDivElement>(null);
  const pendingStart = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  const previousInteraction = useRef<string | undefined>(undefined);
  const choose = (id: string) => {
    selected.current = id;
    offset.current = undefined;
    setSessionId(id);
    setDetail(undefined);
    revision.current++;
    followMessages.current = true;
  };
  const refresh = useCallback(async () => {
    const generation = revision.current;
    const listed = await rpc('agent.session.list', { limit: 100 });
    const loadedSessions = [...listed.sessions];
    for (let page = 1; page < sessionPages.current && page * 100 < listed.total; page++) {
      const next = await rpc('agent.session.list', { offset: page * 100, limit: 100 });
      loadedSessions.push(...next.sessions);
    }
    if (generation !== revision.current) return;
    const uniqueSessions = [...new Map(loadedSessions.map((item) => [item.id, item])).values()];
    setSessions(uniqueSessions);
    setSessionTotal(listed.total);
    const id =
      (uniqueSessions.some((session) => session.id === selected.current)
        ? selected.current
        : undefined) ||
      uniqueSessions.find((session) => session.status !== 'archived')?.id ||
      uniqueSessions[0]?.id;
    if (!id) {
      selected.current = '';
      setSessionId('');
      setDetail(undefined);
      return;
    }
    if (selected.current !== id) {
      selected.current = id;
      offset.current = undefined;
      setSessionId(id);
    }
    let loaded = await rpc('agent.session.get', {
      sessionId: id,
      offset: offset.current,
      limit: 100,
    });
    if (offset.current === undefined && loaded.total > 100)
      loaded = await rpc('agent.session.get', {
        sessionId: id,
        offset: Math.max(0, loaded.total - 100),
        limit: 100,
      });
    if (generation === revision.current && selected.current === id) setDetail(loaded);
  }, []);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    let disposed = false;
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        await refreshRef.current();
      } catch (cause) {
        if (!disposed) setError(errorMessage(cause));
      } finally {
        loading = false;
      }
    };
    void load();
    const unsubscribe = subscribe((event) => {
      if (event.type.startsWith('agent.')) void load();
    });
    const timer = window.setInterval(() => void load(), 1500);
    return () => {
      disposed = true;
      revision.current++;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (sessionId) void refresh().catch((cause: unknown) => setError(errorMessage(cause)));
  }, [sessionId, refresh]);
  useEffect(() => {
    setTitle(detail?.session.title ?? '');
    setMode(detail?.session.mode ?? 'plan');
  }, [detail?.session.id, detail?.session.title, detail?.session.mode]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    const session = await rpc('agent.session.create', {
      deviceId: device?.id,
      mode,
      title: '新会话',
    });
    choose(session.id);
    await refresh();
    return session;
  };
  const update = async (patch: {
    title?: string;
    mode?: AgentMode;
    status?: AgentSession['status'];
  }) => {
    if (!detail) return;
    await rpc('agent.session.update', {
      sessionId: detail.session.id,
      revision: detail.session.revision,
      ...patch,
    });
    await refresh();
  };
  const send = async () => {
    const text = query.trim();
    if (!text || busy) return;
    await run(async () => {
      const session = detail?.session ?? (await create());
      if (
        !request.current ||
        request.current.sessionId !== session.id ||
        request.current.text !== text
      )
        request.current = { sessionId: session.id, text, id: crypto.randomUUID() };
      await rpc('agent.turn.start', {
        sessionId: session.id,
        message: text,
        requestId: request.current.id,
      });
      request.current = undefined;
      setQuery('');
      offset.current = undefined;
      followMessages.current = true;
      await refresh();
    });
  };
  const session = detail?.session;
  const lastTurn = detail?.turns.at(-1);
  const progress = lastTurn?.status === 'running' ? lastTurn.progress : undefined;
  const active = lastTurn && ['queued', 'running', 'waiting'].includes(lastTurn.status);
  const pending =
    detail?.interactions.filter((interaction) => interaction.status === 'pending') ?? [];
  const canResume =
    lastTurn && ['interrupted', 'failed', 'waiting'].includes(lastTurn.status) && !pending.length;
  const pendingId = pending.at(-1)?.id;
  const lastMessageId = detail?.messages.at(-1)?.id;
  useEffect(() => {
    if (tab !== 'chat' || !chatLog.current) return;
    if (followMessages.current) {
      if (pendingId && pendingId !== previousInteraction.current)
        pendingStart.current?.scrollIntoView({ block: 'start' });
      else chatLog.current.scrollTop = chatLog.current.scrollHeight;
    }
    previousInteraction.current = pendingId;
  }, [
    tab,
    sessionId,
    pendingId,
    lastMessageId,
    lastTurn?.status,
    progress?.text,
    progress?.status,
  ]);
  return (
    <section className="agent-page aw-page">
      <PageHeading
        padding="page"
        title="Agent 助手"
        icon={<Bot />}
        text="围绕目标规划，逐项确认后执行"
        actions={<Button onClick={onOpenSettings}>模型设置</Button>}
      />
      {error && (
        <div className="aw-error">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      <div className="aw-workspace">
        <aside className="aw-sessions" aria-label="Agent 会话">
          <Button variant="primary" disabled={busy} onClick={() => void run(create)}>
            <Plus size={15} />
            新建会话
          </Button>
          <p className="aw-muted">新会话设备：{device?.name ?? '未指定'}</p>
          <div className="aw-session-list">
            {sessions.map((item) => (
              <button
                className="aw-session"
                key={item.id}
                data-selected={item.id === sessionId || undefined}
                aria-pressed={item.id === sessionId}
                onClick={() => {
                  choose(item.id);
                  setQuery('');
                  setReferenceId('');
                  setTab('chat');
                }}
              >
                <strong>{item.title}</strong>
                <span>
                  {item.mode === 'plan' ? '计划模式' : '目标模式'} · {sessionLabels[item.status]}
                </span>
              </button>
            ))}
          </div>
          {sessions.length < sessionTotal && (
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  sessionPages.current++;
                  await refresh();
                })
              }
            >
              查看更多会话
            </Button>
          )}
        </aside>
        <div className="aw-main">
          <div className="aw-toolbar aw-row">
            <TextField
              className="aw-grow"
              aria-label="会话标题"
              value={title}
              disabled={busy || !session}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                if (session && title.trim() && title.trim() !== session.title)
                  void run(() => update({ title: title.trim() }));
              }}
            />
            <Select
              aria-label="Agent 模式"
              value={mode}
              disabled={busy || !!active || session?.status === 'archived'}
              onChange={(event) => {
                const next = event.target.value as AgentMode;
                setMode(next);
                if (session) void run(() => update({ mode: next }));
              }}
            >
              <option value="plan">计划模式</option>
              <option value="goal">目标模式</option>
            </Select>
            {session && (
              <StatusPill
                tone={active ? 'running' : 'neutral'}
                label={sessionLabels[session.status]}
              />
            )}
          </div>
          <Tabs
            aria-label="Agent 工作区"
            idPrefix="agent-workspace"
            value={tab}
            onChange={setTab}
            items={tabs}
          />
          {tab === 'chat' && (
            <div
              className="aw-chat"
              role="tabpanel"
              id="agent-workspace-panel-chat"
              aria-labelledby="agent-workspace-tab-chat"
            >
              <div
                className="aw-chat-log"
                aria-live="polite"
                ref={chatLog}
                onScroll={() => {
                  const element = chatLog.current;
                  if (element)
                    followMessages.current =
                      element.scrollHeight - element.scrollTop - element.clientHeight < 80;
                }}
              >
                {!detail?.messages.length && (
                  <div className="aw-welcome">
                    <Bot size={30} />
                    <h2>从一个具体目标开始</h2>
                    <p>
                      计划模式生成可核对的操作；目标模式可准备有次数、时间与消耗上限的托管授权。
                    </p>
                    <p className="aw-muted">
                      知识检索与自动打新关卡另行建设。模型只通过已开放的工具操作。
                    </p>
                  </div>
                )}
                {detail && detail.total > detail.limit && (
                  <div className="aw-row">
                    <Button
                      disabled={busy || detail.offset === 0}
                      onClick={() =>
                        void run(async () => {
                          offset.current = Math.max(0, detail.offset - detail.limit);
                          await refresh();
                        })
                      }
                    >
                      更早消息
                    </Button>
                    <span className="aw-muted">
                      {detail.offset + 1}–
                      {Math.min(detail.total, detail.offset + detail.messages.length)} /{' '}
                      {detail.total}
                    </span>
                    <Button
                      disabled={busy || detail.offset + detail.messages.length >= detail.total}
                      onClick={() =>
                        void run(async () => {
                          offset.current = detail.offset + detail.limit;
                          await refresh();
                        })
                      }
                    >
                      更新消息
                    </Button>
                  </div>
                )}
                {detail?.references.map((reference) => (
                  <Notice key={reference.id} size="sm" tone="neutral">
                    已引用会话「
                    {sessions.find((item) => item.id === reference.sourceSessionId)?.title ??
                      '历史会话'}
                    」{reference.summary ? `：${reference.summary}` : ''}
                  </Notice>
                ))}
                {detail?.messages.map((message) => (
                  <article className="aw-message" data-role={message.role} key={message.id}>
                    <span className="aw-role">
                      {
                        { user: '你', assistant: 'Agent', tool: '工具', system: '系统' }[
                          message.role
                        ]
                      }
                    </span>
                    <div>
                      <p className="aw-prewrap">{message.content}</p>
                      {message.metadata?.plan &&
                        typeof message.metadata.plan === 'object' &&
                        !Array.isArray(message.metadata.plan) &&
                        'tasks' in message.metadata.plan && (
                          <Button
                            onClick={() => onReviewPlan(message.metadata!.plan as unknown as Plan)}
                          >
                            检查并保存计划
                          </Button>
                        )}
                      <time className="aw-muted">
                        {new Date(message.createdAt).toLocaleTimeString('zh-CN')}
                      </time>
                    </div>
                  </article>
                ))}
                {progress && (
                  <article className="aw-message" data-role="assistant" aria-label="生成中的回复">
                    <span className="aw-role">Agent</span>
                    <div>
                      {progress.text && <p className="aw-prewrap">{progress.text}</p>}
                      <p className="aw-muted" role="status">
                        {progressLabels[progress.status]} · 未完成
                      </p>
                    </div>
                  </article>
                )}
                <div ref={pendingStart} />
                {pending.map((interaction) => (
                  <AgentInteractionCard
                    key={interaction.id}
                    interaction={interaction}
                    busy={busy}
                    respond={(answer) =>
                      run(async () => {
                        followMessages.current = true;
                        await rpc('agent.interaction.respond', {
                          interactionId: interaction.id,
                          answer,
                        });
                        await refresh();
                      })
                    }
                  />
                ))}
                {lastTurn && (
                  <div className="aw-turn-status">
                    <p role="status">
                      {turnLabels[lastTurn.status]}
                      {lastTurn.error ? `：${lastTurn.error}` : ''}
                    </p>
                    <p className="aw-muted">
                      本轮 {describeUsage(lastTurn.usage)}
                      {lastTurn.summaryUsage
                        ? ` · 其中摘要 ${describeUsage(lastTurn.summaryUsage)}`
                        : ''}
                    </p>
                    <div className="aw-row">
                      {active && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await rpc('agent.turn.cancel', { turnId: lastTurn.id });
                              await refresh();
                            })
                          }
                        >
                          取消当前轮次
                        </Button>
                      )}
                      {canResume && (
                        <Button
                          variant="primary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await rpc('agent.turn.resume', { turnId: lastTurn.id });
                              await refresh();
                            })
                          }
                        >
                          恢复当前轮次
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="aw-context-bar">
                <ShieldCheck size={14} />
                <span>
                  {session
                    ? `设备 ${session.scope.deviceId || '未指定'} · ${session.scope.clientType} · 总用量 ${describeUsage(session.usage)}${session.summaryUsage ? ` · 其中摘要 ${describeUsage(session.summaryUsage)}` : ''}`
                    : '对话保存在本机；请先配置模型连接与密钥。'}
                </span>
              </div>
              <form
                className="aw-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <TextArea
                  aria-label="给 Agent 的消息"
                  variant="embedded"
                  className="aw-grow"
                  value={query}
                  disabled={busy || !!active || session?.status === 'archived'}
                  placeholder={
                    mode === 'plan'
                      ? '描述要准备的任务或需要核对的配置…'
                      : '描述目标、设备与允许的执行范围…'
                  }
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
                <Button
                  variant="primary"
                  type="submit"
                  aria-label="发送消息"
                  busy={busy}
                  disabled={busy || !query.trim() || !!active || session?.status === 'archived'}
                >
                  <Send size={16} />
                </Button>
              </form>
            </div>
          )}
          {tab !== 'chat' && (
            <div
              className="aw-content"
              role="tabpanel"
              id={`agent-workspace-panel-${tab}`}
              aria-labelledby={`agent-workspace-tab-${tab}`}
            >
              {tab === 'memory' && (
                <AgentMemoryPanel
                  key={session?.id ?? 'unbound'}
                  session={session}
                  busy={busy}
                  run={run}
                />
              )}
              {tab === 'missions' && (
                <AgentMissionPanel
                  key={session?.id ?? 'unbound'}
                  session={session}
                  plans={plans}
                  busy={busy}
                  run={run}
                  refresh={refresh}
                  onOpenConversation={() => setTab('chat')}
                />
              )}
              {(tab === 'skills' || tab === 'mcp') && (
                <AgentExtensionsPanel
                  key={tab}
                  tab={tab}
                  session={session}
                  busy={busy}
                  run={run}
                  refresh={refresh}
                />
              )}
            </div>
          )}
          {session && (
            <div className="aw-session-actions aw-row">
              <Select
                className="aw-grow"
                aria-label="引用历史会话"
                value={referenceId}
                disabled={busy}
                onChange={(event) => setReferenceId(event.target.value)}
              >
                <option value="">选择历史会话以引用上下文</option>
                {sessions
                  .filter((item) => item.id !== session.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
              </Select>
              <Button
                disabled={busy || !referenceId}
                onClick={() =>
                  void run(async () => {
                    await rpc('agent.context.reference', {
                      sessionId: session.id,
                      sourceSessionId: referenceId,
                    });
                    setReferenceId('');
                    await refresh();
                  })
                }
              >
                引用会话
              </Button>
              <Button
                disabled={busy || !!active}
                onClick={() =>
                  void run(() =>
                    update({ status: session.status === 'archived' ? 'idle' : 'archived' }),
                  )
                }
              >
                {session.status === 'archived' ? '取消归档' : '归档'}
              </Button>
              <Button
                variant="danger"
                disabled={busy || !!active}
                onClick={() => setDeleting(true)}
              >
                删除会话
              </Button>
            </div>
          )}
        </div>
      </div>
      {deleting && session && (
        <ConfirmDialog
          title="删除 Agent 会话"
          confirmLabel="删除会话"
          busy={busy}
          onClose={() => setDeleting(false)}
          onConfirm={() =>
            void run(async () => {
              await rpc('agent.session.delete', {
                sessionId: session.id,
                revision: session.revision,
              });
              setDeleting(false);
              choose('');
              await refresh();
            })
          }
        >
          将删除这段会话与轮次记录。已经保存的任务表和独立长期记忆保留。
        </ConfirmDialog>
      )}
    </section>
  );
}
