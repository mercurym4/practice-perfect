'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const p = require('./main-parity-policy.cjs');
const { admitCandidate, evidenceWriter, acquireSnapshot, closeResources } = require('./browser-main-parity.cjs');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const commit = 'a'.repeat(40);
test('candidate decoder receives separate exact expected commit, not only an envelope claim', () => {
  const raw=Buffer.from('payload'); let called;
  const result=admitCandidate(raw,commit,(input,expected)=>{called={input,expected};return 'decoded';});
  assert.equal(result,'decoded'); assert.equal(called.input,raw); assert.equal(called.expected,commit);
  assert.throws(()=>admitCandidate(raw,undefined,()=>assert.fail('must not decode')));
});
test('fixed exporter arguments do not accept an alternate executable or shell flag', () => {
  assert.deepEqual(p.exporterArguments('main', null), ['scripts/export_main_snapshot.py','--repository','.pp-approved-main']);
  assert.deepEqual(p.exporterArguments('candidate', commit), ['scripts/export_candidate_snapshot.py','--repository','.','--commit',commit]);
  for (const value of ['', 'HEAD', '--help', 'a'.repeat(39), 'A'.repeat(40), commit + ';x', commit + '\n', null]) assert.throws(() => p.sourceCommit(value));
  assert.throws(() => p.exporterArguments('evil', commit));
});
test('acquisition rejects invalid commit before spawning', () => { assert.throws(() => acquireSnapshot('candidate', 'HEAD', new p.Deadline())); });
test('acquisition checks the deadline before even constructing a child', () => {
  let spawned=false;
  assert.throws(()=>acquireSnapshot('main',commit,{remaining:()=>{throw Error('expired');}},()=>{},()=>{spawned=true;}),/expired/);
  assert.equal(spawned,false);
});
function fakeChild(action) {
  const child = new EventEmitter(); child.stdout = new EventEmitter();child.stderr = new EventEmitter(); child.killed = false;
  child.kill = signal => { child.killed = signal; queueMicrotask(() => child.emit('close', 9)); };
  queueMicrotask(() => action(child)); return child;
}
test('acquisition enforces fixed python3 argv and returns only bounded successful stdout', async () => {
  let called;
  const bytes = await acquireSnapshot('candidate',commit,new p.Deadline(),()=>{},(exe,args,options)=> {
    called={exe,args,options}; return fakeChild(child=>{child.stdout.emit('data',Buffer.from('payload'));child.emit('close',0);});
  });
  assert.equal(called.exe,'python3');assert.equal(called.options.shell,false);assert.equal(called.options.stdio[0],'ignore');
  assert.deepEqual(called.args,p.exporterArguments('candidate',commit));assert.equal(bytes.toString(),'payload');
});
test('acquisition refuses nonzero exit without exposing raw stderr or stdout', async () => {
  await assert.rejects(acquireSnapshot('main',commit,new p.Deadline(),()=>{},()=>fakeChild(child=>{child.stderr.emit('data',Buffer.from('SECRET'));child.emit('close',1);})),/^Error: Snapshot acquisition refused$/);
});
test('acquisition kills stdout overrun before concatenation', async () => {
  let child;
  await assert.rejects(acquireSnapshot('main',commit,new p.Deadline(),()=>{},()=>child=fakeChild(c=>c.stdout.emit('data',Buffer.alloc(24*1024*1024+1)))),/refused/);
  assert.equal(child.killed,'SIGKILL');
});
test('acquisition kills stderr overrun and enforces deadline without actual process', async () => {
  let child;
  await assert.rejects(acquireSnapshot('main',commit,new p.Deadline(),()=>{},()=>child=fakeChild(c=>c.stderr.emit('data',Buffer.alloc(65537)))),/refused/);
  assert.equal(child.killed,'SIGKILL');
  await assert.rejects(acquireSnapshot('main',commit,{remaining:()=>5},()=>{},()=>child=fakeChild(()=>{})),/refused/);
  assert.equal(child.killed,'SIGKILL');
});
test('cleanup requires actual successful completions and closes every server', async () => {
  const calls=[];
  const result=await closeResources({context:{close:async()=>{calls.push('context');}},browser:{close:async()=>{calls.push('browser');}},servers:[{closeAllConnections:()=>calls.push('connections'),close:done=>{calls.push('server');done();}}]});
  assert.equal(result.passed,true);assert.deepEqual(new Set(calls),new Set(['context','browser','connections','server']));
});
test('cleanup failure and timeout cannot qualify acceptance', async () => {
  const result=await closeResources({context:{close:async()=>{throw Error('no');}},browser:{close:()=>new Promise(()=>{})},servers:[]},5);
  assert.equal(result.contextClosed,false);assert.equal(result.browserClosed,false);assert.equal(result.passed,false);
});
test('deadline uses monotonic total elapsed rather than resetting each operation', () => {
  let now = 50; const d = new p.Deadline(100, () => now);
  assert.equal(d.remaining(30),30); now=125; assert.equal(d.remaining(),25); now=150; assert.throws(() => d.remaining());
});
test('deadline rejects invalid or expanded budgets', () => { for (const n of [0,-1,Infinity,420001]) assert.throws(() => new p.Deadline(n)); });
test('PNG reservation refuses tall, wide, zero, fractional or over-pixel surfaces', () => {
  assert.equal(p.captureReservation({ document:{width:390,height:900} }), 5*390*900+900+1048576);
  for (const document of [{width:390,height:12001},{width:2561,height:900},{width:0,height:900},{width:1.5,height:900},{width:2560,height:12000}]) assert.throws(() => p.captureReservation({document}));
});
test('budget reserves worst-case bytes before a write and refunds only successful actual bytes', () => {
  const b = new p.EvidenceBudget(100); const a=b.reserve(70); assert.throws(() => b.reserve(31));
  b.complete(a,10); assert.equal(b.used,10); b.reserve(90); assert.throws(() => b.reserve(1));
});
test('failed capture reservation remains charged and cannot be reused', () => {
  const b = new p.EvidenceBudget(100); const a=b.reserve(70); assert.throws(() => b.complete(a,71)); assert.equal(b.used,70);
  assert.throws(() => b.complete({},0)); b.complete(a,70); assert.throws(() => b.complete(a,0));
});
test('finite evidence file count includes reserved JSON plus 108 PNGs', () => {
  const b = new p.EvidenceBudget(1000); for(let n=0;n<109;n++) b.reserve(1); assert.throws(() => b.reserve(1));
});
test('writer keeps first original bytes and refuses overwrite, traversal and oversized writes', () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pp-main-policy-')); const b=new p.EvidenceBudget(100); const write=evidenceWriter(directory,b);
  const token=b.reserve(8); write('00-390-main.png',Buffer.from('original'),token);
  assert.equal(fs.readFileSync(path.join(directory,'00-390-main.png'),'utf8'),'original');
  assert.throws(() => write('00-390-main.png',Buffer.from('changed'),b.reserve(8)));
  assert.throws(() => write('../bad',Buffer.from('x'),b.reserve(1)));
  assert.throws(() => write('00-390-candidate.png',Buffer.from('xx'),b.reserve(1)));
  assert.equal(fs.readFileSync(path.join(directory,'00-390-main.png'),'utf8'),'original');
  // Private temporary fixture intentionally retained; no recursive deletion.
});
const routes=['/','/about','/contact','/our-system','/pricing','/what-we-fix',...Array.from({length:21},(_,n)=>`/page-${n}`)];
const paths=routes.map(r=>r==='/'?'index.html':r.slice(1)+'.html');
const xml=values=>Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+values.map(r=>`<url><loc>https://practiceperfect.us${r}</loc></url>`).join('\n')+'</urlset>');
test('sitemap requires exactly the admitted 27 HTML pages',()=> { assert.deepEqual(p.sitemapRoutes(xml(routes),paths),routes); });
test('sitemap refuses duplicate and missing pages',()=> { assert.throws(()=>p.sitemapRoutes(xml([...routes.slice(1),routes[1]]),paths)); assert.throws(()=>p.sitemapRoutes(xml(routes.slice(1)),paths)); });
test('sitemap refuses extra/private HTML mapping',()=> { assert.throws(()=>p.sitemapRoutes(xml(routes),[...paths,'docs/private.html'])); });
test('sitemap refuses alternate origins and XML entity tricks',()=> {
  for(const value of [xml(routes).toString().replace('https://practiceperfect.us/','https://evil.test/'),xml(routes).toString().replace('<urlset','<!DOCTYPE x><urlset'),xml(routes).toString().replace('/about','/a&amp;b')]) assert.throws(()=>p.sitemapRoutes(Buffer.from(value),paths));
});
test('font admission accepts exact HTTPS GET stylesheet/font resource boundaries',()=> {
  assert.equal(p.externalKind({url:'https://fonts.googleapis.com/css2?family=Inter',method:'GET',type:'stylesheet'}),'stylesheet');
  assert.equal(p.externalKind({url:'https://fonts.gstatic.com/l/font?v=1',method:'GET',type:'font'}),'font');
});
test('font admission refuses alternate host, port, credentials, method and resource types',()=> {
  const good={url:'https://fonts.googleapis.com/css2?family=Inter',method:'GET',type:'stylesheet'};
  for(const change of [{url:'http://fonts.googleapis.com/css2'},{url:'https://fonts.googleapis.com.evil.test/css2'},{url:'https://fonts.googleapis.com:444/css2'},{url:'https://a@fonts.googleapis.com/css2'},{method:'POST'},{type:'fetch'},{url:'https://fonts.googleapis.com/private'}]) assert.equal(p.externalKind({...good,...change}),null);
});
test('geometry removes only known local origin from currentSrc, retaining choice query',()=> {
  const g={document:{width:390,height:900},images:[{currentSrc:'http://127.0.0.1:1/a.webp?w=390',naturalWidth:390}]};
  assert.equal(p.normalizeGeometry(g,'http://127.0.0.1:1').images[0].currentSrc,'/a.webp?w=390');
  assert.equal(g.images[0].currentSrc,'http://127.0.0.1:1/a.webp?w=390');
});
test('geometry refuses unexpected images and excessive element count',()=> {
  assert.throws(()=>p.normalizeGeometry({images:[{currentSrc:'https://evil.test/a.png'}]},'http://127.0.0.1:1'));
  assert.throws(()=>p.normalizeGeometry({images:Array(101).fill({currentSrc:'/a'})},'http://127.0.0.1:1'));
});
test('PNG header parser reads actual dimensions and refuses non-PNG',()=> {
  const b=Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(b); b.write('IHDR',12);b.writeUInt32BE(390,16);b.writeUInt32BE(900,20);
  assert.deepEqual(p.pngDimensions(b),{width:390,height:900}); assert.throws(()=>p.pngDimensions(Buffer.alloc(33)));
});
test('full-page dimensions reject identical cropping, zero and oversize rather than accepting <=',()=> {
  const geometry={document:{width:390,height:900}};p.requireCaptureDimensions({width:390,height:900},geometry);
  for(const actual of [{width:390,height:899},{width:389,height:900},{width:0,height:0},{width:391,height:900}]) assert.throws(()=>p.requireCaptureDimensions(actual,geometry));
});
const fontChecks=serif=>[...[400,500,600,700,800].map(weight=>({family:'Inter',weight,faces:[{family:'Inter',status:'loaded',style:'normal',weight:'100 900'}]})),...(serif?[{family:'DM Serif Display',weight:400,faces:[{family:'DM Serif Display',status:'loaded',style:'normal',weight:'400'}]}]:[])];
test('font checks require every actual loaded normal Latin family/weight group',()=> {p.requireFontChecks(fontChecks(false),'/');p.requireFontChecks(fontChecks(true),'/about');});
test('font checks refuse fallback, unloaded, italic, missing and unsupported weight groups',()=> {
  for(const change of [{family:'Arial'},{status:'unloaded'},{style:'italic'},{weight:'900'}]) {
    const checks=fontChecks(false);Object.assign(checks[0].faces[0],change);assert.throws(()=>p.requireFontChecks(checks,'/'));
  }
  assert.throws(()=>p.requireFontChecks([],'/'));assert.throws(()=>p.requireFontChecks(fontChecks(false),'/about'));
  const checks=fontChecks(false);checks[0].faces=[];assert.throws(()=>p.requireFontChecks(checks,'/'));
});
test('coverage requires all 54 unique route-width cases and no unpassed case',()=> {
  const cases=routes.flatMap(route=>p.WIDTHS.map(width=>({route,width,passed:true})));p.requireCoverage(cases,routes);
  assert.throws(()=>p.requireCoverage(cases.slice(1),routes));assert.throws(()=>p.requireCoverage([...cases.slice(1),cases[1]],routes));
  assert.throws(()=>p.requireCoverage(cases.map((v,n)=>n? v:{...v,passed:false}),routes));
});

