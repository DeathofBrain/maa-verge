"""Bounded local emulator discovery; fixed argv only, no emulator or game launch.

Connection defaults follow upstream v6.20.0 manual/connection.md and
MaaWpfGui/Helper/EmulatorHelper.cs. BlueStacks dynamic ports follow
src/Python/asst/emulator.py. Additional installations/ports are configurable.
"""

import os
import re
import shutil
import socket
import subprocess
import sys
from pathlib import Path

# This is a small list of emulator defaults, not a range scan. Multi-instance
# addresses outside it can be supplied in MAAVERGE_EMULATOR_ADDRESSES.
EMULATOR_PORTS = (
    5555,
    5556,
    5565,
    5575,
    5585,
    5595,
    5554,  # BlueStacks
    16384,
    16416,
    16448,
    16480,
    16512,
    16544,
    16576,  # MuMu 12
    5557,
    5559,
    5561,
    7555,
    62001,
    59865,
    21503,
    58526,
)


def validate_address(address: object) -> str:
    if not isinstance(address, str) or not re.fullmatch(r"[A-Za-z0-9_.:\[\]-]{1,128}", address):
        raise ValueError("ADB 设备地址无效")
    if address.startswith("-"):
        raise ValueError("ADB 设备地址不得以选项开头")
    return address


def is_local_emulator(address: str) -> bool:
    if re.fullmatch(r"emulator-\d{1,5}", address):
        return True
    match = re.fullmatch(r"(?:127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})", address)
    return bool(match and 0 < int(match[1]) <= 65535)


def device_lock_address(address: str) -> str:
    """Canonicalize aliases of the same emulator ADB port for shared OS locks."""
    if re.fullmatch(r"emulator-\d{1,5}", address):
        return f"127.0.0.1:{int(address.removeprefix('emulator-')) + 1}"
    if is_local_emulator(address):
        return "127.0.0.1:" + str(int(address.rsplit(":", 1)[1]))
    return address


def _adb_candidates() -> list[Path]:
    candidates = []
    if path := shutil.which("adb"):
        candidates.append(Path(path))
    for variable in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        if root := os.environ.get(variable):
            candidates.append(
                Path(root) / "platform-tools" / ("adb.exe" if sys.platform == "win32" else "adb")
            )
    for root in os.environ.get("MAAVERGE_EMULATOR_DIRS", "").split(os.pathsep):
        if root:
            base = Path(root).expanduser()
            candidates.extend(
                base / relative
                for relative in (
                    "adb",
                    "adb.exe",
                    "nox_adb.exe",
                    "HD-Adb.exe",
                    "adb/adb.exe",
                    "shell/adb.exe",
                    "vmonitor/bin/adb",
                    "Contents/MacOS/adb",
                )
            )
    if sys.platform == "darwin":
        candidates.append(Path.home() / "Library/Android/sdk/platform-tools/adb")
        for app_root in (Path("/Applications"), Path.home() / "Applications"):
            candidates.extend(
                app_root / relative
                for relative in (
                    "MuMuPlayer.app/Contents/MacOS/adb",
                    "MuMuPlayer Pro.app/Contents/MacOS/adb",
                    "NoxAppPlayer.app/Contents/MacOS/adb",
                    "Nox App Player.app/Contents/MacOS/adb",
                    "BlueStacks.app/Contents/MacOS/hd-adb",
                )
            )
    elif sys.platform == "win32":
        if root := os.environ.get("LOCALAPPDATA"):
            candidates.append(Path(root) / "Android/Sdk/platform-tools/adb.exe")
        for variable in ("ProgramFiles", "ProgramFiles(x86)"):
            if root := os.environ.get(variable):
                candidates.extend(
                    Path(root) / relative
                    for relative in (
                        "BlueStacks_nxt/HD-Adb.exe",
                        "Nox/bin/nox_adb.exe",
                        "Netease/MuMuPlayer-12.0/shell/adb.exe",
                        "Netease/MuMuPlayer/nx_main/adb.exe",
                        "Microvirt/MEmu/adb.exe",
                    )
                )
    else:
        candidates.extend(
            (
                Path.home() / "Android/Sdk/platform-tools/adb",
                Path("/opt/android-sdk/platform-tools/adb"),
            )
        )
    return candidates


