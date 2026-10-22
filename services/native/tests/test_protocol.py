"""CTest-only synthetic native protocol checks. Never load a real core or use ADB."""

import argparse
import base64
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
PARSER.add_argument("--legacy", type=Path)
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
                    assert len(line.encode("utf-8")) <= 4 * 1024 * 1024, "oversized NDJSON output"
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
        selected = config or self.config
        environment = {**os.environ, "MAAVERGE_SYNTHETIC_CASE": scenario}
        if "trace" in selected:
            environment["MAAVERGE_SYNTHETIC_TRACE"] = selected["trace"]
        result = subprocess.run(
            [str(ARGS.worker), "--validate"], input=json.dumps(selected),
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

    def test_validation_only_loads_base_even_with_a_client_connection(self):
        config = {**self.config, "connection": {
            "config": "General", "touchMode": "minitouch", "adbLite": False,
            "clientType": "YoStarEN",
        }}
        result, _ = self.validate(config)
        self.assertEqual(result.returncode, 0, result.stderr)
        trace = Path(config["trace"]).read_text(encoding="utf-8").splitlines()
        loads = [
            Path(line.removeprefix("resource:")) for line in trace if line.startswith("resource:")
        ]
        self.assertEqual(len(loads), 1)
        self.assertTrue(loads[0].samefile(self.resource))
        self.assertNotIn("create-instance", trace)

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

    def preview(self, session, ident="preview"):
        session.send({"id": ident, "operation": "frame"})
        response = session.response(ident)
        self.assertIn("result", response, response)
        return response["result"]

    def test_client_resources_load_base_then_only_the_selected_overlay_before_creation(self):
        for client in [None, "Official", "Bilibili", "YoStarEN", "YoStarJP", "YoStarKR", "txwy"]:
            with self.subTest(client=client):
                config = {**self.config}
                expected = [self.resource]
                if client is not None:
                    config["connection"] = {
                        "config": "General", "touchMode": "minitouch", "adbLite": False,
                        "clientType": client,
                    }
                if client not in [None, "Official", "Bilibili"]:
                    overlay = self.resource / "resource/global" / client
                    (overlay / "resource").mkdir(parents=True)
                    # Sparse overlays inherit everything else from the base.
                    (overlay / "resource/version.json").write_text("{}")
                    expected.append(overlay)
                Path(config["trace"]).unlink(missing_ok=True)
                session = self.connected(config=config)
                self.assertEqual(session.close()[0], 0)
                trace = Path(config["trace"]).read_text(encoding="utf-8").splitlines()
                loads = [line for line in trace if line.startswith("resource:")]
                self.assertEqual(len(loads), len(expected))
                for line, resource in zip(loads, expected, strict=True):
                    self.assertTrue(Path(line.removeprefix("resource:")).samefile(resource))
                    self.assertLess(trace.index(line), trace.index("create-instance"))
                self.assertLess(trace.index("create-instance"), trace.index("connect:General"))
                if client is not None:
                    self.assertLess(trace.index(loads[-1]), trace.index("option:6:" + client))

    def test_missing_or_rejected_client_overlay_fails_before_ready_or_instance_creation(self):
        for client in ["YoStarEN", "YoStarJP", "YoStarKR", "txwy"]:
            for failure in ["missing-directory", "missing-version", "overlay-failure"]:
                with self.subTest(client=client, failure=failure):
                    config = {**self.config, "connection": {
                        "config": "General", "touchMode": "minitouch", "adbLite": False,
                        "clientType": client,
                    }}
                    overlay = self.resource / "resource/global" / client
                    if overlay.exists():
                        shutil.rmtree(overlay)
                    if failure != "missing-directory":
                        (overlay / "resource").mkdir(parents=True)
                    if failure == "overlay-failure":
                        (overlay / "resource/version.json").write_text("{}")
                    Path(config["trace"]).unlink(missing_ok=True)
                    session = self.session(config, scenario=failure)
                    code, errors = session.close()
                    self.assertNotEqual(code, 0)
                    self.assertIn(client, errors)
                    expected_error = {
                        "missing-directory": "client resource directory missing",
                        "missing-version": "missing resource/version.json",
                        "overlay-failure": "cannot load client resource snapshot",
                    }[failure]
                    self.assertIn(expected_error, errors)
                    self.assertIsNone(session.messages.get_nowait())
                    self.assertTrue(session.messages.empty())
                    trace = Path(config["trace"]).read_text(encoding="utf-8").splitlines()
                    loads = [line for line in trace if line.startswith("resource:")]
                    self.assertEqual(len(loads), 2 if failure == "overlay-failure" else 1)
                    self.assertTrue(Path(loads[0].removeprefix("resource:")).samefile(self.resource))
                    if failure == "overlay-failure":
                        self.assertTrue(Path(loads[1].removeprefix("resource:")).samefile(overlay))
                    self.assertNotIn("create-instance", trace)
                    self.assertFalse(any(
                        line.startswith(("connect:", "append-task")) for line in trace
                    ))

    def test_preview_and_click_confirm_native_callbacks_in_preview_pixels(self):
        session = self.connected()
        frame = self.preview(session)
        self.assertEqual({key: frame[key] for key in ("width", "height", "mimeType", "canControl")}, {
            "width": 2, "height": 2, "mimeType": "image/png", "canControl": True,
        })
        image = base64.b64decode(frame["data"], validate=True)
        self.assertEqual(image[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(int.from_bytes(image[16:20], "big"), frame["width"])
        self.assertEqual(int.from_bytes(image[20:24], "big"), frame["height"])
        session.send({"id": "click", "operation": "click", "x": 1, "y": 1})
        self.assertEqual(session.response("click")["result"], {"accepted": True})
        for ident, what in [(17, "Screencap"), (27, "Click")]:
            callback = next(value for value in session.seen if value.get("message") == 4
                            and value.get("details", {}).get("async_call_id") == ident)
            self.assertEqual(callback["details"]["what"], what)
            self.assertIs(callback["details"]["details"]["ret"], True)
        trace = Path(self.config["trace"]).read_text(encoding="utf-8").splitlines()
        self.assertIn("screencap-blocking", trace)
        self.assertIn("click:1:1:block", trace)
        self.assertLess(trace.index("screencap-blocking"), trace.index("get-image"))

    def test_preview_and_click_require_connection_and_frame(self):
        session = self.session()
        session.wait(lambda value: value.get("type") == "ready")
        for operation in ["frame", "click"]:
            session.send({"id": operation, "operation": operation, "x": 0, "y": 0})
            self.assertIn("must be connected", session.response(operation)["error"])
        self.assertEqual(session.close()[0], 0)
        session = self.connected()
        session.send({"id": "click", "operation": "click", "x": 0, "y": 0})
        self.assertIn("frame is required", session.response("click")["error"])
        self.assertNotIn("click:", Path(self.config["trace"]).read_text(encoding="utf-8"))

    def test_preview_click_rejects_noninteger_and_out_of_frame_coordinates(self):
        session = self.connected()
        self.preview(session)
        for index, coordinates in enumerate([
            {}, {"x": True, "y": 0}, {"x": 0, "y": False}, {"x": 1.5, "y": 0},
            {"x": "1", "y": 0}, {"x": -1, "y": 0}, {"x": 0, "y": -1},
            {"x": 2, "y": 0}, {"x": 0, "y": 2}, {"x": 2 ** 64, "y": 0},
        ]):
            with self.subTest(coordinates=coordinates):
                session.send({"id": index, "operation": "click", **coordinates})
                self.assertIn("integers inside", session.response(index)["error"])
        self.assertNotIn("click:", Path(self.config["trace"]).read_text(encoding="utf-8"))

    def test_running_preview_only_reads_cached_image_and_blocks_click(self):
        session = self.connected("task-hold")
        self.preview(session)
        session.send({"id": "task", "operation": "task", "task": {"type": "Fight", "params": {}}})
        self.assertEqual(session.response("task")["result"], {"taskId": 11})
        self.assertIs(self.preview(session, "running-preview")["canControl"], False)
        session.send({"id": "click", "operation": "click", "x": 0, "y": 0})
        self.assertIn("not idle", session.response("click")["error"])
        trace = Path(self.config["trace"]).read_text(encoding="utf-8").splitlines()
        self.assertEqual(trace.count("screencap"), 1)
        self.assertEqual(trace.count("get-image"), 2)
        self.assertFalse(any(line.startswith("click:") for line in trace))

    def test_delayed_native_callback_is_awaited_without_event_pump(self):
        for scenario, operation, ident in [
            ("screencap-callback-delay", "frame", 17), ("click-callback-delay", "click", 27),
        ]:
            with self.subTest(scenario=scenario):
                session = self.connected(scenario)
                if operation == "click":
                    self.preview(session)
                session.send({"id": "command", "operation": operation, "x": 0, "y": 0})
                self.assertIn("result", session.response("command"))
                self.assertTrue(any(value.get("details", {}).get("async_call_id") == ident
                                    for value in session.seen))
                self.assertEqual(session.close()[0], 0)

    def test_preview_refuses_failed_or_mismatched_screencap_results(self):
        for scenario in ["screencap-reject", "screencap-failure", "screencap-wrong-what"]:
            with self.subTest(scenario=scenario):
                session = self.connected(scenario)
                session.send({"id": "frame", "operation": "frame"})
                self.assertIn("error", session.response("frame"))
                self.assertNotIn("get-image", Path(self.config["trace"]).read_text(encoding="utf-8"))
                self.assertEqual(session.close()[0], 0)

    def test_click_requires_successful_exact_callback_and_is_never_replayed(self):
        for scenario in ["click-reject", "click-failure", "click-invalid-ret", "click-wrong-what", "click-disconnect"]:
            with self.subTest(scenario=scenario):
                Path(self.config["trace"]).unlink(missing_ok=True)
                session = self.connected(scenario)
                self.preview(session)
                session.send({"id": "click", "operation": "click", "x": 1, "y": 0})
                self.assertIn("error", session.response("click"))
                trace = Path(self.config["trace"]).read_text(encoding="utf-8").splitlines()
                self.assertEqual(sum(line.startswith("click:") for line in trace), 1)
                self.assertEqual(session.close()[0], 0)

    def test_preview_size_sentinel_png_header_and_dimensions_are_bounded(self):
        for scenario in [
            "image-null-size", "image-oversize", "image-empty", "image-truncated", "image-invalid-png",
            "image-invalid-ihdr", "image-wide", "image-too-many-pixels", "image-zero-dimension",
        ]:
            with self.subTest(scenario=scenario):
                session = self.connected(scenario)
                session.send({"id": "frame", "operation": "frame"})
                self.assertIn("error", session.response("frame"))
                session.send({"id": "click", "operation": "click", "x": 0, "y": 0})
                self.assertIn("frame is required", session.response("click")["error"])
                self.assertEqual(session.close()[0], 0)

    def test_largest_preview_fits_one_ndjson_message(self):
        session = self.connected("image-limit")
        frame = self.preview(session)
        self.assertEqual(len(base64.b64decode(frame["data"], validate=True)), 3 * 1024 * 1024 - 8192)
        self.assertLess(len(json.dumps(frame).encode("utf-8")), 4 * 1024 * 1024 - 8192)

    @unittest.skipUnless(ARGS.legacy, "legacy fixture not supplied")
    def test_optional_preview_symbols_preserve_legacy_core_tasks(self):
        shutil.copyfile(ARGS.legacy, self.core / ARGS.core.name)
        session = self.connected()
        for operation, symbol in [("frame", "AsstGetImage"), ("click", "AsstAsyncClick")]:
            session.send({"id": operation, "operation": operation, "x": 0, "y": 0})
            self.assertIn(symbol, session.response(operation)["error"])
        session.send({"id": "task", "operation": "task", "task": {"type": "Fight", "params": {}}})
        self.assertEqual(session.response("task")["result"], {"taskId": 11})
        session.wait(lambda value: value.get("message") == 10002)
        self.assertEqual(session.close()[0], 0)

    def test_missing_exact_async_callback_exits_unknown_without_replaying(self):
        for scenario, operation in [("screencap-wrong-id", "frame"), ("click-wrong-id", "click")]:
            with self.subTest(scenario=scenario):
                Path(self.config["trace"]).unlink(missing_ok=True)
                session = self.connected(scenario, config={**self.config, "asyncTimeoutMs": 80})
                if operation == "click":
                    self.preview(session)
                session.send({"id": "command", "operation": operation, "x": 0, "y": 0})
                self.assertEqual(session.child.wait(timeout=3), 124)
                code, errors = session.close()
                self.assertEqual(code, 124)
                self.assertIn("result unknown, do not replay", errors)
                if operation == "click":
                    trace = Path(self.config["trace"]).read_text(encoding="utf-8").splitlines()
                    self.assertEqual(sum(line.startswith("click:") for line in trace), 1)

    def test_enhanced_preview_failure_preserves_protocol_stop(self):
        session = self.connected("capture-late-fallback", config=self.capture_config())
        session.send({"id": "frame", "operation": "frame"})
        self.assertIn("error", session.response("frame"))
        self.assertTrue(any(value.get("details", {}).get("why") == "RequiredCaptureProtocolUnavailable"
                            for value in session.seen))
        trace = Path(self.config["trace"]).read_text(encoding="utf-8")
        self.assertIn("stop-cleared-queue", trace)
        self.assertNotIn("get-image", trace)

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
                if os.name == "nt":
                    self.assertFalse(applied["path"].startswith("\\\\?\\"))
                self.assertEqual(applied["index"], 3)
                if method == "mumu":
                    self.assertIs(applied["touch"], False)
                else:
                    self.assertEqual(applied["pid"], 4242)
                self.assertLess(trace.index(extra_line), trace.index("connect:" + name))
                self.assertIn("screencap", trace)

    def test_connection_profile_and_touch_options_precede_async_connect(self):
        config = {**self.config, "connection": {
            "config": "BlueStacks", "touchMode": "maatouch", "adbLite": True,
            "clientType": "Bilibili",
        }}
        session = self.connected(config=config)
        self.assertEqual(session.close()[0], 0)
        trace = Path(config["trace"]).read_text(encoding="utf-8").splitlines()
        for option in ["option:2:maatouch", "option:4:1", "option:5:0", "option:6:Bilibili"]:
            self.assertIn(option, trace)
            self.assertLess(trace.index(option), trace.index("connect:BlueStacks"))

    def test_mumu_touch_enhancement_reaches_both_instance_and_connection_options(self):
        config = self.capture_config(mumuTouch=True, mumuBridge=True)
        session = self.connected(config=config)
        self.assertEqual(session.close()[0], 0)
        trace = Path(config["trace"]).read_text(encoding="utf-8").splitlines()
        self.assertIn("option:2:MumuExtras", trace)
        applied = json.loads(next(line for line in trace if line.startswith("extras:MuMuEmulator12:")).split(":", 2)[2])
        self.assertIs(applied["touch"], True)
        self.assertEqual(applied["index"], 3)

    def test_rejected_instance_option_destroys_the_instance_before_startup_fails(self):
        config = {**self.config, "connection": {
            "config": "General", "touchMode": "minitouch", "adbLite": False,
            "clientType": "Official",
        }}
        session = self.session(config, scenario="option-reject")
        code, errors = session.close()
        self.assertNotEqual(code, 0)
        self.assertIn("rejected", errors)
        trace = Path(config["trace"]).read_text(encoding="utf-8")
        self.assertIn("destroy-done", trace)
        self.assertNotIn("connect:", trace)

    def test_enhanced_task_requires_verified_connection(self):
        session = self.session(self.capture_config())
        session.wait(lambda value: value.get("type") == "ready")
        session.send({"id": "task", "operation": "task", "task": {"type": "Fight", "params": {}}})
        self.assertIn("protocol has not been verified", session.response("task")["error"])
        session.send({"id": "frame", "operation": "screencap"})
        self.assertIn("must be connected", session.response("frame")["error"])
        self.assertEqual(session.close()[0], 0)
        self.assertNotIn("append-task", Path(self.config["trace"]).read_text(encoding="utf-8"))

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
        trace = Path(self.config["trace"]).read_text(encoding="utf-8")
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
        self.assertIn("stop-cleared-queue", Path(self.config["trace"]).read_text(encoding="utf-8"))

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
        while time.monotonic() < deadline and (
            not trace.exists() or "destroy-start" not in trace.read_text(encoding="utf-8")
        ):
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
