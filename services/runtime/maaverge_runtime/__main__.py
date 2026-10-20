"""Newline-delimited JSON-RPC 2.0 over stdio; stdout contains protocol only."""

import argparse
import json
import logging
import os
import sys
import threading
from io import TextIOWrapper
from pathlib import Path
from typing import cast

from .config import data_root
from .models import RpcError
from .runtime import Runtime


def process_request(runtime: Runtime, request) -> dict | None:
    ident = request.get("id") if isinstance(request, dict) else None
    try:
        if (
            not isinstance(request, dict)
            or request.get("jsonrpc") != "2.0"
            or not isinstance(request.get("method"), str)
            or (
                "id" in request
                and (isinstance(ident, bool) or not isinstance(ident, (str, int, type(None))))
            )
        ):
            raise RpcError(-32600, "无效的 JSON-RPC 请求")
        result = runtime.handle(request["method"], request.get("params"))
        return {"jsonrpc": "2.0", "id": ident, "result": result} if "id" in request else None
    except RpcError as error:
        if isinstance(request, dict) and "id" not in request and error.code != -32600:
            return None
        return {"jsonrpc": "2.0", "id": ident, "error": error.as_dict()}
    except Exception:
        logging.exception("Unhandled runtime request")
        return {
            "jsonrpc": "2.0",
            "id": ident,
            "error": {"code": -32603, "message": "本地运行时内部错误"},
        }


def main() -> None:
    if "--core-worker" in sys.argv:
        from .core_worker import main as worker_main

        worker_main()
        return
    if "--native-helper" in sys.argv:
        from .native_helper import main as helper_main

        helper_main()
        return
    parser = argparse.ArgumentParser(description="MAAVerge local runtime")
    parser.add_argument(
        "--mode", choices=("mock", "native"), default=os.environ.get("MAAVERGE_MODE", "mock")
    )
    parser.add_argument("--data-dir", type=Path)
    options = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        cast(TextIOWrapper, sys.stdout).reconfigure(encoding="utf-8", errors="strict")
        cast(TextIOWrapper, sys.stdin).reconfigure(encoding="utf-8", errors="strict")
    logging.basicConfig(stream=sys.stderr, level=logging.INFO)
    output_lock = threading.Lock()

    def send(value):
        with output_lock:
            print(json.dumps(value, ensure_ascii=False), flush=True)

    runtime = Runtime((options.data_dir or data_root()) / options.mode, options.mode, notify=send)
    stop = threading.Event()
    request_workers: list[threading.Thread] = []
    update_slots = threading.BoundedSemaphore(2)

    def update_request(request):
        try:
            if response := process_request(runtime, request):
                send(response)
        finally:
            update_slots.release()

    def ticker():
        while not stop.wait(0.1):
            try:
                runtime.tick()
            except Exception:
                logging.exception("Runtime background tick failed")

    thread = threading.Thread(target=ticker, name="mock-scheduler", daemon=True)
    thread.start()

    def update_loop():
        while not stop.wait(1):
            try:
                runtime.automatic_updates()
                runtime.updates.activate_pending()
            except Exception:
                logging.exception("Background update operation failed")

    update_thread = threading.Thread(target=update_loop, name="component-updater", daemon=True)
    update_thread.start()
    try:
        for line in sys.stdin:
            if len(line) > 1024 * 1024:
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": None,
                        "error": {"code": -32600, "message": "请求超过大小限制"},
                    }
                )
                continue
            try:
                request = json.loads(line)
            except (json.JSONDecodeError, UnicodeError):
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": None,
                        "error": {"code": -32700, "message": "JSON 解析失败"},
                    }
                )
                continue
            # Native update requests can take minutes. Keep reading stdio so the
            # UI can obtain snapshots and receive independent operation results.
            if (
                options.mode == "native"
                and isinstance(request, dict)
                and isinstance(request.get("method"), str)
                and request["method"].startswith("updates.")
            ):
                if not update_slots.acquire(blocking=False):
                    if "id" in request:
                        send(
                            {
                                "jsonrpc": "2.0",
                                "id": request["id"],
                                "error": {"code": -32021, "message": "已有更新请求在处理中"},
                            }
                        )
                    continue
                worker = threading.Thread(target=update_request, args=(request,), daemon=True)
                request_workers = [w for w in request_workers if w.is_alive()]
                request_workers.append(worker)
                worker.start()
            elif response := process_request(runtime, request):
                send(response)
    finally:
        stop.set()
        runtime.running = False
        if hasattr(runtime.updates.source, "client"):
            runtime.updates.source.client.close()
        thread.join(timeout=2)
        update_thread.join(timeout=2)
        for worker in request_workers:
            worker.join(timeout=0.5)
        # A daemon network operation may still be unwinding. The OS will close
        # SQLite after process exit; do not close its handle underneath that worker.
        runtime.close(
            close_store=not thread.is_alive()
            and not update_thread.is_alive()
            and not any(w.is_alive() for w in request_workers)
        )


if __name__ == "__main__":
    main()
