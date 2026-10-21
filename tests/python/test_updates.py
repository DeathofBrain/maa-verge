import hashlib
import io
import json
import tarfile
import zipfile
from pathlib import Path

import httpx
import pytest
from maaverge_runtime.archives import extract_archive
from maaverge_runtime.models import RpcError
from maaverge_runtime.paths import fs_path
from maaverge_runtime.runtime import Runtime
from maaverge_runtime.updates import OfficialSource, platform_asset, run_helper, tree_hash


def zip_bytes(files):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as package:
        for name, content in files.items():
            package.writestr(name, content)
    return output.getvalue()


@pytest.mark.parametrize("name", ["../outside", "/absolute", "C:/outside", "a\\..\\outside"])
def test_archive_rejects_traversal(tmp_path, name):
    archive = tmp_path / "bad.zip"
    archive.write_bytes(zip_bytes({name: "bad"}))
    with pytest.raises(ValueError):
        extract_archive(archive, tmp_path / "output")


def test_archive_rejects_tar_links(tmp_path):
    archive = tmp_path / "bad.tar.gz"
    with tarfile.open(archive, "w:gz") as package:
        info = tarfile.TarInfo("outside")
        info.type = tarfile.SYMTYPE
        info.linkname = "../../outside"
        package.addfile(info)
    with pytest.raises(ValueError, match="链接"):
        extract_archive(archive, tmp_path / "output")


def test_deep_root_long_resource_paths_extract_and_hash(tmp_path):
    deep = tmp_path / ("deep-root-" * 9) / ("generation-" * 6)
    name = "resource/Arknights-Tile-Pos/" + "act12side_s01-" * 10 + ".json"
    archive = tmp_path / "long-path.zip"
    archive.write_bytes(zip_bytes({name: "long-resource"}))
    assert len(str(deep / name)) > 260
    extract_archive(archive, deep)
    assert fs_path(deep / name).read_text() == "long-resource"
    assert len(tree_hash(deep)) == 64


def test_download_checks_hash_and_size(tmp_path):
    content = b"synthetic package"
    source = OfficialSource(
        httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, content=content)))
    )
    metadata = {
        "url": "https://example.test/package.zip",
        "size": len(content),
        "digest": "sha256:" + "0" * 64,
    }
    destination = tmp_path / "package.zip"
    with pytest.raises(ValueError, match="SHA-256"):
        source.download(metadata, destination, lambda _: None)
    assert not destination.exists()
    assert not list(tmp_path.glob("*.partial"))
    metadata["digest"] = "sha256:" + hashlib.sha256(content).hexdigest()
    source.download(metadata, destination, lambda _: None)
    assert destination.read_bytes() == content


def test_resource_metadata_is_pinned_to_one_commit():
    commit = "a" * 40
    urls = []

    def handler(request):
        urls.append(str(request.url))
        if "commits/main" in str(request.url):
            return httpx.Response(200, json={"sha": commit})
        return httpx.Response(200, json={"last_updated": "2026-10-20"})

    metadata = OfficialSource(httpx.Client(transport=httpx.MockTransport(handler))).check(
        "resource"
    )
    assert commit in urls[-1]
    assert metadata["url"].endswith(commit)


def test_platform_selection():
    assert platform_asset("Darwin", "arm64") == "macos-runtime-universal.zip"
    assert platform_asset("Windows", "AMD64") == "win-x64.zip"
    assert platform_asset("Linux", "x86_64") == "linux-x86_64.tar.gz"
    with pytest.raises(ValueError):
        platform_asset("Windows", "x86")


@pytest.mark.parametrize("kind", ["zip", "tar"])
def test_official_updater_reused_in_isolated_process(tmp_path, kind):
    files = {
        "MaaCore.dll": "new-core",
        "MaaUtils.dll": "native-dependency",
        "resource/version.json": "{}",
        "resource/minitouch/arm64-v8a/minitouch": "device-tool",
        "MAA.exe": "gui",
        "MAA.Updater.exe": "gui-updater",
        "externals/System.Private.CoreLib.dll": "dotnet",
    }
    archive = tmp_path / ("official-fixture.zip" if kind == "zip" else "official-fixture.tar.gz")
    if kind == "zip":
        archive.write_bytes(zip_bytes(files))
    else:
        with tarfile.open(archive, "w:gz") as package:
            for name, content in files.items():
                data = content.encode()
                info = tarfile.TarInfo(name)
                info.size = len(data)
                package.addfile(info, io.BytesIO(data))
    target = tmp_path / "staging"
    target.mkdir()
    result = run_helper(
        {
            "operation": "official_update",
            "archive": str(archive),
            "target": str(target),
            "currentVersion": "v6.19.0",
            "version": "v6.20.0",
        }
    )
    assert result["installed"]
    assert (target / "MaaCore.dll").read_text() == "new-core"
    assert (target / "MaaUtils.dll").read_text() == "native-dependency"
    assert (target / "resource/minitouch/arm64-v8a/minitouch").read_text() == "device-tool"
    assert not (target / "MAA.exe").exists()
    assert not (target / "MAA.Updater.exe").exists()
    assert not (target / "externals").exists()
    assert archive.exists()  # helper deletes its staged copy only


