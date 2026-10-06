const { createHash } = require('node:crypto');

module.exports = async function contact(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Please submit the contact form.' });
  }
  const origin = req.headers.origin;
  if (!origin || origin !== `https://${req.headers.host}`) {
    return res.status(403).json({ error: 'Please submit from this website.' });
  }
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Please check your form details.' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Please check your form details.' });
  }
  if (body.website) return res.status(400).json({ error: 'Please try again.' });
  const limits = { first_name: 100, last_name: 100, email: 254, company: 200, interest: 100, message: 5000 };
  const values = {};
  for (const [key, limit] of Object.entries(limits)) {
    if (body[key] != null && typeof body[key] !== 'string') return res.status(400).json({ error: 'Please check your form details.' });
    values[key] = (body[key] || '').trim();
    if (values[key].length > limit) return res.status(400).json({ error: 'Please shorten your form details.' });
  }
  if (!values.first_name || !values.last_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    return res.status(400).json({ error: 'Please provide your name and a valid email address.' });
  }
  const { RESEND_API_KEY, CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL } = process.env;
  if (!RESEND_API_KEY || !CONTACT_FROM_EMAIL || !CONTACT_TO_EMAIL) return res.status(503).json({ error: 'Your request was not sent. Please email mike@practiceperfect.us directly.' });
  const text = `New Practice Perfect strategy-call request\n\nName: ${values.first_name} ${values.last_name}\nEmail: ${values.email}\nCompany: ${values.company || '(not provided)'}\nInterest: ${values.interest || '(not provided)'}\n\nOpportunity:\n${values.message || '(not provided)'}`;
  // Identical retries within a ten-minute window use the provider's same send key.
  const key = createHash('sha256').update(JSON.stringify(values) + Math.floor(Date.now() / 600000)).digest('hex');
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `contact-${key}` },
      body: JSON.stringify({ from: `Practice Perfect <${CONTACT_FROM_EMAIL}>`, to: [CONTACT_TO_EMAIL], reply_to: values.email, subject: 'Practice Perfect — Strategy Call Request', text })
    });
    const result = await response.json();
    if (!response.ok || !result.id) {
      console.error('Contact email rejected', { status: response.status, code: result.name || 'unknown' });
      throw new Error('Email provider did not accept request');
    }
    return res.status(200).json({ ok: true, requestId: result.id });
  } catch (error) {
    console.error('Contact email send failed', { code: error.name });
    return res.status(502).json({ error: 'Your request could not be confirmed. Please try again or email mike@practiceperfect.us directly.' });
  }
};