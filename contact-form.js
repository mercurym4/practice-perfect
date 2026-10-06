(() => {
  const form = document.getElementById('strategy-call-form');
  const status = document.getElementById('contact-status');
  const button = form.querySelector('button[type="submit"]');
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
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Your request was not sent. Please try again.');
      status.textContent = 'Thank you. Your strategy-call request has been sent. We’ll follow up using the email you provided.';
      form.reset();
    } catch (error) {
      status.textContent = error.message === 'Failed to fetch' ? 'Your request could not be confirmed. Please try again or email mike@practiceperfect.us directly.' : error.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Request a Strategy Call →';
    }
  });
})();
