import { useEffect, useState } from 'react';
import {
  rpc,
  type AgentMcpConfig,
  type AgentMcpTool,
  type AgentSession,
  type AgentSkill,
} from '@maaverge/contracts';
import Button from '@/kit/Button';
import TextField from '@/kit/TextField';
import TextArea from '@/kit/TextArea';
import CheckField from '@/kit/CheckField';
import Select from '@/kit/Select';
import NumberField from '@/kit/NumberField';
import Notice from '@/kit/Notice';

type Props = {
  tab: 'skills' | 'mcp';
  session?: AgentSession;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
  refresh: () => Promise<void>;
};
const initialSkill =
  '---\nname: daily-planner\ndescription: 根据用户目标准备日常任务草稿\nallowed-tools: ""\n---\n优先复用现有任务表。涉及执行时等待明确审批。';
const emptyServer = (): AgentMcpConfig => ({
  id: '',
  name: '',
  transport: 'stdio',
  enabled: false,
  command: '',
  args: [],
  enabledTools: [],
  timeoutMs: 30000,
});

export default function AgentExtensionsPanel({ tab, session, busy, run, refresh }: Props) {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [servers, setServers] = useState<AgentMcpConfig[]>([]);
  const [skillContent, setSkillContent] = useState(initialSkill);
  const [skillId, setSkillId] = useState<string>();
  const [skillPath, setSkillPath] = useState('');
  const [server, setServer] = useState(emptyServer);
  const [args, setArgs] = useState('');
  const [tools, setTools] = useState<Record<string, AgentMcpTool[]>>({});
  const [connection, setConnection] = useState<{
    url?: string;
    token?: string;
    enabled: boolean;
  }>();
  const [checkResult, setCheckResult] = useState<Record<string, string>>({});
  const load = async () => {
    const [skillList, mcpList] = await Promise.all([
      rpc('agent.skill.list', {}),
      rpc('agent.mcp.list', {}),
    ]);
    setSkills(skillList.skills);
    setServers(mcpList.servers);
  };
  useEffect(() => {
    void run(load);
    return () => setConnection(undefined);
  }, []);
  // 安装或启用扩展与当前会话选用分离；会话更新携带 revision，由服务端拒绝过期写入。
  const selectExtension = async (
    field: 'skillIds' | 'mcpServerIds',
    id: string,
    enabled: boolean,
  ) => {
    if (!session) return;
    await rpc('agent.session.update', {
      sessionId: session.id,
      revision: session.revision,
      [field]: enabled ? [...session[field], id] : session[field].filter((item) => item !== id),
    });
    await refresh();
  };
  return (
    <section
      className="aw-panel aw-stack"
      aria-label={tab === 'skills' ? 'Skills 管理' : 'MCP 管理'}
    >
      {tab === 'skills' ? (
        <>
          <div>
            <h2>Skills</h2>
            <p className="aw-muted">
              添加指令说明并选择用于当前会话。Skill 不能扩大工具权限或跳过执行审批。
            </p>
          </div>
          <form
            className="aw-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await rpc('agent.skill.save', {
                  id: skillId,
                  content: skillContent,
                  ...(skillId ? {} : { enabled: false }),
                });
                setSkillId(undefined);
                setSkillContent(initialSkill);
                await load();
              });
            }}
          >
            <label className="aw-field">
              SKILL.md 内容
              <TextArea
                className="aw-editor"
                aria-label="Skill 内容"
                value={skillContent}
                maxLength={64000}
                disabled={busy}
                onChange={(event) => setSkillContent(event.target.value)}
              />
            </label>
            <div className="aw-row">
              <Button type="submit" variant="primary" disabled={busy || !skillContent.trim()}>
                {skillId ? '保存 Skill 修改' : '添加 Skill'}
              </Button>
              {skillId && (
                <Button
                  onClick={() => {
                    setSkillId(undefined);
                    setSkillContent(initialSkill);
                  }}
                >
                  取消编辑
                </Button>
              )}
            </div>
          </form>
          <form
            className="aw-row"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await rpc('agent.skill.import', { path: skillPath, enabled: false });
                setSkillPath('');
                await load();
              });
            }}
          >
            <TextField
              className="aw-grow"
              aria-label="Skill 导入路径"
              placeholder="本机 SKILL.md 或目录的完整路径"
              value={skillPath}
              disabled={busy}
              onChange={(event) => setSkillPath(event.target.value)}
            />
            <Button type="submit" disabled={busy || !skillPath.trim()}>
              从本机导入
            </Button>
          </form>
          {!skills.length && <p className="aw-muted">暂无 Skill。</p>}
          {skills.map((skill) => (
            <article key={skill.id} className="aw-card aw-stack">
              <div>
                <h3>{skill.name}</h3>
                <p>{skill.description}</p>
                <p className="aw-muted">
                  允许的工具：{skill.allowedTools.join('、') || '未指定或为空'}
                </p>
                {!skill.allowedTools.length && (
                  <p className="aw-muted">
                    未声明 allowed-tools 时沿用宿主权限；声明为空字符串时禁用工具。
                  </p>
                )}
              </div>
              <CheckField
                label="启用此 Skill"
                checked={skill.enabled}
                disabled={busy}
                onChange={(event) =>
                  void run(async () => {
                    await rpc('agent.skill.enable', {
                      id: skill.id,
                      enabled: event.target.checked,
                    });
                    await load();
                  })
                }
              />
              <CheckField
                label="用于当前会话"
                checked={session?.skillIds.includes(skill.id) ?? false}
                disabled={busy || !session || !skill.enabled}
                onChange={(event) =>
                  void run(() => selectExtension('skillIds', skill.id, event.target.checked))
                }
              />
              <div className="aw-row">
                <Button
                  disabled={busy}
                  onClick={() => {
                    setSkillId(skill.id);
                    setSkillContent(skill.content);
                  }}
                >
                  编辑 Skill
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await rpc('agent.skill.delete', { id: skill.id });
                      await load();
                      await refresh();
                    })
                  }
                >
                  删除 Skill
                </Button>
              </div>
            </article>
          ))}
        </>
      ) : (
        <>
          <div>
            <h2>MCP</h2>
            <p className="aw-muted">
              连接外部工具，逐项选择允许使用的工具。连接检查由你手动发起；外部工具执行单独审批。
            </p>
          </div>
          <form
            className="aw-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await rpc('agent.mcp.save', {
                  server: {
                    ...server,
                    id: server.id || crypto.randomUUID(),
                    args: args.split('\n').filter(Boolean),
                  },
                });
                setServer(emptyServer());
                setArgs('');
                await load();
              });
            }}
          >
            <label className="aw-field">
              服务器名称
              <TextField
                aria-label="MCP 服务器名称"
                value={server.name}
                disabled={busy}
                maxLength={200}
                onChange={(event) =>
                  setServer((previous) => ({ ...previous, name: event.target.value }))
                }
              />
            </label>
            <label className="aw-field">
              连接方式
              <Select
                aria-label="MCP 连接方式"
                value={server.transport}
                disabled={busy}
                onChange={(event) =>
                  setServer((previous) => ({
                    ...previous,
                    transport: event.target.value as AgentMcpConfig['transport'],
                    url: undefined,
                    command: undefined,
                    args: [],
                  }))
                }
              >
                <option value="stdio">本机程序（stdio）</option>
                <option value="streamable-http">HTTP</option>
              </Select>
            </label>
            {server.transport === 'stdio' ? (
              <>
                <label className="aw-field">
                  程序路径
                  <TextField
                    aria-label="MCP 程序路径"
                    value={server.command ?? ''}
                    disabled={busy}
                    placeholder="完整可执行文件路径"
                    onChange={(event) =>
                      setServer((previous) => ({ ...previous, command: event.target.value }))
                    }
                  />
                </label>
                <label className="aw-field">
                  启动参数（每行一个）
                  <TextArea
                    aria-label="MCP 启动参数"
                    value={args}
                    disabled={busy}
                    onChange={(event) => setArgs(event.target.value)}
                  />
                </label>
              </>
            ) : (
              <label className="aw-field">
                服务器地址
                <TextField
                  aria-label="MCP 服务器地址"
                  type="url"
                  value={server.url ?? ''}
                  disabled={busy}
                  onChange={(event) =>
                    setServer((previous) => ({ ...previous, url: event.target.value }))
                  }
                />
              </label>
            )}
            <label className="aw-field">
              请求超时（毫秒）
              <NumberField
                aria-label="MCP 请求超时"
                min={1000}
                max={120000}
                value={server.timeoutMs}
                disabled={busy}
                onChange={(event) =>
                  setServer((previous) => ({ ...previous, timeoutMs: Number(event.target.value) }))
                }
              />
            </label>
            <CheckField
              label="启用服务器"
              checked={server.enabled}
              disabled={busy}
              onChange={(event) =>
                setServer((previous) => ({ ...previous, enabled: event.target.checked }))
              }
            />
            <div className="aw-row">
              <Button
                type="submit"
                variant="primary"
                disabled={
                  busy ||
                  !server.name.trim() ||
                  !(server.transport === 'stdio' ? server.command?.trim() : server.url?.trim())
                }
              >
                {server.id ? '保存服务器修改' : '添加服务器'}
              </Button>
              {server.id && (
                <Button
                  onClick={() => {
                    setServer(emptyServer());
                    setArgs('');
                  }}
                >
                  取消编辑
                </Button>
              )}
            </div>
          </form>
          {servers.map((entry) => (
            <article className="aw-card aw-stack" key={entry.id}>
              <div>
                <h3>{entry.name}</h3>
                <p className="aw-muted">
                  {entry.transport} · {entry.enabledTools.length} 个已允许工具
                </p>
              </div>
              <CheckField
                label="用于当前会话"
                checked={session?.mcpServerIds.includes(entry.id) ?? false}
                disabled={busy || !session || !entry.enabled}
                onChange={(event) =>
                  void run(() => selectExtension('mcpServerIds', entry.id, event.target.checked))
                }
              />
              <div className="aw-row">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await rpc('agent.mcp.check', { id: entry.id });
                      setCheckResult((previous) => ({
                        ...previous,
                        [entry.id]: result.ok
                          ? `连接成功，${result.toolCount ?? 0} 个工具`
                          : (result.error ?? '连接失败'),
                      }));
                    })
                  }
                >
                  检查连接
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await rpc('agent.mcp.tools', { id: entry.id });
                      setTools((previous) => ({ ...previous, [entry.id]: result.tools }));
                    })
                  }
                >
                  选择工具
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setServer(entry);
                    setArgs(entry.args?.join('\n') ?? '');
                  }}
                >
                  编辑服务器
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await rpc('agent.mcp.delete', { id: entry.id });
                      await load();
                      await refresh();
                    })
                  }
                >
                  删除服务器
                </Button>
              </div>
              {checkResult[entry.id] && <p role="status">{checkResult[entry.id]}</p>}
              {tools[entry.id]?.map((tool) => (
                <CheckField
                  key={tool.name}
                  label={tool.name}
                  description={tool.description}
                  checked={entry.enabledTools.includes(tool.name)}
                  disabled={busy}
                  onChange={(event) =>
                    void run(async () => {
                      await rpc('agent.mcp.save', {
                        server: {
                          ...entry,
                          enabledTools: event.target.checked
                            ? [...entry.enabledTools, tool.name]
                            : entry.enabledTools.filter((name) => name !== tool.name),
                        },
                      });
                      await load();
                    })
                  }
                />
              ))}
            </article>
          ))}
          <article className="aw-card aw-stack">
            <h3>Maa Verge MCP 服务</h3>
            <Notice tone="neutral" size="sm">
              向本机外部客户端开放受控工具。连接令牌只在当前界面显示，请仅交给可信客户端。
            </Notice>
            <div className="aw-row">
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const value = await rpc('agent.mcp.server', { enabled: true, showToken: true });
                    setConnection(value);
                  })
                }
              >
                启动并显示连接信息
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setConnection(undefined);
                    await rpc('agent.mcp.server', { enabled: false });
                  })
                }
              >
                停止 MCP 服务
              </Button>
              <Button onClick={() => setConnection(undefined)}>隐藏连接信息</Button>
            </div>
            {connection?.enabled && (
              <div className="aw-stack">
                <label className="aw-field">
                  地址
                  <TextField
                    aria-label="Maa Verge MCP 服务地址"
                    value={connection.url ?? ''}
                    readOnly
                  />
                </label>
                <label className="aw-field">
                  连接令牌
                  <TextField
                    aria-label="Maa Verge MCP 连接令牌"
                    value={connection.token ?? ''}
                    readOnly
                    autoComplete="off"
                  />
                </label>
              </div>
            )}
          </article>
        </>
      )}
    </section>
  );
}