def test_resource_update_independent_of_core_and_idle_activation(tmp_path, monkeypatch):
    monkeypatch.setenv("MAAVERGE_DEVICE_LOCK_DIR", str(tmp_path / "locks"))
    runtime = Runtime(tmp_path / "data")
    try:
        before = runtime.updates.channel("core")["currentVersion"]
        runtime.updates.check("resource")
        runtime.updates.prepare("resource")
        runtime.handle(
            "run.start", {"planId": "daily", "deviceId": "mock-device-1", "requestId": "one"}
        )
        assert runtime.updates.activate("resource")["status"] == "waiting_idle"
        assert runtime.updates.channel("resource")["currentVersion"] == "2026.10.18"
        for _ in range(10):
            runtime.tick(force=True)
        assert runtime.updates.channel("resource")["status"] == "active"
        assert runtime.updates.channel("core")["currentVersion"] == before
    finally:
        runtime.close()


class FixtureSource:
    def __init__(self):
        self.resource_version = "a" * 40

    def check(self, channel):
        return {
            "version": "v6.20.0" if channel == "core" else self.resource_version,
            "name": channel + ".zip",
            "source": "fixture",
        }

    def download(self, metadata, destination, progress):
        files = (
            {
                "MaaCore.dll": "synthetic-not-a-dll",
                "resource/version.json": "{}",
                "resource/base-model": "retain",
            }
            if metadata["name"] == "core.zip"
            else {
                "MaaResource-commit/resource/version.json": json.dumps({"updated": True}),
                "MaaResource-commit/resource/event.json": "new-event",
            }
        )
        destination.write_bytes(zip_bytes(files))
        progress(90)
        return hashlib.sha256(destination.read_bytes()).hexdigest()


def test_native_core_install_and_upgrade_select_files_before_validation(tmp_path):
    class CoreSource(FixtureSource):
        version = "v6.20.0"

        def check(self, channel):
            return {**super().check(channel), "version": self.version}

        def download(self, metadata, destination, progress):
            destination.write_bytes(
                zip_bytes(
                    {
                        "MaaCore.dll": metadata["version"],
                        "MaaUtils.dll": "native-dependency",
                        "resource/version.json": "{}",
                        "resource/onnx/model.onnx": "model",
                        "resource/minitouch/arm64-v8a/minitouch": "device-tool",
                        "MAA.exe": "gui",
                        "MAA.dll": "managed-gui",
                        "MAA.Updater.exe": "gui-updater",
                        "hostfxr.dll": "dotnet-host",
                        "externals/coreclr.dll": "dotnet",
                        "Res/gui.mp4": "video",
                        "Python/sample.py": "sample",
                    }
                )
            )
            progress(90)
            return hashlib.sha256(destination.read_bytes()).hexdigest()

    validated = []

    def validator(core, resource, version):
        assert (core / "MaaCore.dll").read_text() == version
        assert (core / "MaaUtils.dll").is_file()
        assert (resource / "resource/onnx/model.onnx").read_text() == "model"
        assert (resource / "resource/minitouch/arm64-v8a/minitouch").is_file()
        for unused in (
            "MAA.exe",
            "MAA.dll",
            "MAA.Updater.exe",
            "hostfxr.dll",
            "externals",
            "Res",
            "Python",
        ):
            assert not (core / unused).exists()
        validated.append((core, version))

    source = CoreSource()
    runtime = Runtime(tmp_path, mode="native", update_source=source, validator=validator)
    try:
        updates = runtime.updates
        updates.check("core")
        updates.prepare("core")
        updates.activate("core")
        original = runtime.store.get("active", "combo")["core"]
        source.version = "v6.20.1"
        updates.check("core")
        updates.prepare("core")
        # Updating the next generation must not alter a worker's current files.
        assert (Path(original["path"]) / "MaaCore.dll").read_text() == "v6.20.0"
        assert runtime.store.get("active", "combo")["core"] == original
        candidate = runtime.store.get("staged", "core")
        assert candidate["path"] != original["path"]
        assert (Path(candidate["path"]) / "MaaCore.dll").read_text() == "v6.20.1"
        updates.activate("core")
        assert runtime.store.get("active", "combo")["core"]["version"] == "v6.20.1"
        updates.rollback("core")
        assert runtime.store.get("active", "combo")["core"] == original
        assert {version for _, version in validated} == {"v6.20.0", "v6.20.1"}
    finally:
        runtime.close()


