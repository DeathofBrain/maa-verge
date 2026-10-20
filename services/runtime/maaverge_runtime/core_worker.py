"""One MaaCore DLL and resource generation per subprocess and per device."""

import ctypes
import json
import os
import queue
import sys
import threading
from pathlib import Path

from filelock import FileLock

from .native_helper import core_library
from .paths import fs_path


class NativeCore:
    def __init__(self, config: dict, send):
        self.send, self.config = send, config
        self.lock = threading.RLock()
        self.events: queue.Queue = queue.Queue()
        self.pending: set[int] = set()
        self.stop_event = threading.Event()
        core, resource = fs_path(Path(config["core"])), fs_path(Path(config["resource"]))
        if sys.platform == "win32":
            self.dll_directory = os.add_dll_directory(str(core))
        else:
            self.dll_directory = None
        self.library = ctypes.CDLL(str(core_library(core)))
        self.callback_type = ctypes.CFUNCTYPE(None, ctypes.c_int, ctypes.c_char_p, ctypes.c_void_p)
        # Strong reference must live until AsstDestroy returns.
        self.callback = self.callback_type(self.on_callback)
        specs = {
            "AsstSetUserDir": ([ctypes.c_char_p], ctypes.c_bool),
            "AsstLoadResource": ([ctypes.c_char_p], ctypes.c_bool),
            "AsstCreateEx": ([self.callback_type, ctypes.c_void_p], ctypes.c_void_p),
            "AsstDestroy": ([ctypes.c_void_p], None),
            "AsstAsyncConnect": (
                [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_bool],
                ctypes.c_int,
            ),
            "AsstAppendTask": ([ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p], ctypes.c_int),
            "AsstStart": ([ctypes.c_void_p], ctypes.c_bool),
            "AsstStop": ([ctypes.c_void_p], ctypes.c_bool),
            "AsstRunning": ([ctypes.c_void_p], ctypes.c_bool),
        }
        for name, (arguments, result) in specs.items():
            function = getattr(self.library, name)
            function.argtypes, function.restype = arguments, result
        user = Path(config["userDir"])
        user.mkdir(parents=True, exist_ok=True)
        if not self.library.AsstSetUserDir(str(user).encode("utf-8")):
            raise ValueError("无法设置核心工作目录")
        if not self.library.AsstLoadResource(str(resource).encode("utf-8")):
            raise ValueError("无法加载指定资源快照")
        self.handle = self.library.AsstCreateEx(self.callback, None)
        if not self.handle:
            raise ValueError("无法创建 MaaCore 实例")
        self.pump = threading.Thread(target=self.event_pump, daemon=True)
        self.pump.start()

    def on_callback(self, message, details, _):
        try:
            # ctypes c_char_p is copied here before native callback memory expires.
            payload = json.loads(bytes(details).decode("utf-8")) if details else {}
        except (ValueError, UnicodeError):
            payload = {"decodeError": True}
        self.events.put({"type": "callback", "message": message, "details": payload})

    def event_pump(self):
        while not self.stop_event.wait(0.1):
            with self.lock:
                while not self.events.empty():
                    event = self.events.get_nowait()
                    if event["message"] == 4:
                        self.pending.discard(event["details"].get("async_call_id"))
                    self.send(event)
                self.send(
                    {
                        "type": "status",
                        "running": bool(self.library.AsstRunning(self.handle)),
                        "pendingAsync": sorted(self.pending),
                    }
                )

    def command(self, command: dict) -> dict:
        with self.lock:
            action = command["operation"]
            if action == "connect":
                ident = self.library.AsstAsyncConnect(
                    self.handle,
                    self.config["adb"].encode("utf-8"),
                    self.config["address"].encode("utf-8"),
                    b"General",
                    False,
                )
                if ident <= 0:
                    raise ValueError("核心拒绝异步设备连接")
                self.pending.add(ident)
                return {"asyncId": ident}
            if action == "task":
                if self.pending or self.library.AsstRunning(self.handle):
                    raise ValueError("核心或异步调用尚未空闲")
                task = command["task"]
                ident = self.library.AsstAppendTask(
                    self.handle, task["type"].encode(), json.dumps(task["params"]).encode()
                )
                if ident <= 0:
                    raise ValueError("核心拒绝追加任务")
                if not self.library.AsstStart(self.handle):
                    self.library.AsstStop(self.handle)
                    raise ValueError("核心拒绝启动任务")
                return {"taskId": ident}
            if action == "stop":
                if not self.library.AsstStop(self.handle):
                    raise ValueError("核心拒绝停止任务")
                return {"stopping": True}
            raise ValueError("未知核心工作进程操作")

    def close(self):
        self.stop_event.set()
        self.pump.join(timeout=1)
        with self.lock:
            self.library.AsstStop(self.handle)
            self.library.AsstDestroy(self.handle)
        if self.dll_directory:
            self.dll_directory.close()


def main():
    output_lock = threading.Lock()
    # Native logging must not share our protocol stream. Preserve a duplicate
    # protocol descriptor, then redirect DLL stdout to stderr at the OS level.
    protocol = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8", buffering=1)
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())

    def send(value):
        with output_lock:
            print(json.dumps(value, ensure_ascii=True), file=protocol, flush=True)

    config = json.loads(sys.stdin.readline())
    lease = FileLock(config["lockPath"], thread_local=False)
    lease.acquire(timeout=10)
    core = None
    try:
        core = NativeCore(config, send)
        send({"type": "ready"})
        for line in sys.stdin:
            command = json.loads(line)
            try:
                result = core.command(command)
                send({"type": "response", "id": command["id"], "result": result})
            except Exception as error:
                send({"type": "response", "id": command.get("id"), "error": str(error)})
    finally:
        if core:
            core.close()
        lease.release()
        protocol.close()


if __name__ == "__main__":
    main()
