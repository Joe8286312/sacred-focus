#!/usr/bin/env python3
"""Snapshot helpers must include every account and publish nothing on partial failure."""
import json
from contextlib import closing
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
UUID = "12345678-1234-4234-8234-123456789abc"
FILENAME = "app_backup_20261014_120000.db"


class DatabaseBackupTest(unittest.TestCase):
    def setUp(self):
        temporary_root = ROOT / ".tmp" / "backup-tests"
        temporary_root.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="sacred backup 'quote' ", dir=temporary_root)
        self.data = pathlib.Path(self.temporary.name)
        self.connections = []
        for account, relative in [("admin", "app.db"), ("public", "accounts/public/app.db"), (UUID, "accounts/" + UUID + "/app.db")]:
            source = self.data / relative
            source.parent.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(source)
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE example (account TEXT)")
            connection.execute("INSERT INTO example VALUES (?)", (account,))
            connection.commit()
            self.connections.append(connection)

    def tearDown(self):
        for connection in self.connections:
            connection.close()
        self.temporary.cleanup()

    def run_helper(self, runtime):
        if runtime == "python":
            return subprocess.run([sys.executable, str(ROOT / "scripts/lib/backup-databases.py"), str(self.data), FILENAME], capture_output=True, text=True)
        node = shutil.which("node")
        if not node:
            self.skipTest("Node runtime unavailable")
        source = (ROOT / "scripts/lib/backup-databases.cjs").read_text(encoding="utf-8")
        return subprocess.run([node, "-", str(self.data), FILENAME], input=source, capture_output=True, text=True, cwd=ROOT)

    def assert_snapshot(self, runtime):
        result = self.run_helper(runtime)
        self.assertEqual(result.returncode, 0, result.stderr)
        output = self.data / "backup"
        manifest = json.loads((output / (FILENAME + ".manifest.json")).read_text(encoding="utf-8"))
        self.assertEqual({item["accountId"] for item in manifest["databases"]}, {"admin", "public", UUID})
        for item in manifest["databases"]:
            with closing(sqlite3.connect(output / item["snapshot"])) as snapshot:
                self.assertEqual(snapshot.execute("PRAGMA quick_check").fetchall(), [("ok",)])
                self.assertEqual(snapshot.execute("SELECT account FROM example").fetchone(), (item["accountId"],))

    def assert_partial_failure(self, runtime):
        self.connections.pop().close()
        source = self.data / "accounts" / UUID / "app.db"
        source.write_bytes(b"corrupt database")
        result = self.run_helper(runtime)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(list((self.data / "backup").iterdir()), [])
        self.assertEqual(source.read_bytes(), b"corrupt database")

    def test_python_snapshots_all_databases_with_live_wal_and_quoted_paths(self):
        self.assert_snapshot("python")

    def test_node_snapshots_all_databases_with_live_wal_and_quoted_paths(self):
        self.assert_snapshot("node")

    def test_python_publishes_nothing_if_one_account_is_corrupt(self):
        self.assert_partial_failure("python")

    def test_node_publishes_nothing_if_one_account_is_corrupt(self):
        self.assert_partial_failure("node")


if __name__ == "__main__":
    unittest.main()
