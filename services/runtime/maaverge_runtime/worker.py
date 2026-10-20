"""Parent-side supervised native worker. Events are consumed by Runtime.tick."""

import json
import os
import queue
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any


def worker_command() -> list[str]:
    return (
        [sys.executable, "--core-worker"]
        if getattr(sys, "frozen", False)
        else [sys.executable, "-m", "maaverge_runtime.core_worker"]
    )


class CoreWorker:
    def __init__(self, config: dict, lease, command: list[str] | None = None):
        config = {**config, "lockPath": str(lease.lock_file)}
        self.lease, self.config = lease, config
        self.events: queue.Queue = queue.Queue()
        self.ready = threading.Event()
        self.connection_result = threading.Event()
        self.idle = threading.Event()
        self.idle.set()
        self.requests: dict[str, dict] = {}
        self.lock = threading.RLock()
        self.running, self.pending, self.connected, self.closed = False, 0, False, False
        user = Path(config["userDir"])
        user.mkdir(parents=True, exist_ok=True)
        self.log = (user / "worker.stderr.log").open("a", encoding="utf-8")
        environment = dict(os.environ)
        variable = "DYLD_LIBRARY_PATH" if sys.platform == "darwin" else "LD_LIBRARY_PATH"
        environment[variable] = config["core"] + os.pathsep + environment.get(variable, "")
        self.process = subprocess.Popen(
            command or worker_command(),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=self.log,
            text=True,
            encoding="utf-8",
            bufsize=1,
            env=environment,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        self.reader = threading.Thread(target=self.read, daemon=True)
        self.reader.start()
        self.write(config)
        # Transfer ownership to the child before it loads/connects the device.
        # Its OS lease survives a parent crash until native teardown completes.
        lease.release()
        if not self.ready.wait(45) or self.process.poll() is not None:
            self.close()
            raise ValueError("核心工作进程启动失败，请查看本地工作进程日志")

    @property
    def safe_idle(self) -> bool:
        return not self.running and not self.pending and self.process.poll() is None

    def write(self, value: dict):
        with self.lock:
            if self.process.stdin is None:
                raise ValueError("核心工作进程输入已关闭")
            self.process.stdin.write(json.dumps(value) + "\n")
            self.process.stdin.flush()

    def request(self, operation: str, **params) -> dict:
        ident = uuid.uuid4().hex
        item: dict[str, Any] = {"event": threading.Event(), "response": None}
        with self.lock:
            self.requests[ident] = item
        self.write({"id": ident, "operation": operation, **params})
        try:
            if not item["event"].wait(20):
                raise ValueError("核心工作进程未确认操作，结果未知")
            response = item["response"]
            if response.get("error"):
                raise ValueError(response["error"])
            return response["result"]
        finally:
            with self.lock:
                self.requests.pop(ident, None)

    def connect(self):
        self.connected = False
        self.connection_result.clear()
        self.idle.clear()
        self.pending = 1
        return self.request("connect")

    def wait_connected(self, timeout: float = 30) -> bool:
        deadline = time.monotonic() + timeout
        if not self.connection_result.wait(timeout) or not self.connected:
            return False
        return (
            self.idle.wait(max(0, deadline - time.monotonic()))
            and self.connected
            and self.safe_idle
        )

    def task(self, task: dict):
        self.running = True
        return self.request("task", task=task)

    def stop(self):
        return self.request("stop")

    def read(self):
        try:
            assert self.process.stdout is not None
            for line in self.process.stdout:
                try:
                    event = json.loads(line)
                except ValueError:
                    self.events.put({"type": "protocol_error"})
                    continue
                if event.get("type") == "ready":
                    self.ready.set()
                elif event.get("type") == "response":
                    with self.lock:
                        if item := self.requests.get(event.get("id")):
                            item["response"] = event
                            item["event"].set()
                else:
                    if event.get("type") == "status":
                        self.running = bool(event["running"])
                        self.pending = len(event["pendingAsync"])
                        if self.running or self.pending:
                            self.idle.clear()
                        else:
                            self.idle.set()
                    elif (
                        event.get("type") == "callback"
                        and event.get("message") == 4
                        and event.get("details", {}).get("what") == "Connect"
                    ):
                        self.connected = bool(event["details"].get("details", {}).get("ret"))
                        self.connection_result.set()
                    self.events.put(event)
        finally:
            self.connected = False
            self.connection_result.set()
            self.idle.set()
            self.events.put({"type": "exit"})
            self.ready.set()
            with self.lock:
                for item in self.requests.values():
                    item["response"] = {"error": "核心工作进程已退出，操作结果未知"}
                    item["event"].set()

    def close(self):
        if self.closed:
            return
        self.closed = True
        if self.process.stdin:
            self.process.stdin.close()
        try:
            self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=2)
        self.reader.join(timeout=1)
        self.log.close()
        self.lease.release()
