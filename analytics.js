// Retain campaign labels for this browser tab; never retain full referring URLs.
(() => {
  const clean = value => typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value) ? value.toLowerCase() : '';
  const sanitize = data => {
    const result = {};
    for (const key of ['source', 'medium', 'campaign']) {
      const value = clean(data?.[key]);
      if (value) result[key] = value;
    }
    return result;
  };
  let attribution = {};
  try { attribution = sanitize(JSON.parse(window.sessionStorage.getItem('pp_attribution') || '{}')); } catch (_) {}
  const params = new URL(window.location.href || window.location.origin).searchParams;
  const tagged = sanitize({source: params.get('utm_source'), medium: params.get('utm_medium'), campaign: params.get('utm_campaign')});
  if (tagged.source) attribution = tagged;
  if (!attribution.source) {
    let host = '';
    try { host = new URL(document.referrer).hostname; } catch (_) {}
    const known = [ ['facebook.com','facebook'], ['instagram.com','instagram'], ['linkedin.com','linkedin'], ['google.com','google'], ['bing.com','bing'], ['t.co','x'] ];
    const match = known.find(([domain]) => host === domain || host.endsWith('.' + domain));
    attribution = {source: match ? match[1] : host && host !== window.location.hostname ? 'referral' : 'direct', medium: match && ['google','bing'].includes(match[1]) ? 'organic' : match ? 'social' : host && host !== window.location.hostname ? 'referral' : 'none'};
  }
  try { window.sessionStorage.setItem('pp_attribution', JSON.stringify(attribution)); } catch (_) {}
  window.ppAttribution = () => ({...attribution});
})();
(() => {
  if (window.location.hostname !== 'practiceperfect.us') return;
  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
  // Never send query strings, fragments, or form values to analytics.
  window.va('beforeSend', (event) => {
    if (event.url) {
      const url = new URL(event.url, window.location.origin);
      event.url = url.origin + url.pathname;
    }
    return event;
  });
  const services = new Set([
    'practice-growth-audit', 'revenue-growth-sprint',
    'fractional-sales-leadership', 'law-firm-intake-consulting',
    'website-design', 'website-audit-overhaul', 'seo-marketing',
    'ppc-marketing', 'direct-mail-marketing', 'pi-mva-lead-generation'
  ]);
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    try {
      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      const service = url.pathname.replace(/^\/services\//, '');
      if (services.has(service)) {
        window.va('event', { name: 'service_clicked', data: { ...window.ppAttribution(), service } });
      } else if (url.pathname === '/contact' ||
          (url.pathname === '/contact.html') ||
          (url.pathname === window.location.pathname && url.hash === '#contact-form')) {
        const location = link.closest('header') ? 'header' :
          link.closest('footer') ? 'footer' : 'content';
        window.va('event', { name: 'strategy_call_clicked', data: { ...window.ppAttribution(), location } });
      }
    } catch (_) {
      // Analytics must never prevent a visitor from following a link.
    }
  });
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  document.head.appendChild(script);
})();
