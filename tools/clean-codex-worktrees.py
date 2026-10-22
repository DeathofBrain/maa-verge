#!/usr/bin/env python3
"""Remove codex/* linked Git worktrees and local branches."""

import argparse
import os
import subprocess
import sys
from pathlib import Path


def git(repo: Path, *arguments: str) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["git", "-C", str(repo), *arguments],
        capture_output=True,
        check=True,
    )


def worktrees(repo: Path) -> list[dict[str, str]]:
    records = []
    for block in git(repo, "worktree", "list", "--porcelain", "-z").stdout.split(b"\0\0"):
        record = {}
        for field in block.split(b"\0"):
            if field:
                key, _, value = field.partition(b" ")
                record[os.fsdecode(key)] = os.fsdecode(value)
        if "worktree" in record:
            records.append(record)
    return records


def error_text(error: OSError | subprocess.CalledProcessError) -> str:
    if isinstance(error, subprocess.CalledProcessError):
        return os.fsdecode(error.stderr or error.stdout or b"Git command failed").strip()
    return str(error)


def branches(repo: Path) -> dict[str, str]:
    output = git(
        repo, "for-each-ref", "--format=%(refname)%00%(objectname)", "refs/heads/codex/"
    ).stdout
    return {
        os.fsdecode(ref): os.fsdecode(oid)
        for line in output.splitlines()
        for ref, _, oid in [line.partition(b"\0")]
        if ref.startswith(b"refs/heads/codex/")
    }


def clean_branches(repo: Path, *, dry_run: bool, force: bool, planned: set[str]) -> int:
    candidates = branches(repo)
    print(f"找到 {len(candidates)} 个 codex/* 本地分支。")
    if not candidates:
        return 0
    base = None
    if not force:
        try:
            base = os.fsdecode(git(repo, "rev-parse", "--verify", "refs/heads/main").stdout).strip()
        except subprocess.CalledProcessError:
            print("未找到 main，无法核验合并状态；保留所有本地分支。", file=sys.stderr)
            return 1

    removed = failed = 0
    for ref, oid in candidates.items():
        name = ref.removeprefix("refs/heads/")
        try:
            occupied = [item for item in worktrees(repo) if item.get("branch") == ref]
            if occupied and not (dry_run and ref in planned):
                print(f"保留被工作区占用的分支：{name}")
                continue
            if base:
                try:
                    git(repo, "merge-base", "--is-ancestor", oid, base)
                except subprocess.CalledProcessError as error:
                    if error.returncode != 1:
                        raise
                    print(f"保留未合入 main 的分支：{name}（可用 --force 删除）")
                    continue
            if dry_run:
                suffix = "（先移除对应 worktree）" if occupied else ""
                print(f"将删除本地分支：{name}{suffix}")
                continue
            if branches(repo).get(ref) != oid:
                print(f"分支提交已变化，跳过：{name}", file=sys.stderr)
                failed += 1
                continue
            # The explicit main ancestry check above replaces Git's upstream-based
            # -d rule. Git still rejects -D for branches checked out in any worktree.
            git(repo, "branch", "-D", "--", name)
            print(f"已删除本地分支：{name}")
            removed += 1
        except (OSError, subprocess.CalledProcessError) as error:
            print(f"分支删除失败：{name}\n{error_text(error)}", file=sys.stderr)
            failed += 1
    if not dry_run:
        print(f"已删除 {removed} 个本地分支，失败 {failed} 个。")
    return failed


def main() -> int:
    parser = argparse.ArgumentParser(
        description="清理 codex/* worktree 和本地分支；默认保留未合入 main 的分支。"
    )
    parser.add_argument(
        "--repo",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="仓库路径，默认本脚本所在仓库",
    )
    parser.add_argument("--dry-run", action="store_true", help="仅列出目标，不执行删除")
    parser.add_argument(
        "--force", action="store_true", help="允许删除脏 worktree 和未合入 main 的本地分支"
    )
    parser.add_argument(
        "--worktrees-only", action="store_true", help="只清理 worktree，保留所有分支"
    )
    args = parser.parse_args()
    repo = args.repo.resolve()
    cwd = Path.cwd().resolve()
    try:
        records = worktrees(repo)
    except (OSError, subprocess.CalledProcessError) as error:
        print(error_text(error), file=sys.stderr)
        return 1

    removed = failed = matched = 0
    planned: set[str] = set()
    for record in records:
        if not record.get("branch", "").startswith("refs/heads/codex/"):
            continue
        target = Path(record["worktree"])
        if not target.is_absolute():
            print(f"拒绝非绝对路径：{target}", file=sys.stderr)
            failed += 1
            continue
        resolved = target.resolve()
        if record is records[0] or cwd == resolved or resolved in cwd.parents:
            print(f"保留主工作区或当前工作区：{target}")
            continue
        matched += 1
        branch = record["branch"].removeprefix("refs/heads/")
        try:
            if args.dry_run:
                if "locked" in record:
                    print(f"保留锁定的 worktree：{target}")
                elif not args.force and git(target, "status", "--porcelain", "-z").stdout:
                    print(f"保留含未提交文件的 worktree：{target}（可用 --force 删除）")
                else:
                    print(f"将删除 worktree：{target} [{branch}]")
                    planned.add(record["branch"])
                continue
            # Recheck the branch before removal in case another process switched it.
            current = next(
                (item for item in worktrees(repo) if item["worktree"] == record["worktree"]), None
            )
            if current is None or current.get("branch") != record["branch"]:
                print(f"工作区登记或分支已变化，跳过：{target}", file=sys.stderr)
                failed += 1
                continue
            git(repo, "worktree", "remove", *(["--force"] if args.force else []), "--", str(target))
            print(f"已删除：{target} [{branch}]")
            removed += 1
        except (OSError, subprocess.CalledProcessError) as error:
            print(f"删除失败：{target}\n{error_text(error)}", file=sys.stderr)
            failed += 1

    if not matched and not failed:
        print("没有可清理的 codex/* worktree。")
    elif not args.dry_run:
        print(f"已删除 {removed} 个 worktree，失败 {failed} 个。")
    if not args.worktrees_only:
        try:
            failed += clean_branches(repo, dry_run=args.dry_run, force=args.force, planned=planned)
        except (OSError, subprocess.CalledProcessError) as error:
            print(error_text(error), file=sys.stderr)
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
