#!/usr/bin/env python3
"""Inventory active-content dependencies and propose a non-enforcing CSP."""
import argparse
import base64
from collections import Counter, defaultdict
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urljoin, urlsplit

BASE = "https://practiceperfect.us"
PRIVATE_ROOTS = {"docs", "tests", "scripts", "preview"}
ALLOWED = {
    "script-src": {"'self'"},
    "style-src": {"'self'", "https://fonts.googleapis.com"},
    "font-src": {"'self'", "https://fonts.gstatic.com"},
    "img-src": {"'self'", "data:"},
    "connect-src": {"'self'"},
    "frame-src": set(),
    "form-action": {"'self'"},
}
SERVER_ALLOWED = {"https://api.resend.com"}


def token(url, page_url):
    if not url or url.startswith(("#", "mailto:", "tel:", "javascript:")):
        return None
    if url.startswith("data:"):
        return "data:"
    parsed = urlsplit(urljoin(page_url, url))
    if parsed.scheme not in ("http", "https"):
        return None
    base = urlsplit(BASE)
    return "'self'" if (parsed.scheme, parsed.netloc) == (base.scheme, base.netloc) else f"{parsed.scheme}://{parsed.netloc}"


def digest(text):
    value = base64.b64encode(sha256(text.encode("utf-8")).digest()).decode("ascii")
    return "'sha256-" + value + "'"


class InventoryParser(HTMLParser):
    def __init__(self, page_url):
        super().__init__(convert_charrefs=False)
        self.page_url = page_url
        self.origins = defaultdict(set)
        self.inline_scripts, self.inline_styles = [], []
        self.style_attributes, self.event_handlers = 0, []
        self._capture, self._buffer = None, []

    def add(self, directive, value):
        value = token(value, self.page_url)
        if value:
            self.origins[directive].add(value)

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        for name, _ in attrs:
            if name.lower().startswith("on"):
                self.event_handlers.append(name.lower())
        if "style" in values:
            self.style_attributes += 1
        if tag == "script":
            if values.get("src"):
                self.add("script-src", values["src"])
            elif values.get("type", "").lower() not in ("application/ld+json", "application/json"):
                self._capture, self._buffer = "script", []
        elif tag == "style":
            self._capture, self._buffer = "style", []
        elif tag == "link" and "stylesheet" in values.get("rel", "").lower().split():
            self.add("style-src", values.get("href", ""))
        elif tag in ("img", "source"):
            self.add("img-src", values.get("src", ""))
            for candidate in values.get("srcset", "").split(","):
                self.add("img-src", candidate.strip().split(" ")[0])
        elif tag == "iframe":
            self.add("frame-src", values.get("src", ""))
        elif tag == "form":
            self.add("form-action", values.get("action", "") or self.page_url)

    def handle_endtag(self, tag):
        if self._capture == "script" and tag == "script":
            self.inline_scripts.append("".join(self._buffer))
            self._capture, self._buffer = None, []
        elif self._capture == "style" and tag == "style":
            self.inline_styles.append("".join(self._buffer))
            self._capture, self._buffer = None, []

    def handle_data(self, data):
        if self._capture:
            self._buffer.append(data)


def inventory(root):
    root = Path(root).resolve()
    origins = defaultdict(set)
    inline_script_hashes, inline_style_hashes = set(), set()
    errors, files = [], []
    server_origins = set()
    style_attributes = 0
    event_handlers = Counter()

    for path in sorted(root.rglob("*.html")):
        rel = path.relative_to(root)
        if (rel.parts and rel.parts[0] in PRIVATE_ROOTS) or path.name == "services-green.html":
            continue
        route = "/" if rel.as_posix() == "index.html" else "/" + rel.as_posix()[:-5]
        parser = InventoryParser(BASE + route)
        parser.feed(path.read_text(encoding="utf-8"))
        files.append(rel.as_posix())
        for directive, values in parser.origins.items():
            origins[directive].update(values)
        inline_script_hashes.update(digest(value) for value in parser.inline_scripts if value.strip())
        inline_style_hashes.update(digest(value) for value in parser.inline_styles if value.strip())
        style_attributes += parser.style_attributes
        event_handlers.update(parser.event_handlers)

    for path in sorted(root.rglob("*.css")):
        rel = path.relative_to(root)
        if rel.parts and rel.parts[0] in PRIVATE_ROOTS:
            continue
        text = path.read_text(encoding="utf-8")
        for value in re.findall(r"@import\s+(?:url\(\s*)?['\"]([^'\"]+)", text, re.I):
            found = token(value.strip(), BASE + "/" + rel.as_posix())
            if found:
                origins["style-src"].add(found)
        asset_css = re.sub(r"@import\s+[^;]+;", "", text, flags=re.I)
        for value in re.findall(r"url\(\s*['\"]?([^'\")]+)", asset_css, re.I):
            found = token(value.strip(), BASE + "/" + rel.as_posix())
            if found:
                directive = "font-src" if re.search(r"\.(woff2?|ttf|otf)(?:[?#]|$)", value, re.I) else "img-src"
                origins[directive].add(found)

    for path in sorted(root.rglob("*.js")):
        rel = path.relative_to(root)
        if rel.parts and rel.parts[0] in PRIVATE_ROOTS:
            continue
        text = path.read_text(encoding="utf-8")
        for value in re.findall(r"(?:fetch|sendBeacon)\(\s*['\"]([^'\"]+)", text):
            found = token(value, BASE + "/" + rel.as_posix())
            if found:
                if rel.parts and rel.parts[0] == "api":
                    server_origins.add(found)
                else:
                    origins["connect-src"].add(found)

    for directive, values in origins.items():
        for value in sorted(values - ALLOWED.get(directive, set())):
            errors.append({"code": "unexpected-active-origin", "directive": directive, "value": value})
    for name, count in sorted(event_handlers.items()):
        errors.append({"code": "inline-event-handler", "name": name, "count": count})
    for value in sorted(server_origins - SERVER_ALLOWED):
        errors.append({"code": "unexpected-server-origin", "value": value})

    report_only = [
        "default-src 'self'", "base-uri 'self'", "object-src 'none'",
        "frame-ancestors 'none'", "form-action 'self'", "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data:",
        "connect-src 'self'", "frame-src 'none'", "upgrade-insecure-requests",
    ]
    return {
        "ok": not errors,
        "counts": {"public_html": len(files), "inline_script_blocks": len(inline_script_hashes),
                   "inline_style_blocks": len(inline_style_hashes), "style_attributes": style_attributes,
                   "inline_event_handlers": sum(event_handlers.values())},
        "origins": {key: sorted(values) for key, values in sorted(origins.items())},
        "server_connect_origins": sorted(server_origins),
        "inline_script_hashes": sorted(inline_script_hashes),
        "inline_style_hashes": sorted(inline_style_hashes),
        "proposed_report_only": "; ".join(report_only),
        "errors": errors,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default=".")
    result = inventory(parser.parse_args().root)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["ok"] else 1)