def test_native_fixture_install_overlay_validation_failure_and_rollback(tmp_path):
    validations = []
    fail = False

    def validator(core: Path, resource: Path, version: str):
        validations.append((core, resource, version))
        assert (core / "MaaCore.dll").is_file()
        assert (resource / "resource" / "base-model").is_file()
        if fail:
            raise ValueError("synthetic validation failure")

    source = FixtureSource()
    runtime = Runtime(tmp_path, mode="native", update_source=source, validator=validator)
    try:
        updates = runtime.updates
        updates.check("core")
        updates.prepare("core")
        updates.activate("core")
        core_path = Path(runtime.store.get("active", "combo")["core"]["path"])
        updates.check("resource")
        updates.prepare("resource")
        updates.activate("resource")
        combo = runtime.store.get("active", "combo")
        assert Path(combo["resource"]["path"]) != core_path
        assert not (core_path / "resource" / "event.json").exists()
        assert (Path(combo["resource"]["path"]) / "resource" / "event.json").exists()
        updates.rollback("resource")
        assert runtime.store.get("active", "combo")["resource"]["path"] == str(core_path)
        fail = True
        source.resource_version = "b" * 40
        updates.check("resource")
        with pytest.raises(RpcError, match="准备更新失败"):
            updates.prepare("resource")
        assert runtime.store.get("active", "combo")["core"]["path"] == str(core_path)
        assert validations
    finally:
        runtime.close()


def test_resource_rebases_overlay_on_core_preserving_base_and_removing_stale_overrides(tmp_path):
    class OverlaySource(FixtureSource):
        def download(self, metadata, destination, progress):
            if metadata["name"] == "core.zip":
                files = {
                    "MaaCore.dll": "fixture",
                    "resource/version.json": "{}",
                    "resource/onnx/model": "retain-model",
                    "resource/tasks/Roguelike/BlackFlow.json": "base-required-task",
                    "resource/template/Base.png": "base-template",
                    "resource/global/YoStarEN/resource/tasks/Base.json": "base-global-task",
                    "resource/config.json": "base-config",
                }
            else:
                revision = "Old" if self.resource_version == "a" * 40 else "New"
                files = {
                    "snapshot/resource/version.json": "{}",
                    f"snapshot/resource/tasks/hotfix/{revision}.json": revision + "-task",
                    f"snapshot/resource/template/{revision}.png": revision + "-template",
                    f"snapshot/resource/global/YoStarEN/resource/tasks/{revision}.json": revision,
                }
                if revision == "Old":
                    files["snapshot/resource/config.json"] = "override-config"
            destination.write_bytes(zip_bytes(files))
            return hashlib.sha256(destination.read_bytes()).hexdigest()

    source = OverlaySource()
    runtime = Runtime(tmp_path, mode="native", update_source=source, validator=lambda *_: None)
    try:
        runtime.updates.check("core")
        runtime.updates.prepare("core")
        runtime.updates.activate("core")
        baseline = Path(runtime.store.get("active", "combo")["core"]["path"]) / "resource"
        runtime.updates.check("resource")
        runtime.updates.prepare("resource")
        runtime.updates.activate("resource")
        previous = Path(runtime.store.get("active", "combo")["resource"]["path"]) / "resource"
        assert (previous / "config.json").read_text() == "override-config"
        previous_hash, baseline_hash = tree_hash(previous), tree_hash(baseline)
        source.resource_version = "b" * 40
        runtime.updates.check("resource")
        runtime.updates.prepare("resource")
        candidate = Path(runtime.store.get("staged", "resource")["path"]) / "resource"
        assert not (candidate / "tasks/hotfix/Old.json").exists()
        assert not (candidate / "template/Old.png").exists()
        assert not (candidate / "global/YoStarEN/resource/tasks/Old.json").exists()
        assert (candidate / "tasks/hotfix/New.json").is_file()
        assert (candidate / "template/New.png").is_file()
        assert (candidate / "global/YoStarEN/resource/tasks/New.json").is_file()
        assert (candidate / "tasks/Roguelike/BlackFlow.json").read_text() == "base-required-task"
        assert (candidate / "template/Base.png").read_text() == "base-template"
        assert (candidate / "global/YoStarEN/resource/tasks/Base.json").is_file()
        assert (candidate / "onnx/model").read_text() == "retain-model"
        assert (candidate / "config.json").read_text() == "base-config"
        owned = runtime.store.get("staged", "resource")["ownedFiles"]
        assert "tasks/hotfix/New.json" in owned
        assert "tasks/hotfix/Old.json" not in owned
        assert "config.json" not in owned
        assert tree_hash(previous) == previous_hash
        assert tree_hash(baseline) == baseline_hash
    finally:
        runtime.close()