// Entire actual entrypoint composition under VM doubles: no child, socket or browser is started.
function entrypointFixture(mode) {
  const records={decoderExpected:[],spawns:[],writes:[],servers:[],browserCalls:0,contextClosed:0,browserClosed:0};
  const source=fs.readFileSync(path.join(__dirname,'browser-main-parity.cjs'),'utf8');
  const snapshot={paths,read:name=>{assert.equal(name,'sitemap.xml');return xml(routes);},commit:'86894c29c5d02baad35b3cc47815d2d0ec06315e',tree:'f09903750fa6d6c8b6df16a7fe818bb92692154d',fileCount:83,totalBytes:10933866};
  let rejectNavigation;
  const context={close:async()=>{records.contextClosed++;if(rejectNavigation)rejectNavigation(Error('closed'));if(mode==='cleanup-failure')throw Error('cleanup denied');},
    route:async()=>{if(mode==='cleanup-failure')throw Error('mock route failure');},on:()=>{},newPage:async()=>({setDefaultTimeout:()=>{},setViewportSize:async()=>{},goto:()=>new Promise((_,reject)=>{rejectNavigation=reject;}),close:async()=>{}})};
  const browser={version:()=> 'mock-only',newContext:async()=>context,close:async()=>{records.browserClosed++;}};
  const mockPolicy=mode==='deadline'?{...p,Deadline:class{remaining(cap=420000){return Math.min(5,cap);}}}:p;
  const mocks={
    'node:fs':{lstatSync:()=>({isDirectory:()=>true}),mkdirSync:()=>{},writeFileSync:(file,bytes)=>records.writes.push({file,bytes:Buffer.from(bytes)})},
    'node:http':{createServer:()=>{const server={once:()=>{},listen:(_port,host,done)=>{assert.equal(host,'127.0.0.1');queueMicrotask(done);},address:()=>({port:9000+records.servers.length}),closeAllConnections:()=>{},close:done=>{if(done)queueMicrotask(()=>done());}};records.servers.push(server);return server;}},
    'node:child_process':{spawn:(exe,args,options)=>{records.spawns.push({exe,args,options});return fakeChild(child=>{child.stdout.emit('data',Buffer.from(args[0]));child.emit('close',0);});}},
    './main-parity-policy.cjs':mockPolicy,
    './main-snapshot-contract.cjs':{decodeMainSnapshot:raw=>{assert.equal(raw.toString(),'scripts/export_main_snapshot.py');return snapshot;}},
    './candidate-snapshot-contract.cjs':{decodeCandidateSnapshot:(raw,expected)=>{records.decoderExpected.push(expected);assert.equal(expected,commit);assert.equal(raw.toString(),'scripts/export_candidate_snapshot.py');return {...snapshot,candidateCommitClaim:expected,candidateTreeClaim:'b'.repeat(40),publicMappingAuthenticated:true,commitChainVerified:false,fileCount:84};}},
    './snapshot-request-handler.cjs':{createSnapshotHandler:()=>()=>assert.fail('no actual HTTP request allowed')},
    './capture-readiness.cjs':{waitForCaptureReady:()=>assert.fail('no browser evaluation allowed')},
    playwright:{chromium:{launch:async()=>{records.browserCalls++;if(mode==='decoder')throw Error('intentional post-decoder stop');return browser;}}},
  };
  const module={exports:{}};
  const customRequire=name=>Object.hasOwn(mocks,name)?mocks[name]:require(name);
  vm.runInNewContext(source,{require:customRequire,module,exports:module.exports,__dirname,path,Buffer,TextDecoder,URL,setTimeout,clearTimeout,
    console:{log:()=>assert.fail('failure path must not announce PASS'),error:()=>{}},
    process:{env:{GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'mercurym4/practice-perfect',SOURCE_COMMIT:commit,FONT_EVIDENCE_DIR:'/mock-evidence'}},}, {filename:'mocked-browser-main-parity.cjs'});
  return {run:module.exports.main,records};
}
test('actual main entrypoint passes independent expectedCommit into candidate decoder and preserves failure evidence',async()=>{
  const fixture=entrypointFixture('decoder');await assert.rejects(fixture.run(),/verification failed/);
  assert.deepEqual(fixture.records.decoderExpected,[commit]);assert.equal(fixture.records.browserCalls,1);
  assert.equal(fixture.records.spawns.length,2);assert.equal(fixture.records.servers.length,2);
  const json=JSON.parse(fixture.records.writes.at(-1).bytes);assert.equal(json.passed,false);assert.equal(json.visualAcceptance,false);assert.equal(json.cleanup.passed,true);
  assert.equal(json.candidate.commitClaim,commit);assert.equal(json.candidate.commitChainVerified,false);
});
test('actual main entrypoint cleanup rejection sets false acceptance and rejects after writing evidence',async()=>{
  const fixture=entrypointFixture('cleanup-failure');await assert.rejects(fixture.run(),/cleanup not verified/);
  const json=JSON.parse(fixture.records.writes.at(-1).bytes);assert.equal(json.passed,false);assert.equal(json.visualAcceptance,false);assert.equal(json.cleanup.passed,false);
  assert.ok(fixture.records.contextClosed>0);assert.ok(fixture.records.browserClosed>0);
});
test('actual main entrypoint global expiry closes mocked resources and retains failure JSON',async()=>{
  const fixture=entrypointFixture('deadline');await assert.rejects(fixture.run(),/verification failed/);
  const json=JSON.parse(fixture.records.writes.at(-1).bytes);assert.equal(json.passed,false);assert.equal(json.visualAcceptance,false);assert.equal(json.cleanup.passed,true);
  assert.ok(fixture.records.contextClosed>0);assert.ok(fixture.records.browserClosed>0);
});

