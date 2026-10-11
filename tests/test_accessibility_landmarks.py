from html.parser import HTMLParser
from pathlib import Path
import re
import unittest
from urllib.parse import urlparse
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]


def public_pages():
    sitemap = ET.parse(ROOT / "sitemap.xml")
    pages = []
    for loc in sitemap.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc"):
        route = urlparse(loc.text).path.strip("/")
        pages.append(ROOT / (f"{route}.html" if route else "index.html"))
    return pages


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_body = False
        self.body_depth = 0
        self.first_body_child = None
        self.tags = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "body":
            self.in_body = True
            self.body_depth = 0
        elif self.in_body:
            if self.body_depth == 0 and self.first_body_child is None:
                self.first_body_child = (tag, attrs)
            self.body_depth += 1
        self.tags.append((tag, attrs))

    def handle_endtag(self, tag):
        if tag == "body":
            self.in_body = False
        elif self.in_body and self.body_depth:
            self.body_depth -= 1


class AccessibilityLandmarkTests(unittest.TestCase):
    def parse(self, path):
        parser = PageParser()
        parser.feed(path.read_text(encoding="utf-8"))
        return parser

    def test_every_public_page_starts_with_one_skip_link(self):
        pages = public_pages()
        self.assertEqual(27, len(pages))
        for path in pages:
            with self.subTest(path=path.relative_to(ROOT)):
                parser = self.parse(path)
                links = [attrs for tag, attrs in parser.tags if tag == "a" and "skip-link" in attrs.get("class", "").split()]
                self.assertEqual([{"class": "skip-link", "href": "#main-content"}], links)
                self.assertEqual(("a", links[0]), parser.first_body_child)

    def test_every_skip_link_has_one_focusable_main_target(self):
        for path in public_pages():
            with self.subTest(path=path.relative_to(ROOT)):
                parser = self.parse(path)
                mains = [attrs for tag, attrs in parser.tags if tag == "main"]
                self.assertEqual(1, len(mains))
                self.assertEqual("main-content", mains[0].get("id"))
                self.assertEqual("-1", mains[0].get("tabindex"))

    def test_ids_and_aria_references_remain_valid(self):
        for path in public_pages():
            with self.subTest(path=path.relative_to(ROOT)):
                parser = self.parse(path)
                ids = [attrs["id"] for _, attrs in parser.tags if attrs.get("id")]
                self.assertEqual(len(ids), len(set(ids)))
                for _, attrs in parser.tags:
                    for name in ("aria-controls", "aria-labelledby", "aria-describedby"):
                        for target in attrs.get(name, "").split():
                            self.assertIn(target, ids, f"broken {name}={target}")

    def test_services_decorative_svgs_are_hidden(self):
        parser = self.parse(ROOT / "services.html")
        svgs = [attrs for tag, attrs in parser.tags if tag == "svg"]
        self.assertEqual(16, len(svgs))
        self.assertTrue(all(attrs.get("aria-hidden") == "true" for attrs in svgs))

    def test_skip_link_is_hidden_only_until_keyboard_focus(self):
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        normal = re.search(r"\.skip-link\{([^}]*)\}", css)
        focused = re.search(r"\.skip-link:focus\{([^}]*)\}", css)
        self.assertIsNotNone(normal)
        self.assertIsNotNone(focused)
        self.assertIn("position:fixed", normal.group(1))
        self.assertIn("transform:translateY(calc(-100% - 24px))", normal.group(1))
        self.assertNotIn("display:none", normal.group(1))
        self.assertNotIn("visibility:hidden", normal.group(1))
        self.assertIn("transform:translateY(0)", focused.group(1))
        self.assertIn("outline:", focused.group(1))


if __name__ == "__main__":
    unittest.main()
