import io
import os
import stat
import tarfile
import zipfile

import pytest
from maaverge_runtime.archives import extract_archive, extract_core_archive, normalize_runtime_root
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


@pytest.mark.parametrize(
    "kind,wrapper,core,libraries,foreign",
    [
        (
            "zip",
            "",
            "MaaCore.dll",
            {"MaaUtils.dll", "onnxruntime.dll", "MaaAdbControlUnit.dll"},
            {"libunused.so", "libunused.dylib"},
        ),
        (
            "tar",
            "",
            "libMaaCore.so",
            {"libMaaUtils.so", "libonnxruntime.so.1.20.1"},
            {"Windows.dll", "libunused.dylib", "libunused.so.debug"},
        ),
        (
            "zip",
            "MAA-v6.20.0-macos-runtime-universal/",
            "libMaaCore.dylib",
            {"libMaaUtils.dylib", "libonnxruntime.1.20.1.dylib"},
            {"Windows.dll", "libunused.so", "libunused.dylib.debug"},
        ),
    ],
)
def test_core_archive_keeps_runtime_resources_and_licenses(
    tmp_path, kind, wrapper, core, libraries, foreign
):
    retained = {
        core,
        *libraries,
        "resource/version.json",
        "resource/global/YoStarEN/resource/tasks/example.json",
        "resource/models/ocr.bin",
        "resource/tools/helper.exe",
        "LICENSE",
        "LICENSE.txt",
        "THIRD_PARTY_NOTICES.txt",
        "licenses/opencv/COPYING",
    }
    skipped = {
        *foreign,
        "MAA.exe",
        "MAA.Updater.exe",
        "MAA.dll",
        "hostfxr.dll",
        "hostpolicy.dll",
        "MaaCore.pdb",
        "MAA.runtimeconfig.json",
        "externals/Gui.dll",
        "runtimes/win-x64/native/Native.dll",
        "Python/asst/updater.py",
        "README.md",
    }
    archive = tmp_path / "official.archive"
    write_archive(
        archive, {wrapper + name: name.encode() for name in retained | skipped}, {}, kind=kind
    )
    output = tmp_path / "output"
    extract_core_archive(archive, output)
    extracted = {
        path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file()
    }
    assert extracted == {wrapper + name for name in retained}
    if wrapper:
        assert (output / wrapper / core).is_file()
    normalize_runtime_root(output)
    assert (output / core).read_bytes() == core.encode()
    assert (output / "resource/tools/helper.exe").is_file()


@pytest.mark.parametrize("kind", ["zip", "tar"])
def test_core_archive_does_not_open_or_write_skipped_payloads(tmp_path, monkeypatch, kind):
    archive = tmp_path / "official.archive"
    files = {
        "MaaCore.dll": b"core",
        "resource/version.json": b"{}",
        "MAA.exe": b"gui",
        "MAA.dll": b"managed",
        "externals/Gui.dll": b"managed",
        "Python/asst/updater.py": b"example",
    }
    write_archive(archive, files, {}, kind=kind)
    allowed = {"MaaCore.dll", "resource/version.json"}
    opened = set()
    if kind == "zip":
        original_open = zipfile.ZipFile.open

        def checked_zip_open(package, member, *args, **kwargs):
            name = member.filename if isinstance(member, zipfile.ZipInfo) else member
            assert name in allowed
            opened.add(name)
            return original_open(package, member, *args, **kwargs)

        monkeypatch.setattr(zipfile.ZipFile, "open", checked_zip_open)
    else:
        original_extractfile = tarfile.TarFile.extractfile

        def checked_tar_extractfile(package, member, *args, **kwargs):
            name = member.name if isinstance(member, tarfile.TarInfo) else member
            assert name in allowed
            opened.add(name)
            return original_extractfile(package, member, *args, **kwargs)

        monkeypatch.setattr(tarfile.TarFile, "extractfile", checked_tar_extractfile)
    output = tmp_path / "output"
    extract_core_archive(archive, output)
    assert opened == allowed
    extracted = {
        path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file()
    }
    assert extracted == allowed
    assert not (output / "externals").exists()
    assert not (output / "Python").exists()


