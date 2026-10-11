import json
from pathlib import Path
import unittest


HERE = Path(__file__).resolve().parent
CONFIG = HERE.parent / "vercel.json"
if not CONFIG.is_file():
    CONFIG = HERE / "vercel.json"


class VercelSecurityHeadersTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = json.loads(CONFIG.read_text(encoding="utf-8"))

    def test_review_branch_cannot_auto_deploy(self):
        self.assertIs(False, self.config["git"]["deploymentEnabled"][
            "internal-website-source-audit"])

    def test_safe_global_headers_are_configured(self):
        global_rules = [rule for rule in self.config.get("headers", [])
                        if rule.get("source") == "/(.*)"]
        self.assertEqual(1, len(global_rules))
        values = {item["key"].lower(): item["value"]
                  for item in global_rules[0]["headers"]}
        self.assertEqual("nosniff", values.get("x-content-type-options"))
        self.assertEqual("strict-origin-when-cross-origin",
                         values.get("referrer-policy"))


if __name__ == "__main__":
    unittest.main()
