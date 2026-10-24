(() => {
  const form = document.getElementById('strategy-call-form');
  const status = document.getElementById('contact-status');
  const button = form.querySelector('button[type="submit"]');
  const trackedRequests = new Set();
  const phoneInput = document.getElementById('phone');
  phoneInput?.addEventListener('input', () => phoneInput.setCustomValidity(''));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Sending…';
    status.hidden = false;
    status.textContent = 'Sending your request…';
    try {
      const response = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), attribution: window.ppAttribution?.() || {} })
      });
      const result = await response.json();
      if (result.field === 'phone' && phoneInput) {
        phoneInput.setCustomValidity(result.error);
        phoneInput.reportValidity();
        phoneInput.focus();
      }
      if (!response.ok || !result.ok) throw new Error(result.error || 'Your request was not sent. Please try again.');
      status.textContent = 'Thank you. Your details have been received. Next: choose your call time in the calendar below to finish booking.';
      try { window.ppOpenBooking?.(); } catch (_) {
        // A scheduler failure must not turn an accepted inquiry into an error.
      }
      form.reset();
      // Count accepted requests once per page, without sending contact details.
      if (result.requestId && !trackedRequests.has(result.requestId)) {
        trackedRequests.add(result.requestId);
        try {
          window.va?.('event', { name: 'strategy_call_sent', ...(window.ppAttribution ? { data: window.ppAttribution() } : {}) });
        } catch (_) {
          // Measurement must never change the successful form response.
        }
      }
    } catch (error) {
      status.textContent = error.message === 'Failed to fetch' ? 'Your request could not be confirmed. Please try again or email mike@practiceperfect.us directly.' : error.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Continue to scheduling →';
    }
  });
})();
