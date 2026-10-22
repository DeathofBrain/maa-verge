from unittest.mock import Mock

import pytest
from maaverge_runtime import adb
from maaverge_runtime.models import RpcError
from maaverge_runtime.runtime import Runtime
from test_native import FixtureWorker
from test_updates import FixtureSource


def test_adb_environment_sdk_and_emulator_paths(tmp_path, monkeypatch):
    # CI runners and developer machines may provide an SDK or emulator before
    # the fixture's candidates. Exercise only the paths created by this test.
    for variable in (
        "MAAVERGE_ADB_PATH",
        "ANDROID_HOME",
        "ANDROID_SDK_ROOT",
        "MAAVERGE_EMULATOR_DIRS",
    ):
        monkeypatch.delenv(variable, raising=False)
    monkeypatch.setattr(adb.shutil, "which", lambda *_: None)
    monkeypatch.setattr(adb.sys, "platform", "linux")
    sdk = tmp_path / "sdk"
    executable = sdk / "platform-tools/adb"
    executable.parent.mkdir(parents=True)
    executable.touch()
    monkeypatch.setenv("ANDROID_SDK_ROOT", str(sdk))
    assert adb.adb_path() == str(executable)
    executable.unlink()
    custom = tmp_path / "emulator"
    custom.mkdir()
    (custom / "adb").touch()
    monkeypatch.setenv("MAAVERGE_EMULATOR_DIRS", str(custom))
    assert adb.adb_path() == str(custom / "adb")
    monkeypatch.setenv("MAAVERGE_ADB_PATH", str(tmp_path / "missing"))
    with pytest.raises(ValueError, match="不存在"):
        adb.adb_path()


def test_dynamic_bluestacks_ports_and_local_only_configuration(tmp_path, monkeypatch):
    config = tmp_path / "bluestacks.conf"
    config.write_text(
        'bst.instance.Pie64.status.adb_port="50123"\nbst.instance.Pie64_1.adb_port="50125"\n',
        encoding="utf-8",
    )
    monkeypatch.setenv("MAAVERGE_BLUESTACKS_CONFIG", str(config))
    monkeypatch.setenv("MAAVERGE_EMULATOR_ADDRESSES", "127.0.0.1:50121,localhost:50122")
    addresses = adb.emulator_addresses()
    assert addresses[:2] == ["127.0.0.1:50121", "localhost:50122"]
    assert "127.0.0.1:50123" in addresses
    assert "127.0.0.1:50125" in addresses
    assert len(addresses) == len(set(addresses))
    for invalid in ("192.168.1.2:5555", "127.0.0.1:70000", "--help", "emulator-5554"):
        monkeypatch.setenv("MAAVERGE_EMULATOR_ADDRESSES", invalid)
        with pytest.raises(ValueError):
            adb.emulator_addresses()


def test_auto_discover_connects_only_listening_defaults_without_shell(monkeypatch):
    monkeypatch.setattr(adb, "adb_path", lambda: "fixture-adb")
    monkeypatch.setattr(adb, "emulator_addresses", lambda: ["127.0.0.1:5555", "127.0.0.1:7555"])
    monkeypatch.setattr(adb, "_listening", lambda address: address.endswith(":7555"))
    result = Mock(
        stdout=(
            "List of devices attached\nemulator-5554 device model:Fixture\n"
            "127.0.0.1:7555 unauthorized\n"
        )
    )
    run = Mock(return_value=result)
    monkeypatch.setattr(adb.subprocess, "run", run)
    devices, diagnostics = adb.auto_discover()
    assert len(devices) == 2
    assert any("unauthorized" in message for message in diagnostics)
    assert [call.args[0] for call in run.call_args_list] == [
        ["fixture-adb", "devices", "-l"],
        ["fixture-adb", "connect", "127.0.0.1:7555"],
        ["fixture-adb", "devices", "-l"],
    ]
    assert all(not call.kwargs.get("shell", False) for call in run.call_args_list)


