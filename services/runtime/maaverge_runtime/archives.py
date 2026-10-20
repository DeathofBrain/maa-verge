"""Archive extraction with identical safety rules on Windows, Linux and macOS."""

import shutil
import stat
import tarfile
import zipfile
from pathlib import Path, PurePosixPath, PureWindowsPath

from .paths import fs_path

MAX_EXPANDED_BYTES = 8 * 1024**3
MAX_LINK_BYTES = 4096


def safe_destination(root: Path, name: str) -> Path:
    path = PurePosixPath(name.replace("\\", "/"))
    if (
        path.is_absolute()
        or PureWindowsPath(name).drive
        or ".." in path.parts
        or any(":" in part for part in path.parts)
    ):
        raise ValueError(f"压缩包包含不安全路径: {name}")
    target = root.joinpath(*path.parts).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError("压缩包路径越界")
    return target


def extract_archive(archive: Path, destination: Path) -> None:
    archive, destination = fs_path(archive), fs_path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    destination = destination.resolve()
    seen: set[str] = set()
    kinds: dict[Path, str] = {}
    links: dict[Path, Path] = {}
    total = 0

    def charge(size: int) -> None:
        nonlocal total
        total += size
        if total > MAX_EXPANDED_BYTES:
            raise ValueError("压缩包解压大小超出限制")

    def check(name: str, size: int, kind: str) -> Path:
        target = safe_destination(destination, name)
        key = str(target).casefold()
        if key in seen:
            raise ValueError(f"压缩包包含重复路径: {name}")
        seen.add(key)
        if target == destination and kind != "directory":
            raise ValueError("压缩包文件不得覆盖解压目录")
        kinds[target] = kind
        charge(size)
        return target

    def link_target(target: Path, name: str, *, hard: bool = False) -> Path:
        relative = PurePosixPath(name.replace("\\", "/"))
        if (
            not name
            or "\0" in name
            or relative.is_absolute()
            or PureWindowsPath(name).drive
            or any(":" in part for part in relative.parts)
        ):
            raise ValueError("压缩包链接目标无效")
        # Symbolic links are relative to their parent, tar hard links to the
        # archive root. Resolve lexically before any alias is materialized.
        parts = [] if hard else list(target.parent.relative_to(destination).parts)
        for part in relative.parts:
            if part == "..":
                if not parts:
                    raise ValueError("压缩包链接目标越界")
                parts.pop()
            else:
                parts.append(part)
        return safe_destination(destination, "/".join(parts))

    def check_parents() -> None:
        for target in kinds:
            for parent in target.parents:
                if parent == destination:
                    break
                if parent in kinds and kinds[parent] != "directory":
                    raise ValueError("压缩包路径父级不是目录，不允许目录链接")

    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as package:
            entries = []
            for info in package.infolist():
                mode = info.external_attr >> 16
                if stat.S_ISLNK(mode):
                    kind = "link"
                elif info.is_dir():
                    kind = "directory"
                elif stat.S_IFMT(mode) in {0, stat.S_IFREG}:
                    kind = "file"
                else:
                    raise ValueError("不允许压缩包设备或特殊文件")
                target = check(info.filename, info.file_size, kind)
                if kind == "link":
                    if info.file_size > MAX_LINK_BYTES:
                        raise ValueError("压缩包链接目标过长")
                    try:
                        name = package.read(info).decode("utf-8")
                    except UnicodeError as error:
                        raise ValueError("压缩包链接目标编码无效") from error
                    links[target] = link_target(target, name)
                entries.append((info, target, kind, mode))
            check_parents()
            for info, target, kind, mode in entries:
                if kind == "directory":
                    target.mkdir(parents=True, exist_ok=True)
                elif kind == "file":
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with package.open(info) as source, target.open("wb") as output:
                        shutil.copyfileobj(source, output)
                    if mode & 0o111:
                        target.chmod(0o755)
    else:
        with tarfile.open(archive, "r:*") as tar_package:
            tar_entries = []
            for member in tar_package.getmembers():
                if member.isdir():
                    kind = "directory"
                elif member.isfile():
                    kind = "file"
                elif member.issym() or member.islnk():
                    kind = "link"
                else:
                    raise ValueError("不允许压缩包设备或特殊文件")
                target = check(member.name, member.size, kind)
                if kind == "link":
                    links[target] = link_target(target, member.linkname, hard=member.islnk())
                tar_entries.append((member, target, kind))
            check_parents()
            for member, target, kind in tar_entries:
                if kind == "directory":
                    target.mkdir(parents=True, exist_ok=True)
                elif kind == "file":
                    target.parent.mkdir(parents=True, exist_ok=True)
                    tar_source = tar_package.extractfile(member)
                    if tar_source is None:
                        raise ValueError("无法读取压缩包文件")
                    with tar_source, target.open("wb") as output:
                        shutil.copyfileobj(tar_source, output)
                    if member.mode & 0o111:
                        target.chmod(0o755)

    materialized: set[Path] = set()
    for alias in links:
        chain: list[Path] = []
        visiting: set[Path] = set()
        source_path = alias
        while source_path in links and source_path not in materialized:
            if source_path in visiting:
                raise ValueError("压缩包链接包含循环")
            visiting.add(source_path)
            chain.append(source_path)
            source_path = links[source_path]
        if kinds.get(source_path) != "file" and source_path not in materialized:
            raise ValueError("压缩包链接必须指向归档内的普通文件")
        for target in reversed(chain):
            # Copy aliases rather than creating OS links: Windows needs no link
            # privilege, and no later extraction can traverse a symlink directory.
            charge(source_path.stat().st_size)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, target)
            materialized.add(target)
            source_path = target


def normalize_runtime_root(generation: Path) -> None:
    """Flatten the single wrapper used by official macOS runtime archives."""
    generation = fs_path(generation).resolve()

    def is_runtime(path: Path) -> bool:
        return (path / "resource" / "version.json").is_file() and any(
            (path / name).is_file() for name in ("MaaCore.dll", "libMaaCore.so", "libMaaCore.dylib")
        )

    if is_runtime(generation):
        return
    entries = list(generation.iterdir())
    if (
        len(entries) != 1
        or entries[0].is_symlink()
        or not entries[0].is_dir()
        or not is_runtime(entries[0])
    ):
        raise ValueError("核心归档必须包含平铺运行库或唯一的运行库外目录")
    wrapper = entries[0]
    children = list(wrapper.iterdir())
    if any((generation / child.name).exists() for child in children):
        raise ValueError("核心归档外目录展开存在路径冲突")
    for child in children:
        child.rename(generation / child.name)
    wrapper.rmdir()
