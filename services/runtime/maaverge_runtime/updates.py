"""Independent, immutable MaaCore and MaaResource update generations."""

import hashlib
import json
import platform
import re
import shutil
import subprocess
import sys
import threading
import uuid
from collections.abc import Callable
from functools import wraps
from pathlib import Path

import httpx

from .archives import extract_archive, normalize_runtime_root
from .models import RpcError
from .paths import fs_path
from .storage import Store, now

GITHUB = "https://api.github.com/repos/MaaAssistantArknights"


def serial_update(method):
    @wraps(method)
    def wrapper(self, *args, **kwargs):
        with self.operation_lock:
            return method(self, *args, **kwargs)

    return wrapper


def platform_asset(system: str | None = None, machine: str | None = None) -> str:
    system, machine = system or platform.system(), (machine or platform.machine()).lower()
    if system == "Darwin" and machine in {"arm64", "aarch64", "x86_64", "amd64"}:
        return "macos-runtime-universal.zip"
    if system == "Windows" and machine in {"amd64", "x86_64"}:
        return "win-x64.zip"
    if system == "Linux" and machine in {"amd64", "x86_64"}:
        return "linux-x86_64.tar.gz"
    raise ValueError(f"尚未支持的系统架构: {system}/{machine}")


class OfficialSource:
    """Read only official release metadata; all resource URLs use the same commit."""

    def __init__(self, client: httpx.Client | None = None):
        self.client = client or httpx.Client(
            timeout=30, follow_redirects=True, headers={"User-Agent": "maa-verge/0.1"}
        )

    def get_json(self, url: str):
        response = self.client.get(url)
        response.raise_for_status()
        return response.json()

    def check(self, channel: str) -> dict:
        if channel == "core":
            release = self.get_json(f"{GITHUB}/MaaAssistantArknights/releases/latest")
            if release.get("prerelease") or release.get("draft"):
                raise ValueError("稳定通道返回非稳定版本")
            suffix = platform_asset()
            assets = [
                a
                for a in release["assets"]
                if a["name"].startswith("MAA-") and a["name"].endswith("-" + suffix)
            ]
            if len(assets) != 1:
                raise ValueError("未找到唯一匹配的官方运行时包")
            asset = assets[0]
            url = asset["browser_download_url"]
            if not url.startswith("https://github.com/MaaAssistantArknights/"):
                raise ValueError("更新包来源不是官方仓库")
            return {
                "version": release["tag_name"],
                "url": url,
                "name": asset["name"],
                "size": asset["size"],
                "digest": asset.get("digest"),
                "source": "GitHub",
            }
        commit = self.get_json(f"{GITHUB}/MaaResource/commits/main")["sha"]
        if not re.fullmatch(r"[0-9a-f]{40}", commit):
            raise ValueError("无效的资源提交")
        version = self.get_json(
            "https://raw.githubusercontent.com/"
            f"MaaAssistantArknights/MaaResource/{commit}/resource/version.json"
        )
        return {
            "version": commit,
            "commit": commit,
            "resourceVersion": version,
            "url": f"https://codeload.github.com/MaaAssistantArknights/MaaResource/zip/{commit}",
            "name": f"MaaResource-{commit}.zip",
            "source": "GitHub",
        }

    def download(self, metadata: dict, destination: Path, progress: Callable[[int], None]) -> str:
        partial = destination.with_suffix(destination.suffix + ".partial")
        digest, count = hashlib.sha256(), 0
        try:
            with self.client.stream("GET", metadata["url"], timeout=120) as response:
                response.raise_for_status()
                size = metadata.get("size") or int(response.headers.get("content-length", "0"))
                if size > 2 * 1024**3:
                    raise ValueError("下载包超过大小限制")
                with partial.open("wb") as output:
                    for chunk in response.iter_bytes(1024 * 256):
                        count += len(chunk)
                        if count > 2 * 1024**3:
                            raise ValueError("下载包超过大小限制")
                        digest.update(chunk)
                        output.write(chunk)
                        progress(min(90, int(count / size * 90)) if size else 25)
            if metadata.get("size") and count != metadata["size"]:
                raise ValueError("下载包大小不符")
            expected = metadata.get("digest")
            if expected and expected != "sha256:" + digest.hexdigest():
                raise ValueError("下载包 SHA-256 校验失败")
            partial.replace(destination)
            return digest.hexdigest()
        finally:
            partial.unlink(missing_ok=True)


