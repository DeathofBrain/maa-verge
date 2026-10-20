import queue
import sys
import threading

import pytest
from filelock import FileLock
from maaverge_runtime.adb import validate_address
from maaverge_runtime.models import RpcError
from maaverge_runtime.runtime import Runtime
from maaverge_runtime.worker import CoreWorker
from test_updates import FixtureSource


class FixtureWorker:
    instances = []

    def __init__(self, config, lease):
        self.config, self.lease = config, lease
        self.events = queue.Queue()
        self.running, self.pending, self.connected = False, 0, False
        self.closed, self.task_id, self.tasks = False, 0, []
        self.instances.append(self)

    @property
    def safe_idle(self):
        return not self.running and not self.pending and not self.closed

    def connect(self):
        self.pending = 0
        self.events.put(
            {
                "type": "callback",
                "message": 4,
                "details": {"what": "Connect", "async_call_id": 1, "details": {"ret": True}},
            }
        )
        self.events.put({"type": "status", "running": False, "pendingAsync": []})

    def task(self, task):
        self.running = True
        self.tasks.append(task)
        self.task_id += 1
        return {"taskId": self.task_id}

    def wait_connected(self, timeout=30):
        self.connected = True
        return self.safe_idle

    def complete(self, success=True, queue_only=False):
        self.running = False
        if not queue_only:
            self.events.put(
                {
                    "type": "callback",
                    "message": 10002 if success else 10000,
                    "details": {"taskid": self.task_id},
                }
            )
        self.events.put({"type": "callback", "message": 3, "details": {}})
        self.events.put({"type": "status", "running": False, "pendingAsync": []})

    def stop(self):
        self.running = False
        self.events.put({"type": "status", "running": False, "pendingAsync": []})

    def close(self):
        self.closed = True
        self.lease.release()


@pytest.fixture
def native(tmp_path, monkeypatch):
    monkeypatch.setenv("MAAVERGE_DEVICE_LOCK_DIR", str(tmp_path / "locks"))
    monkeypatch.setattr("maaverge_runtime.runtime.adb_path", lambda: "fixture-adb")
    FixtureWorker.instances = []
    runtime = Runtime(
        tmp_path / "native",
        mode="native",
        worker_factory=FixtureWorker,
        update_source=FixtureSource(),
        validator=lambda *_: None,
    )
    runtime.updates.check("core")
    runtime.updates.prepare("core")
    runtime.updates.activate("core")
    runtime.handle(
        "plan.save",
        {
            "plan": {
                "id": "daily",
                "name": "双任务测试",
                "tasks": [
                    {"type": "Fight", "params": {"stage": "1-7", "times": 1}},
                    {"type": "Award", "params": {}},
                ],
            }
        },
    )
    device = runtime.handle("device.connect", {"address": "127.0.0.1:5555"})
    runtime.tick(force=True)
    yield runtime, device["id"]
    runtime.close()


def start_native(runtime, device_id):
    return runtime.handle(
        "run.start", {"planId": "daily", "deviceId": device_id, "requestId": "native-one"}
    )


def test_native_task_queue_requires_evidence_and_idle(native):
    runtime, device_id = native
    run = start_native(runtime, device_id)
    worker = runtime.workers[device_id]
    assert worker.tasks[0]["params"]["stone"] == 0
    assert worker.tasks[0]["params"]["report_to_penguin"] is False
    worker.complete()
    runtime.tick(force=True)
    assert len(worker.tasks) == 2
    assert runtime.store.get("run", run["id"])["progress"] == 50
    worker.complete()
    runtime.tick(force=True)
    assert runtime.store.get("run", run["id"])["status"] == "completed"
    assert runtime.store.get("device", device_id)["state"] == "idle"


@pytest.mark.parametrize("queue_only", [False, True])
def test_all_tasks_completed_does_not_hide_chain_failure(native, queue_only):
    runtime, device_id = native
    run = start_native(runtime, device_id)
    worker = runtime.workers[device_id]
    worker.complete(success=False, queue_only=queue_only)
    runtime.tick(force=True)
    assert runtime.store.get("run", run["id"])["status"] == "failed"
    assert len(worker.tasks) == 1


