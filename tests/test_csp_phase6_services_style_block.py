from hashlib import sha1
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from inventory_csp import inventory

STYLE_BYTES = 9489
STYLESHEET_LINK = '<link rel="stylesheet" href="/services-reference.css">'
STARTING_BLOBS = {
    "services.html": "85353920bc28219b20c7ade32e9deb3cfe8c2ff2",
    "services-reference.css": "48c1a96968b19c843024721f8ce66688045aa46d",
}


def git_blob_sha(text):
    data = text.encode("utf-8")
    return sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def split_candidate():
    css = (ROOT / "services-reference.css").read_text(encoding="utf-8")
    encoded = css.encode("utf-8")
    block = encoded[:STYLE_BYTES].decode("utf-8")
    original = encoded[STYLE_BYTES:].decode("utf-8").removeprefix("\n")
    return css, block, original


def top_level_preludes(css):
    prelude_start = 0
    depth = 0
    preludes = []
    index = 0
    while index < len(css):
        character = css[index]
        if character == "{" and depth == 0:
            prelude = re.sub(r"/\*.*?\*/", "", css[prelude_start:index], flags=re.S).strip()
            preludes.append(prelude)
            depth = 1
        elif character == "{" and depth:
            depth += 1
        elif character == "}" and depth:
            depth -= 1
            if depth == 0:
                prelude_start = index + 1
        index += 1
    if depth:
        raise AssertionError("unbalanced Services CSS")
    return preludes


class CspPhase6ServicesStyleBlockTest(unittest.TestCase):
    def test_only_the_reviewed_services_block_moved(self):
        html = (ROOT / "services.html").read_text(encoding="utf-8")
        css, block, original_css = split_candidate()
        self.assertEqual(STYLE_BYTES, len(block.encode("utf-8")))
        self.assertEqual(1, html.count(STYLESHEET_LINK))
        restored_html = html.replace(
            STYLESHEET_LINK, f"<style>{block}</style>{STYLESHEET_LINK}"
        )
        self.assertEqual(STARTING_BLOBS, {
            "services.html": git_blob_sha(restored_html),
            "services-reference.css": git_blob_sha(original_css),
        })
        self.assertEqual(block + "\n" + original_css, css)

    def test_html_link_and_metadata_order_are_unchanged(self):
        html = (ROOT / "services.html").read_text(encoding="utf-8")
        self.assertNotIn("<style", html)
        self.assertEqual(1, html.count(STYLESHEET_LINK))
        self.assertLess(html.index("fonts.googleapis.com"), html.index(STYLESHEET_LINK))
        self.assertLess(html.index(STYLESHEET_LINK), html.index('<link rel="canonical"'))
        self.assertLess(html.index('<link rel="canonical"'), html.index('/analytics.js'))
        self.assertEqual(1, html.count('type="application/ld+json"'))

    def test_base_rules_and_responsive_order_are_preserved(self):
        _, block, original_css = split_candidate()
        self.assertTrue(block.startswith(":root{"))
        self.assertTrue(original_css.startswith(
            "/* Approved Services composition, using the site's existing Inter typography. */"
        ))
        self.assertNotRegex(block, r"url\(|@import|@font-face|@keyframes|@supports|@layer|@container")
        self.assertEqual(8, block.count("!important"))
        self.assertEqual(87, len(top_level_preludes(block)))
        media = [item for item in top_level_preludes(block) if item.startswith("@media")]
        self.assertEqual([
            "@media(max-width:980px)",
            "@media(max-width:640px)",
            "@media (min-width:1700px)",
            "@media(max-width:980px)",
            "@media(max-width:640px)",
        ], media)
        self.assertLess(block.index("/* Ultrawide Services image handling */"),
                        block.index("/* Services mobile navigation */"))

    def test_inventory_is_fully_externalized(self):
        result = inventory(ROOT)
        self.assertTrue(result["ok"], result)
        self.assertEqual({
            "public_html": 27,
            "inline_script_blocks": 0,
            "inline_style_blocks": 0,
            "style_attributes": 0,
            "inline_event_handlers": 0,
        }, result["counts"])
        self.assertEqual([], result["inline_occurrence_groups"])


if __name__ == "__main__":
    unittest.main()
