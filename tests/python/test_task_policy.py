"""Task compatibility, persistence and consumable-policy regression tests."""

import pytest
from maaverge_runtime.models import TASK_TYPES, Plan, RpcError, Settings
from maaverge_runtime.runtime import Runtime
from maaverge_runtime.task_policy import native_task, validate_plan
from test_native import FixtureWorker
from test_updates import FixtureSource

TASK_EXAMPLES = {
    "StartUp": {"client_type": "Bilibili", "start_game_enabled": True},
    "CloseDown": {"client_type": "YoStarJP"},
    "Fight": {"stage": "Annihilation", "times": 6, "series": 0, "drops": {"30011": 10}},
    "Recruit": {"select": [3, 4, 5], "confirm": [3, 4], "recruitment_time": {"3": 540}},
    "Infrast": {"mode": 10000, "filename": "base.json", "plan_index": 0},
    "Mall": {"buy_first": ["招聘许可"], "blacklist": ["家具零件"]},
    "Award": {"mail": True, "award": True},
    "SwitchTheme": {"themes": ["夜间", "银凇"]},
    "Roguelike": {"theme": "Sami", "mode": 5, "expected_collapsal_paradigms": ["指令"]},
    "Copilot": {"copilot_list": [{"filename": "1-7.json", "is_raid": False}]},
    "SSSCopilot": {"filename": "sss.json", "loop_times": 1},
    "ParadoxCopilot": {"list": ["paradox.json", {"id": "1", "filename": "other.json"}]},
    "Depot": {},
    "OperBox": {},
    "Reclamation": {"theme": "RelaunchAnchor", "mode": 16},
    "Custom": {"task_names": ["MiniGame@PixelPaint@Begin"], "params": {"pixel_paint": {}}},
    "SingleStep": {
        "type": "copilot",
        "subtype": "action",
        "details": {"actions": [{"type": "Skill", "name": "芬"}]},
    },
    "VideoRecognition": {"filename": "battle.mp4"},
    "OperProgress": {
        "plans": [{"name": "芬", "elite": 1, "skill_level": 4, "skill_mastery": [0, 0, 0]}]
    },
}


def make_plan(tasks):
    return Plan.model_validate({"name": "兼容任务表", "tasks": tasks})


def test_all_registered_tasks_round_trip_with_advanced_parameters(tmp_path):
    assert set(TASK_EXAMPLES) == TASK_TYPES
    tasks = [
        {"type": kind, "params": {**params, "future_option": {"nested": [1, "保留", False]}}}
        for kind, params in TASK_EXAMPLES.items()
    ]
    runtime = Runtime(tmp_path)
    try:
        saved = runtime.handle("plan.save", {"plan": make_plan(tasks).model_dump()})
    finally:
        runtime.close()
    restored = Runtime(tmp_path)
    try:
        assert restored.store.get("plan", saved["id"]) == saved
        assert [task["params"] for task in saved["tasks"]] == [task["params"] for task in tasks]
    finally:
        restored.close()


@pytest.mark.parametrize("kind", list(TASK_EXAMPLES))
def test_registered_tasks_reach_native_adapter_without_losing_params(tmp_path, monkeypatch, kind):
    monkeypatch.setenv("MAAVERGE_DEVICE_LOCK_DIR", str(tmp_path / "locks"))
    monkeypatch.setattr("maaverge_runtime.runtime.adb_path", lambda: "fixture-adb")
    runtime = Runtime(
        tmp_path / "data",
        mode="native",
        worker_factory=FixtureWorker,
        update_source=FixtureSource(),
        validator=lambda *_: None,
    )
    try:
        runtime.updates.check("core")
        runtime.updates.prepare("core")
        runtime.updates.activate("core")
        plan = runtime.handle(
            "plan.save",
            {"plan": {"name": kind, "tasks": [{"type": kind, "params": TASK_EXAMPLES[kind]}]}},
        )
        device = runtime.handle("device.connect", {"address": "127.0.0.1:5555"})
        runtime.tick(force=True)
        run = runtime.handle(
            "run.start", {"planId": plan["id"], "deviceId": device["id"], "requestId": kind}
        )
        worker = runtime.workers[device["id"]]
        for key, value in TASK_EXAMPLES[kind].items():
            assert worker.tasks[0]["params"][key] == value
        worker.complete()
        runtime.tick(force=True)
        assert runtime.store.get("run", run["id"])["status"] == "completed"
    finally:
        runtime.close()


