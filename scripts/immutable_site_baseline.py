#!/usr/bin/env python3
"""Read literal approved-main public bytes from local Git objects, never a worktree."""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import subprocess
import sys
import time

BASELINE_COMMIT = "86894c29c5d02baad35b3cc47815d2d0ec06315e"
BASELINE_TREE = "f09903750fa6d6c8b6df16a7fe818bb92692154d"
PUBLIC_PATHS = frozenset({
    "about.html",
    "analytics.js",
    "approved-green.css",
    "assets/library/about/about-growth-dashboard.webp",
    "assets/library/about/executive-boardroom.webp",
    "assets/library/about/leadership-workshop.webp",
    "assets/library/general/practice-perfect-analytics-workspace.webp",
    "assets/library/general/practice-perfect-office-growth-dashboard.webp",
    "assets/library/general/practice-perfect-performance-dashboard.webp",
    "assets/library/heroes/home-growth-hero.webp",
    "assets/library/heroes/practice-perfect-boardroom-hero.webp",
    "assets/library/heroes/services-growth-hero.webp",
    "assets/library/home/approved-monitor-workspace.png",
    "assets/library/home/approved-mountain-cta.png",
    "assets/library/home/approved-office-hero.png",
    "assets/library/home/opportunity-to-measurable-growth-dashboard.png",
    "assets/library/logos/practice-perfect-logo.png",
    "assets/library/logos/practice-perfect-logo.svg",
    "assets/library/masters/approved-green-services-reference.png",
    "assets/library/masters/opportunity-to-measurable-growth-reference.png",
    "assets/library/masters/practice-perfect-analytics-workspace-master.png",
    "assets/library/masters/practice-perfect-analytics-workspace-master.webp",
    "assets/library/masters/practice-perfect-boardroom-master.png",
    "assets/library/masters/practice-perfect-boardroom-master.webp",
    "assets/library/masters/practice-perfect-logo-master.png",
    "assets/library/masters/practice-perfect-office-growth-dashboard-master.png",
    "assets/library/masters/practice-perfect-office-growth-dashboard-master.webp",
    "assets/library/masters/practice-perfect-performance-dashboard-master.webp",
    "assets/library/masters/services-monitor-sharp-v2.png",
    "assets/library/our-system/growth-system-dashboard.webp",
    "assets/library/pricing/scalable-growth-path.webp",
    "assets/library/services/analytics-workspace.webp",
    "assets/library/services/approved-monitor-reference.png",
    "assets/library/services/approved-mountain-reference.png",
    "assets/library/services/approved-office-reference.png",
    "assets/library/services/monitor-sharp-v2-1288.webp",
    "assets/library/services/monitor-sharp-v2-390.webp",
    "assets/library/services/monitor-sharp-v2-780.webp",
    "assets/library/what-we-fix/revenue-diagnostics.webp",
    "assets/services-analytics-workspace-green.webp",
    "assets/services-dashboard-visual.webp",
    "assets/services-office-banner.webp",
    "assets/services-office-sharp-final.webp",
    "contact-form.js",
    "contact.html",
    "enhancements.css",
    "hero-office.svg",
    "home-reference.css",
    "homepage.css",
    "index.html",
    "logo.png",
    "logo.svg",
    "our-system.html",
    "pricing-dashboard.css",
    "pricing.html",
    "resources.css",
    "resources.html",
    "resources/debt-defense-marketing-fit.html",
    "resources/focused-practice-growth-support.html",
    "resources/law-firm-intake-kpis.html",
    "resources/paid-traffic-client-conversations.html",
    "resources/personal-injury-lead-quality.html",
    "resources/practice-growth-feels-stuck.html",
    "resources/practice-search-visibility.html",
    "resources/sales-intake-leadership-support.html",
    "resources/website-losing-client-confidence.html",
    "robots.txt",
    "service-detail.css",
    "services-reference.css",
    "services.html",
    "services/debt-defense-direct-mail.html",
    "services/fractional-sales-leadership.html",
    "services/law-firm-intake-consulting.html",
    "services/pi-mva-lead-generation.html",
    "services/ppc-marketing.html",
    "services/practice-growth-audit.html",
    "services/revenue-growth-sprint.html",
    "services/seo-marketing.html",
    "services/website-audit-overhaul.html",
    "services/website-design.html",
    "sitemap.xml",
    "styles.css",
    "what-we-fix.html",
})
_HEX = re.compile(r"[0-9a-f]{40}\Z")
_MAX_FILE = 2 * 1024 * 1024
_MAX_TOTAL = 16 * 1024 * 1024
_MAX_METADATA = 512 * 1024
SELECTED_INVENTORY_SHA256 = "6378328e0fb0b02fab38e692b9b0f2706197a7eafa3f50aff14b5dd1d790582d"


