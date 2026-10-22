"""Exercise cleanup against disposable repositories, never the project repository."""

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "clean-codex-worktrees.py"


class CleanupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="maaverge-codex-cleanup-")
        self.root = Path(self.temporary.name).resolve()
        self.assertEqual(self.root.parent, Path(tempfile.gettempdir()).resolve())
        self.addCleanup(self.temporary.cleanup)
        self.repo = self.root / "repository"
        self.repo.mkdir()
        self.env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        self.env.update(
            PYTHONUTF8="1",
            GIT_CONFIG_NOSYSTEM="1",
            GIT_CONFIG_GLOBAL=os.devnull,
            GIT_AUTHOR_NAME="Fixture",
            GIT_AUTHOR_EMAIL="fixture@example.invalid",
            GIT_COMMITTER_NAME="Fixture",
            GIT_COMMITTER_EMAIL="fixture@example.invalid",
        )
        self.git("init", "-q", "-b", "main")
        self.git("commit", "-q", "--allow-empty", "-m", "fixture")

    def git(self, *args: str, cwd: Path | None = None) -> str:
        result = subprocess.run(
            ["git", "-C", str(cwd or self.repo), *args],
            env=self.env,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        return result.stdout

    def clean(self, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--repo", str(self.repo), *args],
            env=self.env,
            cwd=cwd or self.root,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )

    def names(self) -> set[str]:
        return set(self.git("for-each-ref", "--format=%(refname:short)", "refs/heads").splitlines())

    def add_worktree(self, branch: str, folder: str) -> Path:
        target = self.root / folder
        self.git("worktree", "add", "-q", "-b", branch, str(target))
        return target

    def test_branch_only_repository_and_main_ancestry_ignore_upstream(self) -> None:
        self.git("branch", "codex/merged")
        self.git("branch", "feature/keep")
        self.git("switch", "-q", "-c", "codex/unmerged")
        self.git("commit", "-q", "--allow-empty", "-m", "unmerged")
        self.git("branch", "upstream-ahead")
        self.git("switch", "-q", "main")
        self.git("branch", "--set-upstream-to=upstream-ahead", "codex/unmerged")
        self.git("branch", "--set-upstream-to=upstream-ahead", "codex/merged")
        before = self.names()
        preview = self.clean("--dry-run", "--force")
        self.assertEqual(preview.returncode, 0, preview.stderr)
        self.assertIn("codex/merged", preview.stdout)
        self.assertIn("codex/unmerged", preview.stdout)
        self.assertEqual(self.names(), before)
        result = self.clean()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("codex/merged", self.names())
        self.assertIn("codex/unmerged", self.names())
        forced = self.clean("--force")
        self.assertEqual(forced.returncode, 0, forced.stderr)
        self.assertNotIn("codex/unmerged", self.names())
        self.assertEqual(self.names(), {"main", "feature/keep", "upstream-ahead"})

    def test_worktree_cleanup_preserves_occupied_branches_and_current_directory(self) -> None:
        clean = self.add_worktree("codex/clean", "clean \u6d4b\u8bd5 with spaces")
        dirty = self.add_worktree("codex/dirty", "dirty")
        locked = self.add_worktree("codex/locked", "locked")
        current = self.add_worktree("codex/current", "current")
        nested = current / "nested"
        nested.mkdir()
        (dirty / "untracked.txt").write_text("fixture", encoding="utf-8")
        self.git("worktree", "lock", str(locked))
        self.git("branch", "-m", "codex/primary")
        before = self.git("worktree", "list", "--porcelain", "-z")
        preview = self.clean("--dry-run", "--force", cwd=nested)
        self.assertEqual(preview.returncode, 0, preview.stderr)
        self.assertEqual(self.git("worktree", "list", "--porcelain", "-z"), before)
        self.assertTrue(all(path.exists() for path in [clean, dirty, locked, current]))
        result = self.clean("--force", cwd=nested)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertFalse(clean.exists())
        self.assertFalse(dirty.exists())
        self.assertTrue(locked.exists())
        self.assertTrue(current.exists())
        self.assertTrue(self.repo.exists())
        self.assertEqual(self.names(), {"codex/locked", "codex/current", "codex/primary"})

    def test_worktrees_only_retains_local_branches_and_detached_worktrees(self) -> None:
        target = self.add_worktree("codex/clean", "clean")
        detached = self.root / "detached"
        self.git("worktree", "add", "-q", "--detach", str(detached))
        result = self.clean("--worktrees-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(target.exists())
        self.assertTrue(detached.exists())
        self.assertIn("codex/clean", self.names())

    def test_dirty_worktree_and_its_branch_are_preserved_by_default(self) -> None:
        target = self.add_worktree("codex/dirty", "dirty")
        (target / "untracked.txt").write_text("fixture", encoding="utf-8")
        before = self.git("worktree", "list", "--porcelain", "-z")
        preview = self.clean("--dry-run")
        self.assertEqual(preview.returncode, 0, preview.stderr)
        self.assertEqual(self.git("worktree", "list", "--porcelain", "-z"), before)
        result = self.clean()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertTrue(target.exists())
        self.assertIn("codex/dirty", self.names())

    def test_missing_main_preserves_branches(self) -> None:
        self.git("branch", "codex/keep")
        self.git("branch", "-m", "trunk")
        result = self.clean()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(self.names(), {"trunk", "codex/keep"})


if __name__ == "__main__":
    unittest.main()
