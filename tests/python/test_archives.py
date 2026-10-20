import io
import os
import stat
import tarfile
import zipfile

import pytest
from maaverge_runtime.archives import extract_archive, normalize_runtime_root
from maaverge_runtime.paths import fs_path


def write_archive(path, files, links, *, kind="zip", hard=False):
    if kind == "zip":
        with zipfile.ZipFile(path, "w") as package:
            # Aliases precede their targets, as real archives may order them.
            for name, target in links.items():
                info = zipfile.ZipInfo(name)
                info.create_system = 3
                info.external_attr = (stat.S_IFLNK | 0o777) << 16
                package.writestr(info, target)
            for name, content in files.items():
                package.writestr(name, content)
    else:
        with tarfile.open(path, "w:gz") as package:
            for name, target in links.items():
                info = tarfile.TarInfo(name)
                info.type = tarfile.LNKTYPE if hard else tarfile.SYMTYPE
                info.linkname = target
                package.addfile(info)
            for name, content in files.items():
                info = tarfile.TarInfo(name)
                info.size = len(content)
                info.mode = 0o755
                package.addfile(info, io.BytesIO(content))


@pytest.mark.parametrize("kind,hard", [("zip", False), ("tar", False), ("tar", True)])
def test_internal_file_aliases_are_regular_files(tmp_path, kind, hard):
    archive = tmp_path / "runtime.archive"
    write_archive(
        archive,
        {"libs/library.1": b"native-library"},
        {
            "libs/library": "libs/library.1" if hard else "library.1",
            "alias": "libs/library",
        },
        kind=kind,
        hard=hard,
    )
    output = tmp_path / "output"
    extract_archive(archive, output)
    for name in ("libs/library", "alias"):
        path = output / name
        assert path.read_bytes() == b"native-library"
        assert not path.is_symlink()
    if kind == "tar" and os.name != "nt":
        assert (output / "alias").stat().st_mode & 0o111


@pytest.mark.parametrize("kind", ["zip", "tar"])
def test_relative_parent_within_archive_is_allowed(tmp_path, kind):
    archive = tmp_path / "runtime.archive"
    write_archive(archive, {"lib.1": b"library"}, {"aliases/lib": "../lib.1"}, kind=kind)
    extract_archive(archive, tmp_path / "output")
    assert (tmp_path / "output/aliases/lib").read_bytes() == b"library"


@pytest.mark.parametrize("kind,hard", [("zip", False), ("tar", False), ("tar", True)])
@pytest.mark.parametrize("target", ["../../outside", "/absolute", "C:/outside", "\\\\host\\x"])
def test_alias_cannot_escape_archive(tmp_path, kind, hard, target):
    archive = tmp_path / "bad.archive"
    write_archive(archive, {}, {"alias": target}, kind=kind, hard=hard)
    with pytest.raises(ValueError, match="链接"):
        extract_archive(archive, tmp_path / "output")


@pytest.mark.parametrize("kind,hard", [("zip", False), ("tar", False), ("tar", True)])
@pytest.mark.parametrize(
    "links", [{"alias": "missing"}, {"a": "b", "b": "a"}, {"alias": "directory"}]
)
def test_alias_requires_existing_noncyclic_file(tmp_path, kind, hard, links):
    archive = tmp_path / "bad.archive"
    write_archive(archive, {"directory/file": b"regular"}, links, kind=kind, hard=hard)
    with pytest.raises(ValueError, match="链接"):
        extract_archive(archive, tmp_path / "output")


@pytest.mark.parametrize("kind", ["zip", "tar"])
def test_alias_cannot_be_a_parent_directory(tmp_path, kind):
    archive = tmp_path / "bad.archive"
    write_archive(archive, {"file": b"data", "alias/child": b"bad"}, {"alias": "file"}, kind=kind)
    with pytest.raises(ValueError, match="父级"):
        extract_archive(archive, tmp_path / "output")


def test_alias_cannot_copy_preexisting_file_outside_archive_members(tmp_path):
    archive = tmp_path / "bad.archive"
    write_archive(archive, {}, {"alias": "preexisting"})
    output = tmp_path / "output"
    output.mkdir()
    (output / "preexisting").write_bytes(b"not-in-archive")
    with pytest.raises(ValueError, match="归档内"):
        extract_archive(archive, output)


def test_materialized_copies_count_toward_expanded_limit(tmp_path, monkeypatch):
    archive = tmp_path / "bad.tar.gz"
    write_archive(archive, {"file": b"x" * 16}, {"alias": "file"}, kind="tar", hard=True)
    monkeypatch.setattr("maaverge_runtime.archives.MAX_EXPANDED_BYTES", 25)
    with pytest.raises(ValueError, match="大小"):
        extract_archive(archive, tmp_path / "output")


def test_wrapped_macos_layout_flattens_after_alias_materialization(tmp_path):
    archive = tmp_path / "macos.zip"
    wrapper = "MAA-v6.20.0-macos-runtime-universal"
    write_archive(
        archive,
        {
            f"{wrapper}/libMaaCore.dylib": b"synthetic-core",
            f"{wrapper}/libonnxruntime.1.dylib": b"synthetic-onnx",
            f"{wrapper}/resource/version.json": b"{}",
        },
        {f"{wrapper}/libonnxruntime.dylib": "libonnxruntime.1.dylib"},
    )
    # Exercise real filesystem operations beyond Windows MAX_PATH, including
    # alias copying and moving files from the wrapper to their final location.
    output = tmp_path / ("generation-" * 9) / ("candidate-" * 9)
    assert len(str(output / wrapper / "resource/version.json")) > 260
    extract_archive(archive, output)
    normalize_runtime_root(output)
    output = fs_path(output)
    assert (output / "libMaaCore.dylib").read_bytes() == b"synthetic-core"
    assert (output / "libonnxruntime.dylib").read_bytes() == b"synthetic-onnx"
    assert not (output / "libonnxruntime.dylib").is_symlink()
    assert (output / "resource/version.json").read_bytes() == b"{}"
    assert not (output / wrapper).exists()


def test_flat_runtime_layout_is_unchanged(tmp_path):
    (tmp_path / "resource").mkdir()
    (tmp_path / "resource/version.json").write_text("{}")
    (tmp_path / "libMaaCore.so").write_bytes(b"core")
    normalize_runtime_root(tmp_path)
    assert (tmp_path / "libMaaCore.so").read_bytes() == b"core"


def test_runtime_wrapper_requires_a_unique_complete_layout(tmp_path):
    (tmp_path / "wrapper/resource").mkdir(parents=True)
    (tmp_path / "wrapper/resource/version.json").write_text("{}")
    (tmp_path / "wrapper/libMaaCore.dylib").write_bytes(b"core")
    (tmp_path / "unexpected").write_bytes(b"other")
    with pytest.raises(ValueError, match="唯一"):
        normalize_runtime_root(tmp_path)
