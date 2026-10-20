"""Deterministic mock runtime and shared application service boundary."""

import hashlib
import re
import threading
import time
import uuid
from collections.abc import Callable
from pathlib import Path

from filelock import FileLock, Timeout
from pydantic import ValidationError

from .adb import (
    adb_path,
    adb_server_identity,
    auto_discover,
    device_lock_address,
    discover,
    is_local_emulator,
    validate_address,
)
from .config import device_lock_path
from .models import Plan, RpcError, Settings, Snapshot
from .storage import Store, now
from .task_policy import native_task, validate_plan
from .updates import UpdateService
from .worker import CoreWorker


class Runtime:
    def __init__(
        self,
        root: Path,
        mode: str = "mock",
        notify: Callable | None = None,
        tick_seconds: float = 0.6,
        update_source=None,
        validator=None,
        worker_factory=None,
    ):
        if mode not in {"mock", "native"}:
            raise ValueError("运行模式必须是 mock 或 native")
        self.root, self.mode, self.notify = root, mode, notify
        self.store, self.lock = Store(root), threading.RLock()
        self.tick_seconds, self.last_tick = tick_seconds, time.monotonic()
        self.device_locks: dict[str, FileLock] = {}
        self.workers: dict[str, CoreWorker] = {}
        self.connecting: set[str] = set()
        self.worker_factory = worker_factory or CoreWorker
        self.reconnect_after_update: list[dict] = []
        self.switching_components = False
        self.auto_connect_lock = threading.Lock()
        self.auto_connect_suppressed: set[str] = set()
        self.next_auto_connect = time.monotonic() + 2
        self.last_connection_diagnostics: list[str] = []
        self.running = True
        # Startup checks are delayed to let the first snapshot render. Explicit
        # native mode bootstraps its own core; mock mode never accesses the network.
        self.next_checks = {"core": time.monotonic() + 3, "resource": time.monotonic() + 6}
        self._seed()
        for device in self.store.all("device"):
            device["state"] = "offline"
            self.store.put("device", device["id"], device)
        # In-flight effects are uncertain after a crash; never replay automatically.
        for run in self.store.all("run"):
            if run["status"] == "running":
                run.update(
                    status="failed",
                    finishedAt=now(),
                    message="上次运行被中断；请核对设备后重新执行",
                )
                self.store.put("run", run["id"], run)
                self.emit("run.interrupted", run["message"], {"runId": run["id"]})
        self.updates = UpdateService(
            root / "components",
            self.store,
            self.emit,
            self.busy,
            mode,
            update_source,
            validator,
            before_activate=self.before_component_switch,
            after_activate=self.after_component_switch,
            finish_activate=self.finish_component_switch,
        )

    def _seed(self) -> None:
        if self.store.get("meta", "initialized"):
            return
        self.store.put("settings", "main", Settings().model_dump())
        if self.mode == "mock":
            for plan in [
                {
                    "id": "daily",
                    "name": "日常收菜",
                    "tasks": [
                        {"type": "StartUp", "params": {}},
                        {"type": "Recruit", "params": {}},
                        {"type": "Infrast", "params": {}},
                        {"type": "Mall", "params": {}},
                        {"type": "Award", "params": {}},
                    ],
                },
                {
                    "id": "farm-1-7",
                    "name": "1-7 材料补给",
                    "tasks": [{"type": "Fight", "params": {"stage": "1-7", "times": 6}}],
                },
            ]:
                value = Plan.model_validate(plan).model_dump()
                self.store.put("plan", value["id"], value)
        self.store.put("meta", "initialized", True)

    def emit(self, event_type: str, message: str, data: dict | None = None) -> dict:
        with self.lock:
            event = self.store.event(event_type, message, data)
            if self.notify:
                self.notify({"jsonrpc": "2.0", "method": "runtime.event", "params": event})
            return event

    def busy(self) -> bool:
        return (
            bool(self.connecting)
            or any(
                run["status"] == "running"
                and not (
                    self.mode == "native"
                    and self.store.get("execution", run["id"], {}).get("boundaryWaiting")
                )
                for run in self.store.all("run")
            )
            or any(not worker.safe_idle for worker in list(self.workers.values()))
        )

    def devices(self) -> list[dict]:
        if self.mode != "mock":
            return self.store.all("device")
        return [
            {
                "id": "mock-device-1",
                "name": "本地演示设备",
                "address": "mock://local",
                "state": "running" if self.busy() else "idle",
                "coreVersion": self.updates.channel("core")["currentVersion"],
                "resourceVersion": self.updates.channel("resource")["currentVersion"],
            }
        ]

    def snapshot(self) -> dict:
        return Snapshot.model_validate(
            {
                "mode": self.mode,
                "devices": self.devices(),
                "plans": self.store.all("plan"),
                "runs": list(reversed(self.store.all("run")))[0:100],
                "updates": self.updates.channels(),
                "settings": self.store.get("settings", "main"),
                "events": self.store.events(),
            }
        ).model_dump()

    def handle(self, method: str, params: dict | None = None):
        if params is None:
            params = {}
        if not isinstance(params, dict):
            raise RpcError(-32602, "params 必须是对象")
        if method == "device.connect":
            return self.connect_device(params)
        if method == "device.auto_connect":
            return self.auto_connect_devices()
        # Updates may download or validate in an isolated subprocess. Never hold
        # the app lock across them: snapshots and progress notifications stay live.
        if method in {"updates.check", "updates.prepare", "updates.activate", "updates.rollback"}:
            if "channel" not in params:
                raise RpcError(-32602, "缺少更新通道")
            result = getattr(self.updates, method.split(".")[1])(params["channel"])
            if method == "updates.activate" and params["channel"] == "core":
                self.next_checks["resource"] = time.monotonic()
            return result
        with self.lock:
            try:
                if method == "app.snapshot":
                    return self.snapshot()
                if method == "device.discover":
                    if self.mode == "mock":
                        return [
                            {"address": "mock://local", "name": "演示设备", "adbState": "device"}
                        ]
                    try:
                        return discover()
                    except Exception as error:
                        raise RpcError(-32040, "ADB 设备发现失败", str(error)) from error
                if method == "device.disconnect":
                    return self.disconnect_device(params["id"])
                if method == "plan.save":
                    plan = Plan.model_validate(params["plan"])
                    if plan.schedule:
                        raise RpcError(-32030, "定时调度尚未实现，请使用手动执行")
                    self.validate_policy(plan)
                    if not plan.id:
                        plan.id = "plan-" + uuid.uuid4().hex[:12]
                    self.store.put("plan", plan.id, plan.model_dump())
                    self.emit("plan.saved", "计划已保存", {"planId": plan.id})
                    return plan.model_dump()
                if method == "plan.delete":
                    ident = params["id"]
                    if any(
                        r["planId"] == ident and r["status"] == "running"
                        for r in self.store.all("run")
                    ):
                        raise RpcError(-32011, "运行中的计划不能删除")
                    self.store.delete("plan", ident)
                    self.emit("plan.deleted", "计划已删除", {"planId": ident})
                    return {"deleted": True}
                if method == "run.start":
                    return self.start_run(params)
                if method == "run.stop":
                    return self.stop_run(params["id"])
                if method == "agent.message":
                    return self.agent_message(params["message"])
                if method == "settings.save":
                    settings = Settings.model_validate(params["settings"])
                    previous = Settings.model_validate(self.store.get("settings", "main"))
                    if settings.autoConnect and not previous.autoConnect:
                        self.auto_connect_suppressed.clear()
                        self.next_auto_connect = 0
                    self.store.put("settings", "main", settings.model_dump())
                    self.emit("settings.saved", "设置已保存")
                    return settings.model_dump()
                raise RpcError(-32601, "未知方法", {"method": method})
            except (KeyError, TypeError, ValidationError) as error:
                raise RpcError(-32602, "请求参数无效", str(error)) from error

    def validate_policy(self, plan: Plan) -> None:
        settings = Settings.model_validate(self.store.get("settings", "main"))
        validate_plan(plan, settings)

    def start_run(self, params: dict) -> dict:
        if self.switching_components:
            raise RpcError(-32011, "正在切换核心与资源，请稍候")
        token = params["requestId"]
        if not isinstance(token, str) or not token or len(token) > 200:
            raise RpcError(-32602, "requestId 必须是非空字符串")
        if existing := self.store.get("request", token):
            if existing["planId"] != params["planId"] or existing["deviceId"] != params["deviceId"]:
                raise RpcError(-32011, "同一请求标识不能用于不同执行")
            return self.store.get("run", existing["runId"])
        plan = self.store.get("plan", params["planId"])
        if not plan:
            raise RpcError(-32004, "计划不存在")
        validated_plan = Plan.model_validate(plan)
        self.validate_policy(validated_plan)
        plan = validated_plan.model_dump()
        if plan["deviceId"] is not None and plan["deviceId"] != params["deviceId"]:
            raise RpcError(-32011, "任务表已绑定其他设备，请使用绑定设备执行")
        if not plan["enabled"]:
            raise RpcError(-32011, "计划已禁用")
        plan = {
            **plan,
            "tasks": [
                task
                for task in plan["tasks"]
                if task.get("enabled", True) and task["params"].get("enable", True)
            ],
        }
        if not plan["tasks"]:
            raise RpcError(-32010, "任务表至少需要启用一条任务才能执行")
        device = next((d for d in self.devices() if d["id"] == params["deviceId"]), None)
        if not device:
            raise RpcError(-32004, "设备不存在")
        if device["state"] != "idle":
            raise RpcError(-32011, "设备已有控制者")
        if any(
            r["deviceId"] == device["id"] and r["status"] == "running"
            for r in self.store.all("run")
        ):
            raise RpcError(-32011, "该设备已有尚未结束的计划")
        if self.mode == "native":
            worker = self.workers.get(device["id"])
            if not worker or not worker.connected or not worker.safe_idle:
                raise RpcError(-32011, "核心尚未连接或异步操作未结束")
        else:
            lease = FileLock(device_lock_path(device["address"]), thread_local=False)
            try:
                lease.acquire(timeout=0)
            except Timeout as error:
                raise RpcError(-32011, "其他本地实例正在控制此设备") from error
        ident = "run-" + uuid.uuid4().hex[:12]
        run = {
            "id": ident,
            "planId": params["planId"],
            "deviceId": device["id"],
            "status": "running",
            "progress": 0,
            "message": "模拟执行：正在初始化" if self.mode == "mock" else "正在提交首个任务",
            "startedAt": now(),
        }
        if self.mode == "mock":
            self.device_locks[ident] = lease
        self.store.put("run", ident, run)
        self.store.put("run_plan", ident, plan)
        self.store.put(
            "request",
            token,
            {"runId": ident, "planId": params["planId"], "deviceId": params["deviceId"]},
        )
        self.emit("run.started", run["message"], {"run": run})
        if self.mode == "native":
            device["state"] = "running"
            self.store.put("device", device["id"], device)
            self.submit_native_task(run, 0)
            return self.store.get("run", ident)
        return run

    def stop_run(self, ident: str) -> dict:
        run = self.store.get("run", ident)
        if not run:
            raise RpcError(-32004, "执行记录不存在")
        if run["status"] == "running":
            if self.mode == "native" and (worker := self.workers.get(run["deviceId"])):
                try:
                    worker.stop()
                    execution = self.store.get("execution", ident, {})
                    execution["stopRequested"] = time.monotonic()
                    self.store.put("execution", ident, execution)
                    run["message"] = "正在停止并等待核心与异步调用结束，原计划保留"
                    self.store.put("run", ident, run)
                    return run
                except Exception:
                    worker.close()
                    self.workers.pop(run["deviceId"], None)
            run.update(status="stopped", finishedAt=now(), message="模拟执行已停止，原计划保留")
            self.store.put("run", ident, run)
            self.release(ident)
            self.emit("run.stopped", run["message"], {"run": run})
        return run

    def release(self, ident: str) -> None:
        if lease := self.device_locks.pop(ident, None):
            lease.release()

    def connect_device(
        self, params: dict, *, internal: bool = False, automatic: bool = False
    ) -> dict:
        if self.mode == "mock":
            return self.devices()[0]
        ident = None
        reserved = False
        try:
            with self.lock:
                if self.switching_components and not internal:
                    raise RpcError(-32011, "正在切换核心与资源，暂不能连接设备")
                if not self.running:
                    raise RpcError(-32011, "应用运行时正在退出")
                address = validate_address(params.get("address"))
                if automatic:
                    self.validate_automatic_connection(address)
                elif not internal:
                    self.auto_connect_suppressed.discard(device_lock_address(address))
                combo = self.store.get("active", "combo", {})
                if not combo.get("core"):
                    raise ValueError("请先在更新中心安装并启用核心")
                ident = "device-" + hashlib.sha256(address.encode()).hexdigest()[:12]
                if ident in self.connecting:
                    raise RpcError(-32011, "该设备正在建立连接")
                if ident in self.workers:
                    return self.store.get("device", ident)
                self.connecting.add(ident)
                reserved = True
            executable = adb_path()
            key = adb_server_identity() + "|" + device_lock_address(address)
            lease = FileLock(device_lock_path(key), thread_local=False)
            lease.acquire(timeout=0)
            config = {
                "core": combo["core"]["path"],
                "resource": combo["resource"]["path"],
                "adb": executable,
                "address": address,
                "userDir": str(self.root / "workers" / ident),
            }
            try:
                worker = self.worker_factory(config, lease)
                worker.connect()
            except Exception:
                if "worker" in locals():
                    worker.close()
                lease.release()
                raise
            with self.lock:
                if not self.running:
                    worker.close()
                    raise RpcError(-32011, "应用运行时正在退出")
                if automatic:
                    try:
                        self.validate_automatic_connection(address)
                    except RpcError:
                        worker.close()
                        raise
                self.workers[ident] = worker
                device = {
                    "id": ident,
                    "name": str(params.get("name") or address)[:80],
                    "address": address,
                    "state": "offline",
                    "coreVersion": combo["core"]["version"],
                    "resourceVersion": combo["resource"]["version"],
                }
                self.store.put("device", ident, device)
                self.emit("device.connecting", "正在异步连接设备", {"device": device})
                return device
        except RpcError:
            raise
        except Timeout as error:
            raise RpcError(-32011, "其他本地实例已连接该设备") from error
        except Exception as error:
            raise RpcError(-32040, "设备连接失败", str(error)) from error
        finally:
            if ident and reserved:
                with self.lock:
                    self.connecting.discard(ident)

    def validate_automatic_connection(self, address: str) -> None:
        """Caller holds self.lock: do not undo a changed setting or manual disconnect."""
        settings = Settings.model_validate(self.store.get("settings", "main"))
        if not settings.autoConnect:
            raise RpcError(-32011, "自动连接已关闭")
        if device_lock_address(address) in self.auto_connect_suppressed:
            raise RpcError(-32011, "该设备已手动断开，自动连接已跳过")

    def auto_connect_devices(self, *, automatic: bool = False) -> dict:
        """Discover local emulators and request MaaCore connections, never start tasks."""
        if self.mode == "mock":
            return {
                "devices": self.devices(),
                "discovered": [
                    {"address": "mock://local", "name": "演示设备", "adbState": "device"}
                ],
                "diagnostics": ["模拟模式：未扫描端口、调用 ADB 或连接真实设备"],
            }
        if not self.auto_connect_lock.acquire(blocking=False):
            raise RpcError(-32011, "模拟器自动连接正在进行")
        try:
            with self.lock:
                if not self.running or self.switching_components:
                    raise RpcError(-32011, "正在退出或切换核心，请稍后重试")
                if not automatic:
                    self.auto_connect_suppressed.clear()
                if not self.store.get("active", "combo", {}).get("core"):
                    raise RpcError(-32040, "请先在更新中心安装并启用核心，再自动连接模拟器")
            try:
                discovered, diagnostics = auto_discover()
            except Exception as error:
                raise RpcError(-32040, "模拟器自动发现失败", str(error)) from error
            devices = []
            seen: set[str] = set()
            for candidate in discovered:
                address = candidate["address"]
                key = device_lock_address(address)
                if (
                    candidate["adbState"] != "device"
                    or not is_local_emulator(address)
                    or key in seen
                    or (automatic and key in self.auto_connect_suppressed)
                ):
                    continue
                seen.add(key)
                try:
                    with self.lock:
                        if self.switching_components or not self.running:
                            raise RpcError(-32011, "正在退出或切换核心，请稍后重试")
                        existing = next(
                            (
                                self.store.get("device", ident)
                                for ident in self.workers
                                if device_lock_address(self.store.get("device", ident)["address"])
                                == key
                            ),
                            None,
                        )
                        if existing:
                            worker = self.workers[existing["id"]]
                            if worker.connected or not worker.safe_idle:
                                devices.append(existing)
                                continue
                            # A completed failed connection may be retried, but an
                            # active task or pending async operation is never replaced.
                            self.disconnect_device(existing["id"], internal=True)
                    devices.append(self.connect_device(candidate, automatic=automatic))
                except RpcError as error:
                    diagnostics.append(f"{address}：{error.message}")
            if not devices:
                diagnostics.append(
                    "未连接到可用模拟器；请启动模拟器并开启 ADB 调试，或手动填写地址"
                )
            if not automatic or diagnostics != self.last_connection_diagnostics:
                self.emit(
                    "device.auto_connect",
                    "模拟器自动连接检查完成",
                    {
                        "requested": len(devices),
                        "diagnostics": diagnostics,
                    },
                )
            self.last_connection_diagnostics = diagnostics
            return {"devices": devices, "discovered": discovered, "diagnostics": diagnostics}
        finally:
            self.auto_connect_lock.release()

    def automatic_connections(self) -> None:
        """Dedicated background loop: startup, newly enabled setting, then every 30s."""
        if self.mode != "native" or not self.running:
            return
        with self.lock:
            settings = Settings.model_validate(self.store.get("settings", "main"))
            if (
                not settings.autoConnect
                or time.monotonic() < self.next_auto_connect
                or self.switching_components
                or self.busy()
            ):
                return
            self.next_auto_connect = time.monotonic() + 30
            if not self.store.get("active", "combo", {}).get("core"):
                return
        try:
            self.auto_connect_devices(automatic=True)
        except RpcError as error:
            diagnostics = [error.message, str(error.data or "")]
            if diagnostics != self.last_connection_diagnostics and self.running:
                self.emit("device.auto_connect_failed", error.message, {"detail": error.data})
            self.last_connection_diagnostics = diagnostics

    def disconnect_device(self, ident: str, *, internal: bool = False) -> dict:
        if self.switching_components and not internal:
            raise RpcError(-32011, "正在切换核心与资源，暂不能断开设备")
        if (
            any(r["deviceId"] == ident and r["status"] == "running" for r in self.store.all("run"))
            and not self.switching_components
        ):
            raise RpcError(-32011, "请先停止该设备的执行")
        if worker := self.workers.pop(ident, None):
            worker.close()
        if device := self.store.get("device", ident):
            if not internal:
                self.auto_connect_suppressed.add(device_lock_address(device["address"]))
            device["state"] = "offline"
            self.store.put("device", ident, device)
        self.emit("device.disconnected", "设备控制权已释放", {"deviceId": ident})
        return {"disconnected": True}

    def before_component_switch(self) -> None:
        with self.lock:
            if not self.switching_components and self.busy():
                raise ValueError("核心或异步操作仍在运行")
            self.switching_components = True
            reconnect = {d["id"]: d for d in self.reconnect_after_update}
            reconnect.update(
                {ident: self.store.get("device", ident) for ident in list(self.workers)}
            )
            self.reconnect_after_update = list(reconnect.values())
            workers = list(self.workers.items())
            self.workers.clear()
            for ident, _ in workers:
                device = self.store.get("device", ident)
                device["state"] = "offline"
                self.store.put("device", ident, device)
                self.emit("device.disconnected", "正在安全切换核心工作进程", {"deviceId": ident})
        errors = []
        for _, worker in workers:
            try:
                worker.close()
            except Exception as error:
                errors.append(str(error))
        if errors:
            raise ValueError("旧核心工作进程退出失败: " + "; ".join(errors))

    def after_component_switch(self) -> None:
        for device in list(self.reconnect_after_update):
            self.connect_device(
                {"address": device["address"], "name": device["name"]}, internal=True
            )
            worker = self.workers[device["id"]]
            if not worker.wait_connected(timeout=30):
                raise ValueError("新版核心设备重连失败或超时: " + device["name"])

    def finish_component_switch(self, error: str | None = None) -> None:
        with self.lock:
            if not self.switching_components:
                return
            if error:
                for worker in list(self.workers.values()):
                    worker.close()
                self.workers.clear()
                for device in self.store.all("device"):
                    device["state"] = "offline"
                    self.store.put("device", device["id"], device)
                for run in self.store.all("run"):
                    if run["status"] == "running":
                        self.finish_native_run(
                            run, "failed", "核心切换及旧版重连失败；请人工核对设备: " + error
                        )
                self.emit(
                    "update.recovery_failed", "设备重连失败，已终止等待中的计划", {"error": error}
                )
            self.reconnect_after_update = []
            self.switching_components = False

    def submit_native_task(self, run: dict, index: int) -> None:
        plan = self.store.get("run_plan", run["id"])
        state = {
            "index": index,
            "completed": False,
            "failed": False,
            "queueEnded": False,
            "idleAfterEnd": False,
            "taskId": None,
            "stopRequested": None,
        }
        self.store.put("execution", run["id"], state)
        task = native_task(plan["tasks"][index])
        try:
            result = self.workers[run["deviceId"]].task(task)
            state["taskId"] = result["taskId"]
            self.store.put("execution", run["id"], state)
            run.update(
                message="正在执行 " + task["type"], progress=index * 100 // len(plan["tasks"])
            )
            self.store.put("run", run["id"], run)
            device = self.store.get("device", run["deviceId"])
            device["state"] = "running"
            self.store.put("device", device["id"], device)
            self.emit("run.progress", run["message"], {"run": run})
        except Exception as error:
            self.finish_native_run(run, "failed", "任务提交失败或结果未知: " + str(error))

    def finish_native_run(self, run: dict, status: str, message: str) -> None:
        run.update(status=status, message=message, finishedAt=now())
        if status == "completed":
            run["progress"] = 100
        self.store.put("run", run["id"], run)
        if device := self.store.get("device", run["deviceId"]):
            worker = self.workers.get(run["deviceId"])
            device["state"] = (
                "idle" if worker and worker.connected and worker.safe_idle else "offline"
            )
            self.store.put("device", device["id"], device)
        self.emit("run." + status, message, {"run": run})

    def poll_native_workers(self) -> None:
        for ident, worker in list(self.workers.items()):
            run = next(
                (
                    r
                    for r in self.store.all("run")
                    if r["deviceId"] == ident and r["status"] == "running"
                ),
                None,
            )
            while not worker.events.empty():
                event = worker.events.get_nowait()
                state = self.store.get("execution", run["id"], {}) if run else {}
                if event["type"] in {"exit", "protocol_error"}:
                    worker.connected = False
                    if run:
                        self.finish_native_run(
                            run, "failed", "核心工作进程异常，执行结果未知；不会自动重放"
                        )
                        run = None
                    device = self.store.get("device", ident)
                    device["state"] = "offline"
                    self.store.put("device", ident, device)
                    worker.close()
                    self.workers.pop(ident, None)
                    break
                if event["type"] == "callback":
                    message, details = event["message"], event["details"]
                    if message == 4 and details.get("what") == "Connect":
                        worker.connected = bool(details.get("details", {}).get("ret"))
                        device = self.store.get("device", ident)
                        device["state"] = "idle" if worker.connected else "offline"
                        self.store.put("device", ident, device)
                        self.emit(
                            "device.connected" if worker.connected else "device.failed",
                            "设备已连接" if worker.connected else "核心设备连接失败",
                            {"device": device},
                        )
                    if message == 2 and details.get("what") in {"Disconnect", "ResolutionChanged"}:
                        worker.connected = False
                        if run:
                            self.finish_native_run(run, "failed", "设备连接中断，请核对现场后重试")
                            run = None
                    if run:
                        task_matches = details.get("taskid") == state.get("taskId")
                        if message in {0, 1} or (message == 10000 and task_matches):
                            state["failed"] = True
                        if message == 10002 and task_matches:
                            state["completed"] = True
                        if message == 3 and ("taskid" not in details or task_matches):
                            state["queueEnded"] = True
                        if message == 10004 and task_matches:
                            state["failed"] = True
                        self.store.put("execution", run["id"], state)
                    if details.get("what") == "UnsupportedLevel":
                        self.next_checks["resource"] = min(
                            self.next_checks["resource"], time.monotonic() + 60
                        )
                elif event["type"] == "status" and run:
                    if not event["running"] and not event["pendingAsync"]:
                        if (
                            state.get("queueEnded")
                            or state.get("failed")
                            or state.get("stopRequested")
                        ):
                            state["idleAfterEnd"] = True
                            self.store.put("execution", run["id"], state)
            if not run:
                continue
            state = self.store.get("execution", run["id"], {})
            if state.get("boundaryWaiting") and not state.get("stopRequested"):
                waiting = any(c["status"] == "waiting_idle" for c in self.updates.channels())
                if (
                    worker.connected
                    and worker.safe_idle
                    and not waiting
                    and not self.switching_components
                ):
                    self.submit_native_task(run, state["nextIndex"])
            elif state.get("stopRequested") and time.monotonic() - state["stopRequested"] > 15:
                worker.close()
                self.workers.pop(ident, None)
                self.finish_native_run(
                    run, "stopped", "核心停止超时，已结束工作进程；请核对设备现场"
                )
            elif state.get("idleAfterEnd"):
                if state.get("stopRequested"):
                    self.finish_native_run(run, "stopped", "执行已停止，未执行计划保留")
                elif state.get("failed") or not state.get("completed"):
                    self.finish_native_run(
                        run, "failed", "核心任务失败或缺少成功证据；不会继续后续任务"
                    )
                else:
                    index = state["index"] + 1
                    plan = self.store.get("run_plan", run["id"])
                    if index < len(plan["tasks"]):
                        if any(c["status"] == "waiting_idle" for c in self.updates.channels()):
                            state.update(boundaryWaiting=True, nextIndex=index)
                            self.store.put("execution", run["id"], state)
                            run.update(
                                progress=index * 100 // len(plan["tasks"]),
                                message="当前任务完成，等待核心与资源热切换后继续剩余计划",
                            )
                            self.store.put("run", run["id"], run)
                            self.emit("run.progress", run["message"], {"run": run})
                        else:
                            self.submit_native_task(run, index)
                    else:
                        self.finish_native_run(run, "completed", "所有任务链均报告成功且核心已空闲")

    def tick(self, force: bool = False) -> None:
        with self.lock:
            if not force and time.monotonic() - self.last_tick < self.tick_seconds:
                return
            self.last_tick = time.monotonic()
            for run in self.store.all("run"):
                if run["status"] != "running":
                    continue
                if self.mode == "native":
                    continue
                run["progress"] = min(100, run["progress"] + 10)
                plan = self.store.get("run_plan", run["id"])
                task_index = min(
                    len(plan["tasks"]) - 1, run["progress"] * len(plan["tasks"]) // 100
                )
                run["message"] = "模拟执行：" + plan["tasks"][task_index]["type"]
                if run["progress"] == 100:
                    run.update(
                        status="completed", finishedAt=now(), message="模拟完成，未操作真实游戏"
                    )
                    self.release(run["id"])
                self.store.put("run", run["id"], run)
                self.emit("run.progress", run["message"], {"run": run})
            if self.mode == "native":
                self.poll_native_workers()
        if self.mode == "mock":
            self.updates.activate_pending()

    def automatic_updates(self) -> None:
        """Called by the stdio background loop, outside the UI request lock."""
        if self.mode != "native" or not self.running:
            return
        settings = Settings.model_validate(self.store.get("settings", "main"))
        for channel, interval in (("core", 24 * 3600), ("resource", 6 * 3600)):
            enabled = getattr(
                settings, "autoUpdateCore" if channel == "core" else "autoUpdateResource"
            )
            if not enabled or time.monotonic() < self.next_checks[channel]:
                continue
            self.next_checks[channel] = time.monotonic() + interval
            try:
                state = self.updates.check(channel)
                if not self.running:
                    return
                installed = self.updates.channel("core")["currentVersion"] != "未安装"
                if (installed or channel == "core") and state["status"] == "available":
                    self.updates.prepare(channel)
                    self.updates.activate(channel)
            except RpcError:
                # Failed automatic checks retry after five minutes. All errors are
                # visible in the update channel and event history.
                self.next_checks[channel] = time.monotonic() + 300

    def agent_message(self, message: str) -> dict:
        if not isinstance(message, str) or not message.strip() or len(message) > 4000:
            raise RpcError(-32602, "请输入 1 到 4000 字的目标")
        if self.mode != "mock":
            raise RpcError(-32030, "云模型尚未接入；请切换 mock 查看本地计划演示")
        if any(word in message for word in ("刷", "作战", "1-7", "材料")):
            stage = re.search(r"\b\d{1,2}-\d{1,2}\b", message)
            count = re.search(r"(\d{1,3})\s*(?:次|把|局)", message)
            target = stage.group() if stage else "1-7"
            tasks = [
                {
                    "type": "Fight",
                    "params": {
                        "stage": target,
                        "times": max(1, int(count.group(1))) if count else 6,
                    },
                }
            ]
            name = target + " 材料补给"
        else:
            name = "Agent 日常计划"
            tasks = [
                {"type": task, "params": {}}
                for task in ("StartUp", "Recruit", "Infrast", "Mall", "Award")
            ]
        plan = Plan.model_validate({"id": "", "name": name, "tasks": tasks})
        self.validate_policy(plan)
        self.emit("agent.plan_proposed", "本地演示已生成待确认计划，尚未执行")
        return {
            "reply": "这是本地规则生成的演示计划，未调用云端模型。请检查任务，保存后手动执行。"
            "消耗额度默认均为 0。",
            "plan": plan.model_dump(),
            "requiresConfirmation": True,
            "mode": "mock",
        }

    def close(self, close_store: bool = True) -> None:
        with self.lock:
            self.running = False
            for run in self.store.all("run"):
                if run["status"] == "running":
                    self.stop_run(run["id"])
            for ident in list(self.device_locks):
                self.release(ident)
            for worker in list(self.workers.values()):
                worker.close()
            self.workers.clear()
            if close_store:
                self.store.close()