test('pair-local evidence decision requires exact Buffer equality rather than hash or identity',()=>{
  const main=Buffer.from('first original');
  assert.deepEqual(p.firstPairEvidence(main,Buffer.from(main),'00-390-main.png','00-390-candidate.png'),
    {evidenceFile:'00-390-main.png',storage:'deduplicated-equal-first-capture'});
  assert.deepEqual(p.firstPairEvidence(main,Buffer.from('first changed'),'00-390-main.png','00-390-candidate.png'),
    {evidenceFile:'00-390-candidate.png',storage:'original-first-capture'});
  assert.throws(()=>p.firstPairEvidence(main,'first original','00-390-main.png','00-390-candidate.png'));
});
test('pair-local evidence rejects traversal, newline and cross-case or width aliases',()=>{
  const b=Buffer.from('same');
  for(const names of [['../00-390-main.png','00-390-candidate.png'],['00-390-main.png\n','00-390-candidate.png'],
    ['00-390-main.png','01-390-candidate.png'],['00-390-main.png','00-1440-candidate.png'],['00-390-main.png','../00-390-candidate.png']])
    assert.throws(()=>p.firstPairEvidence(b,b,...names));
});
test('deduplication refunds only its admitted reservation and does not expand byte/file caps',()=>{
  const b=new p.EvidenceBudget(100);const retained=b.reserve(70);b.complete(retained,10);
  const candidate=b.reserve(70);assert.equal(b.used,80);
  const decision=p.firstPairEvidence(Buffer.from('same'),Buffer.from('same'),'00-390-main.png','00-390-candidate.png');
  assert.equal(decision.storage,'deduplicated-equal-first-capture');b.complete(candidate,0);assert.equal(b.used,10);assert.equal(b.files,2);
  assert.throws(()=>b.complete(candidate,0));assert.throws(()=>b.reserve(91));
  assert.equal(p.MAX_EVIDENCE_BYTES,64*1024*1024);assert.equal(p.MAX_JSON_BYTES,1024*1024);
});