def test_native_stop_waits_for_idle_and_keeps_plan(native):
    runtime, device_id = native
    run = start_native(runtime, device_id)
    runtime.handle("run.stop", {"id": run["id"]})
    runtime.tick(force=True)
    assert runtime.store.get("run", run["id"])["status"] == "stopped"
    assert runtime.store.get("plan", "daily")


def test_resource_switch_waits_then_restarts_worker_without_restarting_service(native):
    runtime, device_id = native
    old_worker = runtime.workers[device_id]
    runtime.updates.check("resource")
    runtime.updates.prepare("resource")
    run = start_native(runtime, device_id)
    assert runtime.updates.activate("resource")["status"] == "waiting_idle"
    old_worker.complete(success=False)
    runtime.tick(force=True)
    assert runtime.store.get("run", run["id"])["status"] == "failed"
    runtime.updates.activate_pending()
    new_worker = runtime.workers[device_id]
    assert old_worker.closed
    assert new_worker is not old_worker
    assert new_worker.config["resource"] != old_worker.config["resource"]
    runtime.tick(force=True)
    assert runtime.store.get("device", device_id)["state"] == "idle"


def test_native_device_lock_shared_across_data_roots(native, tmp_path):
    runtime, _ = native
    second = Runtime(
        tmp_path / "second",
        mode="native",
        worker_factory=FixtureWorker,
        update_source=FixtureSource(),
        validator=lambda *_: None,
    )
    try:
        second.store.put("active", "combo", runtime.store.get("active", "combo"))
        with pytest.raises(RpcError, match="其他本地实例"):
            second.handle("device.connect", {"address": "127.0.0.1:5555"})
    finally:
        second.close()


def test_hot_update_at_task_boundary_continues_unexecuted_tasks(native):
    runtime, device_id = native
    worker = runtime.workers[device_id]
    run = start_native(runtime, device_id)
    runtime.updates.check("resource")
    runtime.updates.prepare("resource")
    runtime.updates.activate("resource")
    worker.complete()
    runtime.tick(force=True)
    assert len(worker.tasks) == 1
    assert runtime.store.get("execution", run["id"])["boundaryWaiting"]
    assert not runtime.busy()
    runtime.updates.activate_pending()
    new_worker = runtime.workers[device_id]
    runtime.tick(force=True)
    assert new_worker is not worker
    assert len(new_worker.tasks) == 1
    assert new_worker.tasks[0]["type"] == "Award"
    new_worker.complete()
    runtime.tick(force=True)
    assert runtime.store.get("run", run["id"])["status"] == "completed"


def test_worker_restart_failure_restores_active_combination(native):
    runtime, device_id = native
    runtime.updates.check("resource")
    runtime.updates.prepare("resource")
    runtime.updates.activate("resource")
    runtime.tick(force=True)
    active = runtime.store.get("active", "combo")
    calls = 0

    def fail_once(config, lease):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ValueError("synthetic startup failure")
        return FixtureWorker(config, lease)

    runtime.worker_factory = fail_once
    with pytest.raises(RpcError, match="回滚初始化失败"):
        runtime.updates.rollback("resource")
    assert runtime.store.get("active", "combo") == active
    assert runtime.workers[device_id].config["resource"] == active["resource"]["path"]


def test_async_reconnect_failure_restores_old_combo_and_continues_plan(native):
    runtime, device_id = native
    original = runtime.store.get("active", "combo")
    run = start_native(runtime, device_id)
    runtime.updates.check("resource")
    runtime.updates.prepare("resource")
    runtime.updates.activate("resource")
    runtime.workers[device_id].complete()
    runtime.tick(force=True)
    waits = []

    def factory(config, lease):
        worker = FixtureWorker(config, lease)

        def acknowledge(timeout):
            waits.append(timeout)
            worker.connected = config["resource"] == original["resource"]["path"]
            return worker.connected

        worker.wait_connected = acknowledge
        return worker

    runtime.worker_factory = factory
    runtime.updates.activate_pending()
    assert runtime.store.get("active", "combo") == original
    assert runtime.updates.channel("resource")["status"] == "failed"
    assert not runtime.switching_components
    assert waits == [30, 30]
    runtime.tick(force=True)
    assert runtime.workers[device_id].tasks[-1]["type"] == "Award"
    assert runtime.store.get("run", run["id"])["status"] == "running"


