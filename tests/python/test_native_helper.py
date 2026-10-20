from pathlib import Path
from types import SimpleNamespace

import pytest
from maaverge_runtime import native_helper


def test_failed_resource_validation_preserves_bounded_errors_before_probe_cleanup(
    tmp_path, monkeypatch
):
    resource = tmp_path / "resource"
    resource.mkdir()
    (resource / "version.json").write_text("{}")
    probe = None

    def set_user_dir(value):
        nonlocal probe
        probe = Path(value.decode())
        return True

    def load_resource(_):
        log_dir = probe / "debug"
        log_dir.mkdir()
        (log_dir / "asst.log").write_text(
            "[ERR] old diagnostic\n"
            + "[TRC] verbose unrelated output\n" * 4000
            + "\n".join(f"[ERR] recent native loader error {index}" for index in range(12)),
            encoding="utf-8",
        )
        return False

    library = SimpleNamespace(
        **{
            symbol: lambda *_: None
            for symbol in (
                "AsstCreate",
                "AsstCreateEx",
                "AsstDestroy",
                "AsstAppendTask",
                "AsstStart",
                "AsstStop",
                "AsstRunning",
                "AsstAsyncConnect",
            )
        },
        AsstGetVersion=lambda: b"v6.20.0",
        AsstSetUserDir=set_user_dir,
        AsstLoadResource=load_resource,
    )
    monkeypatch.setattr(native_helper, "core_library", lambda path: path / "fixture-library")
    monkeypatch.setattr(native_helper.ctypes, "CDLL", lambda _: library)
    if hasattr(native_helper.os, "add_dll_directory"):
        monkeypatch.setattr(
            native_helper.os, "add_dll_directory", lambda _: SimpleNamespace(close=lambda: None)
        )
    with pytest.raises(ValueError, match="资源加载校验失败") as error:
        native_helper.validate(tmp_path, tmp_path, "v6.20.0")
    assert "recent native loader error 11" in str(error.value)
    assert "old diagnostic" not in str(error.value)
    assert "unrelated output" not in str(error.value)
    assert len(str(error.value)) < 1300
    assert not probe.exists()
