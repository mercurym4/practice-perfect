const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const code=fs.readFileSync('analytics.js','utf8');
const saved={};
function page(url,referrer='',storage=saved){
 const window={location:new URL(url),sessionStorage:{getItem:k=>storage[k],setItem:(k,v)=>storage[k]=v}};
 const document={referrer,addEventListener(){},createElement:()=>({}),head:{appendChild(){}}};
 vm.runInNewContext(code,{window,document,URL,Set});return JSON.parse(JSON.stringify(window.ppAttribution()));
}
assert.deepEqual(page('https://practiceperfect.us/?utm_source=explee&utm_medium=email&utm_campaign=law-firms'),{source:'explee',medium:'email',campaign:'law-firms'});
assert.deepEqual(page('https://practiceperfect.us/contact','https://practiceperfect.us/services'),{source:'explee',medium:'email',campaign:'law-firms'});
assert.equal(page('https://practiceperfect.us/?utm_source=facebook&utm_campaign=october').source,'facebook');
assert.deepEqual(page('https://practiceperfect.us/?utm_source=person%40example.com&utm_campaign=%3Cscript%3E','',{}),{source:'direct',medium:'none'});
assert.deepEqual(page('https://practiceperfect.us/','https://www.google.com/search?q=private',{}),{source:'google',medium:'organic'});
assert.equal(page('https://practiceperfect.us/','https://evilfacebook.com/',{}).source,'referral');
const blocked=new Proxy({},{get(){throw Error('blocked')}});assert.equal(page('https://practiceperfect.us/?utm_source=instagram','',blocked).source,'instagram');
console.log('PASS: tagged source, cross-page retention, new campaign replacement, invalid labels stripped, referrer classification, blocked storage fallback.');
