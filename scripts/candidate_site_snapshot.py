#!/usr/bin/env python3
"""Read a fixed candidate public snapshot through authenticated local Git-object chains."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

from immutable_site_baseline import PUBLIC_PATHS, BaselineError, _Git, _object_hash

CANDIDATE_PUBLIC_PATHS = frozenset((*PUBLIC_PATHS, "mobile-menu.js"))
MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_TOTAL_BYTES = 16 * 1024 * 1024
MAX_METADATA_BYTES = 2 * 1024 * 1024
MAX_METADATA_OBJECT_BYTES = 512 * 1024
_HEX = re.compile(r"[0-9a-f]{40}\Z")
_TREE_HEADER = re.compile(rb"tree ([0-9a-f]{40})\Z")
_MODES = {b"40000", b"100644", b"100755", b"120000", b"160000"}


class CandidateSnapshotError(BaselineError):
    """Fail-closed candidate identity, path, object or budget refusal."""


def _parse_tree(data: bytes) -> dict[bytes, tuple[str, str]]:
    """Parse authenticated binary tree data, without normalizing raw entry names."""
    entries = {}
    offset = 0
    previous = None
    while offset < len(data):
        space = data.find(b" ", offset)
        if space < 0:
            raise CandidateSnapshotError("Malformed binary tree mode")
        mode = data[offset:space]
        nul = data.find(b"\0", space + 1)
        if nul < 0 or nul + 21 > len(data):
            raise CandidateSnapshotError("Truncated binary tree entry")
        name = data[space + 1:nul]
        if (mode not in _MODES or not name or len(name) > 255 or b"/" in name
                or name in (b".", b"..") or name in entries):
            raise CandidateSnapshotError("Invalid or duplicate binary tree entry")
        # Git sorts directories as if a slash followed the raw name.
        sort_key = name + (b"/" if mode == b"40000" else b"")
        if previous is not None and sort_key <= previous:
            raise CandidateSnapshotError("Noncanonical binary tree ordering")
        previous = sort_key
        oid = data[nul + 1:nul + 21].hex()
        entries[name] = (mode.decode("ascii"), oid)
        offset = nul + 21
    return entries


class CandidateSiteSnapshot:
    """Fixed 84 public paths at a required full commit OID; no ref/worktree fallback."""
    def __init__(self, repository: str | Path, commit: str):
        if not isinstance(commit, str) or not _HEX.fullmatch(commit):
            raise CandidateSnapshotError("Expected full lowercase candidate commit required")
        self._commit_oid = commit
        self._git = _Git(Path(repository).resolve())
        self._metadata_reserved = 0
        self._blob_reserved = 0
        self._trees: dict[str, dict[bytes, tuple[str, str]]] = {}
        self._cache: dict[str, bytes] = {}
        raw_commit = self._metadata(["cat-file", "commit", commit], MAX_METADATA_OBJECT_BYTES)
        if _object_hash("commit", raw_commit) != commit:
            raise CandidateSnapshotError("Candidate commit identity mismatch")
        if b"\n\n" not in raw_commit:
            raise CandidateSnapshotError("Malformed candidate commit headers")
        headers = raw_commit.split(b"\n\n", 1)[0].split(b"\n")
        match = _TREE_HEADER.fullmatch(headers[0])
        if not match or any(line.startswith(b"tree ") for line in headers[1:]):
            raise CandidateSnapshotError("Candidate first/unique tree header required")
        self._tree_oid = match.group(1).decode("ascii")
        self._tree(self._tree_oid)
        self._entries: dict[str, tuple[str, str]] = {}
        for path in sorted(CANDIDATE_PUBLIC_PATHS):
            components = path.encode("ascii").split(b"/")
            oid = self._tree_oid
            for index, component in enumerate(components):
                entry = self._tree(oid).get(component)
                if entry is None:
                    raise CandidateSnapshotError("Candidate public path missing")
                mode, oid = entry
                if index < len(components) - 1:
                    if mode != "40000":
                        raise CandidateSnapshotError("Candidate ancestor is not a tree")
                    self._tree(oid)  # Authenticate this raw child before following its mapping.
                elif mode not in ("100644", "100755"):
                    raise CandidateSnapshotError("Candidate leaf is not a regular blob")
            self._entries[path] = (mode, oid)
        canonical = json.dumps([[path, *self._entries[path]] for path in sorted(self._entries)],
                               ensure_ascii=True, separators=(",", ":")).encode("ascii")
        self._mapping_sha256 = hashlib.sha256(canonical).hexdigest()

    @property
    def commit(self) -> str:
        return self._commit_oid

    @property
    def tree(self) -> str:
        return self._tree_oid

    @property
    def selected_inventory_sha256(self) -> str:
        return self._mapping_sha256

    def _metadata(self, arguments: list[str], cap: int) -> bytes:
        remaining = MAX_METADATA_BYTES - self._metadata_reserved
        allowance = min(cap, remaining)
        if allowance <= 0:
            raise CandidateSnapshotError("Candidate metadata budget exhausted")
        # Failed reads retain the entire reservation, so repeated failures cannot
        # reset aggregate budgets. Successful reads refund only unused allowance.
        self._metadata_reserved += allowance
        data = self._git.run(arguments, allowance)
        if not isinstance(data, bytes) or len(data) > allowance:
            raise CandidateSnapshotError("Candidate metadata output exceeded bound")
        self._metadata_reserved -= allowance - len(data)
        return data

    def _tree(self, oid: str) -> dict[bytes, tuple[str, str]]:
        if oid not in self._trees:
            data = self._metadata(["cat-file", "tree", oid], MAX_METADATA_OBJECT_BYTES)
            if _object_hash("tree", data) != oid:
                raise CandidateSnapshotError("Candidate tree identity mismatch")
            self._trees[oid] = _parse_tree(data)
        return self._trees[oid]

    def read(self, path: str) -> bytes:
        if not isinstance(path, str) or path not in CANDIDATE_PUBLIC_PATHS:
            raise CandidateSnapshotError("Path outside candidate public allowlist")
        if path in self._cache:
            return self._cache[path]  # bytes are immutable; no mutable buffer escapes.
        oid = self._entries[path][1]
        size_output = self._metadata(["cat-file", "-s", oid], 32)
        if not re.fullmatch(rb"(0|[1-9][0-9]*)\n", size_output):
            raise CandidateSnapshotError("Invalid candidate blob size")
        size = int(size_output)
        if size > MAX_FILE_BYTES or size > MAX_TOTAL_BYTES - self._blob_reserved:
            raise CandidateSnapshotError("Candidate blob byte budget exceeded")
        self._blob_reserved += size
        data = self._git.run(["cat-file", "blob", oid], size)
        if (not isinstance(data, bytes) or len(data) != size
                or _object_hash("blob", data) != oid):
            # Keep size reserved on read/identity failure, including caller retries.
            raise CandidateSnapshotError("Candidate literal blob identity/size mismatch")
        self._cache[path] = data
        return data

    def inventory(self) -> dict:
        files = []
        for path in sorted(CANDIDATE_PUBLIC_PATHS):
            data = self.read(path)
            mode, oid = self._entries[path]
            files.append({"path": path, "mode": mode, "git_blob": oid,
                          "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        return {"schema": 1, "repository": "mercurym4/practice-perfect",
                "candidate_commit": self._commit_oid, "candidate_tree": self._tree_oid,
                "selected_inventory_sha256": self._mapping_sha256,
                "source": "authenticated-local-git-object-chain",
                "file_count": len(files), "total_bytes": sum(row["size"] for row in files),
                "files": files, "renderer_verified": False,
                "visual_acceptance": False, "deployment_verified": False}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True,
                        help="Local repository containing the exact candidate commit objects")
    parser.add_argument("--commit", required=True,
                        help="Full lowercase 40-hex expected candidate commit, not a ref")
    arguments = parser.parse_args(argv)
    try:
        result = CandidateSiteSnapshot(arguments.repository, arguments.commit).inventory()
    except (BaselineError, OSError, ValueError):
        print("Candidate public snapshot refused", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

