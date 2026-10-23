import hashlib
import os
from pathlib import Path

from platformdirs import user_data_path


def data_root() -> Path:
    if override := os.environ.get("MAAVERGE_DATA_DIR"):
        return Path(override).expanduser().resolve()
    directory = (
        Path(os.environ["MAAVERGE_APP_DIR"])
        if os.environ.get("MAAVERGE_APP_DIR")
        else Path(__file__).resolve().parents[3]
    )
    directory = directory.resolve()
    root = directory / "config"
    legacy = (
        user_data_path("MAAVerge", appauthor=False).parent
        / "MAAVerge-dev"
        / hashlib.sha256(str(directory).encode()).hexdigest()[:8]
    )
    if (legacy / "native/maaverge.sqlite3").exists() and not (
        root / "native/maaverge.sqlite3"
    ).exists():
        raise RuntimeError(
            "检测到旧开发配置，请先移除 MAAVERGE_BACKEND=python 并启动一次默认后端完成迁移"
        )
    return root


def device_lock_path(address: str) -> Path:
    # Deliberately independent of checkout/data root: local app instances share locks.
    root = (
        Path(os.environ.get("MAAVERGE_DEVICE_LOCK_DIR", ""))
        if os.environ.get("MAAVERGE_DEVICE_LOCK_DIR")
        else user_data_path("MAAVerge", appauthor=False) / "device-locks"
    )
    root.mkdir(parents=True, exist_ok=True)
    return root / (hashlib.sha256(address.encode()).hexdigest() + ".lock")
