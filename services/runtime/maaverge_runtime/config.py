import hashlib
import os
from pathlib import Path

from platformdirs import user_data_path


def data_root() -> Path:
    if override := os.environ.get("MAAVERGE_DATA_DIR"):
        return Path(override).expanduser().resolve()
    return user_data_path("MAAVerge", appauthor=False)


def device_lock_path(address: str) -> Path:
    # Deliberately independent of checkout/data root: local app instances share locks.
    root = (
        Path(os.environ.get("MAAVERGE_DEVICE_LOCK_DIR", ""))
        if os.environ.get("MAAVERGE_DEVICE_LOCK_DIR")
        else user_data_path("MAAVerge", appauthor=False) / "device-locks"
    )
    root.mkdir(parents=True, exist_ok=True)
    return root / (hashlib.sha256(address.encode()).hexdigest() + ".lock")