def test_emulator_lock_aliases_share_identity():
    assert adb.device_lock_address("emulator-5554") == "127.0.0.1:5555"
    assert adb.device_lock_address("localhost:5555") == "127.0.0.1:5555"
    assert adb.device_lock_address("[::1]:5555") == "127.0.0.1:5555"
    assert adb.device_lock_address("127.0.0.1:16384") == "127.0.0.1:5555"
    assert adb.device_lock_address("localhost:16448") == adb.device_lock_address("emulator-5558")
    assert adb.device_lock_address("USB_SERIAL") == "USB_SERIAL"
    assert not adb.is_local_emulator("192.168.1.2:5555")


@pytest.fixture
def auto_runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("MAAVERGE_DEVICE_LOCK_DIR", str(tmp_path / "locks"))
    monkeypatch.setattr("maaverge_runtime.runtime.adb_path", lambda: "fixture-adb")
    runtime = Runtime(
        tmp_path / "native",
        "native",
        worker_factory=FixtureWorker,
        update_source=FixtureSource(),
        validator=lambda *_: None,
    )
    runtime.updates.check("core")
    runtime.updates.prepare("core")
    runtime.updates.activate("core")
    yield runtime
    runtime.close()


def fixture_discovery():
    return (
        [
            {"address": "emulator-5554", "name": "Fixture", "adbState": "device"},
            {"address": "127.0.0.1:5555", "name": "Alias", "adbState": "device"},
            {"address": "USB_SERIAL", "name": "Phone", "adbState": "device"},
            {"address": "127.0.0.1:7555", "name": "Unauthorized", "adbState": "unauthorized"},
        ],
        [],
    )


def test_auto_connect_skips_usb_unauthorized_and_duplicate_aliases(auto_runtime, monkeypatch):
    monkeypatch.setattr("maaverge_runtime.runtime.auto_discover", fixture_discovery)
    result = auto_runtime.handle("device.auto_connect", {})
    assert len(result["devices"]) == 1
    assert len(result["discovered"]) == 4
    assert result["devices"][0]["address"] == "emulator-5554"
    auto_runtime.tick(force=True)
    assert auto_runtime.devices()[0]["state"] == "idle"
    assert not auto_runtime.store.all("run")


def test_automatic_startup_toggle_and_manual_disconnect(auto_runtime, monkeypatch):
    discover = Mock(side_effect=fixture_discovery)
    monkeypatch.setattr("maaverge_runtime.runtime.auto_discover", discover)
    auto_runtime.next_auto_connect = 0
    auto_runtime.automatic_connections()
    assert discover.call_count == 1
    auto_runtime.tick(force=True)
    device = auto_runtime.devices()[0]
    auto_runtime.handle("device.disconnect", {"id": device["id"]})
    auto_runtime.next_auto_connect = 0
    auto_runtime.automatic_connections()
    assert not auto_runtime.workers
    settings = auto_runtime.snapshot()["settings"]
    settings["autoConnect"] = False
    auto_runtime.handle("settings.save", {"settings": settings})
    auto_runtime.next_auto_connect = 0
    auto_runtime.automatic_connections()
    assert discover.call_count == 2
    settings["autoConnect"] = True
    auto_runtime.handle("settings.save", {"settings": settings})
    auto_runtime.automatic_connections()
    assert auto_runtime.workers
    assert discover.call_count == 3


def test_auto_connect_refuses_during_component_switch(auto_runtime, monkeypatch):
    discover = Mock(side_effect=AssertionError("must not discover"))
    monkeypatch.setattr("maaverge_runtime.runtime.auto_discover", discover)
    auto_runtime.switching_components = True
    with pytest.raises(RpcError, match="切换核心"):
        auto_runtime.handle("device.auto_connect", {})
    discover.assert_not_called()
    auto_runtime.switching_components = False


def test_mock_auto_connection_never_calls_adb(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "maaverge_runtime.runtime.auto_discover", Mock(side_effect=AssertionError("real ADB"))
    )
    runtime = Runtime(tmp_path)
    result = runtime.handle("device.auto_connect", {})
    assert result["devices"][0]["id"] == "mock-device-1"
    assert result["diagnostics"]
    runtime.automatic_connections()
    runtime.close()


