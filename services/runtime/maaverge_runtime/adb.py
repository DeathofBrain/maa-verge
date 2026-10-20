"""Explicit ADB discovery. No shell and no implicit connection on startup."""

import os
import re
import shutil
import subprocess
from pathlib import Path


def validate_address(address: object) -> str:
    if not isinstance(address, str) or not re.fullmatch(r"[A-Za-z0-9_.:\[\]-]{1,128}", address):
        raise ValueError("ADB 设备地址无效")
    if address.startswith("-"):
        raise ValueError("ADB 设备地址不得以选项开头")
    return address


def adb_path() -> str:
    configured = os.environ.get("MAAVERGE_ADB_PATH")
    candidate = configured or shutil.which("adb")
    if not candidate or not Path(candidate).is_file():
        raise ValueError("未找到 ADB，请配置 MAAVERGE_ADB_PATH 或将 adb 加入 PATH")
    return str(Path(candidate).resolve())


def discover() -> list[dict]:
    executable = adb_path()
    result = subprocess.run(
        [executable, "devices", "-l"],
        capture_output=True,
        text=True,
        timeout=15,
        check=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    devices = []
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) < 2 or fields[0] in {"List", "*"}:
            continue
        address = validate_address(fields[0])
        name = next(
            (v.removeprefix("model:") for v in fields[2:] if v.startswith("model:")), address
        )
        devices.append({"address": address, "name": name, "adbState": fields[1]})
    return devices
