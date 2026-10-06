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
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  document.head.appendChild(script);
})();
