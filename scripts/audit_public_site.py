#!/usr/bin/env python3
"""Check Practice Perfect's static public pages without network calls or writes."""
import argparse
from collections import Counter
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urljoin, urlsplit
import xml.etree.ElementTree as ET

BASE = 'https://practiceperfect.us'
PRIVATE_ROOTS = {'docs', 'tests', 'scripts', 'preview'}


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.canonicals, self.links, self.assets, self.ids = [], [], [], []
        self.descriptions, self.robots, self.jsonld = [], [], []
        self.title, self.h1 = '', 0
        self._title = False
        self._json = None
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            self.ids.append(a['id'])
        if tag == 'a' and a.get('name'):
            self.ids.append(a['name'])
        if tag == 'h1':
            self.h1 += 1
        if tag == 'title':
            self._title = True
        if tag == 'link':
            rel = a.get('rel', '').lower().split()
            if 'canonical' in rel:
                self.canonicals.append(a.get('href', ''))
            if any(v in rel for v in ('stylesheet', 'icon', 'preload', 'modulepreload')):
                self.assets.append(a.get('href', ''))
        if tag in ('img', 'script') and a.get('src'):
            self.assets.append(a['src'])
        if tag == 'a' and a.get('href'):
            self.links.append(a['href'])
        if tag == 'meta':
            name = a.get('name', '').lower()
            if name == 'description':
                self.descriptions.append(a.get('content', ''))
            if name == 'robots':
                self.robots.append(a.get('content', '').lower())
        if tag == 'script' and a.get('type', '').lower() == 'application/ld+json':
            self._json = ''

    def handle_endtag(self, tag):
        if tag == 'title':
            self._title = False
        if tag == 'script' and self._json is not None:
            self.jsonld.append(self._json)
            self._json = None

    def handle_data(self, data):
        if self._title:
            self.title += data
        if self._json is not None:
            self._json += data


def audit(root):
    root = Path(root).resolve()
    errors = []
    def fail(path, code, detail):
        errors.append({'path': path, 'code': code, 'detail': detail})
    def within_root(path):
        try:
            path.resolve().relative_to(root)
            return True
        except (ValueError, OSError, RuntimeError):
            return False
    def private(path):
        parts = Path(path).parts
        return bool(parts and parts[0] in PRIVATE_ROOTS) or path.endswith('.md') or path in ('services-green', 'services-green.html')
    pages = {}
    for path in sorted(root.rglob('*.html')):
        rel = path.relative_to(root).as_posix()
        if private(rel) or any(part.startswith('.') for part in Path(rel).parts):
            continue
        if not within_root(path):
            fail(rel, 'source-outside-root', 'Refusing to read an outside-root HTML target')
            continue
        route = '/' if rel == 'index.html' else '/' + rel[:-5]
        pages[route] = (rel, Page(path.read_text(encoding='utf-8')))
    if not pages:
        fail('.', 'no-pages', 'No public HTML pages found')
    try:
        if not within_root(root / 'sitemap.xml'):
            raise OSError('Refusing to read an outside-root sitemap target')
        sitemap = ET.parse(root / 'sitemap.xml').getroot()
        locs = [e.text or '' for e in sitemap.findall('{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
        expected = {BASE + route for route in pages}
        for url in sorted(expected - set(locs)):
            fail('sitemap.xml', 'sitemap-missing', url)
        for url in sorted(set(locs) - expected):
            fail('sitemap.xml', 'sitemap-extra', url)
        for url, count in Counter(locs).items():
            if count > 1:
                fail('sitemap.xml', 'sitemap-duplicate', url)
    except (OSError, ET.ParseError) as exc:
        fail('sitemap.xml', 'sitemap-unreadable', str(exc))
    try:
        if not within_root(root / 'robots.txt'):
            raise OSError('Refusing to read an outside-root robots target')
        robots = (root / 'robots.txt').read_text(encoding='utf-8')
        if not re.search(r'^Sitemap:\s*' + re.escape(BASE + '/sitemap.xml') + r'\s*$', robots, re.M | re.I):
            fail('robots.txt', 'sitemap-directive', 'Expected production sitemap directive')
        if re.search(r'^Disallow:\s*/\s*$', robots, re.M | re.I):
            fail('robots.txt', 'crawl-blocked', 'Root disallow requires manual user-agent review')
    except OSError as exc:
        fail('robots.txt', 'robots-unreadable', str(exc))
    incoming = set()
    page_by_file = {rel: (route, page) for route, (rel, page) in pages.items()}
    counts = {'pages': len(pages), 'internal_links': 0, 'local_assets': 0, 'jsonld_blocks': 0}
    titles, descriptions = {}, {}
    for route, (rel, page) in pages.items():
        if page.canonicals != [BASE + route]:
            fail(rel, 'canonical', repr(page.canonicals))
        if page.h1 != 1:
            fail(rel, 'h1-count', str(page.h1))
        if not page.title.strip():
            fail(rel, 'title-empty', 'Expected a page title')
        titles.setdefault(page.title.strip(), []).append(rel)
        if len(page.descriptions) != 1 or not page.descriptions[0].strip():
            fail(rel, 'description', repr(page.descriptions))
        else:
            descriptions.setdefault(page.descriptions[0].strip(), []).append(rel)
        if any(re.search(r'\b(noindex|none)\b', value) for value in page.robots):
            fail(rel, 'noindex', repr(page.robots))
        for value, count in Counter(page.ids).items():
            if count > 1:
                fail(rel, 'duplicate-id', value)
        for data in page.jsonld:
            counts['jsonld_blocks'] += 1
            try:
                json.loads(data)
            except json.JSONDecodeError as exc:
                fail(rel, 'jsonld-invalid', str(exc))
        for kind, hrefs in (('link', page.links), ('asset', page.assets)):
            for href in hrefs:
                try:
                    url = urlsplit(urljoin(BASE + route, href))
                except ValueError as exc:
                    fail(rel, 'url-invalid', str(exc))
                    continue
                if url.scheme not in ('http', 'https') or url.netloc != 'practiceperfect.us':
                    continue
                target = unquote(url.path).lstrip('/') or 'index.html'
                if '..' in Path(target).parts or not within_root(root / target):
                    fail(rel, 'path-traversal', href)
                    continue
                if kind == 'asset':
                    counts['local_assets'] += 1
                    if not (root / target).is_file():
                        fail(rel, 'asset-missing', href)
                    continue
                counts['internal_links'] += 1
                if private(target):
                    fail(rel, 'private-link', href)
                target_page = pages.get(url.path)
                target_route = url.path
                if not target_page and target in page_by_file and (root / target).is_file():
                    target_route, parsed_page = page_by_file[target]
                    target_page = (target, parsed_page)
                if target_page and target_route != route:
                    incoming.add(target_route)
                if target_page:
                    if url.fragment and unquote(url.fragment) not in target_page[1].ids:
                        fail(rel, 'anchor-missing', href)
                elif not (root / target).is_file():
                    fail(rel, 'link-missing', href)
    for route, (rel, _) in pages.items():
        if route != '/' and route not in incoming:
            fail(rel, 'orphan-page', route)
    for code, values in (('title-duplicate', titles), ('description-duplicate', descriptions)):
        for value, paths in values.items():
            if len(paths) > 1:
                fail(', '.join(paths), code, value)
    return {'ok': not errors, 'counts': counts, 'errors': errors}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', nargs='?', default='.', help='Repository root (default: current directory)')
    result = audit(parser.parse_args().root)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['ok'] else 1)
