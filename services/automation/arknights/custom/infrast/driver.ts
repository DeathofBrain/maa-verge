/** 页面驱动：绑定基建观察、JSON Pipeline 与页面身份核对，不决定业务成功。 */
import { AtomicFailure } from '#automation/core/errors';
import type { AtomicMatch } from '#automation/core/types';
import {
  type AtomicRoomTarget,
  type InfrastDriver,
  type OverviewObservation,
  type TrimObservation,
  type RoomCapacityEvidence,
} from './types';
import { AtomicVision, observeFacility, roomRowOrder } from './observations';
import { normalize, validateRoomIdentity } from './validation';
import { resolveOperatorName } from './names';
import { runInfrastPipeline } from './pipeline';

/** 绑定当前资源与上下文；可信确认参数只由 provider 一次性消费后注入，不能来自公开 JSON 描述。 */
export function createInfrastDriver(
  vision: AtomicVision,
  trustedRoom?: RoomCapacityEvidence,
  trustedSelectedCount?: number,
  analyzeOperators = false,
): InfrastDriver {
  // 证据只属于本次驱动和已核对的目标；导航新房间时清除，不能跨设备或根调用缓存。
  let roomEvidence = trustedRoom ? structuredClone(trustedRoom) : undefined;
  let unmodifiedRoomSelection = false;
  let selectedCount = trustedSelectedCount;
  // 完整词边界避免把 B101 误当作更长位置编号的一部分。
  const hasPosition = (texts: AtomicMatch[], position: string) =>
    texts.some((item) =>
      new RegExp(`(?:^|[^A-Z0-9])${normalize(position).toUpperCase()}(?:$|[^A-Z0-9])`, 'u').test(
        normalize(item.text ?? '').toUpperCase(),
      ),
    );
  // 进入房间后核对设施标题和可选位置，拒绝在身份不明的房间继续选人。
  const requireRoom = async (target: AtomicRoomTarget) => {
    const frame = await vision.frame();
    const label = await vision.recognize(
      frame,
      vision.rule(`facility.label.${target.facility}`),
      [0, 0, 600, 250],
    );
    if (!label.hit) throw new AtomicFailure('进入后未能核对设施标题，不会在未知房间选人');
    if (
      target.position &&
      !hasPosition((await vision.texts(frame, [0, 0, 600, 250])).matches, target.position)
    )
      throw new AtomicFailure('进入后房间位置标识与请求不符');
  };
  // 仅导航点击后允许页面过渡；本循环只能读取目标页门禁，不再次输入，也不吞掉未知原生错误。
  const waitAfterNavigation = async (observe: () => Promise<void>, pending: string) => {
    const deadline = Math.min(Date.now() + 5000, vision.context.deadline ?? Infinity);
    let message = pending;
    while (true) {
      try {
        await observe();
        if (Date.now() <= deadline) return;
      } catch (error) {
        if (!(error instanceof AtomicFailure) || error.status !== 'failed') throw error;
        message = error.message;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new AtomicFailure(`导航只读等待超时：${message}`, 'unknown');
      await vision.wait(Math.min(200, remaining));
    }
  };
  const waitForRoom = (target: AtomicRoomTarget) =>
    waitAfterNavigation(() => requireRoom(target), '入房后未能核对目标设施与完整位置');
  const waitForOverview = () =>
    waitAfterNavigation(async () => {
      const frame = await vision.frame();
      if (!(await vision.recognize(frame, vision.rule('queue.rotate'))).hit)
        throw new AtomicFailure('当前画面尚未确认总览队列轮换入口');
    }, '打开总览后未能确认目标页');
  // 主页返回次数由 JSON 的有限分支控制；驱动不解释 next 或执行额外任务。
  const base = async () => {
    await runInfrastPipeline(vision, 'Infrast@Base');
  };
  const overview = () => vision.overview();
  // 已在总览时直接读取；仅领域识别失败才尝试从基建入口导航，未知异常原样上抛。
  const enterOverview = async () => {
    try {
      return await overview();
    } catch (error) {
      if (!(error instanceof AtomicFailure)) throw error;
    }
    await base();
    let result: OverviewObservation | undefined;
    await runInfrastPipeline(vision, 'Infrast@OpenOverview', {
      async readOverview() {
        // 只等待导航页标记；实际房间行观察仍即时检查歧义，不能借等待把错误领域结果提升为成功。
        await waitForOverview();
        result = await overview();
      },
    });
    if (!result) throw new AtomicFailure('总览流程未返回页面证据', 'unknown');
    return result;
  };
  // 训练角色入口位于专精页面，切入前再次确认训练室身份。
  const enterMastery = async () => {
    if ((await vision.match('training.page')).hit) return;
    await runInfrastPipeline(vision, 'Infrast@Training@Mastery', {
      async requireTrainingRoom() {
        await requireRoom({ facility: 'Training', room: 1 });
      },
    });
  };
  // 在导航前检查特殊设施所需规则，避免走到页面中途才发现入口尚未适配。
  const preflight = (target: AtomicRoomTarget) => {
    validateRoomIdentity(target);
    if (target.facility === 'Processing' && !vision.profile.actions['processing.list'])
      throw new AtomicFailure('当前资源缺少独立加工站选人入口', 'unavailable');
    if (target.facility === 'Training') {
      for (const rule of [
        'training.idle',
        'training.processing',
        'training.operator',
        'training.page',
        'training.confirm',
        'training.expandRole',
        'training.allOcr',
        'training.collapseRole',
      ])
        vision.rule(rule);
      for (const action of ['room.bottomTab', 'training.trainee', 'training.assistant'])
        if (!vision.profile.actions[action])
          throw new AtomicFailure(`训练适配缺少明确动作 ${action}`, 'unavailable');
    }
  };
  const driver: InfrastDriver = {
    preflight,
    preflightOperators(names) {
      for (const name of names) {
        const resolved = resolveOperatorName(vision.profile, name);
        if (!resolved.nameVerified || resolved.name !== name)
          throw new AtomicFailure(
            `干员 ${name} 不是当前官方字典的完整姓名，未修改名单`,
            'unavailable',
          );
      }
    },
    overview,
    enterOverview,
    async enumerateRooms(facilities) {
      await base();
      const before = await vision.roomCounts(facilities),
        after = await vision.roomCounts(facilities);
      if (
        before.fingerprint !== after.fingerprint ||
        JSON.stringify(before.counts) !== JSON.stringify(after.counts)
      )
        throw new AtomicFailure('两次完整基建格点观察不一致，未修改任何名单', 'unavailable');
      const requested = facilities.flatMap((facility) =>
        Array.from({ length: before.counts[facility] ?? 0 }, (_, index) => ({
          facility,
          room: index + 1,
          operators: [],
        })),
      );
      const rooms = requested.length ? await driver.resolveRooms!(requested) : [];
      return {
        rooms: rooms.map(({ operators: _operators, ...target }) => target),
        evidence: { before, after },
      };
    },
    /** 官方计划的序号只作候选；先收齐全部身份，不能一边猜位置一边提交前面的房间。 */
    async resolveRooms(rooms) {
      await enterOverview();
      const found = new Map<string, { facility: string; position?: string }>();
      for (let page = 0; page < 20; page++) {
        const snapshot = await overview();
        for (const row of snapshot.rows) {
          const key = `${row.facility}:${row.room}`;
          if (!rooms.some((room) => `${room.facility}:${room.room}` === key)) continue;
          validateRoomIdentity(row);
          const old = found.get(key);
          if (old && old.position !== row.position)
            throw new AtomicFailure('总览同一官方房号出现不同完整位置，未修改任何名单');
          found.set(key, row);
        }
        if (rooms.every((room) => found.has(`${room.facility}:${room.room}`))) {
          const resolved = rooms.map((room) => {
            const actual = found.get(`${room.facility}:${room.room}`)!;
            if (room.position && room.position !== actual.position)
              throw new AtomicFailure('自定义计划位置与游戏总览不符，未修改任何名单');
            return { ...room, ...(actual.position ? { position: actual.position } : {}) };
          });
          // 不同房号不能指向同一物理位置；其余跨房分配仍由批次预检统一检查。
          const positions = resolved.flatMap((room) => (room.position ? [room.position] : []));
          if (new Set(positions).size !== positions.length)
            throw new AtomicFailure('总览多个房号指向同一完整位置，未修改任何名单');
          return resolved;
        }
        await vision.swipeOverview();
      }
      throw new AtomicFailure(
        '总览未在 20 页内收齐官方计划的完整房间身份，未修改任何名单',
        'unavailable',
      );
    },
    // 两个独立动作入口各执行一次；页面完成回调不会被这里升级为业务成功。
    rotateQueue: () => runInfrastPipeline(vision, 'Infrast@RotateQueue'),
    // 先进入总览，再由 JSON 打开整顿；Custom 返回可供流程留存的页面观察。
    async enterTrim() {
      await enterOverview();
      let result: TrimObservation | undefined;
      await runInfrastPipeline(vision, 'Infrast@OpenTrim', {
        async readTrim() {
          result = await driver.trimObservation();
        },
      });
      if (!result) throw new AtomicFailure('整顿流程未返回页面证据', 'unknown');
      return result;
    },
    trim: () => runInfrastPipeline(vision, 'Infrast@Trim'),
    trimObservation: () => vision.trimObservation(),
    /** 两条导航路径点击后只读等待目标标题与位置；候选入口和点击接受均不代表已经入房。 */
    async openRoom(target, route) {
      roomEvidence = undefined;
      unmodifiedRoomSelection = false;
      selectedCount = undefined;
      preflight(target);
      await base();
      // 总览最多浏览 20 页；跨页只接受可核对的 position，不把可见行号当全局房号。
      if (route === 'overview') {
        await enterOverview();
        for (let page = 0; page < 20; page++) {
          const snapshot = await overview();
          const candidates = snapshot.rows.filter(
            (row) =>
              row.facility === target.facility &&
              (target.position ? row.position === target.position : row.room === target.room),
          );
          if (candidates.length === 1) {
            if (!target.position && page > 0)
              throw new AtomicFailure('滚动后的总览序号不构成房间身份，请提供 position');
            // 点击前取新帧，重找原行并再次核对位置，防止滚动或刷新后复用旧坐标。
            const frame = await vision.frame();
            const labels = (
              await vision.recognize(
                frame,
                vision.rule(`facility.label.${target.facility}`),
                [420, 70, 820, 650],
              )
            ).matches.sort(roomRowOrder);
            const label = labels.find(
              (item) =>
                Math.abs(item.box[1] - candidates[0]!.box[1]) < 10 &&
                Math.abs(item.box[0] - candidates[0]!.box[0]) < 10,
            );
            if (!label) throw new AtomicFailure('操作前总览行发生变化');
            if (
              target.position &&
              !hasPosition(
                (
                  await vision.texts(frame, [
                    420,
                    Math.max(70, label.box[1] - 10),
                    820,
                    Math.min(80, 720 - Math.max(70, label.box[1] - 10)),
                  ])
                ).matches,
                target.position,
              )
            )
              throw new AtomicFailure('操作前目标总览行的位置标识消失');
            await vision.click(frame, label.box);
            await vision.wait(500);
            await waitForRoom(target);
            return;
          }
          if (!target.position) break;
          await vision.swipeOverview();
        }
        throw new AtomicFailure('总览未找到唯一目标行；请核对明确房间位置');
      }
      // 主页路线仅按当前设施候选定位；进入后仍核对完整房间位置，绝不猜测固定布局。
      const { frame, matches, view } = await observeFacility(vision, target.facility);
      const match = matches[target.room - 1];
      if (!match) throw new AtomicFailure('基建主页未识别到指定设施序号；没有猜测设施坐标');
      vision.context.onProgress?.({
        capabilityId: 'game.infrast',
        message: '已识别设施入口，入房后继续核对完整位置',
        data: { target, view },
      });
      await vision.click(frame, match.box);
      await vision.wait(500);
      await waitForRoom(target);
    },
    // 训练双角色和加工站采用独立入口，其余设施复用普通进驻名单页。
    async openRoster(target, role) {
      // JSON 控制筛选和进入顺序；Custom 仅核验房间与当前名单页是否可读。
      const handlers = {
        async requireRoom() {
          await requireRoom(target);
        },
        async readOperators() {
          // 等待名单页的完整卡片锚点；姓名歧义等领域失败仍由下一步严格观察立即拒绝。
          await waitAfterNavigation(async () => {
            if (!(await vision.operatorsReady()))
              throw new AtomicFailure('当前画面尚未出现完整名单卡片');
          }, '打开名单后未能确认完整卡片');
          await driver.operators();
        },
        async ensureRoomPanel() {
          await vision.ensureRoomPanel(target);
        },
        async readRoomCapacity() {
          roomEvidence = undefined;
          unmodifiedRoomSelection = false;
          roomEvidence = await vision.roomCapacity(target);
          unmodifiedRoomSelection = true;
        },
      };
      if (target.facility === 'Training') {
        await enterMastery();
        if (!role) throw new AtomicFailure('训练选人必须指定角色');
        await runInfrastPipeline(
          vision,
          role === 'trainee' ? 'Infrast@Training@Trainee' : 'Infrast@Training@Assistant',
          handlers,
        );
      } else {
        await runInfrastPipeline(
          vision,
          target.facility === 'Processing' ? 'Infrast@Processing@Roster' : 'Infrast@Room@Roster',
          handlers,
        );
      }
    },
    // 将单步观察和列表动作交给视觉层／JSON；扫描范围与名单完整性由流程层决定。
    async operators() {
      const observation = await vision.operators(
        analyzeOperators ? roomEvidence?.target.facility : undefined,
      );
      return {
        ...observation,
        ...(roomEvidence ? { room: structuredClone(roomEvidence) } : {}),
        ...(unmodifiedRoomSelection ? { selectionOrigin: 'room_entry' as const } : {}),
        ...(selectedCount === undefined ? {} : { selectedCount }),
      };
    },
    resetFilter: () => {
      // 恢复「全部」只改变可见列表，不改变待选集合；同次入房人数在首次选人前仍有效。
      return runInfrastPipeline(vision, 'Infrast@Filter');
    },
    page: (direction) => vision.swipeOperators(direction),
    clickOperator: (card) => {
      unmodifiedRoomSelection = false;
      selectedCount = undefined;
      return vision.clickCard(card);
    },
    clear: () => {
      unmodifiedRoomSelection = false;
      selectedCount = undefined;
      return runInfrastPipeline(vision, 'Infrast@Clear');
    },
    async verifyConfirmTarget(target) {
      await vision.confirmTarget(target);
    },
    // 每个可能输入都在其实际使用的新帧核验目标；外部模拟器操作不会推进宿主代际，不能只信缓存。
    async confirm(role, target, trainee) {
      if (!target) throw new AtomicFailure('确认缺少明确目标房间，未点击', 'unavailable');
      if (role === 'trainee' && !trainee)
        throw new AtomicFailure('确认缺少明确受训者，未点击', 'unavailable');
      await runInfrastPipeline(
        vision,
        role === 'trainee'
          ? 'Infrast@Confirm@Trainee'
          : role === 'assistant'
            ? 'Infrast@Confirm@Assistant'
            : 'Infrast@Confirm',
        {
          async action(params) {
            if (params.action !== 'operators.confirm')
              throw new AtomicFailure('确认流程包含未审阅固定动作');
            const action = vision.profile.actions['operators.confirm'];
            if (!action?.box) throw new AtomicFailure('确认动作参数缺失，未点击', 'unavailable');
            const frame = await vision.confirmTarget(target);
            await vision.click(frame, action.box);
            await vision.wait(action.delayMs);
          },
          async clickRule(params) {
            const id = params.rule;
            if (
              typeof id !== 'string' ||
              !['operators.conflict', 'training.collapseRole', 'training.confirm'].includes(id)
            )
              throw new AtomicFailure('确认流程包含未审阅规则');
            const frame = await vision.frame();
            const matches = (await vision.recognize(frame, vision.rule(id))).matches;
            if (!matches.length) {
              if (params.optional === true) return;
              throw new AtomicFailure('确认新帧没有命中实际提交入口，未点击');
            }
            await vision.confirmTarget(target, frame);
            if (role === 'trainee' && (await vision.training(frame)).trainee !== trainee)
              throw new AtomicFailure('确认新帧无法核对当前已选受训者，未点击', 'unavailable');
            await vision.click(frame, [...matches].sort((a, b) => b.score - a.score)[0]!.box);
            await vision.wait(vision.options.settleMs ?? 0);
          },
        },
      );
    },
    training: () => vision.training(),
    /** 训练受训者采用独立 OCR 名单；有限翻页寻找唯一完整姓名，不会启动训练。 */
    async chooseTrainee(name) {
      const requested = resolveOperatorName(vision.profile, name);
      if (requested.nameVerified !== true || requested.name !== name)
        throw new AtomicFailure('受训者请求必须是当前官方字典中的完整姓名，未点击', 'unavailable');
      const pages = new Set<string>();
      for (let page = 0; page < 100; page++) {
        const frame = await vision.frame();
        const texts = await vision.recognize(
          frame,
          { ...vision.rule('operators.name'), onlyRec: false },
          [300, 80, 850, 570],
        );
        const matches = texts.matches.filter((item) => {
          const observed = resolveOperatorName(vision.profile, item.text ?? '');
          return observed.nameVerified === true && observed.name === name;
        });
        if (matches.length > 1) throw new AtomicFailure('受训者列表姓名存在歧义');
        if (matches.length === 1) {
          // 精确姓名与点击绑定当前新帧；此名单的布局和普通基建卡片不同。
          await vision.click(frame, matches[0]!.box);
          await vision.wait(300);
          return;
        }
        // 空页或重复姓名集合都表示本次搜索应结束；100 页是额外的硬性上限。
        const identity = texts.matches
          .map((item) => normalize(item.text ?? ''))
          .sort()
          .join('\u0000');
        if (!identity || pages.has(identity)) break;
        pages.add(identity);
        await vision.swipeOperators('right');
      }
      throw new AtomicFailure(
        '未在受训者列表找到明确干员；可能未拥有、未精二或专精已满。未开启训练。',
      );
    },
  };
  return driver;
}