@pytest.mark.parametrize(
    "kind,hard,wrapper,core,library,alias,intermediate",
    [
        (
            "zip",
            False,
            "macos/",
            "libMaaCore.dylib",
            "libonnxruntime.1.20.1.dylib",
            "libonnxruntime.dylib",
            "libonnxruntime.1.dylib",
        ),
        (
            "tar",
            False,
            "",
            "libMaaCore.so",
            "libonnxruntime.so.1.20.1",
            "libonnxruntime.so",
            "libonnxruntime.so.1",
        ),
        (
            "tar",
            True,
            "linux/",
            "libMaaCore.so",
            "libonnxruntime.so.1.20.1",
            "libonnxruntime.so",
            "libonnxruntime.so.1",
        ),
    ],
)
def test_core_archive_materializes_versioned_library_aliases(
    tmp_path, kind, hard, wrapper, core, library, alias, intermediate
):
    archive = tmp_path / "official.archive"
    write_archive(
        archive,
        {
            wrapper + core: b"core",
            wrapper + library: b"runtime",
            wrapper + "resource/version.json": b"{}",
        },
        {
            wrapper + alias: (wrapper if hard else "") + intermediate,
            wrapper + intermediate: (wrapper if hard else "") + library,
        },
        kind=kind,
        hard=hard,
    )
    output = tmp_path / "output"
    extract_core_archive(archive, output)
    normalize_runtime_root(output)
    for name in (alias, intermediate, library):
        assert (output / name).read_bytes() == b"runtime"
        assert not (output / name).is_symlink()


@pytest.mark.parametrize("kind,hard", [("zip", False), ("tar", False), ("tar", True)])
def test_core_alias_cannot_restore_an_excluded_payload(tmp_path, kind, hard):
    archive = tmp_path / "official.archive"
    write_archive(
        archive,
        {
            "MaaCore.dll": b"core",
            "resource/version.json": b"{}",
            "externals/Gui.dll": b"excluded",
        },
        {"native.dll": "externals/Gui.dll"},
        kind=kind,
        hard=hard,
    )
    output = tmp_path / "output"
    with pytest.raises(ValueError, match="保留"):
        extract_core_archive(archive, output)
    assert not list(output.iterdir())


@pytest.mark.parametrize("kind", ["zip", "tar"])
@pytest.mark.parametrize(
    "links",
    [
        {"ignored/alias": "../../outside"},
        {"ignored/a": "b", "ignored/b": "a"},
        {"ignored/alias": "missing"},
        {"ignored/alias": "../resource"},
    ],
)
def test_core_archive_validates_even_excluded_links(tmp_path, kind, links):
    archive = tmp_path / "bad.archive"
    write_archive(
        archive,
        {"MaaCore.dll": b"core", "resource/version.json": b"{}"},
        links,
        kind=kind,
    )
    output = tmp_path / "output"
    with pytest.raises(ValueError, match="链接"):
        extract_core_archive(archive, output)
    assert not list(output.iterdir())


@pytest.mark.parametrize("kind", ["zip", "tar"])
@pytest.mark.parametrize("name", ["../ignored.exe", "/ignored.exe", "C:/ignored.exe"])
def test_core_archive_validates_even_excluded_paths(tmp_path, kind, name):
    archive = tmp_path / "bad.archive"
    write_archive(
        archive,
        {"MaaCore.dll": b"core", "resource/version.json": b"{}", name: b"ignored"},
        {},
        kind=kind,
    )
    with pytest.raises(ValueError, match="路径"):
        extract_core_archive(archive, tmp_path / "output")


def test_core_archive_rejects_excluded_duplicate_members(tmp_path):
    archive = tmp_path / "bad.zip"
    with zipfile.ZipFile(archive, "w") as package:
        package.writestr("MaaCore.dll", b"core")
        package.writestr("resource/version.json", b"{}")
        package.writestr("externals/GUI.dll", b"first")
        package.writestr("externals/gui.dll", b"second")
    with pytest.raises(ValueError, match="重复"):
        extract_core_archive(archive, tmp_path / "output")


