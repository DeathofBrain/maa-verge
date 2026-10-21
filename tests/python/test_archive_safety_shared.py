"""Shared hostile-member corpus for the Python reference and TypeScript runtime."""

import io
import json
import stat
import tarfile
import zipfile
from pathlib import Path

import pytest
from maaverge_runtime.archives import extract_core_archive


CASES = json.loads((Path(__file__).parents[1] / "fixtures/archive-safety.json").read_text("utf-8"))


@pytest.mark.parametrize("kind", ["zip", "tar"])
@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_shared_archive_rejections_before_selected_payloads(tmp_path, kind, case):
    archive = tmp_path / "synthetic.archive"
    files = {"MaaCore.dll": "core", "resource/version.json": "{}", **case.get("files", {})}
    links = case.get("links", {})
    if kind == "zip":
        with zipfile.ZipFile(archive, "w") as package:
            for name, content in files.items():
                package.writestr(name, content)
            for name, target in links.items():
                info = zipfile.ZipInfo(name)
                info.create_system = 3
                info.external_attr = (stat.S_IFLNK | 0o777) << 16
                package.writestr(info, target)
    else:
        with tarfile.open(archive, "w:gz") as package:
            for name, content in files.items():
                data = content.encode("utf-8")
                info = tarfile.TarInfo(name)
                info.size = len(data)
                package.addfile(info, io.BytesIO(data))
            for name, target in links.items():
                info = tarfile.TarInfo(name)
                info.type = tarfile.SYMTYPE
                info.linkname = target
                package.addfile(info)
    destination = tmp_path / "candidate"
    with pytest.raises(ValueError, match=case["error"]):
        extract_core_archive(archive, destination)
    assert list(destination.iterdir()) == []
