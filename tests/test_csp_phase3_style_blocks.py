from hashlib import sha1
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from inventory_csp import inventory

CONTACT_BLOCK = '''<style id="contact-hero-cleanup">
.contact-page .subhero-grid{min-height:0}
.contact-page .contact-nextsteps{min-height:0;margin:0;overflow:visible}
.contact-nextsteps .hero-chip{position:static;max-width:none}
@media(max-width:980px){
.contact-page .subhero-grid{gap:24px}
.contact-page .subhero-copy{padding:36px 0 0}
.contact-page .contact-nextsteps{margin-bottom:32px}
}
</style>'''
AUDIT_BLOCK = '<style>.audit-context-link{display:inline-block;margin-top:12px;color:#0d2b55;font-size:13px;font-weight:700;line-height:1.5;text-decoration:underline;text-underline-offset:3px}.audit-context-link:focus-visible{outline:3px solid #1477ff;outline-offset:4px}</style>'
SERVICE_BLOCKS = {
    "services/debt-defense-direct-mail.html": '<style>#acquisition-scope{scroll-margin-top:94px}</style>',
    "services/pi-mva-lead-generation.html": '<style>#acquisition-scope{scroll-margin-top:94px}</style>',
    "services/ppc-marketing.html": '<style>#marketing-scope{scroll-margin-top:94px}</style>',
    "services/revenue-growth-sprint.html": '<style>#sprint-scope{scroll-margin-top:94px}</style>',
    "services/seo-marketing.html": '<style>#marketing-scope{scroll-margin-top:94px}</style>',
    "services/website-audit-overhaul.html": '<style>#website-scope{scroll-margin-top:94px}</style>',
    "services/website-design.html": '<style>#website-scope{scroll-margin-top:94px}</style>',
}
STARTING_BLOBS = {
    "contact.html": "e5f3735c9253b8dbd91baa414c341460f23ec652",
    "what-we-fix.html": "68a86250a99444dfe3b09a84c3ebfb7e8bc7461b",
    "services/debt-defense-direct-mail.html": "76a8a89ca1276fd1154a4cbdeb5abb6f272951ae",
    "services/pi-mva-lead-generation.html": "1421d56aea21b8c45f9d0a9cdbb2aa69176fd1da",
    "services/ppc-marketing.html": "562a63babb94ad5c667cb91eafc2372e26571191",
    "services/revenue-growth-sprint.html": "636810369aa39092cadb58347b46b6ee7e5df21f",
    "services/seo-marketing.html": "604e441a29ea93803a7287ee06cd902697e8d8ef",
    "services/website-audit-overhaul.html": "c1a1bd7d6d4b324790eb6a31d7f6930bffb51ea3",
    "services/website-design.html": "95c239e72ff7d40707cbe65ebadd87034dfa103b",
}
HEADER_BLOCK = '<style id="pp-logo-match-services">.header .brand{display:flex;align-items:center;flex:0 0 auto}.header .brand img{width:176px!important;height:auto!important;max-width:none!important;display:block!important}@media(max-width:640px){.header .brand img{width:145px!important}}</style>'


def git_blob_sha(text):
    data = text.encode("utf-8")
    return sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


