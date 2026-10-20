import json
import os
import subprocess
import sys

import pytest
from maaverge_runtime.__main__ import process_request
from maaverge_runtime.models import RpcError, Snapshot
from maaverge_runtime.runtime import Runtime


@pytest.fixture
def runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("MAAVERGE_DEVICE_LOCK_DIR", str(tmp_path / "shared-locks"))
    value = Runtime(tmp_path / "data")
    yield value
    value.close()


def start(runtime, token="request-1"):
    return runtime.handle(
        "run.start", {"planId": "daily", "deviceId": "mock-device-1", "requestId": token}
    )


def test_snapshot_conforms_to_public_model(runtime):
    snapshot = Snapshot.model_validate(runtime.snapshot())
    assert snapshot.mode == "mock"
    assert snapshot.settings.budgets.originium == 0


def test_duplicate_start_and_device_exclusivity(runtime):
    run = start(runtime)
    assert start(runtime)["id"] == run["id"]
    with pytest.raises(RpcError, match="设备已有控制者"):
        start(runtime, "second")
    with pytest.raises(RpcError, match="同一请求标识"):
        runtime.handle(
            "run.start",
            {"planId": "farm-1-7", "deviceId": "mock-device-1", "requestId": "request-1"},
        )
    for _ in range(10):
        runtime.tick(force=True)
    assert runtime.snapshot()["runs"][0]["status"] == "completed"
    assert "模拟" in runtime.snapshot()["runs"][0]["message"]


def test_stop_preserves_plan_and_releases_control(runtime):
    run = start(runtime)
    runtime.handle("run.stop", {"id": run["id"]})
    assert len(runtime.snapshot()["plans"]) == 2
    assert start(runtime, "new")["status"] == "running"


def test_restart_marks_uncertain_run_failed_without_replay(tmp_path, monkeypatch):
    monkeypatch.setenv("MAAVERGE_DEVICE_LOCK_DIR", str(tmp_path / "shared-locks"))
    first = Runtime(tmp_path / "data")
    run = start(first)
    # Simulate process loss, bypassing graceful shutdown.
    first.release(run["id"])
    first.store.close()
    second = Runtime(tmp_path / "data")
    try:
        assert second.snapshot()["runs"][0]["status"] == "failed"
        assert not second.busy()
        assert start(second)["status"] == "failed"  # same request never replays
    finally:
        second.close()


def test_budget_and_command_validation(runtime):
    plan = {"name": "bad", "tasks": [{"type": "Fight", "params": {"stone": 1}}]}
    with pytest.raises(RpcError, match="超出"):
        runtime.handle("plan.save", {"plan": plan})
    plan["tasks"][0]["params"] = {"shell": "anything"}
    with pytest.raises(RpcError, match="任意命令"):
        runtime.handle("plan.save", {"plan": plan})
    plan["tasks"][0] = {"type": "Unknown", "params": {}}
    with pytest.raises(RpcError) as error:
        runtime.handle("plan.save", {"plan": plan})
    assert error.value.code == -32602


def test_agent_proposes_without_execution(runtime):
    result = runtime.handle("agent.message", {"message": "刷 1-7 六次"})
    assert result["requiresConfirmation"]
    assert result["plan"]["tasks"][0]["type"] == "Fight"
    assert "未调用云端模型" in result["reply"]
    assert runtime.snapshot()["runs"] == []


def test_json_rpc_invalid_requests_and_notifications(runtime):
    assert process_request(runtime, [])["error"]["code"] == -32600
    assert (
        process_request(runtime, {"jsonrpc": "2.0", "id": 1, "method": "missing"})["error"]["code"]
        == -32601
    )
    assert process_request(runtime, {"jsonrpc": "2.0", "method": "app.snapshot"}) is None


def test_stdio_is_json_only_and_mock_offline(tmp_path):
    requests = (
        "not-json\n" + json.dumps({"jsonrpc": "2.0", "id": 1, "method": "app.snapshot"}) + "\n"
    )
    env = {**os.environ, "MAAVERGE_DATA_DIR": str(tmp_path), "MAAVERGE_MODE": "mock"}
    process = subprocess.run(
        [sys.executable, "-m", "maaverge_runtime"],
        input=requests,
        text=True,
        encoding="utf-8",
        capture_output=True,
        env=env,
        timeout=20,
        check=True,
    )
    messages = [json.loads(line) for line in process.stdout.splitlines()]
    assert messages[0]["error"]["code"] == -32700
    assert messages[1]["id"] == 1
    assert messages[1]["result"]["mode"] == "mock"


def test_native_never_silently_simulates(tmp_path):
    runtime = Runtime(tmp_path, mode="native")
    try:
        assert runtime.snapshot()["devices"] == []
        runtime.handle(
            "plan.save",
            {
                "plan": {
                    "id": "daily",
                    "name": "真实测试计划",
                    "tasks": [{"type": "Award", "params": {}}],
                }
            },
        )
        with pytest.raises(RpcError, match="设备不存在"):
            start(runtime)
        with pytest.raises(RpcError, match="云模型尚未接入"):
            runtime.handle("agent.message", {"message": "做日常"})
    finally:
        runtime.close()
