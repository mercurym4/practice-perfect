#!/usr/bin/env python3
"""Export the fixed candidate public snapshot as canonical bounded JSON bytes."""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import re
import sys

from candidate_site_snapshot import CandidateSiteSnapshot, CANDIDATE_PUBLIC_PATHS
from immutable_site_baseline import BaselineError

MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_TOTAL_BYTES = 16 * 1024 * 1024
MAX_JSON_BYTES = 24 * 1024 * 1024
REPOSITORY = "mercurym4/practice-perfect"
SOURCE = "authenticated-local-git-object-chain"
SCHEMA = "pp-candidate-public-snapshot"
SELECTED_INVENTORY_SHA256 = "d8c9bada27a55ed1b6319e53674f794e048de15874f33f2a3ba05af62570d73b"
_HEX40 = re.compile(r"[0-9a-f]{40}\Z")
_HEX64 = re.compile(r"[0-9a-f]{64}\Z")


def _blob(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def build_snapshot(repository: str, commit: str) -> bytes:
    """No policy, path, pin, source or environment override is accepted."""
    if not isinstance(commit, str) or not _HEX40.fullmatch(commit):
        raise BaselineError("Full candidate commit required")
    candidate = CandidateSiteSnapshot(repository, commit)
    inventory = candidate.inventory()
    keys = {"schema", "repository", "candidate_commit", "candidate_tree",
            "selected_inventory_sha256", "source", "file_count", "total_bytes",
            "files", "renderer_verified", "visual_acceptance", "deployment_verified"}
    if (not isinstance(inventory, dict) or set(inventory) != keys
            or type(inventory["schema"]) is not int or inventory["schema"] != 1
            or inventory["repository"] != REPOSITORY
            or inventory["candidate_commit"] != commit
            or not isinstance(inventory["candidate_tree"], str)
            or not _HEX40.fullmatch(inventory["candidate_tree"])
            or inventory["selected_inventory_sha256"] != SELECTED_INVENTORY_SHA256
            or inventory["source"] != SOURCE
            or inventory["renderer_verified"] is not False
            or inventory["visual_acceptance"] is not False
            or inventory["deployment_verified"] is not False
            or type(inventory["file_count"]) is not int or inventory["file_count"] != 84
            or type(inventory["total_bytes"]) is not int
            or not 0 <= inventory["total_bytes"] <= MAX_TOTAL_BYTES
            or not isinstance(inventory["files"], list) or len(inventory["files"]) != 84
            or len(CANDIDATE_PUBLIC_PATHS) != 84):
        raise BaselineError("Candidate envelope inventory refused")
    rows = []
    total = 0
    for path, entry in zip(sorted(CANDIDATE_PUBLIC_PATHS), inventory["files"], strict=True):
        if (not isinstance(entry, dict)
                or set(entry) != {"path", "git_blob", "mode", "size", "sha256"}
                or entry["path"] != path or entry["mode"] not in ("100644", "100755")
                or not isinstance(entry["git_blob"], str) or not _HEX40.fullmatch(entry["git_blob"])
                or not isinstance(entry["sha256"], str) or not _HEX64.fullmatch(entry["sha256"])
                or type(entry["size"]) is not int or not 0 <= entry["size"] <= MAX_FILE_BYTES):
            raise BaselineError("Candidate envelope entry refused")
        data = candidate.read(path)
        if not isinstance(data, bytes):
            raise BaselineError("Candidate envelope requires literal bytes")
        total += len(data)
        if (total > MAX_TOTAL_BYTES or len(data) != entry["size"]
                or hashlib.sha256(data).hexdigest() != entry["sha256"]
                or _blob(data) != entry["git_blob"]):
            raise BaselineError("Candidate envelope byte identity refused")
        rows.append([path, entry["mode"], entry["git_blob"], len(data),
                     entry["sha256"], base64.b64encode(data).decode("ascii")])
    mapping = json.dumps([[r[0], r[1], r[2]] for r in rows],
                         ensure_ascii=True, separators=(",", ":")).encode("ascii")
    if (hashlib.sha256(mapping).hexdigest() != SELECTED_INVENTORY_SHA256
            or total != inventory["total_bytes"]):
        raise BaselineError("Candidate envelope fixed mapping/total refused")
    # Arrays exclude duplicate object keys. These consumer flags deliberately do
    # not claim that Node has authenticated a raw commit/tree chain.
    value = [SCHEMA, 1, REPOSITORY, commit, inventory["candidate_tree"],
             SELECTED_INVENTORY_SHA256, SOURCE, True, False, False, False, 84, total, rows]
    encoded = json.dumps(value, ensure_ascii=True, separators=(",", ":")).encode("ascii") + b"\n"
    if len(encoded) > MAX_JSON_BYTES:
        raise BaselineError("Candidate envelope JSON budget refused")
    return encoded


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--commit", required=True)
    args = parser.parse_args(argv)
    try:
        output = build_snapshot(args.repository, args.commit)
    except (BaselineError, OSError, ValueError):
        print("Candidate snapshot envelope refused", file=sys.stderr)
        return 1
    sys.stdout.buffer.write(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
