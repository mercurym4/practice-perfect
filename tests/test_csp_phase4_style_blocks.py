from hashlib import sha1
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from inventory_csp import inventory

HEADER_RULES = (
    ".header .brand{display:flex;align-items:center;flex:0 0 auto}"
    ".header .brand img{width:176px!important;height:auto!important;"
    "max-width:none!important;display:block!important}"
    "@media(max-width:640px){.header .brand img{width:145px!important}}"
)
ABOUT_RULES = (
    ".about-dashboard-image-wrap{min-height:0!important;"
    "background:transparent!important;box-shadow:0 16px 42px rgba(13,43,85,.12)}"
    ".about-dashboard-image-wrap img{display:block;width:100%;height:auto;object-fit:contain}"
)
PRICING_RULES = (
    ".pricing-hero-visual{position:relative;min-height:500px;overflow:hidden}"
    ".pricing-hero-image{position:absolute;inset:0;width:100%;height:100%;"
    "object-fit:cover;object-position:center;display:block}"
    ".pricing-hero-visual:after{content:\"\";position:absolute;inset:0;"
    "background:linear-gradient(90deg,rgba(241,247,242,.32),rgba(13,43,85,.04))}"
    ".pricing-hero-visual .hero-chip{z-index:2}"
)
SIMPLE_PAGES = ("index.html", "contact.html", "our-system.html", "what-we-fix.html")
STARTING_BLOBS = {
    "index.html": "0498174f6f0d1b6d5e2c13688fe3a272359e300d",
    "contact.html": "0ce38bd5f74abf3c9a787986834070c37d4c4597",
    "our-system.html": "505764dbd8c4064f98fd2b2ed63889f2c269d2d6",
    "what-we-fix.html": "1fb83dda21fa9376b532720e3ab923aa1c32923f",
    "about.html": "468067705d6657fc684dae23eeb4d9d077be6a90",
    "pricing.html": "17c099573ae222f21b2d9c778589d70cf90eebd4",
    "enhancements.css": "088f62bd242795c50e6c3a2f2755bb3465beba73",
    "pricing-dashboard.css": "dd52482f551d26b339afbd6d7a2141afccb41a09",
}
ENHANCEMENTS_ADDITION = """
/* CSP phase 4: shared header scale and About visual rules moved from page blocks. */
.header .brand{display:flex;align-items:center;flex:0 0 auto}
.header .brand img{width:176px!important;height:auto!important;max-width:none!important;display:block!important}
@media(max-width:640px){.header .brand img{width:145px!important}}
.about-dashboard-image-wrap{min-height:0!important;background:transparent!important;box-shadow:0 16px 42px rgba(13,43,85,.12)}
.about-dashboard-image-wrap img{display:block;width:100%;height:auto;object-fit:contain}
"""
PRICING_ADDITION = """
/* CSP phase 4: exact Pricing hero rules moved from the page block. */
.pricing-hero-visual{position:relative;min-height:500px;overflow:hidden}
.pricing-hero-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block}
.pricing-hero-visual:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(241,247,242,.32),rgba(13,43,85,.04))}
.pricing-hero-visual .hero-chip{z-index:2}
"""
OPERATING_FLOW_RULES = """#growth-operating-flow{grid-template-columns:repeat(2,minmax(0,1fr));min-height:0;padding:28px;gap:16px;background:linear-gradient(135deg,var(--navy),#174c70);border:0;align-items:stretch}
#growth-operating-flow .system-node{position:relative;min-width:0;text-align:left;padding:22px 18px;background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 24px rgba(13,43,85,.12);overflow:hidden}
#growth-operating-flow .system-node:before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--green),var(--blue))}
#growth-operating-flow .system-node-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:20px}
#growth-operating-flow .feature-icon{width:46px;height:46px;flex-shrink:0;margin:0;background:var(--mint);color:var(--navy)}
#growth-operating-flow .system-node span{width:auto;height:auto;margin:0;background:none;border-radius:0;color:var(--text);font-size:12px;letter-spacing:.08em}
#growth-operating-flow .system-node b{font-size:19px;color:var(--navy);line-height:1.3}
#growth-operating-flow .system-node small{font-size:12px;line-height:1.5;color:var(--text);margin-top:7px}
#growth-operating-flow .system-arrow{display:none}
@media(max-width:980px){#growth-operating-flow{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:24px}#growth-operating-flow .system-arrow{display:none}}
@media(max-width:650px){#growth-operating-flow{grid-template-columns:1fr;padding:18px;gap:14px}#growth-operating-flow .system-node{padding:20px}#growth-operating-flow .system-node-top{margin-bottom:14px}}"""
OPERATING_FLOW_STYLE = f'<style id="pp-operating-flow-polish">\n{OPERATING_FLOW_RULES}\n</style>'
PHASE5_ADDITION = f"""
/* CSP phase 5: exact Our System operating-flow rules moved from the page block. */
{OPERATING_FLOW_RULES}
"""


def git_blob_sha(text):
    data = text.encode("utf-8")
    return sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


