import json
from pathlib import Path
import re
import sys
import unittest


HERE = Path(__file__).resolve().parent
CONFIG = HERE.parent / "vercel.json"
if not CONFIG.is_file():
    CONFIG = HERE / "vercel.json"
ROOT = CONFIG.parent
SCRIPTS = ROOT / "scripts"
if SCRIPTS.is_dir():
    sys.path.insert(0, str(SCRIPTS))
    from inventory_csp import inventory


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

    def test_csp_is_report_only_and_has_no_unapproved_reporting_endpoint(self):
        global_rule = next(rule for rule in self.config["headers"]
                           if rule.get("source") == "/(.*)")
        values = {item["key"].lower(): item["value"]
                  for item in global_rule["headers"]}
        self.assertNotIn("content-security-policy", values)
        policy = values["content-security-policy-report-only"]
        for directive in ("default-src 'self'", "object-src 'none'",
                          "frame-ancestors 'none'", "form-action 'self'",
                          "connect-src 'self'"):
            self.assertIn(directive, policy)
        self.assertNotIn("report-uri", policy)
        self.assertNotIn("report-to", policy)

    def test_report_only_style_policy_matches_zero_inline_style_inventory(self):
        global_rule = next(rule for rule in self.config["headers"]
                           if rule.get("source") == "/(.*)")
        values = {item["key"].lower(): item["value"]
                  for item in global_rule["headers"]}
        policy = values["content-security-policy-report-only"]
        directives = {
            parts[0]: parts[1:]
            for directive in policy.split(";")
            if (parts := directive.strip().split())
        }
        self.assertEqual(["'self'", "https://fonts.googleapis.com"],
                         directives["style-src"])
        self.assertNotIn("'unsafe-inline'", directives["style-src"])
        self.assertEqual(["'self'", "'unsafe-inline'"],
                         directives["script-src"])

        result = inventory(ROOT)
        self.assertTrue(result["ok"], result)
        self.assertEqual(0, result["counts"]["inline_style_blocks"])
        self.assertEqual(0, result["counts"]["style_attributes"])
        self.assertEqual(policy, result["proposed_report_only"])

    def test_public_runtime_does_not_create_inline_styles(self):
        dynamic_style = re.compile(
            r"(?:\.style\b|cssText\b|setAttribute\s*\(\s*['\"]style['\"]|"
            r"createElement\s*\(\s*['\"]style['\"]|insertRule\s*\(|"
            r"innerHTML\b|outerHTML\b|insertAdjacentHTML\b|document\.write\s*\()"
        )
        private_roots = {"api", "docs", "preview", "scripts", "tests"}
        public_scripts = [
            path for path in sorted(ROOT.rglob("*.js"))
            if path.relative_to(ROOT).parts[0] not in private_roots
        ]
        self.assertEqual(["analytics.js", "contact-form.js", "mobile-menu.js"],
                         [path.relative_to(ROOT).as_posix() for path in public_scripts])
        for path in public_scripts:
            source = path.read_text(encoding="utf-8")
            self.assertIsNone(dynamic_style.search(source),
                              path.relative_to(ROOT).as_posix())


if __name__ == "__main__":
    unittest.main()
