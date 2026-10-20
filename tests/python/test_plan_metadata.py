"""Saved UI configuration cannot widen execution authorization or mutate active runs."""

import pytest
from maaverge_runtime.models import RpcError
from maaverge_runtime.runtime import Runtime


@pytest.fixture
def runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("MAAVERGE_DEVICE_LOCK_DIR", str(tmp_path / "locks"))
    value = Runtime(tmp_path / "data")
    try:
        yield value
    finally:
        value.close()


def save(runtime, **fields):
    return runtime.handle(
        "plan.save",
        {"plan": {"name": "任务表", "tasks": [{"type": "Award", "params": {}}], **fields}},
    )


def authorize(runtime, **budgets):
    settings = runtime.snapshot()["settings"]
    settings["budgets"].update(budgets)
    return runtime.handle("settings.save", {"settings": settings})


def start(runtime, plan, token="new-run", device="mock-device-1"):
    return runtime.handle(
        "run.start", {"planId": plan["id"], "deviceId": device, "requestId": token}
    )


def test_legacy_plan_defaults_and_unknown_parameters_survive_restart(tmp_path):
    first = Runtime(tmp_path / "data")
    legacy = {
        "id": "legacy",
        "name": "旧版任务表",
        "tasks": [{"type": "Award", "params": {"future_option": {"nested": [1, "保留"]}}}],
    }
    first.store.put("plan", "legacy", legacy)
    normalized = next(plan for plan in first.snapshot()["plans"] if plan["id"] == "legacy")
    assert normalized["description"] == ""
    assert normalized["deviceId"] is None
    assert normalized["group"] == "daily"
    assert normalized["budgets"] is None
    assert normalized["tasks"][0]["enabled"] is True
    saved = first.handle("plan.save", {"plan": normalized})
    first.close()
    second = Runtime(tmp_path / "data")
    try:
        assert second.store.get("plan", "legacy") == saved
        assert saved["tasks"][0]["params"] == legacy["tasks"][0]["params"]
    finally:
        second.close()


def test_offline_binding_and_metadata_round_trip(runtime):
    saved = save(
        runtime,
        description="每周材料补给",
        deviceId="offline-device",
        group="specialized",
        budgets={"medicine": 0},
    )
    assert saved["description"] == "每周材料补给"
    assert saved["deviceId"] == "offline-device"
    assert saved["group"] == "specialized"
    assert saved["budgets"] == {"originium": 0, "medicine": 0, "expedited": 0}
    assert next(plan for plan in runtime.snapshot()["plans"] if plan["id"] == saved["id"]) == saved
    with pytest.raises(RpcError, match="已绑定其他设备"):
        start(runtime, saved)
    assert not runtime.snapshot()["runs"]


@pytest.mark.parametrize("key", ["originium", "medicine", "expedited"])
def test_table_limits_cannot_exceed_global_authorization(runtime, key):
    with pytest.raises(RpcError, match="任务表消耗上限超出应用已授权额度"):
        save(runtime, budgets={key: 1})
    authorize(runtime, **{key: 2})
    saved = save(runtime, budgets={key: 1})
    assert saved["budgets"][key] == 1


def test_effective_table_budget_aggregates_enabled_tasks(runtime):
    authorize(runtime, medicine=5, originium=2)
    tasks = [
        {"type": "Fight", "params": {"medicine": 1, "stone": 1}},
        {"type": "Fight", "params": {"medicine": 2}},
        {"type": "Fight", "enabled": False, "params": {"medicine": 100, "stone": 100}},
        {"type": "Fight", "params": {"enable": False, "medicine": 100}},
    ]
    with pytest.raises(RpcError, match="超出"):
        save(runtime, budgets={"medicine": 2, "originium": 1}, tasks=tasks)
    saved = save(runtime, budgets={"medicine": 3, "originium": 1}, tasks=tasks)
    run = start(runtime, saved)
    assert len(runtime.store.get("run_plan", run["id"])["tasks"]) == 2


@pytest.mark.parametrize("table_budget", [None, {"medicine": 2}])
def test_start_rechecks_lowered_global_authorization(runtime, table_budget):
    authorize(runtime, medicine=2)
    saved = save(
        runtime,
        budgets=table_budget,
        tasks=[{"type": "Fight", "params": {"medicine": 2}}],
    )
    authorize(runtime, medicine=1)
    with pytest.raises(RpcError, match="超出"):
        start(runtime, saved)
    assert not runtime.snapshot()["runs"]


def test_matching_binding_and_unbound_current_device_can_execute(runtime):
    bound = save(runtime, deviceId="mock-device-1")
    run = start(runtime, bound)
    runtime.handle("run.stop", {"id": run["id"]})
    unbound = save(runtime)
    assert start(runtime, unbound, token="unbound")["deviceId"] == "mock-device-1"


def test_editing_saved_plan_does_not_change_running_snapshot(runtime):
    saved = save(runtime, deviceId="mock-device-1", description="运行前")
    run = start(runtime, saved)
    frozen = runtime.store.get("run_plan", run["id"])
    save(
        runtime,
        id=saved["id"],
        deviceId="next-device",
        description="下一次执行",
        group="specialized",
        tasks=[{"type": "Depot", "params": {"future_option": ["保持"]}}],
    )
    assert runtime.store.get("run_plan", run["id"]) == frozen
    assert start(runtime, saved)["id"] == run["id"]  # retry returns its original snapshot
    assert runtime.snapshot()["runs"][0]["deviceId"] == "mock-device-1"


@pytest.mark.parametrize(
    "fields",
    [
        {"description": "长" * 501},
        {"description": None},
        {"deviceId": ""},
        {"deviceId": "x" * 201},
        {"group": "unknown"},
        {"group": None},
        {"budgets": {"medicine": -1}},
        {"budgets": {"medicine": 101}},
        {"budgets": {"unknown": 0}},
    ],
)
def test_malformed_table_settings_are_rejected(runtime, fields):
    with pytest.raises(RpcError) as error:
        save(runtime, **fields)
    assert error.value.code == -32602


def test_system_theme_default_keeps_explicit_saved_choice(tmp_path):
    first = Runtime(tmp_path / "data")
    assert first.snapshot()["settings"]["theme"] == "system"
    settings = first.snapshot()["settings"]
    settings["theme"] = "dark"
    first.handle("settings.save", {"settings": settings})
    first.close()
    second = Runtime(tmp_path / "data")
    try:
        assert second.snapshot()["settings"]["theme"] == "dark"
    finally:
        second.close()
