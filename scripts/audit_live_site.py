#!/usr/bin/env python3
"""Read-only production audit for Practice Perfect; never submits forms."""
import argparse
from dataclasses import dataclass
import json
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener
import xml.etree.ElementTree as ET

from audit_public_site import Page

DEFAULT_BASE = "https://practiceperfect.us"
PRIVATE_PATHS = (
    "/docs/approved-project-state.md",
    "/docs/firewall-check",
    "/tests/analytics.test.cjs",
    "/scripts/audit_image_assets.py",
    "/preview/index.html",
    "/responsive-check",
    "/services-green.html",
)
SECURITY_HEADERS = (
    "strict-transport-security",
    "content-security-policy",
    "x-content-type-options",
    "referrer-policy",
)


@dataclass
class Response:
    status: int
    url: str
    headers: dict
    body: bytes


def fetch_http(url, timeout=10, attempts=2):
    request = Request(url, headers={"User-Agent": "PracticePerfectReadOnlyAudit/1.0"})
    for attempt in range(attempts):
        try:
            with build_opener().open(request, timeout=timeout) as response:
                return Response(response.status, response.geturl(),
                                {k.lower(): v for k, v in response.headers.items()},
                                response.read(2_000_000))
        except HTTPError as exc:
            return Response(exc.code, exc.geturl(),
                            {k.lower(): v for k, v in exc.headers.items()},
                            exc.read(2_000_000))
        except URLError:
            if attempt + 1 == attempts:
                raise
            time.sleep(0.5)


def audit_live(base=DEFAULT_BASE, fetch=fetch_http):
    base = base.rstrip("/")
    errors, warnings = [], []
    counts = {"sitemap_pages": 0, "pages_ok": 0, "private_paths_hidden": 0}

    def fail(path, code, detail):
        errors.append({"path": path, "code": code, "detail": detail})

    def warn(path, code, detail):
        warnings.append({"path": path, "code": code, "detail": detail})

    try:
        robots = fetch(base + "/robots.txt")
        if robots.status != 200:
            fail("/robots.txt", "status", str(robots.status))
        else:
            text = robots.body.decode("utf-8", "replace")
            if f"Sitemap: {base}/sitemap.xml" not in text:
                fail("/robots.txt", "sitemap-directive", "Production sitemap missing")
            if "Disallow: /" in [line.strip() for line in text.splitlines()]:
                fail("/robots.txt", "crawl-blocked", "Root is disallowed")

        sitemap_response = fetch(base + "/sitemap.xml")
        if sitemap_response.status != 200:
            fail("/sitemap.xml", "status", str(sitemap_response.status))
            urls = []
        else:
            root = ET.fromstring(sitemap_response.body)
            urls = [node.text or "" for node in root.findall(
                "{http://www.sitemaps.org/schemas/sitemap/0.9}url/"
                "{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
            counts["sitemap_pages"] = len(urls)
            if not urls:
                fail("/sitemap.xml", "empty", "No public URLs")
            if len(urls) != len(set(urls)):
                fail("/sitemap.xml", "duplicates", "Duplicate URL entries")
            for url in urls:
                parsed = urlsplit(url)
                if parsed.scheme != "https" or parsed.netloc != urlsplit(base).netloc:
                    fail("/sitemap.xml", "foreign-url", url)

        header_inventory = {}
        for url in urls:
            response = fetch(url)
            path = urlsplit(url).path or "/"
            if response.status != 200:
                fail(path, "status", str(response.status))
                continue
            if response.url.rstrip("/") != url.rstrip("/"):
                fail(path, "unexpected-redirect", response.url)
            content_type = response.headers.get("content-type", "")
            if "text/html" not in content_type:
                fail(path, "content-type", content_type)
                continue
            page = Page(response.body.decode("utf-8", "replace"))
            if page.canonicals != [url]:
                fail(path, "canonical", repr(page.canonicals))
            if any("noindex" in value or value.strip() == "none" for value in page.robots):
                fail(path, "html-noindex", repr(page.robots))
            x_robots = response.headers.get("x-robots-tag", "").lower()
            if "noindex" in x_robots or x_robots.strip() == "none":
                fail(path, "header-noindex", x_robots)
            counts["pages_ok"] += 1
            for header in SECURITY_HEADERS:
                if response.headers.get(header):
                    header_inventory[header] = header_inventory.get(header, 0) + 1

        for header in SECURITY_HEADERS:
            if urls and header_inventory.get(header, 0) != len(urls):
                warn("*", "security-header-coverage",
                     f"{header}: {header_inventory.get(header, 0)}/{len(urls)} pages")

        for path in PRIVATE_PATHS:
            response = fetch(base + path)
            if response.status not in (404, 410):
                fail(path, "private-path-exposed", str(response.status))
            else:
                counts["private_paths_hidden"] += 1
    except (ET.ParseError, UnicodeError, URLError, OSError) as exc:
        fail("*", "request-or-parse", str(exc))

    return {"ok": not errors, "base": base, "counts": counts,
            "warnings": warnings, "errors": errors}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=DEFAULT_BASE)
    result = audit_live(parser.parse_args().base)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["ok"] else 1)
