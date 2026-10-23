import hashlib

import pytest
from maaverge_runtime import config


def test_default_config_uses_program_directory_and_override(tmp_path, monkeypatch):
    monkeypatch.delenv("MAAVERGE_DATA_DIR", raising=False)
    monkeypatch.setenv("MAAVERGE_APP_DIR", str(tmp_path / "program"))
    monkeypatch.setattr(
        config, "user_data_path", lambda *args, **kwargs: tmp_path / "user/MAAVerge"
    )
    assert config.data_root() == tmp_path / "program/config"
    monkeypatch.setenv("MAAVERGE_DATA_DIR", str(tmp_path / "isolated"))
    assert config.data_root() == tmp_path / "isolated"


def test_reference_requires_default_backend_to_import_old_config(tmp_path, monkeypatch):
    directory = (tmp_path / "program").resolve()
    monkeypatch.delenv("MAAVERGE_DATA_DIR", raising=False)
    monkeypatch.setenv("MAAVERGE_APP_DIR", str(directory))
    monkeypatch.setattr(
        config, "user_data_path", lambda *args, **kwargs: tmp_path / "user/MAAVerge"
    )
    legacy = (
        tmp_path / "user/MAAVerge-dev" / hashlib.sha256(str(directory).encode()).hexdigest()[:8]
    )
    (legacy / "native").mkdir(parents=True)
    (legacy / "native/maaverge.sqlite3").touch()
    with pytest.raises(RuntimeError, match="默认后端"):
        config.data_root()
    (directory / "config/native").mkdir(parents=True)
    (directory / "config/native/maaverge.sqlite3").touch()
    assert config.data_root() == directory / "config"
