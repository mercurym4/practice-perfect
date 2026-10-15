#!/usr/bin/env python3
"""Compare approved copy and selected design inputs; not rendered visual parity."""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import stat
import sys

from immutable_site_baseline import ApprovedMainBaseline, BASELINE_COMMIT, BASELINE_TREE, PUBLIC_PATHS

PAGES = tuple(sorted(path for path in PUBLIC_PATHS if path.endswith(".html")))
MAX_PAGE_BYTES = 1024 * 1024
MAX_TOTAL_BYTES = 16 * 1024 * 1024
_VOID = frozenset("area base br col embed hr img input link meta param source track wbr".split())
_SPACE = re.compile(r"[ \t\r\n\f]+")
_CATEGORIES = ("public_text", "title", "description", "metadata", "canonical", "json_ld", "image_choices")


class ContentError(RuntimeError):
    """Malformed source or unsafe candidate read; never a browser judgment."""


class _Source(HTMLParser):
    def __init__(self, candidate):
        super().__init__(convert_charrefs=True)
        self.candidate = candidate
        self.stack = []
        self.text = []
        self.titles = []
        self.title_text = None
        self.description = []
        self.metadata = []
        self.canonical = []
        self.json_ld = []
        self.script_text = None
        self.images = []
        self.skip_depth = None
        self.skip_text = []
        self.skip_count = 0
        self.main_targets = 0
        self.body_count = 0
        self.head_count = 0
        self.html_count = 0

    def handle_starttag(self, tag, attributes):
        if not self.stack and tag != "html":
            raise ContentError("Element outside HTML root")
        if self.stack == ["html"] and tag not in ("head", "body"):
            raise ContentError("Invalid direct HTML child")
        if tag == "html" and (self.stack or self.html_count):
            raise ContentError("HTML root is not unique")
        if tag == "head" and (self.stack != ["html"] or self.head_count or self.body_count):
            raise ContentError("Head must precede body")
        if tag == "body" and (self.stack != ["html"] or self.head_count != 1 or self.body_count):
            raise ContentError("Body requires one closed preceding head")
        if tag == "title" and self.stack != ["html", "head"]:
            raise ContentError("Title must be in head")
        if len(self.stack) > 256:
            raise ContentError("HTML nesting bound exceeded")
        names = [key for key, _ in attributes]
        if len(set(names)) != len(names):
            raise ContentError("Duplicate HTML attributes")
        attrs = dict(attributes)
        if tag == "meta":
            self.metadata.append(sorted(attributes))
        if self.skip_depth is not None:
            raise ContentError("Skip link must contain plain text only")
        if tag == "html":
            self.html_count += 1
        if tag == "head":
            self.head_count += 1
        if tag == "body":
            self.body_count += 1
        if tag == "title":
            if self.title_text is not None:
                raise ContentError("Nested title")
            self.title_text = []
        if tag == "meta" and (attrs.get("name") or "").lower() == "description":
            self.description.append(attrs.get("content"))
        if tag == "link" and "canonical" in (attrs.get("rel") or "").lower().split():
            self.canonical.append(attrs.get("href"))
        if tag == "img":
            self.images.append([attrs.get("src"), attrs.get("srcset"), attrs.get("alt")])
        if tag == "script":
            self.script_text = [] if (attrs.get("type") or "").lower() == "application/ld+json" else None
        if tag == "a" and ("skip-link" in (attrs.get("class") or "").split()
                           or attrs.get("href") == "#main-content"):
            if (not self.candidate or attrs != {"class": "skip-link", "href": "#main-content"}
                    or self.stack != ["html", "body"]):
                raise ContentError("Unapproved skip-link shape or placement")
            self.skip_count += 1
            self.skip_depth = len(self.stack)
            self.skip_text = []
        if self.candidate and attrs.get("id") == "main-content":
            if tag != "main" or attrs.get("tabindex") != "-1":
                raise ContentError("Invalid skip-link target")
            self.main_targets += 1
        if tag not in _VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in _VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in _VOID or not self.stack or self.stack[-1] != tag:
            raise ContentError("Unbalanced HTML structure")
        if self.skip_depth is not None and len(self.stack) == self.skip_depth + 1:
            if tag != "a" or "".join(self.skip_text) != "Skip to main content":
                raise ContentError("Unapproved skip-link text")
            self.skip_depth = None
        if tag == "title":
            self.titles.append("".join(self.title_text))
            self.title_text = None
        if tag == "script" and self.script_text is not None:
            self.json_ld.append("".join(self.script_text))
            self.script_text = None
        self.stack.pop()

    def handle_data(self, data):
        if not self.stack and data.strip():
            raise ContentError("Text outside HTML document")
        if self.skip_depth is not None:
            self.skip_text.append(data)
            return
        if "script" in self.stack:
            if self.script_text is not None:
                self.script_text.append(data)
            return
        if "style" in self.stack:
            return
        self.text.append(data)
        if self.title_text is not None:
            self.title_text.append(data)

    def handle_comment(self, data):
        if self.skip_depth is not None:
            raise ContentError("Skip link must contain plain text only")

    def handle_decl(self, declaration):
        if declaration.lower() != "doctype html" or self.stack or self.html_count:
            raise ContentError("Unapproved HTML declaration")

    def handle_pi(self, data):
        raise ContentError("Processing instruction in HTML")

    def finish(self):
        self.close()
        if (self.stack or self.rawdata or self.html_count != 1 or self.head_count != 1
                or self.body_count != 1 or len(self.titles) != 1
                or len(self.description) != 1 or self.description[0] is None
                or len(self.canonical) != 1 or self.canonical[0] is None):
            raise ContentError("Incomplete or ambiguous HTML document")
        if self.candidate and (self.skip_count != 1 or self.main_targets != 1):
            raise ContentError("Exactly one approved skip link and target required")
        return {"public_text": _SPACE.sub(" ", "".join(self.text)).strip(" \t\r\n\f"),
                "title": self.titles[0], "description": self.description[0],
                "metadata": self.metadata,
                "canonical": self.canonical[0], "json_ld": self.json_ld,
                "image_choices": self.images}


