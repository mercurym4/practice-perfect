const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup() {
 const events=[], scripts=[], listeners={};
 const frame={contentWindow:{}};
 const elements={
  'booking-panel':{hidden:true,scrollIntoView(){this.scrolled=true}},
  'calendly-embed':{querySelector:()=>frame},
  'booking-status':{},
  'strategy-call-form':{hidden:false},
  'booking-intro':{},
  'booking-title':{focus(){}},
  'booking-fallback':{addEventListener:(n,f)=>listeners.fallback=f}
 };
 const window={addEventListener:(n,f)=>listeners[n]=f,setTimeout:()=>1,clearTimeout(){},va:(t,p)=>events.push(p),Calendly:{initInlineWidget(o){assert.equal(o.url,'https://calendly.com/mike-practiceperfect/30min')}}};
 const document={getElementById:id=>elements[id],createElement:()=>({}),head:{appendChild:s=>scripts.push(s)}};
 vm.runInNewContext(fs.readFileSync('booking.js','utf8'),{window,document});
 return {window,elements,scripts,events,listeners,frame};
}
const t=setup();
t.window.ppOpenBooking();t.window.ppOpenBooking();
assert.equal(t.elements['strategy-call-form'].hidden,true);
assert.equal(t.elements['booking-panel'].scrolled,true);
assert.equal(t.scripts.length,1);assert.equal(t.elements['booking-panel'].hidden,false);
t.scripts[0].onload();
const notify=(origin,source,event)=>t.listeners.message({origin,source,data:{event}});
notify('https://evil.example',t.frame.contentWindow,'calendly.event_scheduled');
notify('https://calendly.com',{},'calendly.event_scheduled');
assert.equal(t.events.length,1);
notify('https://calendly.com',t.frame.contentWindow,'calendly.date_and_time_selected');
assert.equal(t.events.length,1);
notify('https://calendly.com',t.frame.contentWindow,'calendly.event_scheduled');
notify('https://calendly.com',t.frame.contentWindow,'calendly.event_scheduled');
assert.equal(t.events.filter(e=>e.name==='strategy_call_booked').length,1);
assert.match(t.elements['booking-status'].textContent,/is booked/);
const failed=setup();failed.window.va=()=>{throw Error('Analytics blocked')};failed.window.ppOpenBooking();failed.scripts[0].onerror();
assert.match(failed.elements['booking-status'].textContent,/scheduling link/);
assert.equal(JSON.stringify(t.events),'[{"name":"scheduler_opened"},{"name":"strategy_call_booked"}]');
console.log('PASS: one scheduler load; trusted frame/origin only; no conversion on time selection; booking deduplication; blocked-script fallback; analytics failure isolation; no personal details in events.');
