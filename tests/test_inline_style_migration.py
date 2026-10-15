from html.parser import HTMLParser
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_ROOTS = {"docs", "tests", "scripts", "preview"}

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

def top_level_rules(css):
    css = re.sub(r"/\*[\s\S]*?\*/", "", css)
    rules = {}
    cursor = 0
    while cursor < len(css):
        opening = css.find("{", cursor)
        if opening < 0:
            break
        selector = css[cursor:opening].strip()
        depth, closing = 1, opening + 1
        while closing < len(css) and depth:
            depth += (css[closing] == "{") - (css[closing] == "}")
            closing += 1
        if depth:
            raise AssertionError("Unbalanced CSS braces")
        if selector and not selector.startswith("@"):
            rules[selector] = css[opening + 1:closing - 1].strip()
        cursor = closing
    return rules

def specificity(selector):
    ids = len(re.findall(r"#[\w-]+", selector))
    classes = len(re.findall(r"\.[\w-]+", selector))
    without_not = re.sub(r":not\([^)]*\)", "", selector)
    elements = len(re.findall(r"(?<![.#:-])\b(?:body|div|section)\b", without_not))
    return ids, classes, elements

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

        contact_html, _ = page("contact.html")
        contact_target = '<div class="contact-panel"><div class="eyebrow">Start here</div>'
        self.assertEqual(1, contact_html.count(contact_target))
        pricing_html, _ = page("pricing.html")
        pricing_target = '<div class="pricing-intro"><div class="section-heading">'
        self.assertEqual(1, pricing_html.count(pricing_target))

    def test_exact_rules_are_top_level_and_keep_former_inline_values(self):
        enhancements = (ROOT / "enhancements.css").read_text(encoding="utf-8")
        pricing = (ROOT / "pricing-dashboard.css").read_text(encoding="utf-8")
        enhancement_rules = top_level_rules(enhancements)
        pricing_rules = top_level_rules(pricing)
        self.assertEqual("margin-top:18px", enhancement_rules[".feature-grid--spaced"])
        contact_selector = "body:not(.services-page) .contact-panel .eyebrow"
        self.assertEqual("color:#9bd08d", enhancement_rules[contact_selector])
        self.assertEqual("margin:0", pricing_rules[".pricing-intro .section-heading"])
        # A target selector appearing inside a media query could make the migrated
        # value viewport-dependent. Each appears exactly once in the full file and
        # is proven above to be a top-level rule.
        self.assertEqual(1, enhancements.count(".feature-grid--spaced"))
        self.assertEqual(1, enhancements.count(contact_selector))
        self.assertEqual(1, pricing.count(".pricing-intro .section-heading"))

    def test_contact_rule_beats_existing_brand_rule_without_important(self):
        css = (ROOT / "enhancements.css").read_text(encoding="utf-8")
        general = "body:not(.services-page) .eyebrow{color:var(--pp-green)}"
        target = "body:not(.services-page) .contact-panel .eyebrow{color:#9bd08d}"
        self.assertIn(general, css)
        self.assertIn(target, css)
        self.assertLess(css.index(general), css.index(target))
        self.assertNotIn("!important", target)
        self.assertGreater(
            specificity(target.split("{", 1)[0]),
            specificity(general.split("{", 1)[0]),
        )

    def test_migrated_margin_rules_beat_or_avoid_existing_declarations(self):
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        pricing = (ROOT / "pricing-dashboard.css").read_text(encoding="utf-8")
        base = top_level_rules(styles)
        target = top_level_rules(pricing)
        self.assertNotIn("margin", base[".feature-grid"])
        self.assertIn("margin-bottom:34px", base[".section-heading"])
        self.assertGreater(
            specificity(".pricing-intro .section-heading"),
            specificity(".section-heading"),
        )
        self.assertEqual("margin:0", target[".pricing-intro .section-heading"])

    def test_target_stylesheet_order_is_unchanged(self):
        for name in ("our-system.html", "what-we-fix.html", "contact.html"):
            html, _ = page(name)
            self.assertLess(html.index('href="styles.css"'), html.index('href="enhancements.css"'))
        html, _ = page("pricing.html")
        self.assertLess(html.index('href="enhancements.css"'), html.index('href="pricing-dashboard.css"'))

if __name__ == "__main__":
    unittest.main()

