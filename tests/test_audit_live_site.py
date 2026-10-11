import unittest

from audit_live_site import PRIVATE_PATHS, Response, audit_live


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


if __name__ == "__main__":
    unittest.main()
