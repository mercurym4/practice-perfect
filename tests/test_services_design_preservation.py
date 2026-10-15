"""Source guards for the actual Services stylesheet; no rendering or provider calls."""
from hashlib import sha1
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
PREFIX_BYTES = 16349
PREFIX_BLOB = "4a696ef68df2aaa7509deb89b1962eba303cebf8"
ACCESSIBILITY = (
    "/* Keyboard users can bypass the repeated site navigation. Hidden until focused. */\n"
    ".skip-link{position:fixed;top:12px;left:12px;z-index:10000;padding:12px 16px;border:2px solid currentColor;border-radius:8px;background:#fff;color:var(--navy);font-weight:700;transform:translateY(calc(-100% - 24px));transition:transform .15s ease}\n"
    ".skip-link:focus{transform:translateY(0);outline:3px solid #1477ff;outline-offset:3px}\n"
    "@media(prefers-reduced-motion:reduce){.skip-link{transition:none}}\n"
)
APPENDIX = (
    "\n/* PP-WEB-44: Preserve Services geometry with intrinsic image dimensions and keyboard access. */\n"
    ".services-reference .brand img{height:auto}\n\n" + ACCESSIBILITY
).encode("utf-8")


def git_blob(data):
    return sha1(f"blob {len(data)}\0".encode("ascii") + data).hexdigest()


def validate_services_css(css, shared_css):
    if not isinstance(css, bytes) or len(css) != PREFIX_BYTES + len(APPENDIX):
        raise ValueError("Services reviewed extension length changed")
    prefix, suffix = css[:PREFIX_BYTES], css[PREFIX_BYTES:]
    if git_blob(prefix) != PREFIX_BLOB:
        raise ValueError("Services original stylesheet bytes changed")
    if suffix != APPENDIX:
        raise ValueError("Services reviewed geometry/accessibility extension changed")
    canonical = ACCESSIBILITY.encode("utf-8")
    if shared_css.count(canonical) != 1:
        raise ValueError("Canonical shared skip/focus/reduced-motion rules differ")
    return prefix


class ServicesParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stylesheets = []
        self.skip_links = []
        self.mains = []
        self.images = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.stylesheets.append(attrs.get("href"))
        if tag == "a" and attrs.get("class") == "skip-link":
            self.skip_links.append(attrs)
        if tag == "main":
            self.mains.append(attrs)
        if tag == "img":
            self.images.append(attrs)


class ServicesDesignPreservationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.css = (ROOT / "services-reference.css").read_bytes()
        cls.shared = (ROOT / "styles.css").read_bytes()
        cls.html = (ROOT / "services.html").read_text(encoding="utf-8")

    def test_actual_services_css_keeps_every_prior_byte_then_only_reviewed_extension(self):
        prefix = validate_services_css(self.css, self.shared)
        self.assertEqual(PREFIX_BLOB, git_blob(prefix))
        self.assertEqual(16349, len(prefix))

    def test_skip_focus_and_reduced_motion_are_exact_shared_canonical_rules(self):
        self.assertEqual(1, self.shared.count(ACCESSIBILITY.encode()))
        self.assertTrue(self.css.endswith(ACCESSIBILITY.encode()))
        self.assertNotIn(b"display:none", ACCESSIBILITY.encode())
        self.assertNotIn(b"visibility:hidden", ACCESSIBILITY.encode())

    def test_services_loads_the_repaired_stylesheet_without_unrelated_shared_css(self):
        parsed = ServicesParser()
        parsed.feed(self.html)
        local = [href for href in parsed.stylesheets if href.startswith("/")]
        self.assertEqual(["/services-reference.css"], local)
        self.assertNotIn("styles.css", parsed.stylesheets)
        self.assertEqual([{"class": "skip-link", "href": "#main-content"}], parsed.skip_links)
        self.assertEqual([{"id": "main-content", "tabindex": "-1"}], parsed.mains)

    def test_intrinsic_logo_height_has_no_width_palette_spacing_or_other_image_override(self):
        self.assertEqual(1, APPENDIX.count(b".services-reference .brand img{height:auto}"))
        self.assertNotIn(b"width:", APPENDIX)
        self.assertNotIn(b"!important", APPENDIX)
        self.assertNotIn(b"object-fit", APPENDIX)
        parsed = ServicesParser()
        parsed.feed(self.html)
        logo = [image for image in parsed.images if image.get("src") == "/assets/library/logos/practice-perfect-logo.svg"]
        self.assertEqual(1, len(logo))
        self.assertEqual(("240", "160"), (logo[0]["width"], logo[0]["height"]))
        # Numeric correlation only, not a browser-rendered dimension assertion.
        self.assertAlmostEqual(145 * 150 / 225, 96.6666666667)
        self.assertAlmostEqual(176 * 150 / 225, 117.3333333333)

    def test_unchanged_pre_fix_source_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_services_css(self.css[:PREFIX_BYTES], self.shared)

    def test_prior_design_mutation_is_rejected(self):
        changed = self.css.replace(b"--navy:#0d2b55", b"--navy:#0d2b54", 1)
        self.assertEqual(len(self.css), len(changed))
        with self.assertRaisesRegex(ValueError, "original stylesheet"):
            validate_services_css(changed, self.shared)

    def test_truncated_prefix_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_services_css(self.css[1:], self.shared)

    def test_duplicate_extension_or_late_overrides_are_rejected(self):
        for extra in (APPENDIX, b".skip-link{position:static}", b".brand img{height:160px}"):
            with self.subTest(extra=extra):
                with self.assertRaises(ValueError):
                    validate_services_css(self.css + extra, self.shared)

    def test_visible_in_flow_skip_link_regression_is_rejected(self):
        changed = self.css[:PREFIX_BYTES] + APPENDIX.replace(b"position:fixed", b"position:static")
        with self.assertRaises(ValueError):
            validate_services_css(changed, self.shared)

    def test_fixed_html_logo_height_regression_is_rejected(self):
        changed = self.css[:PREFIX_BYTES] + APPENDIX.replace(b"img{height:auto}", b"img{height:160px}")
        with self.assertRaises(ValueError):
            validate_services_css(changed, self.shared)

    def test_keyboard_focus_and_reduced_motion_regressions_are_rejected(self):
        for before, after in ((b"translateY(0)", b"translateY(-100%)"),
                              (b"outline:3px solid #1477ff", b"outline:none"),
                              (b"transition:none", b"transition:transform 2s")):
            with self.subTest(before=before):
                with self.assertRaises(ValueError):
                    validate_services_css(self.css[:PREFIX_BYTES] + APPENDIX.replace(before, after), self.shared)

    def test_shared_canonical_drift_or_duplicate_is_rejected(self):
        for shared in (self.shared.replace(b".skip-link:focus{", b".skip-link:focus-visible{"),
                       self.shared + ACCESSIBILITY.encode()):
            with self.assertRaises(ValueError):
                validate_services_css(self.css, shared)


if __name__ == "__main__":
    unittest.main()
