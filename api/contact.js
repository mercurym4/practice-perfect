const confirmation = require('../lib/inquiry-confirmation');
const consentCopy = require('../consent-copy.json');
const { createHash } = require('node:crypto');
const { parsePhoneNumberFromString } = require('libphonenumber-js/max');

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
  const limits = { first_name: 100, last_name: 100, email: 254, phone: 40, company: 200, interest: 100, message: 5000 };
  const values = {};
  for (const [key, limit] of Object.entries(limits)) {
    if (body[key] != null && typeof body[key] !== 'string') return res.status(400).json({ error: 'Please check your form details.' });
    values[key] = (body[key] || '').trim();
    if (values[key].length > limit) return res.status(400).json({ error: 'Please shorten your form details.' });
  }
  if (!values.first_name || !values.last_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    return res.status(400).json({ error: 'Please provide your name and a valid email address.' });
  }
  const phone = parsePhoneNumberFromString(values.phone, { defaultCountry: 'US', extract: false });
  if (!phone || !phone.isValid()) {
    return res.status(400).json({ field: 'phone', error: 'Enter a valid phone number with area code. For numbers outside the U.S., include + and the country code.' });
  }
  values.phone = phone.formatInternational() + (phone.ext ? ` ext. ${phone.ext}` : '');
  if (body.sms_consent != null && body.sms_consent !== 'yes') return res.status(400).json({ error: 'Please check your SMS preference.' });
  if (body.sms_consent === 'yes' && body.consent_version !== consentCopy.version) return res.status(400).json({ error: 'Please refresh the page and review the SMS consent before submitting.' });
  values.smsConsent = body.sms_consent === 'yes';
  values.consentVersion = body.consent_version === consentCopy.version ? consentCopy.version : 'not supplied';
  const attribution = {};
  for (const key of ['source', 'medium', 'campaign']) {
    const value = body.attribution?.[key];
    if (typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value)) attribution[key] = value.toLowerCase();
  }
  values.attribution = attribution;
  // Keep retry payloads identical, including the explicitly rounded receipt time.
  const receiptWindow = Math.floor(Date.now() / 600000);
  const receivedAt = new Date(receiptWindow * 600000).toISOString();
  const { RESEND_API_KEY, CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL } = process.env;
  if (!RESEND_API_KEY || !CONTACT_FROM_EMAIL || !CONTACT_TO_EMAIL) return res.status(503).json({ error: 'Your request was not sent. Please email mike@practiceperfect.us directly.' });
  const text = `New Practice Perfect strategy-call request\n\nName: ${values.first_name} ${values.last_name}\nEmail: ${values.email}\nPhone: ${values.phone}\nCompany: ${values.company || '(not provided)'}\nInterest: ${values.interest || '(not provided)'}\n\nOpportunity:\n${values.message || '(not provided)'}\n\nLead source (visitor-reported campaign labels)\nSource: ${attribution.source || 'unknown'}\nMedium: ${attribution.medium || 'unknown'}\nCampaign: ${attribution.campaign || '(not tagged)'}\n\nContact permission record\nSMS inquiry/appointment/marketing opt-in: ${values.smsConsent ? 'YES' : 'NO — do not text'}\nPromotional SMS consent: ${values.smsConsent ? 'YES — combined opt-in' : 'NO'}\nReceived at (UTC, rounded down to 10-minute window): ${receivedAt}\nForm: https://practiceperfect.us/contact\nDisclosure version: ${values.consentVersion}\nSMS disclosure: ${consentCopy.sms}\nCall/email disclosure: ${consentCopy.callEmail}`;
  // Identical retries within a ten-minute window use the provider's same send key.
  const key = createHash('sha256').update(JSON.stringify(values) + receiptWindow).digest('hex');
  async function sendEmail(kind, payload) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `contact-${kind === 'confirmation' ? 'v4' : 'v2'}-${kind}-${key}` },
      body: JSON.stringify({ from: `Practice Perfect <${CONTACT_FROM_EMAIL}>`, ...payload })
    });
    const result = await response.json();
    if (!response.ok || !result.id) {
      console.error('Contact email rejected', { kind, status: response.status });
      throw new Error('Email provider did not accept request');
    }
    return result.id;
  }
  let requestId;
  try {
    requestId = await sendEmail('owner', { to: [CONTACT_TO_EMAIL], reply_to: values.email, subject: 'Practice Perfect — Strategy Call Request', text });
    const confirmationId = await sendEmail('confirmation', {
      to: [values.email], reply_to: CONTACT_TO_EMAIL,
      subject: 'We received your inquiry — Practice Perfect',
      ...confirmation(attribution)
    });
    return res.status(200).json({ ok: true, requestId, confirmationId });
  } catch (error) {
    console.error('Contact email send failed', { code: error.name, ownerAccepted: Boolean(requestId) });
    return res.status(502).json({ error: requestId
      ? 'Your inquiry reached our team, but your confirmation email could not be sent. Please retry, or email mike@practiceperfect.us for help.'
      : 'Your request could not be confirmed. Please try again or email mike@practiceperfect.us directly.' });
  }
};
