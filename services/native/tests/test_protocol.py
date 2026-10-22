"""CTest-only synthetic native protocol checks. Never load a real core or use ADB."""

import argparse
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import tempfile
import threading
import time
import unittest

from filelock import FileLock, Timeout


PARSER = argparse.ArgumentParser()
PARSER.add_argument("--worker", type=Path, required=True)
PARSER.add_argument("--core", type=Path, required=True)
PARSER.add_argument("--missing", type=Path, required=True)
PARSER.add_argument("--suite", required=True)
ARGS = PARSER.parse_args()


class Session:
    def __init__(self, config, mode="--worker", scenario=""):
        environment = {**os.environ, "MAAVERGE_SYNTHETIC_CASE": scenario}
        if "trace" in config:
            environment["MAAVERGE_SYNTHETIC_TRACE"] = config["trace"]
        self.child = subprocess.Popen(
            [str(ARGS.worker), mode], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, encoding="utf-8", env=environment,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        self.messages = queue.Queue()
        self.seen = []
        self.errors = []

        def reader():
            for line in self.child.stdout:
                try:
                    value = json.loads(line)
                    assert value["protocolVersion"] == 1, value
                    self.messages.put(value)
                except Exception as error:
                    self.errors.append(str(error) + ": " + line)
            self.messages.put(None)

        self.reader = threading.Thread(target=reader)
        self.reader.start()
        self.send(config)

    def send(self, value):
        self.child.stdin.write(json.dumps(value) + "\n")
        self.child.stdin.flush()

    def wait(self, predicate, timeout=5):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            value = self.messages.get(timeout=max(0.01, deadline - time.monotonic()))
            if value is None:
                raise AssertionError("unexpected EOF: " + self.child.stderr.read())
            self.seen.append(value)
            if predicate(value):
                return value
        raise AssertionError("missing protocol message")

    def response(self, ident):
        return self.wait(lambda value: value.get("type") == "response" and value.get("id") == ident)

    def close(self):
        if self.child.stdin and not self.child.stdin.closed:
            self.child.stdin.close()
        try:
            code = self.child.wait(timeout=6)
        except subprocess.TimeoutExpired:
            self.child.kill()
            self.child.wait()
            raise AssertionError("synthetic worker failed to exit")
        self.reader.join(timeout=2)
        errors = self.child.stderr.read()
        self.child.stdout.close()
        self.child.stderr.close()
        assert not self.errors, self.errors
        return code, errors


class Base(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="maaverge-native-synthetic-")
        self.root = Path(self.temporary.name) / "中文 runtime"
        self.root.mkdir()
        self.core = self.root / "core"
        self.core.mkdir()
        shutil.copyfile(ARGS.core, self.core / ARGS.core.name)
        self.resource = self.root / "resources"
        (self.resource / "resource").mkdir(parents=True)
        (self.resource / "resource/version.json").write_text("{}")
        self.config = {
            "protocolVersion": 1, "core": str(self.core), "resource": str(self.resource),
            "userDir": str(self.root / "user"), "adb": "synthetic-never-executed",
            "address": "synthetic://no-device", "lockPath": str(self.root / "device.lock"),
            "trace": str(self.root / "trace.txt"), "version": "vsynthetic",
        }
        self.sessions = []

    def session(self, config=None, **kwargs):
        session = Session(config or self.config, **kwargs)
        self.sessions.append(session)
        return session

    def tearDown(self):
        for session in self.sessions:
            if session.child.poll() is None:
                session.close()
        self.temporary.cleanup()

    def validate(self, config=None, scenario=""):
        environment = {**os.environ, "MAAVERGE_SYNTHETIC_CASE": scenario}
        result = subprocess.run(
            [str(ARGS.worker), "--validate"], input=json.dumps(config or self.config),
            text=True, encoding="utf-8", capture_output=True, timeout=6, env=environment,
        )
        messages = [json.loads(line) for line in result.stdout.splitlines()]
        for value in messages:
            self.assertEqual(value["protocolVersion"], 1)
        return result, messages


class Validation(Base):
    def test_success_uses_isolated_directory_and_clean_stdout(self):
        result, messages = self.validate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(messages, [{"version": "vsynthetic", "resourceLoaded": True, "protocolVersion": 1}])
        self.assertIn("synthetic native stdout", result.stderr)
        self.assertFalse((self.root / "user").exists())

    def test_version_mismatch(self):
        result, messages = self.validate({**self.config, "version": "vwrong"})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(messages, [])
        self.assertIn("version mismatch", result.stderr)

    def test_missing_symbol(self):
        shutil.copyfile(ARGS.missing, self.core / ARGS.core.name)
        result, _ = self.validate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("AsstRunning", result.stderr)

    def test_missing_library(self):
        (self.core / ARGS.core.name).unlink()
        result, messages = self.validate()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(messages, [])
        self.assertIn("missing MaaCore library", result.stderr)

    def test_missing_resource(self):
        (self.resource / "resource/version.json").unlink()
        result, _ = self.validate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("resource/version.json", result.stderr)

    def test_failed_resource_contains_bounded_last_errors(self):
        result, _ = self.validate(scenario="resource-failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("synthetic missing resource 99", result.stderr)
        self.assertNotIn("synthetic missing resource 1\n", result.stderr)
        self.assertLess(len(result.stderr), 2000)


class Worker(Base):
    def connected(self, scenario="", config=None):
        session = self.session(config, scenario=scenario)
        session.wait(lambda value: value.get("type") == "ready")
        session.send({"id": "connect", "operation": "connect"})
        self.assertEqual(session.response("connect")["result"], {"asyncId": 7})
        callback = session.wait(lambda value: value.get("message") == 4)
        self.assertTrue(callback["details"]["details"]["ret"])
        session.wait(lambda value: value.get("type") == "status" and not value["pendingAsync"])
        return session

    def capture_config(self, method="mumu", **extras):
        emulator = self.root / "模拟器"
        emulator.mkdir(exist_ok=True)
        return {**self.config, "capture": {
            "method": method, "emulatorPath": str(emulator), "instanceIndex": 3, **extras,
        }}

    def test_enhanced_extras_precede_connection_and_new_screencap(self):
        for method, name, expected, extras in [
            ("mumu", "MuMuEmulator12", "MumuExtras", {}),
            ("ldplayer", "LDPlayer", "LDExtras", {"pid": 4242}),
        ]:
            with self.subTest(method=method):
                config = self.capture_config(method, **extras)
                session = self.connected(config=config)
                evidence = next(
                    value for value in session.seen
                    if value.get("details", {}).get("what") == "FastestWayToScreencap"
                )
                self.assertEqual(evidence["details"]["details"]["method"], expected)
                session.send({"id": "frame", "operation": "screencap"})
                self.assertEqual(session.response("frame")["result"], {"asyncId": 17})
                frame = session.wait(
                    lambda value: value.get("details", {}).get("what") == "Screencap"
                )
                self.assertTrue(frame["details"]["details"]["ret"])
                session.wait(
                    lambda value: value.get("type") == "status" and not value["pendingAsync"]
                )
                session.send({
                    "id": "task", "operation": "task", "task": {"type": "Fight", "params": {}}
                })
                self.assertEqual(session.response("task")["result"], {"taskId": 11})
                session.wait(lambda value: value.get("message") == 10002)
                self.assertEqual(session.close()[0], 0)
                trace = Path(config["trace"]).read_text(encoding="utf-8").splitlines()
                extra_line = next(line for line in trace if line.startswith("extras:" + name + ":"))
                applied = json.loads(extra_line.split(":", 2)[2])
                self.assertTrue(Path(applied["path"]).samefile(config["capture"]["emulatorPath"]))
                self.assertEqual(applied["index"], 3)
                if method == "mumu":
                    self.assertIs(applied["touch"], False)
                else:
                    self.assertEqual(applied["pid"], 4242)
                self.assertLess(trace.index(extra_line), trace.index("connect:" + name))
                self.assertIn("screencap", trace)

    def test_enhanced_task_requires_verified_connection(self):
        session = self.session(self.capture_config())
        session.wait(lambda value: value.get("type") == "ready")
        session.send({"id": "task", "operation": "task", "task": {"type": "Fight", "params": {}}})
        self.assertIn("protocol has not been verified", session.response("task")["error"])
        session.send({"id": "frame", "operation": "screencap"})
        self.assertIn("must be connected", session.response("frame")["error"])
        self.assertEqual(session.close()[0], 0)
        self.assertNotIn("append-task", Path(self.config["trace"]).read_text())

    def test_enhanced_fallback_missing_evidence_and_connect_failure_block_tasks(self):
        for scenario in ["capture-fallback", "capture-no-evidence", "capture-connect-failure"]:
            with self.subTest(scenario=scenario):
                session = self.session(self.capture_config(), scenario=scenario)
                session.wait(lambda value: value.get("type") == "ready")
                session.send({"id": "connect", "operation": "connect"})
                session.response("connect")
                result = session.wait(
                    lambda value: value.get("message") == 4
                    and value.get("details", {}).get("what") == "Connect"
                )
                details = result["details"]["details"]
                self.assertIs(details["ret"], False)
                self.assertEqual(details["expectedMethod"], "MumuExtras")
                self.assertTrue(details["error"])
                session.wait(
                    lambda value: value.get("type") == "status" and not value["pendingAsync"]
                )
                session.send({
                    "id": "task", "operation": "task", "task": {"type": "Fight", "params": {}}
                })
                self.assertIn("protocol has not been verified", session.response("task")["error"])
                self.assertEqual(session.close()[0], 0)
                self.assertNotIn(
                    "append-task", Path(self.config["trace"]).read_text(encoding="utf-8")
                )

    def test_enhanced_reprobe_fallback_and_screencap_failure_stop_and_disconnect(self):
        for scenario in ["capture-late-fallback", "screencap-failure"]:
            with self.subTest(scenario=scenario):
                session = self.connected(scenario, config=self.capture_config())
                session.send({"id": "frame", "operation": "screencap"})
                session.response("frame")
                failure = session.wait(
                    lambda value: value.get("message") == 2
                    and value.get("details", {}).get("what") == "Disconnect"
                )
                self.assertEqual(failure["details"]["why"], "RequiredCaptureProtocolUnavailable")
                self.assertTrue(failure["details"]["details"]["error"])
                frame = session.wait(
                    lambda value: value.get("details", {}).get("what") == "Screencap"
                )
                self.assertIs(frame["details"]["details"]["ret"], False)
                self.assertTrue(frame["details"]["details"]["error"])
                session.wait(
                    lambda value: value.get("type") == "status" and not value["pendingAsync"]
                )
                session.send({
                    "id": "task", "operation": "task", "task": {"type": "Fight", "params": {}}
                })
                self.assertIn("protocol has not been verified", session.response("task")["error"])
                self.assertEqual(session.close()[0], 0)
                trace = Path(self.config["trace"]).read_text(encoding="utf-8")
                self.assertIn("stop-cleared-queue", trace)
                self.assertNotIn("append-task", trace)

    def test_invalid_capture_configuration_is_rejected(self):
        configs = [
            self.capture_config(instanceIndex=-1), self.capture_config(instanceIndex=True),
            self.capture_config(instanceIndex=1.5), self.capture_config(pid=22),
            self.capture_config("ldplayer", pid=0), self.capture_config("ldplayer", pid=2147483648),
            self.capture_config("unsupported"),
            self.capture_config(emulatorPath=str(self.root / "missing")),
        ]
        for config in configs:
            with self.subTest(capture=config["capture"]):
                session = self.session(config)
                code, errors = session.close()
                self.assertNotEqual(code, 0)
                self.assertTrue(errors)

    def test_connect_task_callbacks_and_eof_destroy(self):
        session = self.connected()
        session.send({"id": "task", "operation": "task", "task": {"type": "Fight", "params": {}}})
        self.assertEqual(session.response("task")["result"], {"taskId": 11})
        event = session.wait(lambda value: value.get("message") == 10002)
        self.assertEqual(event["details"]["taskchain"], "Fight")
        session.wait(lambda value: value.get("type") == "status" and not value["running"])
        code, errors = session.close()
        self.assertEqual(code, 0, errors)
        trace = Path(self.config["trace"]).read_text()
        self.assertIn("destroy-done", trace)
        self.assertIn("synthetic native stdout: destroyed", errors)

    def test_pending_connection_blocks_task(self):
        session = self.session(scenario="async-hang")
        session.wait(lambda value: value.get("type") == "ready")
        session.send({"id": "connect", "operation": "connect"})
        session.response("connect")
        session.send({"id": "task", "operation": "task", "task": {"type": "Fight", "params": {}}})
        self.assertIn("not idle", session.response("task")["error"])

    def test_stop_clears_queue(self):
        session = self.connected()
        session.send({"id": "task", "operation": "task", "task": {"type": "Fight", "params": {}}})
        session.response("task")
        session.send({"id": "stop", "operation": "stop"})
        self.assertEqual(session.response("stop")["result"], {"stopping": True})
        session.wait(lambda value: value.get("type") == "status" and not value["running"])
        self.assertFalse(any(value.get("message") == 10002 for value in session.seen))

    def test_malformed_callback_is_copied_as_error(self):
        session = self.connected("malformed-callback")
        session.send({"id": "task", "operation": "task", "task": {"type": "Fight", "params": {}}})
        session.response("task")
        event = session.wait(lambda value: value.get("message") == 9001)
        self.assertEqual(event["details"], {"decodeError": True})

    def test_rejected_native_task(self):
        session = self.connected("task-reject")
        session.send({"id": "task", "operation": "task", "task": {"type": "Fight", "params": {}}})
        self.assertIn("rejected appended task", session.response("task")["error"])

    def test_rejected_start_clears_native_queue(self):
        session = self.connected("start-reject")
        session.send({"id": "task", "operation": "task", "task": {"type": "Fight", "params": {}}})
        self.assertIn("rejected task start", session.response("task")["error"])
        self.assertIn("stop-cleared-queue", Path(self.config["trace"]).read_text())

    def test_native_call_and_async_deadlines_exit_unknown(self):
        for scenario, key in [("call-hang", "nativeCallTimeoutMs"), ("async-hang", "asyncTimeoutMs")]:
            session = self.session({**self.config, key: 80}, scenario=scenario)
            session.wait(lambda value: value.get("type") == "ready")
            session.send({"id": "connect", "operation": "connect"})
            self.assertEqual(session.child.wait(timeout=3), 124)
            code, errors = session.close()
            self.assertEqual(code, 124)
            self.assertIn("result unknown", errors)

    def test_destroy_timeout_is_bounded(self):
        session = self.session({**self.config, "shutdownTimeoutMs": 80}, scenario="destroy-hang")
        session.wait(lambda value: value.get("type") == "ready")
        self.assertEqual(session.close()[0], 124)


class Lease(Base):
    def test_cpp_excludes_python_and_releases_on_eof(self):
        session = self.session(mode="--lease-only")
        session.wait(lambda value: value.get("type") == "ready")
        lock = FileLock(self.config["lockPath"])
        with self.assertRaises(Timeout):
            lock.acquire(timeout=0)
        self.assertEqual(session.close()[0], 0)
        with lock.acquire(timeout=0):
            pass
        self.assertFalse((self.root / "user").exists())

    def test_python_excludes_cpp(self):
        with FileLock(self.config["lockPath"]).acquire(timeout=0):
            session = self.session({**self.config, "lockTimeoutMs": 50}, mode="--lease-only")
            code, errors = session.close()
            self.assertNotEqual(code, 0)
            self.assertIn("device lock busy", errors)

    def test_worker_keeps_lock_through_destroy(self):
        session = self.session(scenario="destroy-delay")
        session.wait(lambda value: value.get("type") == "ready")
        session.child.stdin.close()
        deadline = time.monotonic() + 3
        trace = Path(self.config["trace"])
        while time.monotonic() < deadline and (not trace.exists() or "destroy-start" not in trace.read_text()):
            time.sleep(0.01)
        lock = FileLock(self.config["lockPath"])
        with self.assertRaises(Timeout):
            lock.acquire(timeout=0)
        self.assertEqual(session.close()[0], 0)
        with lock.acquire(timeout=0):
            pass

    def test_cpp_competitor_and_crash_release(self):
        session = self.session(mode="--lease-only")
        session.wait(lambda value: value.get("type") == "ready")
        rival = self.session({**self.config, "lockTimeoutMs": 20}, mode="--lease-only")
        self.assertNotEqual(rival.close()[0], 0)
        session.child.kill()
        session.close()
        replacement = self.session(mode="--lease-only")
        replacement.wait(lambda value: value.get("type") == "ready")


class Protocol(Base):
    def test_old_configuration_and_commands_remain_compatible(self):
        config = {key: value for key, value in self.config.items() if key != "protocolVersion"}
        session = self.session(config)
        session.wait(lambda value: value.get("type") == "ready")
        session.send({"id": 42, "operation": "stop"})
        self.assertIn("result", session.response(42))

    def test_unsupported_configuration_version_is_rejected(self):
        session = self.session({**self.config, "protocolVersion": 2}, mode="--lease-only")
        self.assertNotEqual(session.close()[0], 0)

    def test_invalid_command_does_not_kill_worker(self):
        session = self.session()
        session.wait(lambda value: value.get("type") == "ready")
        session.send({"id": "bad", "operation": "shell", "command": "must-never-run"})
        self.assertIn("unknown", session.response("bad")["error"])
        session.send({"id": "version", "protocolVersion": 2, "operation": "stop"})
        self.assertIn("protocolVersion", session.response("version")["error"])
        session.send({"id": "ok", "operation": "stop"})
        self.assertIn("result", session.response("ok"))

    def test_malformed_json_is_rejected_then_worker_continues(self):
        session = self.session()
        session.wait(lambda value: value.get("type") == "ready")
        session.child.stdin.write("{invalid-json\n")
        session.child.stdin.flush()
        self.assertIn("error", session.response(None))
        session.send({"id": "ok", "operation": "stop"})
        self.assertIn("result", session.response("ok"))

    def test_oversized_configuration_fails_before_loading(self):
        result = subprocess.run(
            [str(ARGS.worker), "--worker"], input="x" * (4 * 1024 * 1024 + 1) + "\n",
            text=True, encoding="utf-8", capture_output=True, timeout=6,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("exceeds 4 MiB", result.stderr)


SUITES = {"validation": Validation, "worker": Worker, "lease": Lease, "protocol": Protocol}
RESULT = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(SUITES[ARGS.suite]))
raise SystemExit(not RESULT.wasSuccessful())