class NativeValidator:
    def __call__(self, core: Path, resource: Path, version: str) -> None:
        run_helper(
            {
                "operation": "validate",
                "core": str(core),
                "resource": str(resource),
                "version": version,
            },
            timeout=90,
        )


def run_helper(config: dict, timeout: int = 180) -> dict:
    command = (
        [sys.executable, "--native-helper"]
        if getattr(sys, "frozen", False)
        else [sys.executable, "-m", "maaverge_runtime.native_helper"]
    )
    result = subprocess.run(
        command,
        input=json.dumps(config),
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode:
        raise ValueError("原生隔离进程失败: " + result.stderr[-1500:])
    return json.loads(result.stdout.splitlines()[-1])


def tree_hash(root: Path) -> str:
    root = fs_path(root)
    digest = hashlib.sha256()
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        digest.update(path.relative_to(root).as_posix().encode())
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    return digest.hexdigest()


class UpdateService:
    def __init__(
        self,
        root: Path,
        store: Store,
        emit: Callable,
        busy: Callable[[], bool],
        mode: str = "mock",
        source=None,
        validator=None,
        before_activate=None,
        after_activate=None,
        finish_activate=None,
    ):
        self.root, self.store, self.emit, self.busy, self.mode = root, store, emit, busy, mode
        self.operation_lock = threading.RLock()
        self.before_activate = before_activate or (lambda: None)
        self.after_activate = after_activate or (lambda: None)
        self.finish_activate = finish_activate or (lambda error=None: None)
        self.source, self.validator = source or OfficialSource(), validator or NativeValidator()
        (root / "generations").mkdir(parents=True, exist_ok=True)
        (root / "downloads").mkdir(exist_ok=True)
        if not store.get("update", "core"):
            versions = {
                "app": "0.1.0",
                "core": "v6.20.0" if mode == "mock" else "未安装",
                "resource": "2026.10.18" if mode == "mock" else "未安装",
            }
            for channel, version in versions.items():
                self._save(
                    {
                        "id": channel,
                        "currentVersion": version,
                        "status": "idle",
                        "progress": 0,
                        "message": "模拟更新源" if mode == "mock" else "尚未检查",
                    }
                )
        for state in self.channels():
            if state["status"] in {"checking", "downloading"}:
                state.update(status="failed", message="上次更新准备被中断，请重试", progress=0)
                self._save(state)
        if mode == "mock" and not store.get("active", "combo"):
            initial = root / "generations" / "mock-initial"
            initial.mkdir(exist_ok=True)
            store.put(
                "active",
                "combo",
                {
                    channel: {
                        "version": self.channel(channel)["currentVersion"],
                        "path": str(initial),
                        "mode": "mock",
                    }
                    for channel in ("core", "resource")
                },
            )

    def channels(self) -> list[dict]:
        return self.store.all("update")

    def channel(self, channel: str) -> dict:
        if channel not in {"app", "core", "resource"}:
            raise RpcError(-32602, "未知更新通道")
        return self.store.get("update", channel)

    def _save(self, value: dict) -> dict:
        self.store.put("update", value["id"], value)
        return value

    def _change(self, channel: str, **changes) -> dict:
        value = self.channel(channel)
        value.update(changes)
        self._save(value)
        self.emit("update.changed", value["message"], {"channel": channel, "update": value})
        return value

    @serial_update
    def check(self, channel: str) -> dict:
        current = self.channel(channel)
        if current["status"] in {"downloading", "staged", "waiting_idle"}:
            return current
        if channel == "app":
            return self._change(channel, status="idle", message="开发预览版尚未配置应用发行更新源")
        self._change(channel, status="checking", message="正在检查官方版本", progress=0)
        try:
            metadata = (
                {"version": "v6.21.0" if channel == "core" else "2026.10.20.2", "source": "mock"}
                if self.mode == "mock"
                else self.source.check(channel)
            )
            self.store.put("update_metadata", channel, metadata)
            available = metadata["version"] != current["currentVersion"]
            if channel == "core" and available:

                def stable_version(value):
                    match = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)", value)
                    return tuple(map(int, match.groups())) if match else None

                installed, latest = (
                    stable_version(current["currentVersion"]),
                    stable_version(metadata["version"]),
                )
                if installed and latest and latest < installed:
                    raise ValueError("官方稳定版本低于已安装版本，拒绝自动降级")
            return self._change(
                channel,
                latestVersion=metadata["version"],
                status="available" if available else "idle",
                message="发现可用更新" if available else "当前已是最新版本",
            )
        except Exception as error:
            self._change(channel, status="failed", message=str(error))
            raise RpcError(-32020, "检查更新失败", str(error)) from error

    @serial_update
    def prepare(self, channel: str) -> dict:
        current = self.channel(channel)
        if channel == "app":
            raise RpcError(-32020, "应用更新需使用桌面发行通道")
        if current["status"] in {"staged", "waiting_idle", "downloading"}:
            return current
        metadata = self.store.get("update_metadata", channel)
        if not metadata:
            self.check(channel)
            metadata = self.store.get("update_metadata", channel)
        if metadata["version"] == current["currentVersion"]:
            return current
        generation = self.root / "generations" / f"{channel}-{uuid.uuid4().hex}"
        generation.mkdir()
        self._change(channel, status="downloading", progress=0, message="正在准备独立更新快照")
        try:
            if self.mode == "mock":
                (generation / "resource").mkdir()
                (generation / "resource" / "version.json").write_text(
                    json.dumps({"version": metadata["version"], "mock": True}), encoding="utf-8"
                )
                digest = tree_hash(generation)
            else:
                digest = self._prepare_native(channel, metadata, generation, current)
            manifest = {
                **metadata,
                "path": str(generation),
                "sha256": digest,
                "validatedAt": now(),
                "mode": self.mode,
            }
            (generation / "manifest.json").write_text(
                json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
            )
            self.store.put("staged", channel, manifest)
            return self._change(
                channel, status="staged", progress=100, message="快照已校验，等待在空闲边界生效"
            )
        except Exception as error:
            self._change(channel, status="failed", message=str(error), progress=0)
            raise RpcError(-32020, "准备更新失败，活动版本保持可用", str(error)) from error

    def _prepare_native(self, channel: str, metadata: dict, generation: Path, current: dict) -> str:
        archive = self.root / "downloads" / (uuid.uuid4().hex + "-" + metadata["name"])

        def progress(percent: int) -> None:
            self._change(channel, progress=percent, message="正在下载官方组件")

        digest = self.source.download(metadata, archive, progress)
        combo = self.store.get("active", "combo", {})
        if channel == "core":
            if combo.get("core"):
                run_helper(
                    {
                        "operation": "official_update",
                        "archive": str(archive),
                        "target": str(generation),
                        "currentVersion": current["currentVersion"],
                        "version": metadata["version"],
                    }
                )
            else:
                extract_archive(archive, generation)
            normalize_runtime_root(generation)
            self.validator(generation, generation, metadata["version"])
        else:
            core = combo.get("core")
            if not core:
                raise ValueError("请先安装核心与基础资源")
            # Resource snapshots are overlays, not complete core installations.
            # MaaResource is a complete snapshot of an incremental overlay, not
            # the full core resources. Rebase on the immutable CORE each time:
            # deleted old overlay files disappear, while base-only task trees and
            # models survive (and removed overrides revert to their base version).
            baseline = fs_path(Path(core["path"]) / "resource")
            candidate_resource = fs_path(generation / "resource")
            shutil.copytree(baseline, candidate_resource)
            overlay = fs_path(generation / "_overlay")
            extract_archive(archive, overlay)
            roots = list(overlay.glob("*/resource"))
            if len(roots) != 1:
                raise ValueError("资源归档结构不符合预期")
            metadata["ownedFiles"] = [
                p.relative_to(roots[0]).as_posix()
                for p in sorted(roots[0].rglob("*"))
                if p.is_file()
            ]
            shutil.copytree(roots[0], candidate_resource, dirs_exist_ok=True)
            shutil.rmtree(overlay)
            self.validator(Path(core["path"]), generation, core["version"])
            metadata["coreVersion"] = core["version"]
            metadata["contentHash"] = tree_hash(generation / "resource")
        archive.unlink(missing_ok=True)
        return digest

    @serial_update
    def activate(self, channel: str) -> dict:
        self.channel(channel)
        staged = self.store.get("staged", channel)
        if not staged:
            raise RpcError(-32020, "没有已经校验的候选快照")
        if self.busy():
            return self._change(channel, status="waiting_idle", message="等待当前任务结束后热切换")
        combo = self.store.get("active", "combo", {})
        next_combo = dict(combo)
        if channel == "core":
            next_combo.update(core=staged, resource=staged)
        else:
            if self.mode != "mock" and staged.get("coreVersion") != combo.get("core", {}).get(
                "version"
            ):
                raise RpcError(-32020, "核心已变化，请重新准备资源快照")
            next_combo["resource"] = staged
        try:
            if self.mode != "mock":
                self.validator(
                    Path(next_combo["core"]["path"]),
                    Path(next_combo["resource"]["path"]),
                    next_combo["core"]["version"],
                )
            self._switch_combo(next_combo, combo)
            self.store.put("previous", "combo", combo)
            self.store.delete("staged", channel)
            if channel == "core" and self.mode != "mock":
                self.store.delete("staged", "resource")
                self._change(
                    "resource",
                    currentVersion="bundled@" + staged["version"],
                    status="active",
                    message="使用新核心附带的已验证基础资源",
                )
            result = self._change(
                channel,
                currentVersion=staged["version"],
                status="active",
                progress=100,
                message="新快照已生效，桌面无需重启",
            )
            self.finish_activate()
            return result
        except Exception as error:
            self._change(
                channel, status="failed", message="切换校验失败，保留原版本: " + str(error)
            )
            raise RpcError(-32020, "更新切换失败，已保留原版本", str(error)) from error

    def _switch_combo(self, candidate: dict, original: dict) -> None:
        try:
            self.before_activate()
        except Exception as error:
            self.finish_activate(str(error))
            raise
        # The pointer changes atomically, but external control remains guarded
        # until every restarted worker acknowledges Connect and drains async work.
        self.store.put("active", "combo", candidate)
        try:
            self.after_activate()
        except Exception as error:
            try:
                self.before_activate()
                self.store.put("active", "combo", original)
                self.after_activate()
            except Exception as restore_error:
                self.store.put("active", "combo", original)
                failure = f"候选版本重连失败: {error}；原版本重连也失败: {restore_error}"
                self.finish_activate(failure)
                raise ValueError(failure) from error
            self.finish_activate()
            raise ValueError(f"候选版本重连失败，已恢复原版本: {error}") from error

    def activate_pending(self) -> None:
        for channel in self.channels():
            if channel["status"] == "waiting_idle" and not self.busy():
                try:
                    self.activate(channel["id"])
                except RpcError:
                    pass

    @serial_update
    def rollback(self, channel: str) -> dict:
        self.channel(channel)
        if self.busy():
            raise RpcError(-32021, "请等待任务结束后回滚")
        previous = self.store.get("previous", "combo")
        if not previous or channel not in previous:
            raise RpcError(-32020, "没有可回滚的已验证版本")
        active = self.store.get("active", "combo", {})
        try:
            if self.mode != "mock":
                self.validator(
                    Path(previous["core"]["path"]),
                    Path(previous["resource"]["path"]),
                    previous["core"]["version"],
                )
            self._switch_combo(previous, active)
        except Exception as error:
            self._change(channel, status="failed", message="回滚初始化失败，已恢复活动版本")
            raise RpcError(-32020, "回滚初始化失败，已恢复活动版本", str(error)) from error
        self.store.put("previous", "combo", active)
        for key in ("core", "resource"):
            if key in previous:
                self._change(
                    key,
                    currentVersion=previous[key]["version"],
                    status="active",
                    message="已恢复上一组验证通过的核心与资源",
                    progress=100,
                )
        self.finish_activate()
        return self.channel(channel)
