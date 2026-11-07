import { useEffect, useState } from 'react';
import { rpc, type AgentMemory, type AgentSession } from '@maaverge/contracts';
import Button from '@/kit/Button';
import TextField from '@/kit/TextField';
import TextArea from '@/kit/TextArea';
import Select from '@/kit/Select';
import StatusPill from '@/kit/StatusPill';

type Props = {
  session?: AgentSession;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
};

// 记忆分通用与当前账号范围，编辑携带记录版本，已有记录的范围不能在此表单中改换。
export default function AgentMemoryPanel({ session, busy, run }: Props) {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [key, setKey] = useState('');
  const [content, setContent] = useState('');
  const [scope, setScope] = useState<'global' | 'account'>('account');
  const [editing, setEditing] = useState<AgentMemory>();
  const load = async () => {
    const result = await rpc('agent.memory.list', { sessionId: session?.id, limit: 100 });
    setMemories(result.memories);
  };
  useEffect(() => {
    void run(load);
  }, [session?.id]);
  const clear = () => {
    setEditing(undefined);
    setKey('');
    setContent('');
  };
  return (
    <section className="aw-panel aw-stack" aria-label="长期记忆管理">
      <div>
        <h2>长期记忆</h2>
        <p className="aw-muted">
          通用偏好可在会话间复用；账号记忆只对当前设备、客户端与账号范围生效。可随时修改或删除。
        </p>
      </div>
      <form
        className="aw-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await rpc('agent.memory.save', {
              id: editing?.id,
              revision: editing?.revision,
              sessionId: session?.id,
              key: key.trim(),
              content: content.trim(),
              scope,
            });
            clear();
            await load();
          });
        }}
      >
        <label className="aw-field">
          名称
          <TextField
            aria-label="记忆名称"
            value={key}
            maxLength={200}
            disabled={busy}
            onChange={(event) => setKey(event.target.value)}
          />
        </label>
        <label className="aw-field">
          内容
          <TextArea
            aria-label="记忆内容"
            value={content}
            maxLength={12000}
            disabled={busy}
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
        <label className="aw-field">
          范围
          <Select
            aria-label="记忆范围"
            value={scope}
            disabled={busy || !!editing}
            onChange={(event) => setScope(event.target.value as 'global' | 'account')}
          >
            <option value="account">当前账号</option>
            <option value="global">通用偏好</option>
          </Select>
        </label>
        <div className="aw-row">
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !key.trim() || !content.trim() || (scope === 'account' && !session)}
          >
            {editing ? '保存修改' : '添加记忆'}
          </Button>
          {editing && <Button onClick={clear}>取消编辑</Button>}
        </div>
      </form>
      {!memories.length && <p className="aw-muted">暂无长期记忆。</p>}
      {memories.map((memory) => (
        <article className="aw-card aw-stack" key={memory.id}>
          <div className="aw-row aw-between">
            <h3>{memory.key}</h3>
            <StatusPill label={memory.scope === 'global' ? '通用偏好' : '当前账号'} />
          </div>
          <p className="aw-prewrap">{memory.content}</p>
          <div className="aw-row">
            <Button
              disabled={busy}
              onClick={() => {
                setEditing(memory);
                setKey(memory.key);
                setContent(memory.content);
                setScope(memory.scope);
              }}
            >
              编辑记忆
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await rpc('agent.memory.delete', { id: memory.id, revision: memory.revision });
                  if (editing?.id === memory.id) clear();
                  await load();
                })
              }
            >
              删除记忆
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