def test_auto_connect_reuses_connected_alias_and_retries_failed_idle_worker(
    auto_runtime, monkeypatch
):
    monkeypatch.setattr("maaverge_runtime.runtime.auto_discover", fixture_discovery)
    device = auto_runtime.handle("device.connect", {"address": "127.0.0.1:5555"})
    auto_runtime.tick(force=True)
    old_worker = auto_runtime.workers[device["id"]]
    result = auto_runtime.handle("device.auto_connect", {})
    assert result["devices"][0]["id"] == device["id"]
    assert auto_runtime.workers[device["id"]] is old_worker
    old_worker.connected = False
    result = auto_runtime.handle("device.auto_connect", {})
    assert old_worker.closed
    assert result["devices"][0]["address"] == "emulator-5554"
    assert not auto_runtime.store.all("run")


def test_auto_connect_reuses_saved_device_identity_after_alias_changes(auto_runtime, monkeypatch):
    device = auto_runtime.handle("device.connect", {"address": "127.0.0.1:5555"})
    auto_runtime.tick(force=True)
    plan = auto_runtime.handle(
        "plan.save",
        {
            "plan": {
                "name": "保持设备绑定",
                "deviceId": device["id"],
                "tasks": [{"type": "Award", "params": {}}],
            }
        },
    )
    auto_runtime.handle("device.disconnect", {"id": device["id"]})
    monkeypatch.setattr("maaverge_runtime.runtime.auto_discover", fixture_discovery)
    result = auto_runtime.handle("device.auto_connect", {})
    assert result["devices"][0]["id"] == device["id"]
    assert len(auto_runtime.devices()) == 1
    auto_runtime.tick(force=True)
    run = auto_runtime.handle(
        "run.start",
        {"planId": plan["id"], "deviceId": device["id"], "requestId": "reconnected-binding"},
    )
    assert run["status"] == "running"


def test_manual_alias_connection_reuses_existing_device_controller(auto_runtime):
    device = auto_runtime.handle("device.connect", {"address": "127.0.0.1:5555"})
    auto_runtime.tick(force=True)
    worker = auto_runtime.workers[device["id"]]
    same = auto_runtime.handle("device.connect", {"address": "emulator-5554"})
    assert same["id"] == device["id"]
    assert auto_runtime.workers[device["id"]] is worker
    assert len(auto_runtime.devices()) == 1


def test_alias_reconnect_preserves_legacy_saved_device_id(auto_runtime):
    legacy = {
        "id": "device-legacy-raw-address-hash",
        "name": "旧版模拟器",
        "address": "emulator-5554",
        "state": "offline",
        "coreVersion": None,
        "resourceVersion": None,
    }
    auto_runtime.store.put("device", legacy["id"], legacy)
    connected = auto_runtime.handle("device.connect", {"address": "localhost:5555"})
    assert connected["id"] == legacy["id"]
    assert len(auto_runtime.devices()) == 1


@pytest.mark.parametrize(
    "socket", [None, "tcp:localhost:5037", "tcp:127.0.0.1:5037", "tcp:[::1]:5037", "tcp:5037"]
)
def test_adb_server_socket_aliases_share_lock_namespace(monkeypatch, socket):
    monkeypatch.delenv("ANDROID_ADB_SERVER_PORT", raising=False)
    monkeypatch.delenv("ANDROID_ADB_SERVER_ADDRESS", raising=False)
    if socket is None:
        monkeypatch.delenv("ADB_SERVER_SOCKET", raising=False)
    else:
        monkeypatch.setenv("ADB_SERVER_SOCKET", socket)
    assert adb.adb_server_identity() == "tcp:127.0.0.1:5037"


