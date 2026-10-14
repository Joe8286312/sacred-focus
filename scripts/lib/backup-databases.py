#!/usr/bin/env python3
"""Online SQLite snapshots for the administrator and every existing account DB."""
import datetime
import json
import os
import pathlib
import re
import shutil
import sqlite3
import sys
import tempfile


def backup_databases(data_dir, filename):
    if not re.fullmatch(r"app_(backup|pre_update)_\d{8}_\d{6}\.db", filename):
        raise ValueError("Invalid backup filename")
    data_dir = pathlib.Path(data_dir).resolve()
    output_dir = data_dir / "backup"
    output_dir.mkdir(parents=True, exist_ok=True)
    accounts_name = filename[:-3] + "_accounts"
    final_paths = [output_dir / filename, output_dir / accounts_name, output_dir / (filename + ".manifest.json")]
    if any(item.exists() for item in final_paths):
        raise FileExistsError("Backup target already exists")
    sources = [("admin", data_dir / "app.db", filename)]
    accounts_dir = data_dir / "accounts"
    if accounts_dir.exists():
        if accounts_dir.is_symlink():
            raise ValueError("Account directory cannot be a symbolic link")
        for entry in sorted(accounts_dir.iterdir()):
            source = entry / "app.db"
            if not source.exists():
                continue
            if entry.is_symlink() or source.is_symlink() or not re.fullmatch(r"public|[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", entry.name):
                raise ValueError("Unexpected account database path")
            sources.append((entry.name, source, accounts_name + "/" + entry.name + "/app.db"))
    moved = []
    try:
        with tempfile.TemporaryDirectory(prefix="." + filename + ".tmp-", dir=output_dir) as temporary:
            stage = pathlib.Path(temporary)
            manifest = {"formatVersion": 1, "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "consistency": "per-database", "method": "python-sqlite-online", "databases": []}
            for account_id, source, relative_target in sources:
                if source.is_symlink() or not source.is_file():
                    raise ValueError("Missing or invalid source database")
                target = stage / relative_target
                target.parent.mkdir(parents=True, exist_ok=True)
                source_connection = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=5)
                target_connection = sqlite3.connect(target)
                try:
                    source_connection.backup(target_connection)
                    if target_connection.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                        raise ValueError("Backup integrity check failed")
                finally:
                    target_connection.close()
                    source_connection.close()
                os.chmod(target, 0o600)
                manifest["databases"].append({"accountId": account_id, "source": source.relative_to(data_dir).as_posix(), "snapshot": relative_target})
            manifest_path = stage / (filename + ".manifest.json")
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            os.chmod(manifest_path, 0o600)
            # Root snapshot is the completion marker and is published last.
            for item in [stage / accounts_name, manifest_path, stage / filename]:
                if item.exists():
                    final = output_dir / item.name
                    os.replace(item, final)
                    moved.append(final)
    except BaseException:
        for item in reversed(moved):
            shutil.rmtree(item) if item.is_dir() else item.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    try:
        backup_databases(sys.argv[1], sys.argv[2])
    except Exception as error:
        print("SQLite backup failed: " + str(error), file=sys.stderr)
        # Runtime is present: a source/snapshot failure must not turn into an unchecked cold copy.
        sys.exit(2)