class BaselineError(RuntimeError):
    """Fail-closed baseline admission or bounded-read failure."""


def _safe_path(path: str) -> bool:
    return (isinstance(path, str) and bool(path) and len(path) <= 240
            and not path.startswith("/") and "\\" not in path
            and all(part not in ("", ".", "..") and not part.startswith(".")
                    for part in path.split("/"))
            and all(32 <= ord(c) < 127 for c in path))


@dataclass(frozen=True)
class _Policy:
    """Private fixture seam; the public loader and CLI always use production pins."""
    commit: str = BASELINE_COMMIT
    tree: str = BASELINE_TREE
    paths: frozenset[str] = PUBLIC_PATHS
    selected_inventory_sha256: str = SELECTED_INVENTORY_SHA256
    max_file: int = _MAX_FILE
    max_total: int = _MAX_TOTAL


class _Git:
    def __init__(self, repository: Path):
        self.repository = repository
        self.started = time.monotonic()
        self.calls = 0

    def run(self, arguments: list[str], limit: int, timeout: float = 5.0) -> bytes:
        self.calls += 1
        remaining = 60.0 - (time.monotonic() - self.started)
        if self.calls > 256 or remaining <= 0:
            raise BaselineError("Git command budget exhausted")
        timeout = min(timeout, remaining)
        environment = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        environment.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull,
                           GIT_NO_REPLACE_OBJECTS="1", GIT_NO_LAZY_FETCH="1",
                           GIT_OPTIONAL_LOCKS="0",
                           GIT_TERMINAL_PROMPT="0", LC_ALL="C")
        command = ["git", "--no-replace-objects", "-C", str(self.repository), *arguments]
        try:
            process = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       env=environment)
        except OSError as exc:
            raise BaselineError("Git could not start") from exc
        output = bytearray()
        errors = bytearray()
        deadline = time.monotonic() + timeout
        try:
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ, (output, limit))
                selector.register(process.stderr, selectors.EVENT_READ, (errors, 65536))
                while selector.get_map():
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise BaselineError("Git command timed out")
                    for key, _ in selector.select(remaining):
                        buffer, cap = key.data
                        chunk = os.read(key.fileobj.fileno(), min(65536, cap - len(buffer) + 1))
                        if not chunk:
                            selector.unregister(key.fileobj)
                        else:
                            buffer.extend(chunk)
                            if len(buffer) > cap:
                                raise BaselineError("Git command output exceeded bound")
                try:
                    returncode = process.wait(timeout=max(0.001, deadline - time.monotonic()))
                except subprocess.TimeoutExpired as exc:
                    raise BaselineError("Git command timed out") from exc
                if returncode != 0:
                    # Do not disclose arbitrary repository-config stderr in CI artifacts.
                    raise BaselineError("Required local Git object/command unavailable")
                return bytes(output)
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdout.close()
            process.stderr.close()


def _object_hash(kind: str, data: bytes) -> str:
    return hashlib.sha1(kind.encode("ascii") + b" " + str(len(data)).encode("ascii")
                        + b"\0" + data).hexdigest()


