const assert=require('node:assert/strict');
const fs=require('node:fs');
const handler=require('../api/contact');
const copy=require('../consent-copy.json');
process.env.RESEND_API_KEY='test';process.env.CONTACT_FROM_EMAIL='test@example.com';process.env.CONTACT_TO_EMAIL='test@example.com';
let sent;
global.fetch=async(u,o)=>{sent=JSON.parse(o.body);return{ok:true,json:async()=>({id:'test'})}};
async function run(extra){let code;await handler({method:'POST',headers:{origin:'https://practiceperfect.us',host:'practiceperfect.us'},body:{first_name:'Test',last_name:'Visitor',email:'test@example.com',phone:'7135550123',...extra}},{setHeader(){},status(c){code=c;return this},json(){}});return code;}
(async()=>{
 assert.equal(await run({}),200);assert.match(sent.text,/NO — do not text/);
 assert.equal(await run({sms_consent:'yes',consent_version:copy.version}),200);assert.match(sent.text,/opt-in: YES/);assert.ok(sent.text.includes(copy.sms));assert.match(sent.text,/Received at \(UTC\): \d{4}-/);
 assert.equal(await run({sms_consent:'yes',consent_version:'old'}),400);
 assert.equal(await run({sms_consent:true}),400);
 const html=fs.readFileSync('contact.html','utf8');
 const checkbox=html.match(/<input id="sms-consent"[^>]+>/)[0];
 assert.ok(!/checked|required/.test(checkbox));assert.ok(html.includes(copy.sms));assert.ok(html.includes(copy.callEmail));
 console.log('PASS: optional unchecked consent; both choices accepted; explicit YES only; version validated; exact disclosure and server timestamp in inquiry email.');
})();
