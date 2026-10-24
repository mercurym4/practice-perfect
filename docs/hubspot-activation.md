# Practice Perfect CRM connection

HubSpot portal: 247715928. Vercel project: practice-perfect.

## Current implementation

Server-only sync in lib/hubspot-contact.js runs after the owner notification is accepted. It is disabled unless HUBSPOT_SYNC_ENABLED is exactly true. Set HUBSPOT_ACCESS_TOKEN as a sensitive server-side Vercel environment variable using a HubSpot app with crm.objects.contacts.read and crm.objects.contacts.write access to this portal. Never place the credential in source, browser code, or chat.

Before enabling, verify the five pp_ properties exist in the intended portal. Deploy the environment changes, then test a new inquiry and confirm its CRM record. Verify an existing booked/suppressed contact retains those statuses. Sync fills only missing fields; it does not replace existing user-entered values. Campaign fields retain the first recorded labels.

CRM failures are logged without personal details; they do not block inquiry confirmation or scheduling. Owner notification emails remain the recovery source. No persistent retry queue is implemented: failed syncs require reconciliation. Do not enable automated follow-up based solely on CRM absence or missing booking status.

## Still required

- Website HubSpot credential and activation test.
- Calendly-to-HubSpot integration or authenticated server-side booking reconciliation. ChatGPT account connections do not provide website credentials.
- Verified handling of bookings, cancellations, reschedules, and differing inquiry/booking email addresses.
- A durable follow-up ledger, suppression/opt-out handling, booking recheck immediately before delivery, and retry/deduplication behavior before sending reminders.

No scheduled reminders or background booking sync are included in this change.
