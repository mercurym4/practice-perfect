from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch
from urllib.error import URLError
from urllib.request import Request

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent / "scripts"
if not SCRIPTS.is_dir():
    SCRIPTS = HERE
sys.path.insert(0, str(SCRIPTS))
from audit_live_site import (PRIVATE_PATHS, Response, SameOriginRedirectHandler,
                             URLBoundaryError, admitted_url, audit_live, fetch_http)


BASE = "https://practiceperfect.us"


def page(url, robots=""):
    body = (f'<!doctype html><html><head><link rel="canonical" href="{url}">'
            f'<meta name="robots" content="{robots}"></head><body></body></html>')
    return Response(200, url, {"content-type": "text/html; charset=utf-8"}, body.encode())


def fixture():
    urls = [BASE + "/", BASE + "/about"]
    sitemap = ('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
               + "".join(f"<url><loc>{url}</loc></url>" for url in urls) + "</urlset>")
    values = {
        BASE + "/robots.txt": Response(200, BASE + "/robots.txt", {},
            f"User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n".encode()),
        BASE + "/sitemap.xml": Response(200, BASE + "/sitemap.xml", {}, sitemap.encode()),
        **{url: page(url) for url in urls},
        **{BASE + path: Response(404, BASE + path, {}, b"") for path in PRIVATE_PATHS},
    }
    return values


class LiveAuditTest(unittest.TestCase):
    def run_audit(self, mutate=None):
        values = fixture()
        if mutate:
            mutate(values)
        return audit_live(BASE, fetch=lambda url: values[url])

    def test_accepts_public_pages_and_hidden_internal_paths(self):
        result = self.run_audit()
        self.assertTrue(result["ok"], result)
        self.assertEqual(2, result["counts"]["pages_ok"])
        self.assertEqual(len(PRIVATE_PATHS), result["counts"]["private_paths_hidden"])

    def test_detects_exposed_internal_path(self):
        result = self.run_audit(lambda values: values.__setitem__(
            BASE + PRIVATE_PATHS[0], Response(200, BASE + PRIVATE_PATHS[0], {}, b"secret")))
        self.assertFalse(result["ok"])
        self.assertIn("private-path-exposed", {e["code"] for e in result["errors"]})

    def test_detects_wrong_live_canonical(self):
        result = self.run_audit(lambda values: values.__setitem__(
            BASE + "/about", page(BASE + "/wrong")))
        self.assertFalse(result["ok"])
        self.assertIn("canonical", {e["code"] for e in result["errors"]})

    def test_detects_live_noindex(self):
        result = self.run_audit(lambda values: values.__setitem__(
            BASE + "/about", page(BASE + "/about", "noindex,follow")))
        self.assertFalse(result["ok"])
        self.assertIn("html-noindex", {e["code"] for e in result["errors"]})


