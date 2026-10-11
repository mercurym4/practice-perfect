from pathlib import Path
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent / "scripts"
if not SCRIPTS.is_dir():
    SCRIPTS = HERE
sys.path.insert(0, str(SCRIPTS))
from inventory_csp import inventory


class CspInventoryTest(unittest.TestCase):
    def site(self, html):
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        (root / "index.html").write_text(html, encoding="utf-8")
        return temp, root

    def test_expected_self_google_fonts_and_inline_blocks_pass(self):
        temp, root = self.site('''<html><head>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
          <style>body{color:#123}</style><script>document.documentElement.className="ready"</script>
          <script src="/analytics.js"></script></head><body><img src="data:image/png;base64,AA=="></body></html>''')
        try:
            result = inventory(root)
            self.assertTrue(result["ok"], result)
            self.assertEqual(1, result["counts"]["inline_script_blocks"])
            self.assertEqual(1, result["counts"]["inline_style_blocks"])
        finally:
            temp.cleanup()

    def test_unexpected_external_script_fails(self):
        temp, root = self.site('<script src="https://tracker.example/app.js"></script>')
        try:
            result = inventory(root)
            self.assertFalse(result["ok"])
            self.assertEqual("unexpected-active-origin", result["errors"][0]["code"])
        finally:
            temp.cleanup()

    def test_inline_event_handler_fails(self):
        temp, root = self.site('<button onclick="doThing()">Go</button>')
        try:
            result = inventory(root)
            self.assertFalse(result["ok"])
            self.assertEqual("inline-event-handler", result["errors"][0]["code"])
        finally:
            temp.cleanup()

    def test_css_import_and_server_function_are_classified_separately(self):
        temp, root = self.site('<link rel="stylesheet" href="/styles.css">')
        try:
            (root / "styles.css").write_text(
                '@import url("https://fonts.googleapis.com/css2?family=Inter");',
                encoding="utf-8",
            )
            (root / "api").mkdir()
            (root / "api" / "contact.js").write_text(
                'fetch("https://api.resend.com/emails")', encoding="utf-8"
            )
            result = inventory(root)
            self.assertTrue(result["ok"], result)
            self.assertIn("https://fonts.googleapis.com", result["origins"]["style-src"])
            self.assertNotIn("https://fonts.googleapis.com", result["origins"].get("img-src", []))
            self.assertNotIn("https://api.resend.com", result["origins"].get("connect-src", []))
            self.assertEqual(["https://api.resend.com"], result["server_connect_origins"])
        finally:
            temp.cleanup()

    def test_inline_occurrences_include_locations_and_duplicate_groups(self):
        temp, root = self.site('''<html><head>
<style>.notice{color:red}</style>
<script>document.body.dataset.ready="true"</script>
</head><body><p style="font-weight:700">Ready</p></body></html>''')
        try:
            (root / "about.html").write_text(
                '<style>.notice{color:red}</style><p style="font-weight:700">About</p>',
                encoding="utf-8",
            )
            result = inventory(root)
            groups = result["inline_occurrence_groups"]
            style_block = next(group for group in groups if group["kind"] == "style-block")
            style_attr = next(group for group in groups if group["kind"] == "style-attribute")
            script = next(group for group in groups if group["kind"] == "script")
            self.assertEqual(2, style_block["occurrence_count"])
            self.assertEqual(["about.html", "index.html"], [item["path"] for item in style_block["locations"]])
            self.assertEqual(2, style_attr["occurrence_count"])
            self.assertEqual(3, script["locations"][0]["line"])
            self.assertEqual("p", style_attr["locations"][0]["tag"])
        finally:
            temp.cleanup()


if __name__ == "__main__":
    unittest.main()