class _ObjectBaseline:
    def __init__(self, repository: str | Path, policy: _Policy):
        if (not _HEX.fullmatch(policy.commit) or not _HEX.fullmatch(policy.tree)
                or not policy.paths or len(policy.paths) > 100
                or not re.fullmatch(r"[0-9a-f]{64}", policy.selected_inventory_sha256)
                or any(not _safe_path(p) for p in policy.paths)
                or not 0 < policy.max_file <= _MAX_FILE
                or not 0 < policy.max_total <= _MAX_TOTAL):
            raise BaselineError("Invalid immutable baseline policy")
        self._policy = policy
        self._git = _Git(Path(repository).resolve())
        self._cache: dict[str, bytes] = {}
        self._total = 0
        commit = self._git.run(["cat-file", "commit", policy.commit], _MAX_METADATA)
        if _object_hash("commit", commit) != policy.commit:
            raise BaselineError("Commit object identity mismatch")
        if commit.split(b"\n", 1)[0] != b"tree " + policy.tree.encode("ascii"):
            raise BaselineError("Pinned commit/tree mismatch")
        tree = self._git.run(["cat-file", "tree", policy.tree], _MAX_METADATA)
        if _object_hash("tree", tree) != policy.tree:
            raise BaselineError("Tree object identity mismatch")
        listing = self._git.run(["ls-tree", "-rz", "--full-tree", policy.tree], _MAX_METADATA)
        self._entries: dict[str, tuple[str, str]] = {}
        for record in listing.split(b"\0"):
            if not record:
                continue
            try:
                metadata, raw_path = record.split(b"\t", 1)
                mode, kind, sha = metadata.decode("ascii").split(" ")
                path = raw_path.decode("utf-8")
            except (ValueError, UnicodeError) as exc:
                raise BaselineError("Malformed Git tree inventory") from exc
            if path in policy.paths:
                if path in self._entries or mode not in ("100644", "100755") or kind != "blob":
                    raise BaselineError("Selected path is not a unique regular blob")
                if not _HEX.fullmatch(sha):
                    raise BaselineError("Invalid blob identity")
                self._entries[path] = (mode, sha)
        if self._entries.keys() != policy.paths:
            raise BaselineError("Approved public path missing from pinned tree")
        selected = [[path, *self._entries[path]] for path in sorted(policy.paths)]
        canonical = json.dumps(selected, ensure_ascii=True, separators=(",", ":")).encode("ascii")
        if hashlib.sha256(canonical).hexdigest() != policy.selected_inventory_sha256:
            raise BaselineError("Pinned selected inventory mismatch")

    def read(self, path: str) -> bytes:
        if not _safe_path(path) or path not in self._policy.paths:
            raise BaselineError("Path is outside the approved public allowlist")
        if path in self._cache:
            return self._cache[path]
        sha = self._entries[path][1]
        size_output = self._git.run(["cat-file", "-s", sha], 32)
        if not re.fullmatch(rb"(0|[1-9][0-9]*)\n", size_output):
            raise BaselineError("Invalid blob size")
        size = int(size_output)
        if size > self._policy.max_file or self._total + size > self._policy.max_total:
            raise BaselineError("Baseline byte budget exceeded")
        data = self._git.run(["cat-file", "blob", sha], size)
        if len(data) != size or _object_hash("blob", data) != sha:
            raise BaselineError("Literal blob identity/size mismatch")
        self._cache[path] = data
        self._total += len(data)
        return data

    def inventory(self) -> dict:
        files = []
        for path in sorted(self._policy.paths):
            data = self.read(path)
            files.append({"path": path, "git_blob": self._entries[path][1],
                          "mode": self._entries[path][0], "size": len(data),
                          "sha256": hashlib.sha256(data).hexdigest()})
        return {"schema": 1, "repository": "mercurym4/practice-perfect",
                "baseline_commit": self._policy.commit, "baseline_tree": self._policy.tree,
                "selected_inventory_sha256": self._policy.selected_inventory_sha256,
                "source": "literal-local-git-objects", "file_count": len(files),
                "total_bytes": sum(f["size"] for f in files), "files": files,
                "visual_acceptance": False, "deployment_verified": False}


class ApprovedMainBaseline(_ObjectBaseline):
    """Production API. Missing pinned objects fail; there is no network/ref fallback."""
    def __init__(self, repository: str | Path):
        super().__init__(repository, _Policy())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True,
                        help="Local Git repository containing the exact approved baseline objects")
    arguments = parser.parse_args(argv)
    try:
        result = ApprovedMainBaseline(arguments.repository).inventory()
    except BaselineError as exc:
        print(f"Baseline refused: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