class OriginBoundaryTest(unittest.TestCase):
    def with_targets(self, targets):
        from xml.sax.saxutils import escape
        values = fixture()
        body = ('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                + "".join(f"<url><loc>{escape(url)}</loc></url>" for url in targets) + "</urlset>")
        values[BASE + "/sitemap.xml"] = Response(200, BASE + "/sitemap.xml", {}, body.encode())
        calls = []
        def fake(url):
            calls.append(url)
            return values.get(url, page(url))
        return audit_live(BASE, fetch=fake), calls

    def test_bad_sitemap_targets_never_reach_injected_fetch(self):
        targets = ["https://outside.invalid/secret", "http://practiceperfect.us/", "/relative",
                   "https://user:secret@practiceperfect.us/", BASE + "/?secret=value",
                   BASE + "/#secret", BASE + "/?", BASE + "/#", BASE + "/a%2Fb",
                   BASE + "/%252fsecret", BASE + "/%2e%2e/secret", BASE + "/%0dprivate",
                   BASE + "/%5cprivate", BASE + "/%broken", BASE + ":0/", BASE + ":99999/",
                   "https://[bad/", "https://practiceperfect.us.evil/", "https://practiceperfect.us:444/"]
        result, calls = self.with_targets(targets + [BASE + "/about"])
        self.assertFalse(result["ok"])
        self.assertEqual(1, result["counts"]["pages_ok"])
        self.assertEqual(len(targets), sum(e["code"] == "foreign-url" for e in result["errors"]))
        self.assertFalse(set(targets) & set(calls))
        self.assertNotIn("secret", str(result))
        self.assertEqual(len(PRIVATE_PATHS), result["counts"]["private_paths_hidden"])

    def test_raw_controls_and_backslashes_refused_before_fetch(self):
        for url in [BASE + "/\nsecret", "\thttps://practiceperfect.us/", BASE + "/a b",
                    BASE + "/\\private", BASE + "/%09private", BASE + "/%7fprivate"]:
            with self.subTest(url=repr(url)), patch("audit_live_site.build_opener") as opener:
                with self.assertRaises(URLBoundaryError):
                    fetch_http(url)
                opener.assert_not_called()

    def test_invalid_base_never_calls_fetch_and_redacts_credentials(self):
        for base in ["http://practiceperfect.us", "https://u:secret@practiceperfect.us",
                     BASE + "/folder", BASE + "/?secret=value", BASE + "/#x", BASE + ":0",
                     "https://[oops", "https://practiceperfect.us:bad", "", None,
                     "https://practiceperfect.us:", "https://[::1%0aevil]",
                     "https://[::1]:", "https://practicéperfect.us", "https://practiceperfect..us",
                     " https://practiceperfect.us", "https://practiceperfect.us\\evil"]:
            fetch = Mock()
            result = audit_live(base, fetch=fetch)
            self.assertFalse(result["ok"])
            self.assertEqual("invalid-base", result["errors"][0]["code"])
            self.assertEqual("[invalid base]", result["base"])
            self.assertNotIn("secret", str(result))
            fetch.assert_not_called()

    def test_explicit_https_deployment_origins_and_default_ports(self):
        for base in ["https://deployment.example:8443", "https://127.0.0.1:8443", "https://[::1]:8443"]:
            self.assertEqual(8443, admitted_url(base, base=True)[2])
        self.assertEqual(admitted_url(BASE), admitted_url("HTTPS://PRACTICEPERFECT.US:443/"))
        result, calls = self.with_targets(["https://PRACTICEPERFECT.US:443/about"])
        self.assertTrue(result["ok"], result)
        self.assertIn("https://PRACTICEPERFECT.US:443/about", calls)

    def test_empty_and_duplicate_sitemaps_fail_without_repeat_requests(self):
        result, calls = self.with_targets([])
        self.assertIn("empty", {e["code"] for e in result["errors"]})
        self.assertEqual(2 + len(PRIVATE_PATHS), len(calls))
        result, calls = self.with_targets([BASE + "/about", BASE + "/about"])
        self.assertIn("duplicates", {e["code"] for e in result["errors"]})
        self.assertEqual(1, calls.count(BASE + "/about"))

    def test_injected_foreign_final_urls_stop_each_resource_kind(self):
        for target in [BASE + "/robots.txt", BASE + "/sitemap.xml", BASE + "/about",
                       BASE + PRIVATE_PATHS[0]]:
            values = fixture()
            previous = values[target]
            values[target] = Response(previous.status, "https://foreign.invalid/?secret=value",
                                      previous.headers, previous.body)
            calls = []
            def fake(url):
                calls.append(url)
                return values[url]
            result = audit_live(BASE, fetch=fake)
            self.assertFalse(result["ok"])
            self.assertEqual("request-or-parse", result["errors"][-1]["code"])
            self.assertEqual(target, calls[-1])
            self.assertNotIn("secret", str(result))
            self.assertFalse(any("foreign.invalid" in url for url in calls))

    def test_all_redirect_codes_refuse_foreign_before_followup_open(self):
        origin = admitted_url(BASE)
        for code in [301, 302, 303, 307, 308]:
            for location in ["https://foreign.invalid/", "//foreign.invalid/", "http://practiceperfect.us/",
                             "https://user:secret@practiceperfect.us/", BASE + ":444/",
                             "/?secret=value", "/%252fprivate", "/%0afoo", "\n/about", "/a\\b"]:
                handler = SameOriginRedirectHandler(origin)
                parent, fp = Mock(), Mock()
                handler.add_parent(parent)
                request = Request(BASE + "/original")
                request.timeout = 10
                with self.subTest(code=code, location=location), patch("urllib.request.Request") as follow_request:
                    with self.assertRaises(URLBoundaryError):
                        getattr(handler, f"http_error_{code}")(request, fp, code, "redirect", {"location": location})
                    follow_request.assert_not_called()
                parent.open.assert_not_called()
                fp.read.assert_not_called()
                fp.close.assert_called_once_with()

    def test_final_redirect_request_guard_closes_without_read_or_request(self):
        handler = SameOriginRedirectHandler(admitted_url(BASE))
        request = Request(BASE + "/original")
        for fp in [Mock(), None, Mock(close=Mock(side_effect=OSError("close failed")))]:
            with patch("urllib.request.Request") as follow_request:
                with self.assertRaises(URLBoundaryError):
                    handler.redirect_request(request, fp, 302, "redirect", {}, "https://foreign.invalid/")
                follow_request.assert_not_called()
            if fp is not None:
                fp.read.assert_not_called()
                fp.close.assert_called_once_with()

    def test_malformed_redirect_location_and_uri_close_without_followup(self):
        for code in [301, 302, 303, 307, 308]:
            for header in ["location", "uri"]:
                for value in ["https://[bad/", "https://[::1", "https://[::1]extra/",
                              "https://practiceperfect.us:bad/", "/unicode-\u2603"]:
                    handler = SameOriginRedirectHandler(admitted_url(BASE))
                    parent, fp = Mock(), Mock()
                    handler.add_parent(parent)
                    request = Request(BASE + "/original")
                    request.timeout = 10
                    with self.subTest(code=code, header=header, value=value), patch("urllib.request.Request") as follow_request:
                        with self.assertRaises(URLBoundaryError):
                            getattr(handler, f"http_error_{code}")(request, fp, code, "redirect", {header: value})
                        follow_request.assert_not_called()
                    parent.open.assert_not_called()
                    fp.read.assert_not_called()
                    fp.close.assert_called_once_with()

    def test_same_origin_redirect_reaches_mock_opener_as_get(self):
        for location, expected in [("/about", BASE + "/about"), ("next", BASE + "/folder/next"),
                                   (BASE + ":443/about", BASE + ":443/about")]:
            handler = SameOriginRedirectHandler(admitted_url(BASE))
            parent, fp = Mock(), Mock()
            handler.add_parent(parent)
            request = Request(BASE + "/folder/start")
            request.timeout = 10
            getattr(handler, "http_error_302")(request, fp, 302, "redirect", {"location": location})
            followup = parent.open.call_args.args[0]
            self.assertEqual(expected, followup.full_url)
            self.assertEqual("GET", followup.get_method())
            self.assertEqual(10, parent.open.call_args.kwargs["timeout"])

    def test_fetch_http_installs_boundary_and_retains_request_limits(self):
        response = Mock(status=200, headers={"Content-Type": "text/plain"})
        response.geturl.return_value = BASE + "/about"
        response.read.return_value = b"body"
        opener = Mock()
        opener.open.return_value.__enter__ = Mock(return_value=response)
        opener.open.return_value.__exit__ = Mock(return_value=False)
        with patch("audit_live_site.build_opener", return_value=opener) as build:
            result = fetch_http(BASE + "/about")
        self.assertIsInstance(build.call_args.args[0], SameOriginRedirectHandler)
        self.assertEqual(b"body", result.body)
        response.read.assert_called_once_with(2_000_000)
        self.assertEqual(10, opener.open.call_args.kwargs["timeout"])
        self.assertEqual("GET", opener.open.call_args.args[0].get_method())

    def test_request_failure_details_do_not_echo_transport_urls_or_secrets(self):
        fetch = Mock(side_effect=URLError("https://user:secret@foreign.invalid/?token=value"))
        result = audit_live(BASE, fetch=fetch)
        self.assertFalse(result["ok"])
        self.assertNotIn("secret", str(result))
        self.assertNotIn("token", str(result))
        self.assertEqual("request-or-parse", result["errors"][0]["code"])
        fetch.assert_called_once_with(BASE + "/robots.txt")


if __name__ == "__main__":
    unittest.main()

