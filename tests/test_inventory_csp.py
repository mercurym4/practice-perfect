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


if __name__ == "__main__":
    unittest.main()
