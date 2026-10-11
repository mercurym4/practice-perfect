import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]

EXPECTED_HIGH_PRIORITY = {
    ("about.html", "/assets/library/about/leadership-workshop.webp"),
    ("index.html", "/assets/library/heroes/practice-perfect-boardroom-hero.webp"),
    ("our-system.html", "/assets/library/general/practice-perfect-analytics-workspace.webp"),
    ("pricing.html", "/assets/library/pricing/scalable-growth-path.webp"),
    ("services.html", "/assets/library/services/approved-office-reference.png"),
    ("what-we-fix.html", "/assets/library/what-we-fix/revenue-diagnostics.webp"),
}

EXPECTED_LAZY = {
    ("about.html", "/assets/library/home/opportunity-to-measurable-growth-dashboard.png"),
    ("index.html", "/assets/library/home/opportunity-to-measurable-growth-dashboard.png"),
    ("index.html", "/assets/library/services/approved-mountain-reference.png"),
    ("services.html", "/assets/library/services/approved-mountain-reference.png"),
    ("services.html", "/assets/library/services/monitor-sharp-v2-780.webp"),
}


class ImageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attrs):
        if tag == "img":
            self.images.append(dict(attrs))


def public_pages():
    sitemap = ET.parse(ROOT / "sitemap.xml")
    urls = [node.text for node in sitemap.iter() if node.tag.endswith("loc")]
    pages = []
    for url in urls:
        route = urlparse(url).path.strip("/")
        pages.append(ROOT / ("index.html" if not route else f"{route}.html"))
    return pages


def public_images():
    for page in public_pages():
        parser = ImageParser()
        parser.feed(page.read_text())
        for image in parser.images:
            yield page.relative_to(ROOT).as_posix(), image


class ImageLoadingPriorityTests(unittest.TestCase):
    def test_only_reviewed_above_fold_images_are_high_priority(self):
        actual = set()
        for page, image in public_images():
            if image.get("fetchpriority") == "high":
                actual.add((page, image.get("src")))
                self.assertEqual("async", image.get("decoding"), f"async decode in {page}")
                self.assertNotEqual("lazy", image.get("loading"), f"high priority image in {page}")
        self.assertEqual(EXPECTED_HIGH_PRIORITY, actual)

    def test_only_reviewed_below_fold_images_are_lazy(self):
        actual = set()
        for page, image in public_images():
            if image.get("loading") == "lazy":
                actual.add((page, image.get("src")))
                self.assertEqual("async", image.get("decoding"), f"async decode in {page}")
                self.assertNotEqual("high", image.get("fetchpriority"), f"lazy image in {page}")
        self.assertEqual(EXPECTED_LAZY, actual)

    def test_logo_loading_is_not_deferred(self):
        logos = []
        for page, image in public_images():
            if image.get("src") == "/assets/library/logos/practice-perfect-logo.svg":
                logos.append((page, image))
                self.assertNotEqual("lazy", image.get("loading"), f"logo in {page}")
                self.assertNotEqual("high", image.get("fetchpriority"), f"logo in {page}")
        self.assertEqual(53, len(logos))


if __name__ == "__main__":
    unittest.main()