def adb_path() -> str:
    if configured := os.environ.get("MAAVERGE_ADB_PATH"):
        path = Path(configured).expanduser()
        if not path.is_file():
            raise ValueError("MAAVERGE_ADB_PATH 指向的 ADB 不存在")
        return str(path.resolve())
    for candidate in _adb_candidates():
        if candidate.is_file():
            return str(candidate.resolve())
    raise ValueError(
        "未找到 ADB；请安装 Android platform-tools，"
        "或配置 MAAVERGE_ADB_PATH / MAAVERGE_EMULATOR_DIRS"
    )


def _run(executable: str, *args: str, timeout: float = 15) -> str:
    result = subprocess.run(
        [executable, *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    return result.stdout


def discover(executable: str | None = None) -> list[dict]:
    devices = []
    for line in _run(executable or adb_path(), "devices", "-l").splitlines():
        fields = line.split()
        if len(fields) < 2 or fields[0] in {"List", "*"}:
            continue
        address = validate_address(fields[0])
        name = next(
            (v.removeprefix("model:") for v in fields[2:] if v.startswith("model:")), address
        )
        devices.append({"address": address, "name": name, "adbState": fields[1]})
    return devices


def emulator_addresses() -> list[str]:
    addresses = [f"127.0.0.1:{port}" for port in EMULATOR_PORTS]
    if configured := os.environ.get("MAAVERGE_EMULATOR_ADDRESSES"):
        extras = [value.strip() for value in configured.split(",") if value.strip()]
        if len(extras) > 16:
            raise ValueError("自动连接最多配置 16 个额外本机地址")
        for address in extras:
            if not is_local_emulator(address) or address.startswith("emulator-"):
                raise ValueError("自动连接地址必须是带有效端口的本机回环地址")
        addresses = extras + addresses
    configs = []
    if configured := os.environ.get("MAAVERGE_BLUESTACKS_CONFIG"):
        configs.append(Path(configured).expanduser())
    if root := os.environ.get("ProgramData"):
        configs.extend(
            Path(root) / folder / "bluestacks.conf" for folder in ("BlueStacks_nxt", "BlueStacks")
        )
    for config in configs:
        if not config.is_file() or config.stat().st_size > 2 * 1024 * 1024:
            continue
        content = config.read_text(encoding="utf-8", errors="replace")
        for value in re.findall(
            r'^bst\.instance\.[\w-]+\.(?:status\.)?adb_port\s*=\s*"?(\d+)"?', content, re.MULTILINE
        ):
            if 0 < int(value) <= 65535:
                addresses.append(f"127.0.0.1:{int(value)}")
    return list(dict.fromkeys(addresses))[:48]


def _listening(address: str) -> bool:
    host, port = address.rsplit(":", 1)
    try:
        with socket.create_connection((host.strip("[]"), int(port)), timeout=0.15):
            return True
    except OSError:
        return False


def auto_discover() -> tuple[list[dict], list[str]]:
    executable = adb_path()
    devices = discover(executable)
    diagnostics = []
    known = {device["address"] for device in devices if device["adbState"] == "device"}
    for address in emulator_addresses():
        if address in known or not _listening(address):
            continue
        try:
            output = _run(executable, "connect", address, timeout=3).strip()
            if "connected to" not in output.lower():
                diagnostics.append(f"{address}：{output[:180] or 'ADB 未确认连接'}")
        except (OSError, subprocess.SubprocessError) as error:
            diagnostics.append(f"{address}：ADB 连接失败（{type(error).__name__}）")
    devices = discover(executable)
    for device in devices:
        if is_local_emulator(device["address"]) and device["adbState"] != "device":
            diagnostics.append(f"{device['address']}：{device['adbState']}，请检查模拟器 ADB 授权")
    return devices, diagnostics
