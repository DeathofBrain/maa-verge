"""Isolated native validation and official updater. Never connects a device."""

import ctypes
import importlib
import json
import os
import platform
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from .archives import extract_archive
from .paths import fs_path


def core_library(root: Path) -> Path:
    root = fs_path(root)
    name = {"Windows": "MaaCore.dll", "Darwin": "libMaaCore.dylib", "Linux": "libMaaCore.so"}[
        platform.system()
    ]
    path = root / name
    if not path.is_file():
        raise ValueError(f"核心包缺少 {name}")
    return path


def probe_errors(user_dir: Path) -> str:
    """Capture recent loader errors before the isolated probe directory is removed."""
    try:
        with (user_dir / "debug" / "asst.log").open("rb") as log:
            log.seek(0, os.SEEK_END)
            log.seek(max(0, log.tell() - 64 * 1024))
            lines = log.read().decode("utf-8", errors="replace").splitlines()
        errors = [line for line in lines if "[ERR]" in line]
        return "\n".join(errors[-8:])[-1200:]
    except OSError:
        return ""


def validate(core: Path, resource: Path, expected: str) -> dict:
    core, resource = fs_path(core), fs_path(resource)
    if not (resource / "resource" / "version.json").is_file():
        raise ValueError("资源快照缺少 resource/version.json")
    handle = None
    if sys.platform == "win32":
        handle = os.add_dll_directory(str(core.resolve()))
    try:
        library = ctypes.CDLL(str(core_library(core).resolve()))
        for symbol in (
            "AsstGetVersion",
            "AsstLoadResource",
            "AsstCreate",
            "AsstCreateEx",
            "AsstSetUserDir",
            "AsstDestroy",
            "AsstAppendTask",
            "AsstStart",
            "AsstStop",
            "AsstRunning",
            "AsstAsyncConnect",
        ):
            getattr(library, symbol)
        library.AsstGetVersion.restype = ctypes.c_char_p
        actual = library.AsstGetVersion().decode("utf-8")
        if actual != expected:
            raise ValueError(f"核心版本校验失败: 期望 {expected}，实际 {actual}")
        library.AsstLoadResource.argtypes = [ctypes.c_char_p]
        library.AsstLoadResource.restype = ctypes.c_bool
        library.AsstSetUserDir.argtypes = [ctypes.c_char_p]
        library.AsstSetUserDir.restype = ctypes.c_bool
        with tempfile.TemporaryDirectory(
            prefix="maaverge-core-probe-", ignore_cleanup_errors=True
        ) as user_dir:
            if not library.AsstSetUserDir(user_dir.encode("utf-8")):
                raise ValueError("核心工作目录初始化失败")
            if not library.AsstLoadResource(str(resource.resolve()).encode("utf-8")):
                details = probe_errors(Path(user_dir))
                raise ValueError("MaaCore 资源加载校验失败" + ("\n" + details if details else ""))
        return {"version": actual, "resourceLoaded": True}
    finally:
        if handle:
            handle.close()


def official_update(config: dict) -> None:
    from .vendor.asst.utils import Version

    # Upstream helper is intentionally dynamically adapted at this integration
    # boundary; it is vendored unmodified rather than edited for our type checker.
    updater: Any = importlib.import_module("maaverge_runtime.vendor.asst.updater")

    archive, target = Path(config["archive"]), Path(config["target"])
    # The official class probes the old DLL in its constructor, which is unnecessary:
    # the active immutable generation already passed an independent native probe.
    instance = updater.Updater.__new__(updater.Updater)
    instance.path = str(target)
    instance.version = Version.Stable
    instance.cur_version = config["currentVersion"]
    instance.get_latest_version = lambda: (config["version"], "pinned-release")
    instance.get_download_url = lambda _: (["verified-local-archive"], archive.name)

    def copy_download(download_url_list, download_path):
        del download_url_list
        shutil.copyfile(archive, download_path)
        return True

    updater.downloader.file_download = copy_download
    updater.Updater.custom_print = staticmethod(
        lambda text: print(str(text), file=sys.stderr, flush=True)
    )
    zip_class, tar_open = updater.zipfile.ZipFile, updater.tarfile.open

    class CheckedZip(zipfile.ZipFile):
        def extractall(self, path=None, members=None, pwd=None):
            if members is not None or pwd is not None:
                raise ValueError("不支持部分或加密更新包")
            # extract_archive uses zipfile too: restore the original during extraction.
            updater.zipfile.ZipFile = zip_class
            try:
                extract_archive(archive, Path(path))
            finally:
                updater.zipfile.ZipFile = CheckedZip

    class CheckedTar:
        def __init__(self, *args, **kwargs):
            self.package = tar_open(*args, **kwargs)

        def getnames(self):
            return self.package.getnames()

        def close(self):
            self.package.close()

        def extractall(self, path):
            updater.tarfile.open = tar_open
            try:
                extract_archive(archive, Path(path))
            finally:
                updater.tarfile.open = CheckedTar

    updater.zipfile.ZipFile, updater.tarfile.open = CheckedZip, CheckedTar
    try:
        instance.update()
    finally:
        updater.zipfile.ZipFile, updater.tarfile.open = zip_class, tar_open


def main() -> None:
    command = json.load(sys.stdin)
    if command["operation"] == "validate":
        result = validate(Path(command["core"]), Path(command["resource"]), command["version"])
    elif command["operation"] == "official_update":
        official_update(command)
        result = {"installed": True}
    else:
        raise ValueError("未知原生辅助命令")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