def test_core_archive_keeps_empty_resource_and_license_directories(tmp_path):
    archive = tmp_path / "official.zip"
    with zipfile.ZipFile(archive, "w") as package:
        package.writestr("MaaCore.dll", b"core")
        package.writestr("resource/version.json", b"{}")
        package.writestr("resource/empty/", b"")
        package.writestr("licenses/empty/", b"")
        package.writestr("externals/empty/", b"")
    output = tmp_path / "output"
    extract_core_archive(archive, output)
    assert (output / "resource/empty").is_dir()
    assert (output / "licenses/empty").is_dir()
    assert not (output / "externals").exists()


@pytest.mark.parametrize("kind", ["zip", "tar"])
def test_core_archive_counts_skipped_payloads_toward_archive_limit(tmp_path, monkeypatch, kind):
    archive = tmp_path / "bad.archive"
    write_archive(
        archive,
        {"MaaCore.dll": b"core", "resource/version.json": b"{}", "MAA.exe": b"x" * 20},
        {},
        kind=kind,
    )
    monkeypatch.setattr("maaverge_runtime.archives.MAX_EXPANDED_BYTES", 25)
    with pytest.raises(ValueError, match="大小"):
        extract_core_archive(archive, tmp_path / "output")


@pytest.mark.parametrize("kind", ["zip", "tar"])
def test_core_archive_rejects_excluded_special_files(tmp_path, kind):
    archive = tmp_path / "bad.archive"
    write_archive(archive, {"MaaCore.dll": b"core", "resource/version.json": b"{}"}, {}, kind=kind)
    if kind == "zip":
        with zipfile.ZipFile(archive, "a") as package:
            info = zipfile.ZipInfo("ignored-device")
            info.create_system = 3
            info.external_attr = (stat.S_IFCHR | 0o600) << 16
            package.writestr(info, b"")
    else:
        with tarfile.open(archive, "w:gz") as package:
            for name, content in {"MaaCore.dll": b"core", "resource/version.json": b"{}"}.items():
                regular = tarfile.TarInfo(name)
                regular.size = len(content)
                package.addfile(regular, io.BytesIO(content))
            info = tarfile.TarInfo("ignored-device")
            info.type = tarfile.CHRTYPE
            package.addfile(info)
    with pytest.raises(ValueError, match="特殊文件"):
        extract_core_archive(archive, tmp_path / "output")


@pytest.mark.parametrize("kind", ["zip", "tar"])
def test_core_archive_rejects_case_insensitive_parent_conflicts(tmp_path, kind):
    archive = tmp_path / "bad.archive"
    write_archive(
        archive,
        {
            "MaaCore.dll": b"core",
            "resource/version.json": b"{}",
            "ignored": b"file",
            "IGNORED/gui.exe": b"conflict",
        },
        {},
        kind=kind,
    )
    with pytest.raises(ValueError, match="父级"):
        extract_core_archive(archive, tmp_path / "output")


@pytest.mark.parametrize(
    "files",
    [
        {"MaaCore.dll": b"core"},
        {"resource/version.json": b"{}"},
        {"deep/wrapper/MaaCore.dll": b"core", "deep/wrapper/resource/version.json": b"{}"},
        {
            "MaaCore.dll": b"core",
            "libMaaCore.so": b"another platform",
            "resource/version.json": b"{}",
        },
        {
            "first/MaaCore.dll": b"core",
            "first/resource/version.json": b"{}",
            "second/MaaCore.dll": b"other",
            "second/resource/version.json": b"{}",
        },
    ],
)
def test_core_archive_requires_a_unique_complete_runtime_root(tmp_path, files):
    archive = tmp_path / "bad.zip"
    write_archive(archive, files, {})
    with pytest.raises(ValueError, match="唯一"):
        extract_core_archive(archive, tmp_path / "output")
