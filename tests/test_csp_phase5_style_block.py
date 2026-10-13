from hashlib import sha1
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from inventory_csp import inventory

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

STYLE_BLOCK = f'<style id="pp-operating-flow-polish">\n{OPERATING_FLOW_RULES}\n</style>'
ENHANCEMENTS_ADDITION = f"""
/* CSP phase 5: exact Our System operating-flow rules moved from the page block. */
{OPERATING_FLOW_RULES}
"""
STARTING_BLOBS = {
    "our-system.html": "c513a119dac936e6cb88a340fff3cb683847bf0d",
    "enhancements.css": "1d2f0f5617edf0211676c72e3e7e4bbb5619b4d7",
}


def git_blob_sha(text):
    data = text.encode("utf-8")
    return sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


class CspPhase5StyleBlockTest(unittest.TestCase):
    def test_only_the_reviewed_block_and_stylesheet_changed(self):
        html = (ROOT / "our-system.html").read_text(encoding="utf-8")
        anchor = '<link rel="stylesheet" href="enhancements.css">'
        self.assertEqual(1, html.count(anchor))
        restored_html = html.replace(anchor, anchor + STYLE_BLOCK)

        enhancements = (ROOT / "enhancements.css").read_text(encoding="utf-8")
        self.assertTrue(enhancements.endswith(ENHANCEMENTS_ADDITION))
        restored_css = enhancements.removesuffix(ENHANCEMENTS_ADDITION)

        self.assertEqual(STARTING_BLOBS, {
            "our-system.html": git_blob_sha(restored_html),
            "enhancements.css": git_blob_sha(restored_css),
        })

    def test_exact_rules_are_externalized_once(self):
        html = (ROOT / "our-system.html").read_text(encoding="utf-8")
        enhancements = (ROOT / "enhancements.css").read_text(encoding="utf-8")
        self.assertNotIn('id="pp-operating-flow-polish"', html)
        self.assertNotIn("#growth-operating-flow{", html)
        for rule in OPERATING_FLOW_RULES.splitlines():
            expected = 2 if rule == "#growth-operating-flow .system-arrow{display:none}" else 1
            self.assertEqual(expected, enhancements.count(rule), rule)

    def test_stylesheet_order_and_responsive_boundaries_are_preserved(self):
        html = (ROOT / "our-system.html").read_text(encoding="utf-8")
        self.assertLess(html.index('href="styles.css"'), html.index('href="enhancements.css"'))
        enhancements = (ROOT / "enhancements.css").read_text(encoding="utf-8")
        self.assertIn("@media(max-width:980px){#growth-operating-flow", enhancements)
        self.assertIn("@media(max-width:650px){#growth-operating-flow", enhancements)
        self.assertNotIn("@media(max-width:640px){#growth-operating-flow", enhancements)

    def test_inventory_reduces_to_the_services_block_only(self):
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
