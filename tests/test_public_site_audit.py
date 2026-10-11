"""Original synthetic fixtures; no network or production-file dependency."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / 'scripts' / 'audit_public_site.py'
if not SCRIPT.is_file():
    SCRIPT = HERE / 'audit_public_site.py'
SPEC = importlib.util.spec_from_file_location('public_site_audit', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
audit = MODULE.audit


def page(route, title, body):
    return ('<!doctype html><html lang="en"><head>'
            f'<title>{title}</title><meta name="description" content="{title} description">'
            f'<link rel="canonical" href="https://practiceperfect.us{route}">'
            '<script type="application/ld+json">{"@type":"WebPage"}</script>'
            f'</head><body><h1>{title}</h1>{body}</body></html>')


class DefectDetection(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / 'site'
        self.root.mkdir()
        self.write('index.html', page('/', 'Original home fixture',
                   '<a href="/about">About</a><a href="/contact#contact-form">Contact</a>'
                   '<img src="/assets/example.svg" alt="Original test asset">'))
        self.write('about.html', page('/about', 'Original about fixture', '<a href="/">Home</a>'))
        self.write('contact.html', page('/contact', 'Original contact fixture',
                   '<a href="/">Home</a><div id="contact-form">Synthetic contact section</div>'))
        self.write('assets/example.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')
        self.write('robots.txt', 'User-agent: *\nAllow: /\nSitemap: https://practiceperfect.us/sitemap.xml\n')
        self.write('sitemap.xml', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
                   ''.join(f'<url><loc>https://practiceperfect.us{route}</loc></url>'
                           for route in ('/', '/about', '/contact')) + '</urlset>')

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')

    def replace(self, name, before, after):
        path = self.root / name
        source = path.read_text(encoding='utf-8')
        self.assertIn(before, source)
        path.write_text(source.replace(before, after), encoding='utf-8')

    def codes(self):
        return {error['code'] for error in audit(self.root)['errors']}

    def test_original_baseline_passes(self):
        result = audit(self.root)
        self.assertTrue(result['ok'], json.dumps(result['errors']))
        self.assertEqual(result['counts'], {'pages': 3, 'internal_links': 4,
                                          'local_assets': 1, 'jsonld_blocks': 3})

    def test_broken_anchor_is_detected(self):
        self.replace('index.html', '/contact#contact-form', '/contact#missing-cta-target')
        self.assertIn('anchor-missing', self.codes())

    def test_incorrect_canonical_is_detected(self):
        self.replace('about.html', 'rel="canonical" href="https://practiceperfect.us/about"',
                     'rel="canonical" href="https://practiceperfect.us/contact"')
        self.assertIn('canonical', self.codes())

    def test_sitemap_omission_is_detected(self):
        self.replace('sitemap.xml', '<url><loc>https://practiceperfect.us/about</loc></url>', '')
        self.assertIn('sitemap-missing', self.codes())

    def test_html_alias_normalizes_route_and_validates_fragment(self):
        self.replace('index.html', '/contact#contact-form', '/contact.html#contact-form')
        self.replace('about.html', 'href="/"', 'href="/index.html"')
        self.assertTrue(audit(self.root)['ok'])
        self.replace('index.html', '/contact.html#contact-form', '/contact.html#missing-cta-target')
        self.assertIn('anchor-missing', self.codes())
        self.assertNotIn('orphan-page', self.codes())

    def test_self_links_do_not_hide_orphan(self):
        self.replace('index.html', '<a href="/contact#contact-form">Contact</a>', '')
        self.replace('contact.html', '<div id="contact-form">',
                     '<a href="#contact-form">Self anchor</a><a href="/contact.html">Self alias</a><div id="contact-form">')
        errors = audit(self.root)['errors']
        self.assertIn({'path': 'contact.html', 'code': 'orphan-page', 'detail': '/contact'}, errors)

    def test_encoded_parent_path_is_rejected(self):
        self.replace('index.html', '/assets/example.svg', '/%2e%2e/outside.svg')
        self.assertIn('path-traversal', self.codes())

    def test_outside_symlink_is_not_followed(self):
        outside = Path(self.tmp.name) / 'outside.svg'
        outside.write_text('Outside fixture: must never be opened by audit')
        asset = self.root / 'assets/example.svg'
        asset.unlink()
        asset.symlink_to(outside)
        self.assertIn('path-traversal', self.codes())

    def test_outside_html_symlink_is_not_read(self):
        outside = Path(self.tmp.name) / 'outside.html'
        outside.write_text('Outside fixture: must never be parsed by audit')
        target = self.root / 'about.html'
        target.unlink()
        target.symlink_to(outside)
        self.assertIn('source-outside-root', self.codes())

    def test_outside_configuration_symlink_is_not_read(self):
        outside = Path(self.tmp.name) / 'outside.xml'
        outside.write_text('Outside fixture: must never be parsed by audit')
        target = self.root / 'sitemap.xml'
        target.unlink()
        target.symlink_to(outside)
        self.assertIn('sitemap-unreadable', self.codes())


if __name__ == '__main__':
    unittest.main()