// Full actual entrypoint with every resource doubled; no Playwright, process or socket is opened.
function fullDedupFixture(mode='equal') {
  const records={captures:0,pages:0,writes:[],fontFetches:0,passes:0,closed:0};
  const script=fs.readFileSync(path.join(__dirname,'browser-main-parity.cjs'),'utf8');
  const policySource=fs.readFileSync(path.join(__dirname,'main-parity-policy.cjs'),'utf8');
  let intercepted;
  const sandbox={Buffer,TextDecoder,URL,setTimeout,clearTimeout,__dirname,
    process:{env:{GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'mercurym4/practice-perfect',SOURCE_COMMIT:commit,FONT_EVIDENCE_DIR:'/mock-evidence'}},
    console:{log:()=>records.passes++,error:()=>{}}};
  const realm=vm.createContext(sandbox);
  const clone=value=>{sandbox.__fixtureValue=JSON.stringify(value);return vm.runInContext('JSON.parse(__fixtureValue)',realm);};
  const context={route:async(_pattern,handler)=>{intercepted=handler;},on:()=>{},close:async()=>{records.closed++;if(mode==='cleanup')throw Error('mock cleanup failed');},
    newPage:async()=>{
      const pageIndex=records.pages++;let width=0,route='/';
      return {setDefaultTimeout:()=>{},setViewportSize:async size=>{width=size.width;},goto:async target=>{
        route=new URL(target).pathname;
        for(const [url,type] of [['https://fonts.googleapis.com/css2?family=Inter','stylesheet'],['https://fonts.gstatic.com/s/fixture.woff2','font']]) {
          await intercepted({request:()=>({url:()=>url,method:()=> 'GET',resourceType:()=>type}),
            fetch:async()=>{records.fontFetches++;return {status:()=>200,headers:()=>({}),body:async()=>Buffer.from('fixture bytes'),dispose:async()=>{}};},
            fulfill:async()=>{},abort:async()=>assert.fail('approved fixture request must not abort')});
        }
        return {status:()=>200};
      },evaluate:async fn=>{
        if(String(fn).includes('document.fonts.load')) return clone(fontChecks(p.SERIF_ROUTES.includes(route)));
        if(fn.name==='waitForCaptureReady')return clone({decodedImages:0});
        return clone({document:{width,height:900},viewport:{width,height:900,dpr:mode==='geometry'&&pageIndex===1?2:1},scroll:{x:0,y:0},images:[]});
      },screenshot:async()=>{
        records.captures++;const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.write('IHDR',12);b.writeUInt32BE(width,16);b.writeUInt32BE(900,20);
        if(mode==='unequal'&&pageIndex===1)b[32]=1;
        return b;
      },close:async()=>{}};
    }};
  const snapshot={paths:clone(paths),read:()=>xml(routes),commit:'86894c29c5d02baad35b3cc47815d2d0ec06315e',tree:'f09903750fa6d6c8b6df16a7fe818bb92692154d',fileCount:83,totalBytes:10933866};
  let serverCount=0;
  const mocks={
    'node:fs':{lstatSync:()=>({isDirectory:()=>true}),mkdirSync:()=>{},writeFileSync:(file,bytes,options)=>{
      assert.equal(options.flag,'wx');assert.equal(records.writes.some(item=>item.file===file),false);
      records.writes.push({file,bytes:Buffer.from(bytes)});
    }},
    'node:http':{createServer:()=>{const port=9100+serverCount++;return {once:()=>{},listen:(_port,host,done)=>{assert.equal(host,'127.0.0.1');queueMicrotask(done);},address:()=>({port}),closeAllConnections:()=>{},close:done=>{if(done)queueMicrotask(done);}};}},
    'node:child_process':{spawn:(_exe,args)=>fakeChild(child=>{child.stdout.emit('data',Buffer.from(args[0]));child.emit('close',0);})},
    './main-snapshot-contract.cjs':{decodeMainSnapshot:()=>snapshot},
    './candidate-snapshot-contract.cjs':{decodeCandidateSnapshot:(_raw,expected)=>{assert.equal(expected,commit);return {...snapshot,candidateCommitClaim:expected,candidateTreeClaim:'b'.repeat(40),publicMappingAuthenticated:true,commitChainVerified:false,fileCount:84};}},
    './snapshot-request-handler.cjs':{createSnapshotHandler:()=>()=>assert.fail('no actual requests')},
    './capture-readiness.cjs':{waitForCaptureReady:function waitForCaptureReady(){}},
    playwright:{chromium:{launch:async()=>({version:()=> 'mock-only',newContext:async()=>context,close:async()=>{records.closed++;}})}},
  };
  let runtimePolicy;
  const customRequire=name=>name==='./main-parity-policy.cjs'?runtimePolicy:Object.hasOwn(mocks,name)?mocks[name]:require(name);
  function load(source){const module={exports:{}};const factory=vm.runInContext('(function(require,module,exports,__dirname){'+source+'\n})',realm);factory(customRequire,module,module.exports,__dirname);return module.exports;}
  runtimePolicy=load(policySource);
  return {run:load(script).main,records};
}
test('actual main captures108 first images but retains54 pair-local PNGs plus JSON on success',async()=>{
  const fixture=fullDedupFixture();await fixture.run();const {records}=fixture;
  assert.equal(records.captures,108);assert.equal(records.pages,108);assert.equal(records.writes.length,55);assert.equal(records.fontFetches,2);assert.equal(records.passes,1);
  const json=JSON.parse(records.writes.at(-1).bytes);assert.equal(json.passed,true);assert.equal(json.visualAcceptance,true);assert.equal(json.cases.length,54);
  const actualFiles=new Map(records.writes.map(item=>[path.basename(item.file),item.bytes]));
  for(const item of json.cases){assert.equal(item.candidate.storage,'deduplicated-equal-first-capture');assert.equal(item.candidate.evidenceFile,item.main.evidenceFile);
    assert.equal(actualFiles.has(item.candidate.name),false);assert.equal(actualFiles.has(item.candidate.evidenceFile),true);assert.equal(item.candidate.sha256,item.main.sha256);}
});
test('actual main retains both unequal first PNGs before failing, without any recapture',async()=>{
  const fixture=fullDedupFixture('unequal');await assert.rejects(fixture.run(),/verification failed/);
  assert.equal(fixture.records.captures,2);assert.equal(fixture.records.writes.length,3);assert.equal(fixture.records.passes,0);
  const json=JSON.parse(fixture.records.writes.at(-1).bytes);assert.equal(json.passed,false);assert.equal(json.visualAcceptance,false);
  assert.equal(json.cases[0].candidate.storage,'original-first-capture');assert.notEqual(json.cases[0].candidate.evidenceFile,json.cases[0].main.evidenceFile);
  assert.equal(fixture.records.writes[0].bytes.equals(fixture.records.writes[1].bytes),false);
});
test('actual main still fails geometry despite byte-equal first PNG deduplication',async()=>{
  const fixture=fullDedupFixture('geometry');await assert.rejects(fixture.run(),/verification failed/);
  assert.equal(fixture.records.captures,2);assert.equal(fixture.records.writes.length,2);
  const json=JSON.parse(fixture.records.writes.at(-1).bytes);assert.equal(json.passed,false);assert.equal(json.visualAcceptance,false);
  assert.equal(json.cases[0].candidate.storage,'deduplicated-equal-first-capture');assert.notDeepEqual(json.cases[0].candidate.geometry,json.cases[0].main.geometry);
});
test('actual main cleanup failure remains false after108 otherwise matching first captures',async()=>{
  const fixture=fullDedupFixture('cleanup');await assert.rejects(fixture.run(),/cleanup not verified/);
  assert.equal(fixture.records.captures,108);assert.equal(fixture.records.writes.length,55);assert.equal(fixture.records.passes,0);
  const json=JSON.parse(fixture.records.writes.at(-1).bytes);assert.equal(json.passed,false);assert.equal(json.visualAcceptance,false);assert.equal(json.cleanup.passed,false);
});
