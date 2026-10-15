import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
INTER_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
COMBINED_URL = "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700;800&display=swap"
DM_SERIF_PAGES = {
    "about.html",
    "contact.html",
    "our-system.html",
    "pricing.html",
    "what-we-fix.html",
}


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "link":
            self.links.append(dict(attrs))


def public_pages():
    namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    sitemap = ElementTree.parse(ROOT / "sitemap.xml")
    pages = []
    for location in sitemap.findall(".//s:loc", namespace):
        relative = urlparse(location.text).path.strip("/") or "index"
        pages.append(relative if relative.endswith(".html") else f"{relative}.html")
    return pages


class FontLoadingTest(unittest.TestCase):
    def test_each_public_page_has_one_reviewed_font_stylesheet(self):
        pages = public_pages()
        self.assertEqual(27, len(pages))
        self.assertEqual(DM_SERIF_PAGES, {page for page in pages if page in DM_SERIF_PAGES})

        combined_count = 0
        inter_only_count = 0
        for page in pages:
            parser = LinkParser()
            parser.feed((ROOT / page).read_text())
            font_links = [
                link.get("href")
                for link in parser.links
                if link.get("rel") == "stylesheet"
                and (link.get("href") or "").startswith("https://fonts.googleapis.com/")
            ]
            expected = COMBINED_URL if page in DM_SERIF_PAGES else INTER_URL
            self.assertEqual([expected], font_links, page)
            combined_count += expected == COMBINED_URL
            inter_only_count += expected == INTER_URL

        self.assertEqual(5, combined_count)
        self.assertEqual(22, inter_only_count)

    def test_font_preconnects_precede_stylesheet_on_every_public_page(self):
        for page in public_pages():
            parser = LinkParser()
            parser.feed((ROOT / page).read_text())
            googleapis = [
                index for index, link in enumerate(parser.links)
                if link.get("rel") == "preconnect"
                and link.get("href") == "https://fonts.googleapis.com"
            ]
            gstatic = [
                (index, link) for index, link in enumerate(parser.links)
                if link.get("rel") == "preconnect"
                and link.get("href") == "https://fonts.gstatic.com"
            ]
            font_stylesheet = [
                index for index, link in enumerate(parser.links)
                if link.get("rel") == "stylesheet"
                and (link.get("href") or "").startswith("https://fonts.googleapis.com/")
            ]
            self.assertEqual(1, len(googleapis), page)
            self.assertEqual(1, len(gstatic), page)
            self.assertEqual(1, len(font_stylesheet), page)
            self.assertIn("crossorigin", gstatic[0][1], page)
            self.assertLess(googleapis[0], font_stylesheet[0], page)
            self.assertLess(gstatic[0][0], font_stylesheet[0], page)

    def test_public_css_has_no_external_font_import_chain(self):
        offenders = []
        for stylesheet in ROOT.rglob("*.css"):
            for line_number, line in enumerate(stylesheet.read_text().splitlines(), start=1):
                if "@import" in line and "fonts.googleapis.com" in line:
                    offenders.append(f"{stylesheet.relative_to(ROOT)}:{line_number}")
        self.assertEqual([], offenders)


if __name__ == "__main__":
    unittest.main()
