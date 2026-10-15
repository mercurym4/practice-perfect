'use strict';
// Private VM-only fixture pin substitution; the production module has no override.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');
const MODULE = path.join(__dirname, 'candidate-snapshot-contract.cjs');
const source = fs.readFileSync(MODULE, 'utf8');
const PATHS = JSON.parse(source.match(/const PATHS = Object.freeze\((\[[\s\S]*?\])\);/)[1]);
const FIXED = 'd8c9bada27a55ed1b6319e53674f794e048de15874f33f2a3ba05af62570d73b';
const COMMIT = '1'.repeat(40);
const TREE = '2'.repeat(40);
const hash = (algorithm, bytes) => crypto.createHash(algorithm).update(bytes).digest('hex');
function fixture() {
  const rows = PATHS.map((p, i) => {
    const b = Buffer.from([0, 255, 128, i, 10]);
    return [p, '100644', hash('sha1', Buffer.concat([Buffer.from('blob ' + b.length + '\0'), b])),
      b.length, hash('sha256', b), b.toString('base64')];
  });
  const mapping = hash('sha256', JSON.stringify(rows.map(r => r.slice(0, 3))));
  return ['pp-candidate-public-snapshot', 1, 'mercurym4/practice-perfect', COMMIT, TREE,
    mapping, 'authenticated-local-git-object-chain', true, false, false, false, 84,
    rows.reduce((n, r) => n + r[3], 0), rows];
}
function encoder(v) { return Buffer.from(JSON.stringify(v) + '\n', 'ascii'); }
function decoder(value = fixture()) {
  const sandbox = {require, module: {exports: {}}, Buffer};
  vm.runInNewContext(source.replace("const MAPPING = '" + FIXED + "';",
    "const MAPPING = '" + value[5] + "';"), sandbox, {filename: MODULE});
  return sandbox.module.exports.decodeCandidateSnapshot;
}
function refuses(mutator) {
  const value = fixture();
  mutator(value);
  assert.throws(() => decoder()(encoder(value), COMMIT), /Candidate snapshot contract refused/);
}
test('fixed 84 path list includes mobile menu, no private paths', () => {
  assert.equal(PATHS.length, 84);
  assert.equal(new Set(PATHS).size, 84);
  assert.deepEqual(PATHS, [...PATHS].sort());
  assert.ok(PATHS.includes('mobile-menu.js'));
  assert.ok(PATHS.every(p => !/^(docs|scripts|tests|api)\//.test(p)));
});
test('synthetic full-84 binary fixture decodes through private VM seam', () => {
  const v = fixture(); const result = decoder()(encoder(v), COMMIT);
  assert.equal(result.fileCount, 84);
  assert.equal(result.totalBytes, 420);
  assert.equal(result.candidateCommitClaim, COMMIT);
  assert.equal(result.candidateTreeClaim, TREE);
  assert.equal(result.selectedInventorySha256, v[5]);
  assert.equal(result.publicMappingAuthenticated, true);
  assert.equal(result.commitChainVerified, false);
  assert.equal(result.visualAcceptance, false);
  assert.equal(result.deploymentVerified, false);
  assert.deepEqual([...result.read('mobile-menu.js')], [0,255,128,PATHS.indexOf('mobile-menu.js'),10]);
});
test('defensive read buffers and frozen metadata', () => {
  const r = decoder()(encoder(fixture()), COMMIT);
  r.read('index.html').fill(9);
  assert.equal(r.read('index.html')[0], 0);
  assert.ok(Object.isFrozen(r));
  assert.ok(Object.isFrozen(r.paths));
  assert.throws(() => r.paths.push('docs/private.md'));
  assert.equal(r.files, undefined);
});
test('production decoder refuses synthetic mapping', () =>
  assert.throws(() => require(MODULE).decodeCandidateSnapshot(encoder(fixture()), COMMIT)));
for (const [label, change] of [
  ['schema', v => v[0] = 'wrong'],
  ['version boolean', v => v[1] = true],
  ['repository', v => v[2] = 'other/site'],
  ['commit mismatch', v => v[3] = '3'.repeat(40)],
  ['tree uppercase', v => v[4] = 'A'.repeat(40)],
  ['tree not string', v => v[4] = {}],
  ['mapping', v => v[5] = '0'.repeat(64)],
  ['producer source', v => v[6] = 'worktree'],
  ['mapping flag', v => v[7] = false],
  ['chain overclaim', v => v[8] = true],
  ['visual overclaim', v => v[9] = true],
  ['deployment overclaim', v => v[10] = true],
  ['count', v => v[11] = 83],
  ['total mismatch', v => v[12]++],
  ['total over budget', v => v[12] = 16*1024*1024+1],
  ['total bool', v => v[12] = true],
  ['total float', v => v[12] = 1.5],
  ['missing row', v => v[13].pop()],
  ['extra row', v => v[13].push(v[13][0])],
  ['row object', v => v[13][0] = {}],
  ['row excess', v => v[13][0].push('extra')],
  ['row order', v => [v[13][0],v[13][1]]=[v[13][1],v[13][0]]],
  ['duplicate path', v => v[13][1][0]=v[13][0][0]],
  ['private path', v => v[13][0][0]='docs/private.md'],
  ['traversal', v => v[13][0][0]='../index.html'],
  ['symlink mode', v => v[13][0][1]='120000'],
  ['noncanonical mode', v => v[13][0][1]=100644],
  ['blob mutation', v => v[13][0][2]='0'.repeat(40)],
  ['blob uppercase', v => v[13][0][2]='A'.repeat(40)],
  ['negative size', v => v[13][0][3]=-1],
  ['size bool', v => v[13][0][3]=true],
  ['size oversized', v => v[13][0][3]=2*1024*1024+1],
  ['size mismatch', v => v[13][0][3]=4],
  ['hash mutation', v => v[13][0][4]='0'.repeat(64)],
  ['hash uppercase', v => v[13][0][4]='A'.repeat(64)],
  ['base64 whitespace', v => v[13][0][5]='AP+A AAo='],
  ['base64 url alphabet', v => v[13][0][5]='AP-A AAo='],
  ['base64 omitted pad', v => v[13][0][5]='AP+AAAo'],
  ['base64 object', v => v[13][0][5]={}],
  ['base64 valid changed bytes', v => v[13][0][5]='Af+AAAo='],
]) test('refuses ' + label, () => refuses(change));
test('separately expected commit cannot be omitted or malformed', () => {
  for (const expected of [undefined, null, {}, 'main', '1'.repeat(39), 'A'.repeat(40), COMMIT+'\n']) {
    assert.throws(() => decoder()(encoder(fixture()), expected));
  }
});
test('read refuses missing/private/typed paths', () => {
  const r=decoder()(encoder(fixture()),COMMIT);
  for (const p of ['docs/private.md','/index.html','../index.html','',null,{},new String('index.html')])
    assert.throws(() => r.read(p));
});
test('wire noncanonical encodings and objects refused', () => {
  const v=fixture(); const raw=encoder(v); const decode=decoder();
  for (const bad of [raw.subarray(0,raw.length-1),Buffer.concat([raw,Buffer.from('\n')]),
    Buffer.from(' '+raw),Buffer.from(raw.toString().replace(',1,',',1e0,')),
    Buffer.from('{}\n'),Buffer.from('{"x":1,"x":2}\n'),Buffer.from('\ufeff'+raw),
    Buffer.from(raw.toString().replace(',420,',',-0,')),Buffer.from([0]),Buffer.from([255])]) {
    assert.throws(() => decode(bad,COMMIT));
  }
  assert.throws(() => decode(raw.toString(),COMMIT));
  assert.throws(() => decode(Buffer.alloc(24*1024*1024+1),COMMIT));
});
test('CLI exact arguments and redacted errors', () => {
  for (const args of [[],['--commit'],['--commit','main'],['--commit',COMMIT+'\n'],['--commit',COMMIT,'--policy','secret']]) {
    const r=spawnSync(process.execPath,[MODULE,...args],{encoding:'utf8',timeout:5000,input:''});
    assert.equal(r.status,1); assert.equal(r.stdout,'');
    assert.equal(r.stderr,'Candidate snapshot contract refused\n');
  }
});
test('CLI refuses bad input without disclosing payload', () => {
  const r=spawnSync(process.execPath,[MODULE,'--commit',COMMIT],
    {encoding:'utf8',timeout:5000,input:'SECRET_REPOSITORY_PATH'});
  assert.equal(r.status,1);assert.equal(r.stdout,'');
  assert.equal(r.stderr,'Candidate snapshot contract refused\n');
});
test('maximum per-file binary payload is admitted at the exact bound', () => {
  const v=fixture(); const b=Buffer.alloc(2*1024*1024,255); const r=v[13][0];
  r[2]=hash('sha1',Buffer.concat([Buffer.from('blob '+b.length+'\0'),b]));
  r[3]=b.length;r[4]=hash('sha256',b);r[5]=b.toString('base64');
  v[12]=v[13].reduce((n,row)=>n+row[3],0);
  v[5]=hash('sha256',JSON.stringify(v[13].map(row=>row.slice(0,3))));
  const result=decoder(v)(encoder(v),COMMIT);
  assert.equal(result.read(PATHS[0]).length,b.length);
});
test('full-hex claims reject a trailing newline even when the expected claim matches', () => {
  const v=fixture();v[3]=COMMIT+'\n';
  assert.throws(()=>decoder()(encoder(v),v[3]));
  v[3]=COMMIT;v[4]=TREE+'\n';
  assert.throws(()=>decoder()(encoder(v),COMMIT));
});
test('commit/tree are explicitly claims, not an independently verified raw chain', () => {
  const v=fixture();v[3]='3'.repeat(40);v[4]='4'.repeat(40);
  const s=decoder()(encoder(v),v[3]);
  assert.equal(s.candidateCommitClaim,v[3]);assert.equal(s.candidateTreeClaim,v[4]);
  assert.equal(s.commitChainVerified,false);assert.equal(s.publicMappingAuthenticated,true);
});
test('aggregate boundary admits 16 MiB and refuses one extra decoded byte', () => {
  const v=fixture();
  for(let i=0;i<v[13].length;i++){
    const b=Buffer.alloc(i<8?2*1024*1024:0,255);const r=v[13][i];
    r[2]=hash('sha1',Buffer.concat([Buffer.from('blob '+b.length+'\0'),b]));
    r[3]=b.length;r[4]=hash('sha256',b);r[5]=b.toString('base64');
  }
  v[12]=16*1024*1024;v[5]=hash('sha256',JSON.stringify(v[13].map(r=>r.slice(0,3))));
  assert.equal(decoder(v)(encoder(v),COMMIT).totalBytes,16*1024*1024);
  const b=Buffer.from([255]),r=v[13][8];
  r[2]=hash('sha1',Buffer.concat([Buffer.from('blob 1\0'),b]));
  r[3]=1;r[4]=hash('sha256',b);r[5]=b.toString('base64');
  v[12]++;v[5]=hash('sha256',JSON.stringify(v[13].map(r=>r.slice(0,3))));
  assert.throws(()=>decoder(v)(encoder(v),COMMIT));
});
test('CLI fixture success emits only a bounded truthful summary', () => {
  const v=fixture();
  const bootstrap=`const fs=require('node:fs'),vm=require('node:vm');
const p=process.argv[1],mapping=process.argv[2],expected=process.argv[3];
const source=fs.readFileSync(p,'utf8').replace("const MAPPING = '${FIXED}';","const MAPPING = '"+mapping+"';");
const m={exports:{}};function r(n){return require(n);}r.main=m;
process.argv=[process.execPath,p,'--commit',expected];
vm.runInNewContext(source,{require:r,module:m,Buffer,process,setTimeout,clearTimeout});`;
  const r=spawnSync(process.execPath,['-e',bootstrap,MODULE,v[5],COMMIT],
    {input:encoder(v),encoding:'utf8',timeout:5000,maxBuffer:16384});
  assert.equal(r.status,0);assert.equal(r.stderr,'');
  const result=JSON.parse(r.stdout);
  assert.equal(result.file_count,84);assert.equal(result.total_bytes,420);
  assert.equal(result.candidate_commit_claim,COMMIT);
  assert.equal(result.candidate_tree_claim,TREE);
  assert.equal(result.public_mapping_authenticated,true);
  assert.equal(result.commit_chain_verified,false);
  assert.equal(result.renderer_verified,false);
  assert.equal(result.visual_acceptance,false);
  assert.equal(result.deployment_verified,false);
  assert.equal(result.rows,undefined);assert.equal(result.files,undefined);
  assert.ok(r.stdout.length<1024);
});
test('CLI refuses over-budget stdin without echoing it', () => {
  const r=spawnSync(process.execPath,[MODULE,'--commit',COMMIT],
    {input:Buffer.alloc(24*1024*1024+1,65),encoding:'utf8',timeout:5000,maxBuffer:16384});
  assert.equal(r.status,1);assert.equal(r.stdout,'');
  assert.equal(r.stderr,'Candidate snapshot contract refused\n');
});