class CspPhase3StyleBlockTest(unittest.TestCase):
    def test_only_the_nine_reviewed_html_blocks_were_removed(self):
        restored = {}
        contact = (ROOT / "contact.html").read_text(encoding="utf-8")
        stylesheet = '<link rel="stylesheet" href="enhancements.css">'
        self.assertEqual(1, contact.count(stylesheet))
        contact = contact.replace(stylesheet, stylesheet + HEADER_BLOCK)
        anchor = '<link rel="canonical" href="https://practiceperfect.us/contact">'
        self.assertEqual(1, contact.count(anchor))
        restored["contact.html"] = contact.replace(anchor, anchor + CONTACT_BLOCK)

        audit = (ROOT / "what-we-fix.html").read_text(encoding="utf-8")
        self.assertEqual(1, audit.count(stylesheet))
        audit = audit.replace(stylesheet, stylesheet + HEADER_BLOCK)
        anchor = '<meta property="og:type" content="website">'
        self.assertEqual(1, audit.count(anchor))
        restored["what-we-fix.html"] = audit.replace(anchor, AUDIT_BLOCK + anchor)

        for name, block in SERVICE_BLOCKS.items():
            html = (ROOT / name).read_text(encoding="utf-8")
            self.assertEqual(1, html.count("</head>"), name)
            restored[name] = html.replace("</head>", block + "</head>")

        self.assertEqual(STARTING_BLOBS, {
            name: git_blob_sha(text) for name, text in restored.items()
        })

    def test_former_inline_blocks_are_absent(self):
        public_html = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted(ROOT.rglob("*.html"))
            if path.relative_to(ROOT).parts[0] not in {"docs", "tests", "scripts", "preview"}
            and path.name != "services-green.html"
        )
        for block in [CONTACT_BLOCK, AUDIT_BLOCK, *SERVICE_BLOCKS.values()]:
            self.assertNotIn(block, public_html)

    def test_exact_rules_are_scoped_once_in_the_existing_stylesheets(self):
        enhancements = (ROOT / "enhancements.css").read_text(encoding="utf-8")
        detail = (ROOT / "service-detail.css").read_text(encoding="utf-8")
        exact_rules = {
            ".contact-page .subhero-grid{min-height:0}": enhancements,
            ".contact-page .contact-nextsteps{min-height:0;margin:0;overflow:visible}": enhancements,
            ".contact-nextsteps .hero-chip{position:static;max-width:none}": enhancements,
            ".audit-context-link{display:inline-block;margin-top:12px;color:#0d2b55;font-size:13px;font-weight:700;line-height:1.5;text-decoration:underline;text-underline-offset:3px}": enhancements,
            ".audit-context-link:focus-visible{outline:3px solid #1477ff;outline-offset:4px}": enhancements,
            ".contact-page .subhero-grid{gap:24px}": enhancements,
            ".contact-page .subhero-copy{padding:36px 0 0}": enhancements,
            ".contact-page .contact-nextsteps{margin-bottom:32px}": enhancements,
            "#acquisition-scope{scroll-margin-top:94px}": detail,
            "#marketing-scope{scroll-margin-top:94px}": detail,
            "#website-scope{scroll-margin-top:94px}": detail,
            "#sprint-scope{scroll-margin-top:94px}": detail,
        }
        for rule, stylesheet in exact_rules.items():
            self.assertEqual(1, stylesheet.count(rule), rule)
        media = re.search(r"@media\(max-width:980px\)\{\n(.*?)\n\}", enhancements, re.S)
        self.assertIsNotNone(media)
        for rule in (
            ".contact-page .subhero-grid{gap:24px}",
            ".contact-page .subhero-copy{padding:36px 0 0}",
            ".contact-page .contact-nextsteps{margin-bottom:32px}",
        ):
            self.assertIn(rule, media.group(1))

    def test_target_pages_keep_the_existing_stylesheet_order(self):
        for name in ("contact.html", "what-we-fix.html"):
            html = (ROOT / name).read_text(encoding="utf-8")
            self.assertLess(html.index('href="styles.css"'), html.index('href="enhancements.css"'))
        for name in SERVICE_BLOCKS:
            html = (ROOT / name).read_text(encoding="utf-8")
            self.assertLess(html.index('href="/styles.css"'), html.index('href="/enhancements.css"'))
            self.assertLess(html.index('href="/enhancements.css"'), html.index('href="/service-detail.css"'))

    def test_phase3_targets_stay_absent_after_later_migrations(self):
        result = inventory(ROOT)
        self.assertTrue(result["ok"], result)
        self.assertEqual(0, result["counts"]["inline_style_blocks"])
        self.assertEqual(0, result["counts"]["inline_script_blocks"])
        self.assertEqual(0, result["counts"]["style_attributes"])
        self.assertEqual(0, result["counts"]["inline_event_handlers"])
        self.assertEqual(0, sum(
            group["occurrence_count"] for group in result["inline_occurrence_groups"]
            if group["kind"] == "style-block"
        ))
        remaining_paths = [
            item["path"]
            for group in result["inline_occurrence_groups"]
            if group["kind"] == "style-block"
            for item in group["locations"]
        ]
        self.assertEqual([], sorted(remaining_paths))
        self.assertTrue(set(SERVICE_BLOCKS).isdisjoint(remaining_paths))
        self.assertEqual(["'self'", "https://fonts.googleapis.com"], result["origins"]["style-src"])
        self.assertEqual(["https://api.resend.com"], result["server_connect_origins"])


if __name__ == "__main__":
    unittest.main()