def test_failed_candidate_and_old_reconnect_fail_waiting_run(native):
    runtime, device_id = native
    original = runtime.store.get("active", "combo")
    run = start_native(runtime, device_id)
    runtime.updates.check("resource")
    runtime.updates.prepare("resource")
    runtime.updates.activate("resource")
    runtime.workers[device_id].complete()
    runtime.tick(force=True)

    def factory(config, lease):
        worker = FixtureWorker(config, lease)
        worker.wait_connected = lambda timeout: False
        return worker

    runtime.worker_factory = factory
    runtime.updates.activate_pending()
    assert runtime.store.get("active", "combo") == original
    failed = runtime.store.get("run", run["id"])
    assert failed["status"] == "failed"
    assert "旧版重连失败" in failed["message"]
    assert runtime.workers == {}
    assert not runtime.switching_components
    assert not runtime.busy()


def test_external_connect_start_blocked_until_switch_ack_and_commit(native):
    runtime, device_id = native
    runtime.updates.check("resource")
    runtime.updates.prepare("resource")
    entered, release = threading.Event(), threading.Event()

    def factory(config, lease):
        worker = FixtureWorker(config, lease)

        def acknowledge(timeout):
            entered.set()
            assert release.wait(3)
            worker.connected = True
            return True

        worker.wait_connected = acknowledge
        return worker

    runtime.worker_factory = factory
    errors = []

    def activate():
        try:
            runtime.updates.activate("resource")
        except Exception as error:
            errors.append(error)

    thread = threading.Thread(target=activate)
    thread.start()
    try:
        assert entered.wait(3)
        assert runtime.snapshot()["mode"] == "native"  # no lock held during ack wait
        with pytest.raises(RpcError, match="暂不能连接"):
            runtime.handle("device.connect", {"address": "127.0.0.1:7777"})
        with pytest.raises(RpcError, match="正在切换"):
            start_native(runtime, device_id)
        with pytest.raises(RpcError, match="暂不能断开"):
            runtime.handle("device.disconnect", {"id": device_id})
    finally:
        release.set()
        thread.join(timeout=5)
    assert not thread.is_alive()
    assert not errors
    assert not runtime.switching_components
    assert runtime.updates.channel("resource")["status"] == "active"


@pytest.mark.parametrize("address", ["-s", "x & echo", "", "$(anything)", "127.0.0.1;echo"])
def test_adb_rejects_shell_and_option_addresses(address):
    with pytest.raises(ValueError):
        validate_address(address)


def test_native_stdio_worker_supervision_with_synthetic_process(tmp_path):
    fixture = tmp_path / "fixture_worker.py"
    fixture.write_text(
        """
import json, sys
json.loads(sys.stdin.readline())
print(json.dumps({"type":"ready"}), flush=True)
for line in sys.stdin:
    command=json.loads(line)
    result={"taskId":42} if command["operation"]=="task" else {"asyncId":1}
    print(json.dumps({"type":"response","id":command["id"],"result":result}), flush=True)
    if command["operation"]=="connect":
        print(json.dumps({"type":"callback","message":4,"details":{
          "what":"Connect","details":{"ret":True}}}), flush=True)
        print(json.dumps({"type":"status","running":False,"pendingAsync":[]}), flush=True)
""",
        encoding="utf-8",
    )
    lease = FileLock(tmp_path / "lease", thread_local=False)
    lease.acquire()
    worker = CoreWorker(
        {"core": str(tmp_path), "userDir": str(tmp_path / "user")},
        lease,
        command=[sys.executable, str(fixture)],
    )
    try:
        assert not worker.wait_connected(timeout=0.01)
        assert worker.connect()["asyncId"] == 1
        assert worker.wait_connected(timeout=1)
        assert worker.task({"type": "Award", "params": {}})["taskId"] == 42
    finally:
        worker.close()
    assert worker.process.poll() is not None
    assert not lease.is_locked
