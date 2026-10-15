#!/usr/bin/env python3
"""Export the immutable approved-main public snapshot to canonical bounded JSON."""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import sys

from immutable_site_baseline import (
    ApprovedMainBaseline, BaselineError, BASELINE_COMMIT, BASELINE_TREE,
    PUBLIC_PATHS, SELECTED_INVENTORY_SHA256,
)

MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_TOTAL_BYTES = 16 * 1024 * 1024
MAX_JSON_BYTES = 24 * 1024 * 1024
REPOSITORY = "mercurym4/practice-perfect"
SOURCE = "literal-local-git-objects"
SCHEMA = "pp-approved-main-snapshot"


def _sha1_blob(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def build_snapshot(repository: str) -> bytes:
    """Fixed production pins only; there is no policy, ref, path or environment override."""
    baseline = ApprovedMainBaseline(repository)
    inventory = baseline.inventory()
    expected_keys = {"schema", "repository", "baseline_commit", "baseline_tree",
                     "selected_inventory_sha256", "source", "file_count", "total_bytes",
                     "files", "visual_acceptance", "deployment_verified"}
    if (not isinstance(inventory, dict) or set(inventory) != expected_keys
            or type(inventory["schema"]) is not int or inventory["schema"] != 1
            or inventory["repository"] != REPOSITORY
            or inventory["baseline_commit"] != BASELINE_COMMIT
            or inventory["baseline_tree"] != BASELINE_TREE
            or inventory["selected_inventory_sha256"] != SELECTED_INVENTORY_SHA256
            or inventory["source"] != SOURCE
            or inventory["visual_acceptance"] is not False
            or inventory["deployment_verified"] is not False
            or type(inventory["file_count"]) is not int
            or inventory["file_count"] != 83
            or type(inventory["total_bytes"]) is not int
            or not 0 <= inventory["total_bytes"] <= MAX_TOTAL_BYTES
            or not isinstance(inventory["files"], list)
            or len(inventory["files"]) != 83):
        raise BaselineError("Snapshot inventory contract refused")
    rows = []
    total = 0
    paths = sorted(PUBLIC_PATHS)
    for path, entry in zip(paths, inventory["files"], strict=True):
        if (not isinstance(entry, dict)
                or set(entry) != {"path", "git_blob", "mode", "size", "sha256"}
                or entry["path"] != path or entry["mode"] not in ("100644", "100755")
                or type(entry["size"]) is not int or not 0 <= entry["size"] <= MAX_FILE_BYTES):
            raise BaselineError("Snapshot entry contract refused")
        data = baseline.read(path)
        if not isinstance(data, bytes):
            raise BaselineError("Snapshot requires literal bytes")
        total += len(data)
        if (total > MAX_TOTAL_BYTES or len(data) != entry["size"]
                or hashlib.sha256(data).hexdigest() != entry["sha256"]
                or _sha1_blob(data) != entry["git_blob"]):
            raise BaselineError("Snapshot byte identity/budget refused")
        rows.append([path, entry["mode"], entry["git_blob"], len(data),
                     entry["sha256"], base64.b64encode(data).decode("ascii")])
    mapping = [[row[0], row[1], row[2]] for row in rows]
    mapping_bytes = json.dumps(mapping, ensure_ascii=True, separators=(",", ":")).encode("ascii")
    if hashlib.sha256(mapping_bytes).hexdigest() != SELECTED_INVENTORY_SHA256:
        raise BaselineError("Snapshot selected path mapping refused")
    if total != inventory["total_bytes"]:
        raise BaselineError("Snapshot total refused")
    # Positional arrays only: duplicate object keys cannot be represented.
    result = [SCHEMA, 1, REPOSITORY, BASELINE_COMMIT, BASELINE_TREE,
              SELECTED_INVENTORY_SHA256, SOURCE, False, False, 83, total, rows]
    encoded = json.dumps(result, ensure_ascii=True, separators=(",", ":")).encode("ascii") + b"\n"
    if len(encoded) > MAX_JSON_BYTES:
        raise BaselineError("Snapshot JSON budget refused")
    return encoded


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True,
                        help="Local repository with the pinned approved-main Git objects")
    arguments = parser.parse_args(argv)
    try:
        output = build_snapshot(arguments.repository)
    except (BaselineError, OSError, ValueError) as exc:
        # Do not expose repository data or Git stderr.
        print("Approved-main snapshot refused", file=sys.stderr)
        return 1
    sys.stdout.buffer.write(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

