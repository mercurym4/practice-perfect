const assert=require('node:assert/strict');
const handler=require('../api/contact');
process.env.RESEND_API_KEY='test-only';process.env.CONTACT_FROM_EMAIL='test@example.com';process.env.CONTACT_TO_EMAIL='test@example.com';
let sent;
global.fetch=async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({id:'test-request'})}};
async function submit(phone){let code,result;await handler({method:'POST',headers:{origin:'https://practiceperfect.us',host:'practiceperfect.us'},body:{first_name:'Test',last_name:'Visitor',email:'test@example.com',phone}}, {setHeader(){},status(n){code=n;return this},json(v){result=v}});return {code,result};}
(async()=>{
 for(const phone of [undefined,'','123','not a number','1'.repeat(16),'0000000000','1234567890','+999123456789','Call 7135550123'])assert.equal((await submit(phone)).code,400);
 assert.equal(sent,undefined,'Invalid phone must not send email');
 for(const phone of ['(713) 555-0123','+44 20 7946 0958']){
  const r=await submit(phone);assert.equal(r.code,200);assert.equal(r.result.ok,true);assert.match(sent.text,/Phone: \+/);
 }
 console.log('PASS: missing/invalid phone rejected before email; formatted US and international phone included in notification. No live email sent.');
})();
