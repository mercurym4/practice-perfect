"""Offline source-signature and filesystem guards; no browser/network."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import verify_main_content as guard


def page(body="<nav>Home</nav><p>Approved <b>growth</b> &amp; care.</p>", *,
         title="Practice &amp; Growth", description="Approved care", canonical="https://practiceperfect.us/",
         images='<img src="/approved.png" alt="Approved" srcset="/approved-2.png 2x">',
         jsonld='{"name":"Practice Perfect"}', candidate=False):
    skip = '<a class="skip-link" href="#main-content">Skip to main content</a>' if candidate else ""
    main = '<main id="main-content" tabindex="-1">' if candidate else "<main>"
    return (f'<!doctype html><html lang="en"><head><title>{title}</title>'
            f'<meta name="description" content="{description}"><link rel="canonical" href="{canonical}">'
            '<style>p{color:navy}</style><script>ignoredExecutable()</script>'
            f'<script type="application/ld+json">{jsonld}</script></head><body>{skip}'
            f'{main}{body}{images}</main><footer>All rights reserved.</footer></body></html>').encode()


class ContentSignatures(unittest.TestCase):
    def compare(self, **changes):
        return guard.compare_page(page(), page(candidate=True, **changes))

    def test_expected_skip_is_only_allowed_copy_delta(self):
        self.assertTrue(self.compare()["equal"])

    def test_title_entity_equivalence(self):
        self.assertTrue(self.compare(title="Practice &#38; Growth")["equal"])

    def test_nbsp_copy_drift_not_normalized(self):
        self.assertIn("public_text",self.compare(body="<nav>Home</nav><p>Approved&nbsp;<b>growth</b> &amp; care.</p>")["differences"])

    def test_all_meta_attributes_preserved(self):
        old=page().replace(b"</head>",b'<meta property="og:title" content="Approved"><meta name="twitter:card" content="summary"></head>')
        new=page(candidate=True).replace(b"</head>",b'<meta property="og:title" content="Changed"><meta name="twitter:card" content="summary"></head>')
        self.assertIn("metadata",guard.compare_page(old,new)["differences"])

    def test_original_existing_main_id_need_not_have_new_tabindex(self):
        old=page().replace(b"<main>",b'<main id="main-content">')
        self.assertTrue(guard.compare_page(old,page(candidate=True))["equal"])

    def test_head_must_precede_body(self):
        original=page(candidate=True).decode()
        head=original[original.index("<head>"):original.index("</head>")+7]
        body=original[original.index("<body>"):original.index("</body>")+7]
        with self.assertRaises(guard.ContentError):
            guard.parse_source(("<html>"+body+head+"</html>").encode(),candidate=True)

    def test_nested_text_preserved(self):
        result = self.compare(body="<nav>Home</nav><p>Approved <b>loss</b> &amp; care.</p>")
        self.assertEqual(result["differences"], ["public_text"])

    def test_navigation_not_ignored(self):
        self.assertIn("public_text", self.compare(body="<nav>Changed</nav><p>Approved <b>growth</b> &amp; care.</p>")["differences"])

    def test_hidden_text_not_ignored(self):
        self.assertIn("public_text", self.compare(body='<nav>Home</nav><p>Approved <b>growth</b> &amp; care.</p><span hidden>Extra offer</span>')["differences"])

    def test_title_metadata_canonical_changes(self):
        for changes, expected in (({"title":"Different"}, "title"),
                                  ({"description":"New offer"}, "description"),
                                  ({"canonical":"https://wrong.invalid/"}, "canonical")):
            with self.subTest(expected=expected):
                self.assertIn(expected, self.compare(**changes)["differences"])

    def test_raw_jsonld_whitespace_and_order_not_normalized(self):
        for jsonld in ('{ "name":"Practice Perfect"}', '{"name":"Other"}'):
            with self.subTest(jsonld=jsonld):
                self.assertIn("json_ld", self.compare(jsonld=jsonld)["differences"])

    def test_dimensions_loading_hints_excluded(self):
        result = self.compare(images='<img src="/approved.png" alt="Approved" srcset="/approved-2.png 2x" width="500" height="300" loading="lazy" decoding="async">')
        self.assertTrue(result["equal"])

    def test_image_src_srcset_alt_changes(self):
        original = '<img src="/approved.png" alt="Approved" srcset="/approved-2.png 2x">'
        for source in (original.replace("approved.png","new.png"),
                       original.replace("approved-2.png","new-2.png"),
                       original.replace('alt="Approved"','alt="Different"'),
                       original.replace(' alt="Approved"', "")):
            with self.subTest(source=source):
                self.assertIn("image_choices", self.compare(images=source)["differences"])

    def test_missing_image_alt_vs_empty_distinct(self):
        old = page(images='<img src="/approved.png">')
        new = page(candidate=True, images='<img src="/approved.png" alt="">')
        self.assertIn("image_choices", guard.compare_page(old, new)["differences"])

    def test_image_order(self):
        a = '<img src="/a.png" alt="A"><img src="/b.png" alt="B">'
        b = '<img src="/b.png" alt="B"><img src="/a.png" alt="A">'
        self.assertIn("image_choices", guard.compare_page(page(images=a), page(candidate=True,images=b))["differences"])

    def test_css_and_executable_script_excluded_explicitly(self):
        new = page(candidate=True).replace(b"color:navy", b"color:red").replace(b"ignoredExecutable()",b"newExecutable()")
        self.assertTrue(guard.compare_page(page(),new)["equal"])

    def test_skip_wrong_text_attributes_extra_nested_and_missing(self):
        expected = b'<a class="skip-link" href="#main-content">Skip to main content</a>'
        for replacement in (b"", expected*2, expected.replace(b"content</a>", b"offer</a>"),
                            expected.replace(b'class="skip-link"', b'class="skip-link hidden"'),
                            expected.replace(b'class="skip-link"', b'class="skip-link" hidden'),
                            expected.replace(b'href="#main-content"', b'href="#wrong"'),
                            expected.replace(b"Skip to", b"<span>Skip</span> to"),
                            expected.replace(b'href="#main-content"',b'href="#main-content" href="#evil"')):
            with self.subTest(replacement=replacement), self.assertRaises(guard.ContentError):
                guard.compare_page(page(),page(candidate=True).replace(expected,replacement))

    def test_wrong_target(self):
        for replacement in (b'id="wrong"', b'id="main-content" hidden', b'id="main-content" tabindex="0"'):
            data=page(candidate=True).replace(b'id="main-content" tabindex="-1"',replacement)
            with self.subTest(replacement=replacement), self.assertRaises(guard.ContentError):
                guard.parse_source(data,candidate=True)

    def test_malformed_documents(self):
        for data in (b"<html>", page().replace(b"</p>",b"</div>"), page().replace(b"</html>",b""),
                     page().replace(b'<meta name="description"',b'<meta name="description" name="other"'),
                     page()+b"<", page().replace(b"Approved", b"Bad\0text",1),
                     page().replace(b"Approved",b"Bad\xff",1)):
            with self.subTest(data=data[:30]), self.assertRaises(guard.ContentError):
                guard.parse_source(data)

    def test_size_bound(self):
        with self.assertRaises(guard.ContentError):
            guard.parse_source(b"x"*(guard.MAX_PAGE_BYTES+1))


class CandidateFiles(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory()
        self.root=Path(self.temporary.name)
        (self.root/"index.html").write_bytes(page(candidate=True))

    def tearDown(self):
        self.temporary.cleanup()

    def test_regular_bytes(self):
        self.assertEqual(guard.read_candidate(self.root,"index.html"),page(candidate=True))

    def test_missing_and_private_outside_path(self):
        for name in ("missing.html","docs/private.html","../index.html","/index.html"):
            with self.subTest(name=name), self.assertRaises(guard.ContentError):
                guard.read_candidate(self.root,name)

    def test_symlink_final(self):
        (self.root/"about.html").symlink_to("index.html")
        with self.assertRaises(guard.ContentError):
            guard.read_candidate(self.root,"about.html")

    def test_symlink_directory_and_root(self):
        (self.root/"services").symlink_to(self.root,target_is_directory=True)
        with self.assertRaises(guard.ContentError):
            guard.read_candidate(self.root,"services/website-design.html")
        link=self.root/"rootlink"
        link.symlink_to(self.root,target_is_directory=True)
        with self.assertRaises(guard.ContentError):
            guard.read_candidate(link,"index.html")

    def test_hardlink_refused(self):
        os.link(self.root/"index.html",self.root/"about.html")
        with self.assertRaises(guard.ContentError):
            guard.read_candidate(self.root,"about.html")

    def test_fifo_refused_without_block(self):
        os.mkfifo(self.root/"about.html")
        with self.assertRaises(guard.ContentError):
            guard.read_candidate(self.root,"about.html")

    def test_directory_not_html(self):
        (self.root/"about.html").mkdir()
        with self.assertRaises(guard.ContentError):
            guard.read_candidate(self.root,"about.html")

    def test_oversized_file(self):
        (self.root/"index.html").write_bytes(b"x"*(guard.MAX_PAGE_BYTES+1))
        with self.assertRaises(guard.ContentError):
            guard.read_candidate(self.root,"index.html")

    def test_report_fixture_is_not_device_or_git_proof(self):
        for path in guard.PAGES:
            location=self.root/path
            location.parent.mkdir(parents=True,exist_ok=True)
            location.write_bytes(page(candidate=True))
        baseline=mock.Mock()
        baseline.read.return_value=page()
        with mock.patch.dict(os.environ,{"SOURCE_COMMIT":"a"*40}):
            report=guard.verify(baseline,self.root)
        self.assertTrue(report["passed"])
        self.assertEqual(len(report["pages"]),27)
        self.assertEqual(report["candidate_source_commit_claim"],"a"*40)
        self.assertFalse(report["candidate_git_identity_authenticated"])
        self.assertFalse(report["visual_parity_verified"])
        self.assertFalse(report["deployment_verified"])

    def test_invalid_source_claim_is_not_accepted(self):
        baseline=mock.Mock()
        baseline.read.return_value=page()
        with mock.patch.dict(os.environ,{"SOURCE_COMMIT":"main", "GITHUB_SHA":"a"*40}):
            report=guard.verify(baseline,self.root)
        self.assertIsNone(report["candidate_source_commit_claim"])

    def test_one_missing_page_fails_full_report(self):
        baseline=mock.Mock()
        baseline.read.return_value=page()
        self.assertFalse(guard.verify(baseline,self.root)["passed"])

    def test_aggregate_exhaustion_stops_further_baseline_reads(self):
        baseline=mock.Mock()
        baseline.read.return_value=page()
        with mock.patch.object(guard,"MAX_TOTAL_BYTES",len(page())-1):
            report=guard.verify(baseline,self.root)
        self.assertFalse(report["passed"])
        self.assertEqual(baseline.read.call_count,1)

    def test_candidate_read_remaining_budget(self):
        with self.assertRaises(guard.ContentError):
            guard.read_candidate(self.root,"index.html",max_bytes=10)

    def test_failed_partial_reads_consume_reserved_budget(self):
        baseline=mock.Mock()
        baseline.read.return_value=page()
        with mock.patch.object(guard,"MAX_TOTAL_BYTES",guard.MAX_PAGE_BYTES+3*len(page())):
            with mock.patch.object(guard,"read_candidate",side_effect=guard.ContentError("changed during read")) as reader:
                report=guard.verify(baseline,self.root)
        self.assertFalse(report["passed"])
        self.assertLessEqual(reader.call_count,2)
        self.assertEqual(len(report["pages"]),27)


if __name__=="__main__":
    unittest.main()