def test_task_switch_preserves_rows_but_excludes_them_from_execution(tmp_path, monkeypatch):
    monkeypatch.setenv("MAAVERGE_DEVICE_LOCK_DIR", str(tmp_path / "locks"))
    runtime = Runtime(tmp_path / "data")
    try:
        plan = runtime.handle(
            "plan.save",
            {
                "plan": {
                    "name": "分项开关",
                    "tasks": [
                        {"type": "Copilot", "params": {}, "enabled": False},
                        {"type": "Fight", "params": {"stone": 99}, "enabled": False},
                        {"type": "Award", "params": {}},
                        {"type": "Recruit", "params": {"enable": False}},
                    ],
                }
            },
        )
        run = runtime.handle(
            "run.start",
            {"planId": plan["id"], "deviceId": "mock-device-1", "requestId": "switches"},
        )
        assert [t["type"] for t in runtime.store.get("run_plan", run["id"])["tasks"]] == ["Award"]
        assert len(runtime.store.get("plan", plan["id"])["tasks"]) == 4
        runtime.handle("run.stop", {"id": run["id"]})
        for task in plan["tasks"]:
            task["enabled"] = False
        runtime.handle("plan.save", {"plan": plan})
        with pytest.raises(RpcError, match="至少需要启用"):
            runtime.handle(
                "run.start",
                {"planId": plan["id"], "deviceId": "mock-device-1", "requestId": "none"},
            )
    finally:
        runtime.close()


@pytest.mark.parametrize(
    "params",
    [
        {"medicine_expire_days": 1},
        {"expiring_medicine": 1},
        {"use_sanity_potion": True},
    ],
)
def test_unbounded_core_consumption_is_rejected_even_with_nonzero_budget(params):
    plan = make_plan([{"type": "Fight", "params": params}])
    with pytest.raises(RpcError, match="不受数量限制"):
        validate_plan(plan, Settings(budgets={"medicine": 100}))


def test_recruit_cannot_treat_ignored_expedite_times_as_a_consumption_cap():
    plan = make_plan(
        [{"type": "Recruit", "params": {"times": 1, "expedite": True, "expedite_times": 100}}]
    )
    with pytest.raises(RpcError, match="不执行加急次数上限"):
        validate_plan(plan, Settings(budgets={"expedited": 100}))


def test_budget_is_aggregate_across_all_enabled_tasks():
    plan = make_plan([{"type": "Fight", "params": {"medicine": 2}}] * 2)
    with pytest.raises(RpcError, match="超出"):
        validate_plan(plan, Settings(budgets={"medicine": 3}))


@pytest.mark.parametrize(
    "params",
    [
        {"future": {"Command": "arbitrary"}},
        {"future": [float("nan")]},
    ],
)
def test_nested_command_and_non_json_numbers_are_rejected(params):
    with pytest.raises(RpcError):
        validate_plan(make_plan([{"type": "Award", "params": params}]), Settings())


def test_custom_cannot_bypass_standard_task_consumable_policy():
    with pytest.raises(RpcError, match="消耗策略审核"):
        validate_plan(
            make_plan([{"type": "Custom", "params": {"task_names": ["Fight"]}}]), Settings()
        )


def test_singlestep_uses_versioned_source_contract():
    with pytest.raises(RpcError, match="details.actions"):
        validate_plan(
            make_plan(
                [
                    {
                        "type": "SingleStep",
                        "params": {
                            "type": "copilot",
                            "subtype": "action",
                            "details": {"name": "芬"},
                        },
                    }
                ]
            ),
            Settings(),
        )


def test_native_defaults_do_not_overwrite_user_options_or_saved_params():
    saved = {"type": "Fight", "params": {"report_to_penguin": True, "times": 6, "drops": {"a": 1}}}
    adapted = native_task(saved)
    assert adapted["params"]["report_to_penguin"] is True
    assert adapted["params"]["medicine_expire_days"] == 0
    adapted["params"]["drops"]["a"] = 2
    assert saved["params"]["drops"]["a"] == 1
    assert "medicine" not in saved["params"]
