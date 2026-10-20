"""Shared deterministic checks for the versioned MaaCore task boundary.

Unrecognised JSON parameters are retained for upstream compatibility. This is
not a claim that every resource-dependent option has been verified in game.
"""

import copy
import json
import math
import re
from typing import Any, NoReturn

from .models import Plan, RpcError, Settings, Task

CLIENTS = {"", "Official", "Bilibili", "txwy", "YoStarEN", "YoStarJP", "YoStarKR"}
FACILITIES = {
    "Mfg",
    "Trade",
    "Power",
    "Control",
    "Reception",
    "Office",
    "Recycle",
    "Dorm",
    "Processing",
    "Training",
    "AssistantChange",
}
DRONES = {"_NotUse", "Money", "SyntheticJade", "CombatRecord", "PureGold", "OriginStone", "Chip"}
COMMAND_KEYS = {"shell", "command", "script", "adb"}
BOOLEAN_KEYS = {
    "enable",
    "start_game_enabled",
    "refresh",
    "set_time",
    "expedite",
    "skip_robot",
    "report_to_penguin",
    "report_to_yituliu",
    "DrGrandet",
    "replenish",
    "dorm_notstationed_enabled",
    "dorm_trust_enabled",
    "fiammetta_recovery_enabled",
    "use_pinus_sylvestris",
    "use_perception_information",
    "use_worldly_plight",
    "use_abyssal_hunter",
    "reception_message_board",
    "reception_clue_exchange",
    "reception_send_clue",
    "continue_training",
    "visit_friends",
    "shopping",
    "force_shopping_if_credit_full",
    "only_buy_discount",
    "reserve_max_credit",
    "credit_fight",
    "award",
    "mail",
    "recruit",
    "orundum",
    "mining",
    "specialaccess",
    "signinevent",
    "formation",
    "use_sanity_potion",
    "add_trust",
    "ignore_requirements",
    "clear_store",
}
STRING_LIST_KEYS = {
    "first_tags",
    "preserve_tags",
    "buy_first",
    "blacklist",
    "fiammetta_targets",
    "themes",
    "task_names",
    "tools_to_craft",
}


def reject(message: str) -> NoReturn:
    raise RpcError(-32010, message)


def integer(value: Any, name: str, minimum: int = 0, maximum: int = 2_147_483_647) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not minimum <= value <= maximum:
        reject(f"{name} 必须是 {minimum} 到 {maximum} 之间的整数")
    return value


def string(value: Any, name: str, *, nonempty: bool = False) -> str:
    if not isinstance(value, str) or "\x00" in value or len(value) > 4096:
        reject(f"{name} 必须是有效文本")
    if nonempty and not value.strip():
        reject(f"{name} 不可为空")
    return value


def enum_string(value: Any, name: str, choices: set[str]) -> str:
    value = string(value, name)
    if value not in choices:
        reject(f"{name}无效")
    return value


def json_tree(value: Any, depth: int = 0) -> None:
    if depth > 32:
        reject("任务参数嵌套过深")
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                reject("任务参数键必须是文本")
            if key.casefold() in COMMAND_KEYS:
                reject("任务不得包含任意命令")
            json_tree(key, depth + 1)
            json_tree(item, depth + 1)
    elif isinstance(value, list):
        for item in value:
            json_tree(item, depth + 1)
    elif isinstance(value, float) and not math.isfinite(value):
        reject("任务参数不得包含非有限数值")
    elif isinstance(value, str):
        try:
            value.encode("utf-8")
        except UnicodeEncodeError:
            reject("任务参数包含无效 Unicode 文本")
    elif value is not None and not isinstance(value, str | int | float | bool):
        reject("任务参数必须是 JSON 数据")


def filenames(params: dict, list_key: str | None = None, *, strings: bool = False) -> None:
    # The core gives any present string filename priority, even an empty one.
    # Do not accept a valid list while silently passing a blank filename to it.
    if "filename" in params:
        string(params["filename"], "文件路径", nonempty=True)
        return
    entries = params.get(list_key) if list_key else None
    if not isinstance(entries, list) or not entries:
        reject("请选择本地文件，或填写非空作业列表")
    if strings and not (
        all(isinstance(entry, str) for entry in entries)
        or all(isinstance(entry, dict) for entry in entries)
    ):
        reject("悖论作业列表必须全部是文件路径，或全部是带整数 ID 的对象")
    for entry in entries:
        if strings and isinstance(entry, str):
            string(entry, "作业文件路径", nonempty=True)
        elif isinstance(entry, dict):
            string(entry.get("filename"), "作业文件路径", nonempty=True)
            if strings or "id" in entry:
                integer(entry.get("id"), "作业 ID", -2_147_483_648)
            if "is_raid" in entry and not isinstance(entry["is_raid"], bool):
                reject("作业突袭选项必须是布尔值")
            if entry.get("nav_name_override") is not None:
                string(entry["nav_name_override"], "作业导航关卡")
        else:
            reject("作业列表格式无效")


