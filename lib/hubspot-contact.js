// Server-only. CRM availability must never prevent receipt emails or scheduling.
module.exports = async function syncContact(values) {
  if (process.env.HUBSPOT_SYNC_ENABLED !== 'true') return { status: 'disabled' };
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return { status: 'failed', reason: 'missing_configuration' };
  const fields = ['firstname', 'lastname', 'phone', 'company', 'pp_campaign_source', 'pp_campaign_medium', 'pp_campaign_name'];
  const proposed = { firstname: values.first_name, lastname: values.last_name, phone: values.phone, company: values.company };
  for (const [key, field] of [['source','pp_campaign_source'], ['medium','pp_campaign_medium'], ['campaign','pp_campaign_name']]) {
    const value = values.attribution?.[key];
    if (typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value)) proposed[field] = value.toLowerCase();
  }
  const base = 'https://api.hubapi.com/crm/v3/objects/contacts';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // One deadline bounds the entire lookup/create/update operation.
  const signal = AbortSignal.timeout(6000);
  const lookup = async () => {
    const response = await fetch(`${base}/${encodeURIComponent(values.email)}?idProperty=email&properties=${fields.join(',')}`, { headers, signal });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('lookup_failed');
    const data = await response.json();
    if (!data.id || !data.properties) throw new Error('invalid_response');
    return data;
  };
  const fillMissing = async contact => {
    const properties = Object.fromEntries(Object.entries(proposed).filter(([key,value]) => value && !contact.properties[key]));
    if (!Object.keys(properties).length) return { status: 'synced' };
    const response = await fetch(`${base}/${encodeURIComponent(contact.id)}`, { method: 'PATCH', headers, signal, body: JSON.stringify({ properties }) });
    if (!response.ok || !(await response.json()).id) throw new Error('update_failed');
    return { status: 'synced' };
  };
  try {
    const existing = await lookup();
    if (existing) return await fillMissing(existing);
    const properties = { email: values.email, ...Object.fromEntries(Object.entries(proposed).filter(([,v]) => v)), pp_booking_status: 'unknown', pp_follow_up_status: 'not_evaluated' };
    const response = await fetch(base, { method: 'POST', headers, signal, body: JSON.stringify({ properties }) });
    if (response.status === 409) {
      const concurrent = await lookup();
      if (!concurrent) throw new Error('conflict_unresolved');
      return await fillMissing(concurrent);
    }
    if (!response.ok || !(await response.json()).id) throw new Error('create_failed');
    return { status: 'synced' };
  } catch (_) {
    // Never expose provider responses, contact details, or credentials in logs.
    return { status: 'failed', reason: 'provider_error' };
  }
};
