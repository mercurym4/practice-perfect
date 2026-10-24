(() => {
  const panel = document.getElementById('booking-panel');
  const embed = document.getElementById('calendly-embed');
  const status = document.getElementById('booking-status');
  if (!panel || !embed || !status) return;
  let started = false;
  let booked = false;
  function track(name) {
    try { window.va?.('event', { name }); } catch (_) { /* Scheduling must work without analytics. */ }
  }
  window.addEventListener('message', (event) => {
    const frame = embed.querySelector('iframe');
    if (event.origin !== 'https://calendly.com' || !frame || event.source !== frame.contentWindow) return;
    if (event.data?.event === 'calendly.event_type_viewed') status.textContent = 'Choose an available date and time below.';
    if (event.data?.event !== 'calendly.event_scheduled' || booked) return;
    booked = true;
    status.textContent = 'Your strategy call is booked. Check your email for the meeting details.';
    track('strategy_call_booked');
  });
  document.getElementById('booking-fallback').addEventListener('click', () => track('scheduler_external_clicked'));
  window.ppOpenBooking = () => {
    panel.hidden = false;
    document.getElementById('booking-title').focus();
    if (started) return;
    started = true;
    track('scheduler_opened');
    const script = document.createElement('script');
    script.src = 'https://assets.calendly.com/assets/external/widget.js';
    script.async = true;
    const unavailable = () => { status.textContent = 'Use the scheduling link above if available times do not appear below.'; };
    const timer = window.setTimeout(unavailable, 12000);
    script.onerror = () => { window.clearTimeout(timer); unavailable(); };
    script.onload = () => {
      window.clearTimeout(timer);
      try {
        window.Calendly.initInlineWidget({
          url: 'https://calendly.com/mike-practiceperfect/30min',
          parentElement: embed
        });
        status.textContent = 'Choose an available time below, or open scheduling in a new tab.';
      } catch (_) { unavailable(); }
    };
    document.head.appendChild(script);
  };
})();
