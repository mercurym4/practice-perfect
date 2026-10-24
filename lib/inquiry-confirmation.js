// Static branded content: never interpolate visitor-supplied text into the email.
const schedulingUrl = 'https://calendly.com/mike-practiceperfect/30min';
const text = `Thank you for contacting Practice Perfect. We received your inquiry.

If you haven't already, the next step is to schedule your strategy call:
${schedulingUrl}

Already booked? You're all set—there is no need to schedule again. Look for your separate Calendly booking confirmation with your appointment details.

Submitting the inquiry form does not book an appointment. Choose and confirm a time to finish scheduling.

Questions or corrections? Reply to this email and our team will help.

Practice Perfect
https://practiceperfect.us`;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>We received your inquiry — Practice Perfect</title></head>
<body style="margin:0;padding:0;background-color:#eef5fb;font-family:Arial,Helvetica,sans-serif;color:#18365d;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">We received your inquiry. Already booked your strategy call? You're all set.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef5fb"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #dde8ef;">
<tr><td style="height:6px;background-color:#1477ff;font-size:1px;line-height:6px;">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 24px;background-color:#ffffff;"><a href="https://practiceperfect.us" style="text-decoration:none;"><img src="https://practiceperfect.us/assets/library/logos/practice-perfect-logo.png" width="224" alt="Practice Perfect" border="0" style="display:block;width:224px;max-width:100%;height:auto;color:#0d2b55;"></a></td></tr>
<tr><td bgcolor="#0d2b55" style="padding:32px 28px;color:#ffffff;">
<p style="margin:0 0 12px;font-size:12px;letter-spacing:2px;font-weight:bold;color:#a8d4ff;">INQUIRY RECEIVED</p>
<h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:32px;line-height:1.2;color:#ffffff;">A stronger practice<br>starts with a conversation.</h1>
<p style="margin:0;font-size:16px;line-height:1.6;color:#e2edfa;">Thank you for reaching out to Practice Perfect. We received your inquiry.</p>
</td></tr>
<tr><td style="padding:30px 28px;">
<h2 style="margin:0 0 14px;font-size:23px;line-height:1.35;color:#0d2b55;">If you haven't already, the next step is to schedule your strategy call.</h2>
<p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#52677e;">Choose a time that works for you so we can discuss your goals and where your practice needs support.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#1477ff" style="border-radius:6px;text-align:center;mso-padding-alt:16px 24px;"><a href="${schedulingUrl}" style="display:inline-block;padding:16px 24px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">Schedule your strategy call</a></td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:26px;"><tr><td bgcolor="#eef5fb" style="padding:20px;border-left:4px solid #1477ff;">
<h3 style="margin:0 0 8px;font-size:17px;color:#0d2b55;">Already booked? You're all set.</h3>
<p style="margin:0;font-size:15px;line-height:1.6;color:#52677e;">There is no need to schedule again. Look for your separate Calendly booking confirmation with your appointment details.</p>
</td></tr></table>
<p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#52677e;">Submitting the inquiry form does not book an appointment. Choose and confirm a time to finish scheduling.</p>
<p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:#18365d;">Questions or corrections? Just reply to this email.</p>
<p style="margin:20px 0 0;font-size:12px;line-height:1.7;color:#52677e;">Button not working? <a href="${schedulingUrl}" style="color:#125ec1;text-decoration:underline;">Open the scheduling calendar</a>.</p>
</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid #dde8ef;background-color:#f8fbfe;font-size:12px;line-height:1.7;color:#52677e;"><strong style="color:#0d2b55;">PRACTICE PERFECT</strong><br>Sales systems. Stronger teams. Measurable growth.<br><a href="https://practiceperfect.us" style="color:#125ec1;text-decoration:underline;">practiceperfect.us</a><br>You received this email because an inquiry was submitted using your email address.</td></tr>
</table></td></tr></table></body></html>`;
module.exports = { text, html };
