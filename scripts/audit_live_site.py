#!/usr/bin/env python3
"""Read-only production audit for Practice Perfect; never submits forms."""
import argparse
from dataclasses import dataclass
import json
import ipaddress
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
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


class URLBoundaryError(ValueError):
    """A target was refused before the audit requested its contents."""


def admitted_url(url, origin=None, *, base=False):
    """Validate raw spelling before urllib can normalize unsafe characters."""
    if not isinstance(url, str) or not url or any(ord(c) <= 32 or ord(c) == 127 for c in url):
        raise URLBoundaryError("URL contains whitespace/control characters or is empty")
    if "\\" in url or re.search(r"%(?![0-9a-fA-F]{2})", url):
        raise URLBoundaryError("URL has a backslash or malformed percent escape")
    try:
        parsed = urlsplit(url)
        host, port = parsed.hostname, parsed.port
    except ValueError as exc:
        raise URLBoundaryError("Malformed URL authority") from exc
    if (parsed.scheme != "https" or not host or "%" in parsed.netloc or parsed.netloc.endswith(":")
            or parsed.username is not None
            or parsed.password is not None or "@" in parsed.netloc
            or parsed.query or parsed.fragment or "?" in url or "#" in url):
        raise URLBoundaryError("Expected credential-free HTTPS URL without query/fragment")
    if port is not None and not 1 <= port <= 65535:
        raise URLBoundaryError("Invalid port")
    try:
        host.encode("ascii")
        if ":" in host:
            ipaddress.IPv6Address(host)
        elif not all(re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?", label)
                     for label in host.split(".")):
            raise ValueError("Invalid hostname")
    except (ValueError, UnicodeError) as exc:
        raise URLBoundaryError("Invalid ASCII hostname") from exc
    decoded_path = unquote(parsed.path)
    if (re.search(r"%(?:2f|5c|25|0[0-9a-f]|1[0-9a-f]|7f)", parsed.path, re.I)
            or "\\" in decoded_path or any(ord(c) <= 32 or ord(c) == 127 for c in decoded_path)
            or any(part in (".", "..") for part in decoded_path.split("/"))):
        raise URLBoundaryError("Unsafe encoded or dot-segment path")
    actual_origin = (parsed.scheme, host.lower(), port or 443)
    if origin is not None and actual_origin != origin:
        raise URLBoundaryError("URL leaves the audited HTTPS origin")
    if base and parsed.path not in ("", "/"):
        raise URLBoundaryError("Base must be an HTTPS origin, not a path")
    return actual_origin


class SameOriginRedirectHandler(HTTPRedirectHandler):
    """Refuse a redirect before the opener can issue its follow-up request."""

    def __init__(self, origin):
        self.origin = origin

    @staticmethod
    def close_refused_response(fp):
        # Reject without draining an untrusted redirect body or leaking its socket.
        if fp is not None:
            try:
                fp.close()
            except OSError:
                pass

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        try:
            admitted_url(newurl, self.origin)
        except URLBoundaryError:
            self.close_refused_response(fp)
            raise
        return super().redirect_request(req, fp, code, msg, headers, newurl)

    def http_error_302(self, req, fp, code, msg, headers):
        try:
            target = headers.get("location", headers.get("uri"))
            if target is not None:
                # Reject the raw Location before urljoin/urllib strip controls.
                if not isinstance(target, str) or any(ord(c) <= 32 or ord(c) == 127 for c in target):
                    raise URLBoundaryError("Unsafe redirect Location")
                if "\\" in target:
                    raise URLBoundaryError("Unsafe redirect Location")
                try:
                    resolved = urljoin(req.full_url, target)
                except (ValueError, UnicodeError) as exc:
                    raise URLBoundaryError("Malformed redirect Location") from exc
                admitted_url(resolved, self.origin)
        except URLBoundaryError:
            self.close_refused_response(fp)
            raise
        try:
            return super().http_error_302(req, fp, code, msg, headers)
        except URLBoundaryError:
            # redirect_request already closed a refusal at its final guard.
            raise
        except (ValueError, UnicodeError) as exc:
            # urllib's legacy Location quoting can reject non-Latin-1 text.
            self.close_refused_response(fp)
            raise URLBoundaryError("Malformed redirect Location") from exc

    http_error_301 = http_error_303 = http_error_307 = http_error_308 = http_error_302


def fetch_http(url, timeout=10, attempts=2):
    origin = admitted_url(url)
    request = Request(url, headers={"User-Agent": "PracticePerfectReadOnlyAudit/1.0"})
    opener = build_opener(SameOriginRedirectHandler(origin))
    for attempt in range(attempts):
        try:
            with opener.open(request, timeout=timeout) as response:
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
    errors, warnings = [], []
    counts = {"sitemap_pages": 0, "pages_ok": 0, "private_paths_hidden": 0}

    def fail(path, code, detail):
        errors.append({"path": path, "code": code, "detail": detail})

    def warn(path, code, detail):
        warnings.append({"path": path, "code": code, "detail": detail})

    try:
        origin = admitted_url(base, base=True)
    except URLBoundaryError as exc:
        fail("*", "invalid-base", str(exc))
        return {"ok": False, "base": "[invalid base]", "counts": counts,
                "warnings": warnings, "errors": errors}
    base = base.rstrip("/")

    def get(url):
        admitted_url(url, origin)
        response = fetch(url)
        # Injectable fetchers are useful offline but may report foreign final URLs.
        admitted_url(response.url, origin)
        return response

    try:
        robots = get(base + "/robots.txt")
        if robots.status != 200:
            fail("/robots.txt", "status", str(robots.status))
        else:
            text = robots.body.decode("utf-8", "replace")
            if f"Sitemap: {base}/sitemap.xml" not in text:
                fail("/robots.txt", "sitemap-directive", "Production sitemap missing")
            if "Disallow: /" in [line.strip() for line in text.splitlines()]:
                fail("/robots.txt", "crawl-blocked", "Root is disallowed")

        sitemap_response = get(base + "/sitemap.xml")
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
            admitted = []
            for index, url in enumerate(urls, 1):
                try:
                    admitted_url(url, origin)
                except URLBoundaryError:
                    fail("/sitemap.xml", "foreign-url", f"Rejected sitemap target at entry {index}")
                    continue
                if url not in admitted:
                    admitted.append(url)
            urls = admitted

        header_inventory = {}
        for url in urls:
            response = get(url)
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
            response = get(base + path)
            if response.status not in (404, 410):
                fail(path, "private-path-exposed", str(response.status))
            else:
                counts["private_paths_hidden"] += 1
    except (ET.ParseError, UnicodeError, URLError, OSError, URLBoundaryError) as exc:
        fail("*", "request-or-parse", f"{type(exc).__name__}: request or response parsing failed")

    return {"ok": not errors, "base": base, "counts": counts,
            "warnings": warnings, "errors": errors}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=DEFAULT_BASE)
    result = audit_live(parser.parse_args().base)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["ok"] else 1)