class CspPhase4StyleBlockTest(unittest.TestCase):
    def test_only_the_six_reviewed_blocks_and_two_stylesheets_changed(self):
        restored = {}
        anchor = '<link rel="stylesheet" href="enhancements.css">'
        for name in SIMPLE_PAGES:
            html = (ROOT / name).read_text(encoding="utf-8")
            self.assertEqual(1, html.count(anchor), name)
            later_style = OPERATING_FLOW_STYLE if name == "our-system.html" else ""
            restored[name] = html.replace(
                anchor,
                anchor + f'<style id="pp-logo-match-services">{HEADER_RULES}</style>' + later_style,
            )

        about = (ROOT / "about.html").read_text(encoding="utf-8")
        self.assertEqual(1, about.count(anchor))
        restored["about.html"] = about.replace(
            anchor, anchor + f'<style id="pp-logo-match-services">{HEADER_RULES}{ABOUT_RULES}</style>'
        )

        pricing = (ROOT / "pricing.html").read_text(encoding="utf-8")
        pricing_anchor = '<link rel="stylesheet" href="pricing-dashboard.css">'
        self.assertEqual(1, pricing.count(pricing_anchor))
        restored["pricing.html"] = pricing.replace(
            pricing_anchor,
            pricing_anchor + f'<style id="pp-logo-match-services">{HEADER_RULES}{PRICING_RULES}</style>',
        )

        enhancements = (ROOT / "enhancements.css").read_text(encoding="utf-8")
        self.assertTrue(enhancements.endswith(PHASE5_ADDITION))
        enhancements = enhancements.removesuffix(PHASE5_ADDITION)
        self.assertTrue(enhancements.endswith(ENHANCEMENTS_ADDITION))
        restored["enhancements.css"] = enhancements.removesuffix(ENHANCEMENTS_ADDITION)
        pricing_css = (ROOT / "pricing-dashboard.css").read_text(encoding="utf-8")
        self.assertTrue(pricing_css.endswith(PRICING_ADDITION))
        restored["pricing-dashboard.css"] = pricing_css.removesuffix(PRICING_ADDITION)

        self.assertEqual(STARTING_BLOBS, {
            name: git_blob_sha(text) for name, text in restored.items()
        })

    def test_exact_rules_are_scoped_once_in_the_expected_stylesheets(self):
        enhancements = (ROOT / "enhancements.css").read_text(encoding="utf-8")
        pricing = (ROOT / "pricing-dashboard.css").read_text(encoding="utf-8")
        for rule in (
            ".header .brand{display:flex;align-items:center;flex:0 0 auto}",
            ".header .brand img{width:176px!important;height:auto!important;max-width:none!important;display:block!important}",
            "@media(max-width:640px){.header .brand img{width:145px!important}}",
            ".about-dashboard-image-wrap{min-height:0!important;background:transparent!important;box-shadow:0 16px 42px rgba(13,43,85,.12)}",
            ".about-dashboard-image-wrap img{display:block;width:100%;height:auto;object-fit:contain}",
        ):
            self.assertEqual(1, enhancements.count(rule), rule)
        for rule in (
            ".pricing-hero-visual{position:relative;min-height:500px;overflow:hidden}",
            ".pricing-hero-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block}",
            '.pricing-hero-visual:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(241,247,242,.32),rgba(13,43,85,.04))}',
            ".pricing-hero-visual .hero-chip{z-index:2}",
        ):
            self.assertEqual(1, pricing.count(rule), rule)
        self.assertNotIn(".header .brand", pricing)

    def test_target_stylesheet_order_and_breakpoints_are_preserved(self):
        for name in (*SIMPLE_PAGES, "about.html"):
            html = (ROOT / name).read_text(encoding="utf-8")
            self.assertLess(html.index('href="styles.css"'), html.index('href="enhancements.css"'))
        index = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertLess(index.index('href="enhancements.css"'), index.index('href="/homepage.css"'))
        pricing = (ROOT / "pricing.html").read_text(encoding="utf-8")
        self.assertLess(pricing.index('href="enhancements.css"'), pricing.index('href="pricing-dashboard.css"'))
        enhancements = (ROOT / "enhancements.css").read_text(encoding="utf-8")
        self.assertIn("@media(max-width:640px){.header .brand img{width:145px!important}}", enhancements)
        self.assertNotIn("@media(max-width:650px){.header .brand img", enhancements)

    def test_inventory_reduces_to_only_the_deferred_phase6_block(self):
        result = inventory(ROOT)
        self.assertTrue(result["ok"], result)
        self.assertEqual(1, result["counts"]["inline_style_blocks"])
        self.assertEqual(0, result["counts"]["inline_script_blocks"])
        self.assertEqual(0, result["counts"]["style_attributes"])
        self.assertEqual(0, result["counts"]["inline_event_handlers"])
        remaining_paths = sorted(
            item["path"]
            for group in result["inline_occurrence_groups"]
            if group["kind"] == "style-block"
            for item in group["locations"]
        )
        self.assertEqual(["services.html"], remaining_paths)


if __name__ == "__main__":
    unittest.main()
