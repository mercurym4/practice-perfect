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
    'ppc-marketing', 'debt-defense-direct-mail', 'pi-mva-lead-generation'
  ]);
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    try {
      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      const service = url.pathname.replace(/^\/services\//, '');
      if (services.has(service)) {
        window.va('event', { name: 'service_clicked', data: { service } });
      } else if (url.pathname === '/contact' ||
          (url.pathname === '/contact.html') ||
          (url.pathname === window.location.pathname && url.hash === '#contact-form')) {
        const location = link.closest('header') ? 'header' :
          link.closest('footer') ? 'footer' : 'content';
        window.va('event', { name: 'strategy_call_clicked', data: { location } });
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
