"""Cross-process data-root leases shared by the Python reference and Bun service."""

import json
import os
import queue
import shutil
import sqlite3
import subprocess
import sys
import threading
from pathlib import Path

import pytest
from maaverge_runtime.storage import Store

REPO = Path(__file__).resolve().parents[2]
STORE_MODULE = (REPO / "services/backend/src/storage.ts").as_uri()
PYTHON_HOLD = """
import sys
from pathlib import Path
from maaverge_runtime.storage import Store
store = Store(Path(sys.argv[1]))
print('{"ready":true}', flush=True)
sys.stdin.read()
store.close()
"""


def environment(root):
    excluded = {
        "NODE_OPTIONS", "NODE_PATH", "BUN_OPTIONS", "BUN_BE_BUN", "BUN_INSTALL",
        "BUN_RUNTIME_TRANSPILER_CACHE_PATH",
    }
    result = {key: value for key, value in os.environ.items() if key.upper() not in excluded}
    result.update(
        PYTHONPATH=str(REPO / "services/runtime"),
        MAAVERGE_MODE="mock",
        MAAVERGE_DATA_DIR=str(root),
        MAAVERGE_DEVICE_LOCK_DIR=str(root / "device-locks"),
        PYTHONIOENCODING="utf-8",
    )
    return result


def bun_executable():
    local = REPO / ".tools/bun" / ("bun.exe" if sys.platform == "win32" else "bun")
    executable = str(local) if local.is_file() else shutil.which("bun")
    if executable is None:
        pytest.skip("Bun is unavailable; Python-only lease checks still run")
    return executable


def seed(root):
    store = Store(root)
    try:
        store.put("plan", "z", {"id": "z", "value": "first"})
        store.put("plan", "a", {"id": "a", "value": "second"})
        store.put("plan", "z", {"id": "z", "value": "updated"})
        store.event("seed", "原始事件")
    finally:
        store.close()


def database_image(root):
    return {
        name: (root / name).read_bytes() if (root / name).exists() else None
        for name in ("maaverge.sqlite3", "maaverge.sqlite3-wal")
    }


def test_python_lease_rejects_a_second_store_before_business_writes(tmp_path):
    seed(tmp_path)
    owner = Store(tmp_path)
    try:
        original = database_image(tmp_path)
        with pytest.raises(sqlite3.OperationalError, match="locked"):
            Store(tmp_path)
        assert database_image(tmp_path) == original
        assert owner.all("plan") == [
            {"id": "z", "value": "updated"}, {"id": "a", "value": "second"},
        ]
        assert owner.event("owner", "失败竞争后仍可写入")["id"] == 2
    finally:
        owner.close()
    recovered = Store(tmp_path)
    try:
        assert recovered.event("recovered", "正常释放后重获")["id"] == 3
    finally:
        recovered.close()


def test_lost_lease_stops_python_business_reads_and_writes(tmp_path):
    store = Store(tmp_path)
    try:
        store.put("plan", "original", {"id": "original"})
        store.lease.rollback()
        with pytest.raises(RuntimeError, match="数据目录锁已失效"):
            store.put("plan", "intruder", {})
        with pytest.raises(RuntimeError, match="数据目录锁已失效"):
            store.all("plan")
    finally:
        store.close()
    recovered = Store(tmp_path)
    try:
        assert recovered.all("plan") == [{"id": "original"}]
    finally:
        recovered.close()


def wait_ready(child):
    messages = queue.Queue()
    reader = threading.Thread(target=lambda: messages.put(child.stdout.readline()), daemon=True)
    reader.start()
    try:
        line = messages.get(timeout=10)
    except queue.Empty:
        pytest.fail("lease owner did not report readiness")
    assert line, f"lease owner exited before readiness: {child.poll()}"
    assert json.loads(line) == {"ready": True}
    assert child.poll() is None


def run_probe(command, root):
    result = subprocess.run(
        command, cwd=REPO, env=environment(root), input="", capture_output=True,
        text=True, encoding="utf-8", timeout=10,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.mark.parametrize("owner_kind", ["python", "bun"])
def test_cross_language_lease_excludes_writers_and_recovers_after_owner_crash(tmp_path, owner_kind):
    bun = bun_executable()
    seed(tmp_path)
    bun_hold = (
        f"import {{ Store }} from {json.dumps(STORE_MODULE)};"
        f"const store = new Store({json.dumps(str(tmp_path))});"
        "console.log('{\"ready\":true}'); process.stdin.resume();"
        "process.stdin.on('end', () => store.close());"
    )
    command = (
        [sys.executable, "-c", PYTHON_HOLD, str(tmp_path)]
        if owner_kind == "python" else [bun, "--eval", bun_hold]
    )
    child = subprocess.Popen(
        command, cwd=REPO, env=environment(tmp_path), stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8",
    )
    try:
        wait_ready(child)
        original = database_image(tmp_path)
        backup = tmp_path / "pre-typescript.sqlite3"
        original_backup = backup.read_bytes() if backup.exists() else None
        if owner_kind == "python":
            contender = (
                f"import {{ Store }} from {json.dumps(STORE_MODULE)};"
                "let rejected = false; try {"
                f" const store = new Store({json.dumps(str(tmp_path))});"
                " store.put('plan', 'intruder', {}); store.close();"
                "} catch (error) {"
                " if (!String(error).includes('其他本地服务')) throw error; rejected = true;"
                "} if (!rejected) throw Error('unexpected concurrent ownership');"
                "console.log(JSON.stringify({locked: true}));"
            )
            assert run_probe([bun, "--eval", contender], tmp_path) == {"locked": True}
        else:
            contender = """
import json, sqlite3, sys
from pathlib import Path
from maaverge_runtime.storage import Store
try:
    store = Store(Path(sys.argv[1]))
except sqlite3.OperationalError:
    print(json.dumps({'locked': True}))
else:
    store.put('plan', 'intruder', {})
    store.close()
    raise RuntimeError('unexpected concurrent ownership')
"""
            assert run_probe(
                [sys.executable, "-c", contender, str(tmp_path)], tmp_path
            ) == {"locked": True}
        assert child.poll() is None
        assert database_image(tmp_path) == original
        assert (backup.read_bytes() if backup.exists() else None) == original_backup
        # Forceful termination bypasses Store.close; the OS must release the lease.
        child.kill()
        child.communicate(timeout=5)
        if owner_kind == "python":
            inspect = (
                f"import {{ Store }} from {json.dumps(STORE_MODULE)};"
                f"const store = new Store({json.dumps(str(tmp_path))});"
                "console.log(JSON.stringify({rows: store.all('plan'),"
                " eventId: store.event('recovered', 'recovered').id})); store.close();"
            )
            recovered = run_probe([bun, "--eval", inspect], tmp_path)
        else:
            inspect = """
import json, sys
from pathlib import Path
from maaverge_runtime.storage import Store
store = Store(Path(sys.argv[1]))
print(json.dumps({'rows': store.all('plan'), 'eventId': store.event('recovered', 'ok')['id']}))
store.close()
"""
            recovered = run_probe([sys.executable, "-c", inspect, str(tmp_path)], tmp_path)
        assert recovered == {
            "rows": [{"id": "z", "value": "updated"}, {"id": "a", "value": "second"}],
            "eventId": 2,
        }
    finally:
        if child.poll() is None:
            child.kill()
        child.communicate(timeout=5)