def validate_task(task: Task) -> None:
    p = task.params
    json_tree(p)
    if len(json.dumps(p, ensure_ascii=False).encode()) > 512 * 1024:
        reject("单项任务参数不得超过 512 KiB")
    for key in BOOLEAN_KEYS & p.keys():
        if not isinstance(p[key], bool):
            reject(f"{key} 必须是布尔值")
    for key in STRING_LIST_KEYS & p.keys():
        if not isinstance(p[key], list) or not all(isinstance(v, str) for v in p[key]):
            reject(f"{key} 必须是文本数组")
        for value in p[key]:
            string(value, key)
    if "client_type" in p:
        enum_string(p["client_type"], "客户端渠道", CLIENTS)
    if "server" in p:
        enum_string(p["server"], "服务器参数", {"CN", "US", "JP", "KR"})
    if not task.enabled or p.get("enable") is False:
        return
    if task.type == "Fight":
        integer(p.get("times", 1), "作战次数", 1)
        string(p.get("stage", ""), "关卡")
        integer(p.get("series", 1), "代理倍率", -1, 10)
        if "drops" in p:
            if not isinstance(p["drops"], dict):
                reject("掉落目标必须是物品 ID 到数量的对象")
            for item, count in p["drops"].items():
                string(item, "掉落物品 ID", nonempty=True)
                integer(count, "掉落数量", 1)
    elif task.type == "Recruit":
        integer(p.get("times", 0), "招募次数")
        for key in ("select", "confirm"):
            if key in p:
                if not isinstance(p[key], list):
                    reject(f"{key} 必须是星级数组")
                for level in p[key]:
                    integer(level, "招募星级", 1, 6)
        integer(p.get("extra_tags_mode", 0), "额外标签模式", 0, 2)
        if "recruitment_time" in p:
            if not isinstance(p["recruitment_time"], dict):
                reject("招募时限必须是对象")
            for level, minutes in p["recruitment_time"].items():
                if level not in {"3", "4", "5", "6"}:
                    reject("招募时限星级必须在 3 到 6 之间")
                integer(minutes, "招募时限（分钟）", 60, 540)
    elif task.type == "Infrast":
        mode = integer(p.get("mode", 0), "基建模式")
        if mode not in {0, 10000, 20000}:
            reject("基建模式无效")
        if "facility" in p and (
            not isinstance(p["facility"], list)
            or any(not isinstance(v, str) or v not in FACILITIES for v in p["facility"])
        ):
            reject("基建设施无效")
        enum_string(p.get("drones", "_NotUse"), "无人机用途", DRONES)
        threshold = p.get("threshold", 0.3)
        if isinstance(threshold, bool) or not isinstance(threshold, int | float):
            reject("心情阈值必须是 0 到 1 之间的数值")
        if not 0 <= threshold <= 1:
            reject("心情阈值必须是 0 到 1 之间的数值")
        if p.get("mode") == 10000:
            filenames(p)
            integer(p.get("plan_index"), "排班方案序号")
    elif task.type == "SwitchTheme" and "themes" not in p:
        reject("请选择候选游戏主题")
    elif task.type == "Roguelike":
        enum_string(
            p.get("theme", "Phantom"),
            "集成战略主题",
            {"Phantom", "Mizuki", "Sami", "Sarkaz", "JieGarden", "BlackFlow"},
        )
        mode = integer(p.get("mode", 0), "集成战略模式")
        if mode not in {0, 1, 4, 5, 6, 7, 10001, 20001, 30001, 30003}:
            reject("集成战略模式无效或已被上游移除")
    elif task.type in {"Copilot", "ParadoxCopilot", "SSSCopilot", "VideoRecognition"}:
        filenames(
            p,
            "copilot_list"
            if task.type == "Copilot"
            else "list"
            if task.type == "ParadoxCopilot"
            else None,
            strings=task.type == "ParadoxCopilot",
        )
        if "loop_times" in p:
            integer(p["loop_times"], "循环次数", 1)
    elif task.type == "Reclamation":
        theme = enum_string(p.get("theme", "Tales"), "生息演算主题", {"Tales", "RelaunchAnchor"})
        mode = integer(p.get("mode", 0), "生息演算模式")
        if (theme == "Tales" and mode not in {0, 1}) or (
            theme == "RelaunchAnchor" and mode not in {16, 32, 48}
        ):
            reject("生息演算主题与模式组合无效")
    elif task.type == "Custom":
        names = p.get("task_names")
        if not isinstance(names, list) or not names:
            reject("自定义任务需要非空 task_names 数组")
        # Arbitrary resource chains could reach consumable actions without the
        # bounded Fight/Recruit interface. Only reviewed mini-game entry points
        # are currently enabled; do not imply generic Custom parity.
        for name in names:
            if name != "MiniGame@PixelPaint@Begin" and not re.fullmatch(
                r"MiniGame@SecretFront@Begin@Ending[A-E](?:@[^@\x00]{1,80})?", name
            ):
                reject("此自定义任务链尚未通过消耗策略审核，请使用对应的标准任务")
    elif task.type == "SingleStep":
        enum_string(p.get("type"), "单步任务类型", {"copilot"})
        enum_string(p.get("subtype"), "单步任务子类型", {"stage", "start", "action"})
        details = p.get("details", {})
        if not isinstance(details, dict):
            reject("单步任务 details 必须是对象")
        if p["subtype"] == "stage":
            string(details.get("stage_name"), "单步任务关卡", nonempty=True)
        elif p["subtype"] == "action":
            actions = details.get("actions")
            if (
                not isinstance(actions, list)
                or not actions
                or not all(isinstance(action, dict) for action in actions)
            ):
                reject("当前核心要求 details.actions 为非空操作数组")
    elif task.type == "OperProgress":
        if not isinstance(p.get("plans"), list):
            reject("干员养成需要 plans 数组")
        for plan in p["plans"]:
            if not isinstance(plan, dict):
                reject("干员养成条目必须是对象")
            string(plan.get("name"), "干员名称", nonempty=True)
            if "elite" in plan:
                integer(plan["elite"], "精英化等级", 1, 2)
            if "skill_level" in plan:
                integer(plan["skill_level"], "技能等级", 2, 7)
            if "skill_mastery" in plan:
                levels = plan["skill_mastery"]
                if not isinstance(levels, list) or len(levels) != 3:
                    reject("技能专精需要三个等级")
                for level in levels:
                    integer(level, "专精等级", 0, 3)
    if "formation_index" in p:
        integer(p["formation_index"], "编队栏位", 0, 4)


