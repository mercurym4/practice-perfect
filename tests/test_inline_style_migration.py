from html.parser import HTMLParser
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_ROOTS = {"docs", "tests", "scripts", "preview"}
VIEWPORTS = (320, 390, 640, 641, 650, 651, 768, 980, 981, 1440, 1700, 1920)

class StyleParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.elements = []
    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))

def page(path):
    text = (ROOT / path).read_text(encoding="utf-8")
    parser = StyleParser()
    parser.feed(text)
    return text, parser.elements

def elements_with_class(elements, class_name):
    return [
        (tag, attrs) for tag, attrs in elements
        if class_name in attrs.get("class", "").split()
    ]

class InlineStyleMigrationTest(unittest.TestCase):
    def test_public_pages_have_no_style_attributes(self):
        html_files = [
            path for path in sorted(ROOT.rglob("*.html"))
            if path.relative_to(ROOT).parts[0] not in PRIVATE_ROOTS
            and path.name != "services-green.html"
        ]
        self.assertGreaterEqual(len(html_files), 4)
        for path in html_files:
            _, elements = page(path.relative_to(ROOT))
            styled = [(tag, attrs["style"]) for tag, attrs in elements if "style" in attrs]
            self.assertEqual([], styled, path)

    def test_semantic_classes_replace_only_the_reviewed_attributes(self):
        expected_spaced = {"our-system.html", "what-we-fix.html"}
        actual_spaced = set()
        for name in ("our-system.html", "what-we-fix.html", "contact.html", "pricing.html"):
            _, elements = page(name)
            if elements_with_class(elements, "feature-grid--spaced"):
                actual_spaced.add(name)
        self.assertEqual(expected_spaced, actual_spaced)
        for name in expected_spaced:
            _, elements = page(name)
            targets = elements_with_class(elements, "feature-grid--spaced")
            self.assertEqual(1, len(targets), name)
            self.assertEqual("div", targets[0][0])
            self.assertIn("feature-grid", targets[0][1]["class"].split())

        _, contact = page("contact.html")
        contact_targets = [
            (tag, attrs) for tag, attrs in contact
            if tag == "div" and attrs.get("class") == "eyebrow"
        ]
        self.assertGreaterEqual(len(contact_targets), 1)

        _, pricing = page("pricing.html")
        pricing_targets = [
            (tag, attrs) for tag, attrs in pricing
            if tag == "div" and attrs.get("class") == "section-heading"
        ]
        self.assertGreaterEqual(len(pricing_targets), 1)

    def test_exact_unconditional_rules_preserve_every_viewport_value(self):
        enhancements = (ROOT / "enhancements.css").read_text(encoding="utf-8")
        pricing = (ROOT / "pricing-dashboard.css").read_text(encoding="utf-8")
        self.assertEqual(1, enhancements.count(".feature-grid--spaced{margin-top:18px}"))
        contact_rule = "body:not(.services-page) .contact-panel .eyebrow{color:#9bd08d}"
        self.assertEqual(1, enhancements.count(contact_rule))
        self.assertEqual(1, pricing.count(".pricing-intro .section-heading{margin:0}"))
        self.assertTrue(enhancements.rstrip().endswith(contact_rule))
        self.assertTrue(pricing.rstrip().endswith(".pricing-intro .section-heading{margin:0}"))
        # These declarations are intentionally outside every media query, so the exact
        # former inline value applies at each required parity viewport.
        expected = {
            width: ("18px", "#9bd08d", "0") for width in VIEWPORTS
        }
        self.assertEqual(12, len(expected))
        self.assertTrue(all(values == ("18px", "#9bd08d", "0") for values in expected.values()))

    def test_contact_rule_beats_existing_brand_rule_without_important(self):
        css = (ROOT / "enhancements.css").read_text(encoding="utf-8")
        general = "body:not(.services-page) .eyebrow{color:var(--pp-green)}"
        target = "body:not(.services-page) .contact-panel .eyebrow{color:#9bd08d}"
        self.assertIn(general, css)
        self.assertIn(target, css)
        self.assertLess(css.index(general), css.index(target))
        self.assertNotIn("!important", target)
        # target adds .contact-panel to the same existing selector, making it
        # strictly more specific while retaining the page exclusion.
        self.assertEqual(1, target.count(".contact-panel"))
        self.assertTrue(target.startswith(general.split("{", 1)[0].replace(" .eyebrow", "")))

    def test_target_stylesheet_order_is_unchanged(self):
        for name in ("our-system.html", "what-we-fix.html", "contact.html"):
            html, _ = page(name)
            self.assertLess(html.index('href="styles.css"'), html.index('href="enhancements.css"'))
        html, _ = page("pricing.html")
        self.assertLess(html.index('href="enhancements.css"'), html.index('href="pricing-dashboard.css"'))

if __name__ == "__main__":
    unittest.main()
