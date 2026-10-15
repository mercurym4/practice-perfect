(() => {
  const form = document.getElementById('strategy-call-form');
  const status = document.getElementById('contact-status');
  const button = form.querySelector('button[type="submit"]');
  const trackedRequests = new Set();
  const confirmationFallback = 'Your request could not be confirmed. Please try again or email mike@practiceperfect.us directly.';
  // Only the current contact API's fixed user-facing errors are displayable.
  // Unknown provider/CDN response strings may contain technical/private data.
  const contactErrors = new Set([
    'Please submit the contact form.',
    'Please submit from this website.',
    'Please check your form details.',
    'Please try again.',
    'Please shorten your form details.',
    'Please provide your name and a valid email address.',
    'Your request was not sent. Please email mike@practiceperfect.us directly.',
    confirmationFallback
  ]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Sending…';
    status.hidden = false;
    status.textContent = 'Sending your request…';
    let timeout;
    try {
      const controller = new AbortController();
      // Cover headers AND the response body. Race as well as abort so a stalled
      // transport cannot keep the form disabled if it ignores cancellation.
      const deadline = new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Contact confirmation timed out'));
          controller.abort();
        }, 15000);
      });
      const submission = (async () => {
        const response = await fetch('/api/contact', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
          signal: controller.signal
        });
        return { response, result: await response.json() };
      })();
      const { response, result } = await Promise.race([submission, deadline]);
      if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result) || result.ok !== true) {
        status.textContent = contactErrors.has(result?.error) ? result.error : confirmationFallback;
        return;
      }
      status.textContent = 'Thank you. Your strategy-call request has been sent. We’ll follow up using the email you provided.';
      form.reset();
      // Count accepted requests once per page, without sending contact details.
      if (result.requestId && !trackedRequests.has(result.requestId)) {
        trackedRequests.add(result.requestId);
        try {
          window.va?.('event', { name: 'strategy_call_sent' });
        } catch (_) {
          // Measurement must never change the successful form response.
        }
      }
    } catch (_) {
      // An aborted/unreadable response does not prove the server did not send.
      status.textContent = confirmationFallback;
    } finally {
      clearTimeout(timeout);
      button.disabled = false;
      button.textContent = 'Request a Strategy Call →';
    }
  });
})();