def parse_source(data: bytes, candidate: bool = False) -> dict:
    if not isinstance(data, bytes) or len(data) > MAX_PAGE_BYTES:
        raise ContentError("HTML byte bound exceeded")
    try:
        text = data.decode("utf-8", errors="strict")
    except UnicodeError as exc:
        raise ContentError("HTML is not strict UTF-8") from exc
    if "\0" in text:
        raise ContentError("NUL in HTML")
    parser = _Source(candidate)
    try:
        parser.feed(text)
        return parser.finish()
    except (ValueError, RecursionError, AssertionError) as exc:
        raise ContentError("HTML parser failed") from exc


def _digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=True, separators=(",", ":")).encode("ascii")).hexdigest()


def compare_page(approved: bytes, candidate: bytes) -> dict:
    old = parse_source(approved, candidate=False)
    new = parse_source(candidate, candidate=True)
    differences = [category for category in _CATEGORIES if old[category] != new[category]]
    return {"equal": not differences, "differences": differences,
            "baseline_sha256": hashlib.sha256(approved).hexdigest(),
            "candidate_sha256": hashlib.sha256(candidate).hexdigest(),
            "signatures": {category: {"baseline": _digest(old[category]),
                                      "candidate": _digest(new[category]),
                                      "equal": old[category] == new[category]}
                           for category in _CATEGORIES}}


def read_candidate(root: Path, path: str, max_bytes: int = MAX_PAGE_BYTES) -> bytes:
    max_bytes = min(max_bytes, MAX_PAGE_BYTES)
    if max_bytes < 0:
        raise ContentError("Aggregate HTML byte bound exceeded")
    if path not in PAGES or any(part in ("", ".", "..") for part in path.split("/")):
        raise ContentError("Candidate path not approved")
    descriptors = []
    try:
        current = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        descriptors.append(current)
        for component in path.split("/")[:-1]:
            current = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current)
            descriptors.append(current)
        descriptor = os.open(path.split("/")[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=current)
        descriptors.append(descriptor)
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
            raise ContentError("Candidate HTML must be a regular non-hardlinked file")
        if metadata.st_size > max_bytes:
            raise ContentError("HTML byte bound exceeded")
        chunks = []
        count = 0
        while count < metadata.st_size:
            chunk = os.read(descriptor, min(65536, metadata.st_size - count))
            if not chunk:
                break
            chunks.append(chunk)
            count += len(chunk)
            if count > max_bytes:
                raise ContentError("HTML byte bound exceeded")
        after = os.fstat(descriptor)
        if count != metadata.st_size or (after.st_size, after.st_mtime_ns, after.st_ino) != (metadata.st_size, metadata.st_mtime_ns, metadata.st_ino):
            raise ContentError("Candidate HTML changed during read")
        return b"".join(chunks)
    except OSError as exc:
        raise ContentError("Candidate HTML missing or unsafe") from exc
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


def verify(baseline, candidate_root: Path) -> dict:
    pages = []
    total = 0
    exhausted = False
    for path in PAGES:
        try:
            if exhausted or total >= MAX_TOTAL_BYTES:
                raise ContentError("Aggregate HTML byte bound exceeded")
            approved = baseline.read(path)
            if len(approved) > MAX_PAGE_BYTES or total + len(approved) > MAX_TOTAL_BYTES:
                exhausted = True
                raise ContentError("Aggregate HTML byte bound exceeded")
            total += len(approved)
            reserved = min(MAX_PAGE_BYTES, MAX_TOTAL_BYTES - total)
            total += reserved
            candidate = read_candidate(candidate_root, path, reserved)
            total -= reserved - len(candidate)
            pages.append({"path": path, **compare_page(approved, candidate)})
        except ContentError as exc:
            pages.append({"path": path, "equal": False, "differences": ["source_refused"],
                          "error": str(exc)})
    source_claim = os.environ.get("SOURCE_COMMIT")
    if source_claim and not re.fullmatch(r"[0-9a-f]{40}", source_claim):
        source_claim = None
    return {"schema": 1, "passed": len(pages) == 27 and all(row["equal"] for row in pages),
            "baseline_commit": BASELINE_COMMIT, "baseline_tree": BASELINE_TREE,
            "candidate_source_commit_claim": source_claim,
            "candidate_git_identity_authenticated": False, "pages": pages,
            "visual_parity_verified": False, "deployment_verified": False,
            "limits": "Selected copy/meta/JSON-LD/image-input source signatures only; not CSS, layout, rendering, functional parity, analytics or contact delivery."}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-repository", required=True)
    parser.add_argument("--candidate", required=True)
    options = parser.parse_args(argv)
    try:
        result = verify(ApprovedMainBaseline(options.baseline_repository), Path(options.candidate))
    except RuntimeError as exc:
        print(f"Content verification refused: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