def test_adb_server_identity_uses_selected_environment_and_socket_precedence(monkeypatch, tmp_path):
    monkeypatch.delenv("ADB_SERVER_SOCKET", raising=False)
    monkeypatch.setenv("ANDROID_ADB_SERVER_PORT", "5038")
    monkeypatch.setenv("ANDROID_ADB_SERVER_ADDRESS", "LOCALHOST")
    assert adb.adb_server_identity() == "tcp:127.0.0.1:5038"
    monkeypatch.setenv("ADB_SERVER_SOCKET", "tcp:remote.example:5040")
    assert adb.adb_server_identity() == "tcp:remote.example:5040"
    socket = tmp_path / "server.sock"
    monkeypatch.setenv("ADB_SERVER_SOCKET", f"localfilesystem:{tmp_path}/unused/../server.sock")
    assert adb.adb_server_identity() == f"localfilesystem:{socket}"
    monkeypatch.setenv("ADB_SERVER_SOCKET", "tcp:localhost:99999")
    with pytest.raises(ValueError, match="端口"):
        adb.adb_server_identity()


def test_equivalent_adb_server_and_serial_aliases_cannot_take_two_controllers(
    auto_runtime, monkeypatch
):
    monkeypatch.delenv("ADB_SERVER_SOCKET", raising=False)
    monkeypatch.delenv("ANDROID_ADB_SERVER_ADDRESS", raising=False)
    monkeypatch.delenv("ANDROID_ADB_SERVER_PORT", raising=False)
    auto_runtime.handle("device.connect", {"address": "emulator-5554"})
    other = Runtime(
        auto_runtime.root.parent / "second",
        "native",
        worker_factory=FixtureWorker,
        update_source=FixtureSource(),
        validator=lambda *_: None,
    )
    try:
        other.updates.check("core")
        other.updates.prepare("core")
        other.updates.activate("core")
        monkeypatch.setenv("ADB_SERVER_SOCKET", "tcp:127.0.0.1:5037")
        with pytest.raises(RpcError, match="其他本地实例"):
            other.handle("device.connect", {"address": "localhost:5555"})
        assert not other.workers
    finally:
        other.close()


def test_disabling_auto_connect_during_discovery_prevents_new_controller(auto_runtime, monkeypatch):
    def discover_then_disable():
        settings = auto_runtime.snapshot()["settings"]
        settings["autoConnect"] = False
        auto_runtime.handle("settings.save", {"settings": settings})
        return fixture_discovery()

    monkeypatch.setattr("maaverge_runtime.runtime.auto_discover", discover_then_disable)
    auto_runtime.next_auto_connect = 0
    auto_runtime.automatic_connections()
    assert not auto_runtime.workers
    assert not auto_runtime.store.all("device")
    assert not auto_runtime.store.all("run")


def test_manual_disconnect_between_discovery_and_reservation_is_preserved(
    auto_runtime, monkeypatch
):
    device = auto_runtime.handle("device.connect", {"address": "emulator-5554"})
    auto_runtime.tick(force=True)
    auto_runtime.handle("device.disconnect", {"id": device["id"]})
    auto_runtime.auto_connect_suppressed.clear()
    original = auto_runtime.connect_device

    def disconnect_at_reservation(candidate, **kwargs):
        auto_runtime.handle("device.disconnect", {"id": device["id"]})
        return original(candidate, **kwargs)

    monkeypatch.setattr(auto_runtime, "connect_device", disconnect_at_reservation)
    monkeypatch.setattr("maaverge_runtime.runtime.auto_discover", fixture_discovery)
    result = auto_runtime.auto_connect_devices(automatic=True)
    assert not auto_runtime.workers
    assert not result["devices"]
    assert "127.0.0.1:5555" in auto_runtime.auto_connect_suppressed


def test_disabling_automatic_connection_during_handshake_closes_unpublished_worker(
    auto_runtime, monkeypatch
):
    instances = []

    class DisableOnConnect(FixtureWorker):
        def connect(self):
            super().connect()
            settings = auto_runtime.snapshot()["settings"]
            settings["autoConnect"] = False
            auto_runtime.handle("settings.save", {"settings": settings})
            instances.append(self)

    auto_runtime.worker_factory = DisableOnConnect
    with pytest.raises(RpcError, match="自动连接已关闭"):
        auto_runtime.connect_device({"address": "127.0.0.1:5555"}, automatic=True)
    assert instances[0].closed
    assert not auto_runtime.workers
    assert not auto_runtime.connecting
    assert not auto_runtime.store.all("device")
