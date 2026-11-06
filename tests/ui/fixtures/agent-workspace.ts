import type { Page } from '@playwright/test';
import { expect, type HarnessWindow } from './desktop';
import type { Snapshot } from '../../../packages/contracts/src/types';

export async function installAgentScenario(
  page: Page,
  {
    interrupted = false,
    mcpQuestion = false,
    reviewablePlan = false,
    missionTargets = false,
    streaming = false,
  } = {},
) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(
    async ({ interrupted, mcpQuestion, reviewablePlan, missionTargets, streaming }) => {
      const harness = (window as HarnessWindow).runtimeHarness;
      const original = harness.call;
      const snapshot = (await original('app.snapshot', {})) as Snapshot;
      const now = new Date().toISOString();
      const usage = {
        modelCalls: 1,
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
        incomplete: false,
      };
      const session = {
        id: 'session-one',
        title: '合成持久会话',
        mode: 'plan',
        scope: {
          deviceId: 'mock-device-1',
          clientType: 'Official',
          accountId: 'account-one',
          identity: 'device-only',
        },
        revision: 1,
        status: 'idle',
        skillIds: [],
        mcpServerIds: [],
        contextReferenceIds: [],
        usage,
        createdAt: now,
        updatedAt: now,
      };
      const messages: Record<string, unknown>[] = [];
      const turns: Record<string, unknown>[] = interrupted
        ? [
            {
              id: 'turn-one',
              sessionId: session.id,
              status: 'interrupted',
              usage,
              createdAt: now,
              updatedAt: now,
              error: '合成重启中断',
            },
          ]
        : [];
      const interactions: Record<string, unknown>[] = [];
      const memories: Record<string, unknown>[] = [];
      const missions: Record<string, unknown>[] = [];
      const calls: { method: string; params: Record<string, unknown> }[] = [];
      Object.assign(window, {
        agentScenarioCalls: calls,
        advanceAgentScenario: (phase: string) => {
          const turn = turns.at(-1);
          if (!streaming || !turn) throw new Error('Expected an active synthetic stream');
          if (phase === 'generating' || phase === 'tool_call') {
            turn.progress = { text: '合成的未完成内容', status: phase };
          } else if (phase === 'completed') {
            turn.status = 'completed';
            session.status = 'idle';
            messages.push({
              id: 'assistant-one',
              sessionId: session.id,
              role: 'assistant',
              content: '合成的最终完整回复',
              createdAt: now,
            });
          } else if (['failed', 'interrupted', 'waiting'].includes(phase)) {
            turn.status = phase;
            session.status = phase === 'waiting' ? 'waiting' : 'idle';
            if (phase !== 'waiting') turn.error = '合成流未完整结束';
          } else throw new Error(`Unknown synthetic stream phase: ${phase}`);
        },
      });
      harness.call = async (method, params) => {
        if (missionTargets && method === 'copilot.workspace.get') {
          const workspace = (await original(method, params)) as { queue: unknown[] };
          return {
            ...workspace,
            queue:
              params.kind === 'Copilot'
                ? [
                    {
                      id: 'existing-queue',
                      versionId: 'existing-version',
                      enabled: true,
                      isRaid: false,
                      navName: '合成关卡',
                    },
                  ]
                : [],
          };
        }
        if (missionTargets && method === 'tool.config.get') {
          calls.push({ method, params: structuredClone(params) });
          return { mode: 'device', updateDepot: false };
        }
        if (!method.startsWith('agent.')) return original(method, params);
        calls.push({ method, params: structuredClone(params) });
        switch (method) {
          case 'agent.session.list':
            return { sessions: [structuredClone(session)], total: 1, offset: 0, limit: 100 };
          case 'agent.session.get':
            return structuredClone({
              session,
              messages,
              turns,
              interactions,
              references: [],
              total: messages.length,
              offset: 0,
              limit: 100,
            });
          case 'agent.session.update':
            Object.assign(session, params);
            session.revision++;
            return structuredClone(session);
          case 'agent.turn.start': {
            messages.push({
              id: 'user-one',
              sessionId: session.id,
              role: 'user',
              content: params.message,
              createdAt: now,
            });
            const turn = {
              id: 'turn-one',
              sessionId: session.id,
              status: 'waiting',
              usage,
              createdAt: now,
              updatedAt: now,
            };
            turns.push(turn);
            session.status = 'waiting';
            if (streaming) {
              Object.assign(turn, {
                status: 'running',
                progress: { text: '', status: 'waiting' },
              });
              session.status = 'running';
              return structuredClone(turn);
            }
            if (reviewablePlan) {
              const plan = {
                ...snapshot.plans[0],
                id: 'synthetic-agent-plan',
                name: 'Agent 刷图计划 · 1-7',
                tasks: [
                  {
                    enabled: true,
                    type: 'Fight',
                    params: { stage: '1-7', times: 6, medicine: 0, stone: 0 },
                  },
                ],
              };
              turn.status = 'completed';
              session.status = 'idle';
              messages.push({
                id: 'tool-plan-one',
                sessionId: session.id,
                role: 'tool',
                content: '已准备任务表草稿，请核对后保存。',
                metadata: { plan },
                createdAt: now,
              });
              return structuredClone(turn);
            }
            interactions.push({
              id: 'question-one',
              sessionId: session.id,
              turnId: turn.id,
              kind: mcpQuestion ? 'mcp' : 'question',
              status: 'pending',
              title: mcpQuestion ? '补充 MCP 参数' : '选择关卡',
              prompt: '请补充目标关卡。',
              inputType: mcpQuestion ? 'text' : 'single',
              required: true,
              options: [
                { id: 'stage-17', label: '1-7' },
                { id: 'stage-ce6', label: 'CE-6' },
              ],
              createdAt: now,
              updatedAt: now,
            });
            return structuredClone(turn);
          }
          case 'agent.interaction.respond': {
            const interaction = interactions.find((item) => item.id === params.interactionId)!;
            interaction.status = 'answered';
            interaction.answer = params.answer;
            if (interaction.kind === 'question' || interaction.kind === 'mcp') {
              interactions.push({
                id: 'approval-one',
                sessionId: session.id,
                turnId: 'turn-one',
                kind: 'approval',
                status: 'pending',
                title: '执行任务表',
                prompt: '在设备上执行已核对的任务表，理智药 0、源石 0。',
                snapshot: { name: '合成任务表', medicine: 0, stone: 0 },
                createdAt: now,
                updatedAt: now,
              });
            } else {
              turns[0].status = 'completed';
              session.status = 'idle';
              messages.push({
                id: 'assistant-one',
                sessionId: session.id,
                role: 'assistant',
                content: '已记录本次明确审批。',
                createdAt: now,
              });
            }
            return structuredClone(interaction);
          }
          case 'agent.turn.resume':
            turns[0].status = 'running';
            session.status = 'running';
            delete turns[0].error;
            return structuredClone(turns[0]);
          case 'agent.turn.cancel':
            turns[0].status = 'cancelled';
            session.status = 'idle';
            return structuredClone(turns[0]);
          case 'agent.memory.list':
            return structuredClone({ memories, total: memories.length, offset: 0, limit: 100 });
          case 'agent.memory.save': {
            const existing = memories.find((memory) => memory.id === params.id);
            if (existing) {
              Object.assign(existing, params, { revision: Number(existing.revision) + 1 });
              return structuredClone(existing);
            }
            const memory = {
              ...params,
              id: 'memory-one',
              revision: 1,
              createdAt: now,
              updatedAt: now,
            };
            memories.push(memory);
            return structuredClone(memory);
          }
          case 'agent.memory.delete':
            memories.splice(
              memories.findIndex((memory) => memory.id === params.id),
              1,
            );
            return { deleted: true };
          case 'agent.mission.list':
            return structuredClone(missions);
          case 'agent.mission.create': {
            const mission = {
              ...params,
              id: 'mission-one',
              deviceId: session.scope.deviceId,
              clientType: session.scope.clientType,
              status: 'waiting',
              remainingExecutions: params.maxExecutions,
              reservedMedicine: 0,
              reservedStone: 0,
              snapshotHashes: [],
              usage,
              createdAt: now,
              updatedAt: now,
            };
            missions.push(mission);
            turns.push({
              id: 'mission-turn-one',
              sessionId: session.id,
              missionId: mission.id,
              status: 'waiting',
              usage,
              createdAt: now,
              updatedAt: now,
            });
            session.status = 'waiting';
            interactions.push({
              id: 'mission-approval-one',
              sessionId: session.id,
              turnId: 'mission-turn-one',
              kind: 'approval',
              status: 'pending',
              title: '有限托管审批',
              prompt: '核对三类固定目标与零消耗上限。',
              snapshot: params,
              createdAt: now,
              updatedAt: now,
            });
            return structuredClone(mission);
          }
          case 'agent.skill.list':
            return { skills: [] };
          case 'agent.mcp.list':
            return { servers: [] };
          default:
            throw new Error(`未登记合成 Agent 方法：${method}`);
        }
      };
    },
    { interrupted, mcpQuestion, reviewablePlan, missionTargets, streaming },
  );
}

export async function advanceAgentScenario(
  page: Page,
  phase: 'generating' | 'tool_call' | 'completed' | 'failed' | 'interrupted' | 'waiting',
) {
  await page.evaluate(
    (next) =>
      (window as unknown as { advanceAgentScenario: (phase: string) => void }).advanceAgentScenario(
        next,
      ),
    phase,
  );
}