def validate_plan(plan: Plan, settings: Settings) -> None:
    effective_budgets = plan.budgets or settings.budgets
    if plan.budgets is not None:
        for key, limit in plan.budgets.model_dump().items():
            if limit > getattr(settings.budgets, key):
                raise RpcError(
                    -32010,
                    "任务表消耗上限超出应用已授权额度",
                    {"budget": key, "limit": limit},
                )
    totals = {"originium": 0, "medicine": 0, "expedited": 0}
    for task in plan.tasks:
        validate_task(task)
        p = task.params
        if not task.enabled or p.get("enable") is False:
            continue
        for key, budget in (("stone", "originium"), ("medicine", "medicine")):
            totals[budget] += integer(p.get(key, 0), "消耗额度")
        # Core v6.20.0 treats expiration as an independent, unbounded allowance.
        # Likewise Copilot has a boolean potion switch without a quantity cap.
        for key in ("expiring_medicine", "medicine_expire_days"):
            if integer(p.get(key, 0), "临期理智药设置"):
                reject("当前核心的临期理智药不受数量限制，暂不能在有限预算下启用")
        if p.get("use_sanity_potion"):
            reject("当前核心的作业理智药不受数量限制，暂不能在有限预算下启用")
        integer(p.get("expedite_times", 0), "加急额度")
        if p.get("expedite"):
            # expedite_times is ignored. AutoRecruitTask can expedite an
            # already-occupied or skipped slot without advancing its new-
            # recruit counter, so times is not a strict consumption cap either.
            reject("当前核心不执行加急次数上限，暂不能在有限预算下启用加急")
    for key, requested in totals.items():
        if requested > getattr(effective_budgets, key):
            raise RpcError(
                -32010, "计划消耗超出已授权额度", {"budget": key, "requested": requested}
            )


def native_task(task: dict) -> dict:
    """Copy a saved task and make all upstream implicit spend/report defaults explicit."""
    task = copy.deepcopy(task)
    p = task["params"]
    if task["type"] in {"StartUp", "CloseDown"}:
        p.setdefault("client_type", "Official")
    if task["type"] == "StartUp":
        p.setdefault("start_game_enabled", True)
    if task["type"] == "Fight":
        for key in ("medicine", "stone", "expiring_medicine", "medicine_expire_days"):
            p.setdefault(key, 0)
        p.setdefault("times", 1)
    if task["type"] in {"Fight", "Recruit", "Roguelike"}:
        p.setdefault("report_to_penguin", False)
        p.setdefault("report_to_yituliu", False)
    if task["type"] == "Recruit":
        p.setdefault("expedite", False)
        p.setdefault("expedite_times", 0)
        p.setdefault("select", [3, 4, 5])
        p.setdefault("confirm", [3, 4])
    if task["type"] == "Infrast":
        p.setdefault(
            "facility", ["Mfg", "Trade", "Power", "Control", "Reception", "Office", "Dorm"]
        )
        p.setdefault("drones", "_NotUse")
        p.setdefault("threshold", 0.3)
    if task["type"] == "Copilot":
        p.setdefault("use_sanity_potion", False)
    return task
