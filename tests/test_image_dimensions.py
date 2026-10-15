import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_DIMENSIONS = {
    "/assets/library/about/leadership-workshop.webp": (1448, 1086),
    "/assets/library/general/practice-perfect-analytics-workspace.webp": (1440, 1080),
    "/assets/library/heroes/practice-perfect-boardroom-hero.webp": (1448, 1086),
    "/assets/library/home/opportunity-to-measurable-growth-dashboard.png": (1008, 608),
    "/assets/library/logos/practice-perfect-logo.svg": (240, 160),
    "/assets/library/pricing/scalable-growth-path.webp": (1672, 941),
    "/assets/library/services/approved-mountain-reference.png": (1448, 177),
    "/assets/library/services/approved-office-reference.png": (798, 453),
    "/assets/library/services/monitor-sharp-v2-780.webp": (1288, 1221),
    "/assets/library/what-we-fix/revenue-diagnostics.webp": (1440, 1080),
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


class ImageDimensionTests(unittest.TestCase):
    def test_every_public_image_has_verified_intrinsic_dimensions(self):
        pages = public_pages()
        self.assertEqual(27, len(pages))
        occurrences = []
        for page in pages:
            parser = ImageParser()
            parser.feed(page.read_text())
            for image in parser.images:
                src = image.get("src")
                self.assertIn(src, EXPECTED_DIMENSIONS, f"unreviewed image source in {page}")
                self.assertRegex(image.get("width", ""), r"^[1-9][0-9]*$", f"width in {page}")
                self.assertRegex(image.get("height", ""), r"^[1-9][0-9]*$", f"height in {page}")
                actual = (int(image["width"]), int(image["height"]))
                self.assertEqual(EXPECTED_DIMENSIONS[src], actual, f"{src} in {page}")
                occurrences.append((page, src, actual))
        self.assertEqual(64, len(occurrences))

    def test_logo_source_dimensions_preserve_svg_viewbox_ratio(self):
        self.assertEqual((240, 160), EXPECTED_DIMENSIONS["/assets/library/logos/practice-perfect-logo.svg"])
        occurrences = 0
        for page in public_pages():
            parser = ImageParser()
            parser.feed(page.read_text())
            occurrences += sum(
                image.get("src") == "/assets/library/logos/practice-perfect-logo.svg"
                for image in parser.images
            )
        self.assertEqual(53, occurrences)


if __name__ == "__main__":
    unittest.main()
