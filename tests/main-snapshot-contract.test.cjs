'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const production = require('./main-snapshot-contract.cjs');
const source = fs.readFileSync(path.join(__dirname, 'main-snapshot-contract.cjs'), 'utf8');
const paths = JSON.parse(source.match(/const PATHS = (\[[\s\S]*?\]);/)[1]);
const sha = (kind, data) => crypto.createHash(kind).update(data).digest('hex');
const rows = paths.map(path => {
  const data = Buffer.from('fixture:' + path, 'ascii');
  return [path, '100644', sha('sha1', Buffer.concat([Buffer.from('blob ' + data.length + '\0'), data])),
    data.length, sha('sha256', data), data.toString('base64')];
});
const mapping = sha('sha256', Buffer.from(JSON.stringify(rows.map(row => row.slice(0, 3)))));
const valid = ['pp-approved-main-snapshot', 1, 'mercurym4/practice-perfect',
  '86894c29c5d02baad35b3cc47815d2d0ec06315e', 'f09903750fa6d6c8b6df16a7fe818bb92692154d',
  mapping, 'literal-local-git-objects', false, false, 83, rows.reduce((n, row) => n + row[3], 0), rows];
const moduleFixture = {exports: {}};
// The ONLY test policy substitution is the mapping pin, in this private VM copy;
// production decoder accepts no policy argument, environment or ref override.
vm.runInNewContext(source.replace(
  "const MAPPING = '6378328e0fb0b02fab38e692b9b0f2706197a7eafa3f50aff14b5dd1d790582d';",
  "const MAPPING = '" + mapping + "';"), {module: moduleFixture, require, Buffer});
const decode = moduleFixture.exports.decodeMainSnapshot;
const wire = value => Buffer.from(JSON.stringify(value) + '\n', 'ascii');
const clone = () => JSON.parse(JSON.stringify(valid));
const rejects = value => assert.throws(() => decode(wire(value)), /refused/);
test('complete 83-file fixture returns exact byte-owned map and false claims', () => {
  const result = decode(wire(valid));
  assert.equal(result.fileCount, 83);
  assert.equal(result.totalBytes, valid[10]);
  assert.equal(result.visualAcceptance, false);
  assert.equal(result.deploymentVerified, false);
  for (const path of result.paths) assert.equal(result.read(path).toString(), 'fixture:' + path);
});
test('defensive byte lookup cannot mutate retained snapshot', () => {
  const result=decode(wire(valid)), first=result.paths[0], bytes=result.read(first);
  bytes.fill(0);
  assert.equal(result.read(first).toString(), 'fixture:'+first);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.paths), true);
  assert.equal('files' in result, false);
  assert.throws(()=>result.read('docs/private.md'),/refused/);
  assert.throws(()=>result.paths.push('extra'));
});
test('unmodified production mapping rejects synthetic fixture', () => {
  assert.throws(() => production.decodeMainSnapshot(wire(valid)), /refused/);
});
test('raw Buffer required', () => assert.throws(() => decode(JSON.stringify(valid)), /refused/));
test('empty input refused', () => assert.throws(() => decode(Buffer.alloc(0)), /refused/));
test('raw JSON byte budget', () => assert.throws(() => decode(Buffer.alloc(production.MAX_JSON_BYTES + 1)), /refused/));
test('invalid JSON', () => assert.throws(() => decode(Buffer.from('[')), /refused/));
test('duplicate-key root object is not a wire format', () => assert.throws(() => decode(Buffer.from('{"a":1,"a":2}\n')), /refused/));
test('UTF8 and NUL refused', () => {
  for (const raw of [Buffer.from('\ufeff[]'), Buffer.from([0xff]), Buffer.from([0])]) assert.throws(() => decode(raw), /refused/);
});
test('canonical newline required', () => assert.throws(() => decode(wire(valid).subarray(0, wire(valid).length - 1)), /refused/));
test('extra whitespace refused', () => assert.throws(() => decode(Buffer.concat([Buffer.from(' '), wire(valid)])), /refused/));
test('noncanonical escaped spelling refused', () => assert.throws(() => decode(Buffer.from(wire(valid).toString().replace('pp-approved', '\\u0070p-approved'))), /refused/));
test('closed top-level tuple', () => { const v = clone(); v.push(1); rejects(v); });
for (const [index, altered] of [[0,'other-schema'],[1,true],[2,'other/repo'],[3,'0'.repeat(40)],
  [4,'0'.repeat(40)],[5,'0'.repeat(64)],[6,'worktree'],[7,true],[8,true],[9,82],[10,-1]]) {
  test('top-level provenance/type refusal index ' + index, () => {const v=clone();v[index]=altered;rejects(v);});
}
test('missing and extra rows', () => {
  let v=clone();v[11].pop();rejects(v);
  v=clone();v[11].push(v[11][0]);rejects(v);
});
test('duplicate/path order refused', () => {
  let v=clone();v[11][1]=v[11][0];rejects(v);
  v=clone();[v[11][0],v[11][1]]=[v[11][1],v[11][0]];rejects(v);
});
test('private, absolute, traversal, query and encoded paths refused', () => {
  for (const path of ['docs/private.md','/index.html','../index.html','index.html?q=x','%69ndex.html']) {
    const v=clone();v[11][0][0]=path;rejects(v);
  }
});
test('row objects including duplicate keys impossible', () => {
  const v=clone();v[11][0]={path:'about.html',data:'x'};rejects(v);
});
test('closed row tuples', () => {const v=clone();v[11][0].push('extra');rejects(v);});
test('mode constraints', () => {const v=clone();v[11][0][1]='120000';rejects(v);});
test('size integer and bound', () => {
  for (const size of [true, -1, 1.5, production.MAX_FILE_BYTES+1]) {
    const v=clone();v[11][0][3]=size;rejects(v);
  }
});
test('malformed digest fields', () => {
  for (const [index,value] of [[2,'F'.repeat(40)],[2,{}],[4,'0'.repeat(63)],[4,1]]) {
    const v=clone();v[11][0][index]=value;rejects(v);
  }
});
test('size and SHA256 mutations refused', () => {
  for (const index of [2,4]) {const v=clone();v[11][0][index]='0'.repeat(index===2?40:64);rejects(v);}
  const v=clone();v[11][0][3]++;rejects(v);
});
test('base64 rejects whitespace padding and alphabet variants', () => {
  for (const text of ['!!!!','Zg','Zg===','Zh==','Zg==\n','Zg-_']) {
    const v=clone();v[11][0][5]=text;rejects(v);
  }
});
test('valid alternative blob remains pinned by path mapping', () => {
  const v=clone(), row=v[11][0], data=Buffer.from('different valid bytes');
  v[10]+=data.length-row[3];
  row[2]=sha('sha1',Buffer.concat([Buffer.from('blob '+data.length+'\0'),data]));
  row[3]=data.length;row[4]=sha('sha256',data);row[5]=data.toString('base64');
  rejects(v);
});
test('aggregate bound and exact total', () => {
  let v=clone();v[10]++;rejects(v);
  v=clone();v[10]=production.MAX_TOTAL_BYTES+1;rejects(v);
});
test('noncanonical exponent and negative zero', () => {
  const raw=wire(valid).toString().replace(',1,',',1e0,');
  assert.throws(()=>decode(Buffer.from(raw)),/refused/);
  const zero=clone();zero[10]=0;
  assert.throws(()=>decode(Buffer.from(JSON.stringify(zero).replace(',0,',',-0,')+'\n')),/refused/);
});
test('no policy argument relaxes production pins', () => {
  assert.throws(()=>production.decodeMainSnapshot(wire(valid),{mapping}),/refused/);
});

function cliHarness() {
  const EventEmitter = require('node:events');
  const stdin = new EventEmitter();
  let destroyed = false, out = '', err = '', timeout, cleared = false;
  stdin.destroy = () => { destroyed = true; };
  const fakeProcess = {stdin, stdout: {write: text => {out += text;}},
    stderr: {write: text => {err += text;}}, exitCode: 0};
  const cliModule = {exports: {}};
  function cliRequire(name) { return require(name); }
  cliRequire.main = cliModule;
  vm.runInNewContext(source.replace(
    "const MAPPING = '6378328e0fb0b02fab38e692b9b0f2706197a7eafa3f50aff14b5dd1d790582d';",
    "const MAPPING = '" + mapping + "';"), {
    module: cliModule, require: cliRequire, Buffer, process: fakeProcess,
    setTimeout(callback, delay) {assert.equal(delay,70000);timeout=callback;return 1;},
    clearTimeout(id) {assert.equal(id,1);cleared=true;}
  });
  return {stdin, process:fakeProcess, get out(){return out;},get err(){return err;},
    get destroyed(){return destroyed;},get cleared(){return cleared;},deadline(){timeout();}};
}
test('CLI emits one small provenance summary only for completely validated input', () => {
  const h=cliHarness(), raw=wire(valid);
  for(let i=0;i<raw.length;i+=13) h.stdin.emit('data',raw.subarray(i,i+13));
  assert.equal(h.out,'');
  h.stdin.emit('end');
  const result=JSON.parse(h.out);
  assert.equal(result.bridge_verified,true);
  assert.equal(result.file_count,83);
  assert.equal(result.total_bytes,valid[10]);
  assert.equal(result.renderer_verified,false);
  assert.equal(result.visual_acceptance,false);
  assert.equal(result.deployment_verified,false);
  assert.equal(result.baseline_commit,valid[3]);
  assert.equal(result.selected_inventory_sha256,mapping);
  assert.ok(h.out.length<1024);
  assert.equal(h.out.includes(rows[0][5]),false);
  assert.equal(h.err,'');
  assert.equal(h.cleared,true);
  h.stdin.emit('end');h.deadline();h.stdin.emit('error',new Error('late secret'));
  assert.equal(h.process.exitCode,0);
  assert.equal(h.out.split('\n').length,2);
});
test('CLI refuses raw overflow before copying excess and ignores late events', () => {
  const h=cliHarness();
  h.stdin.emit('data',Buffer.alloc(production.MAX_JSON_BYTES+1));
  h.stdin.emit('end');h.stdin.emit('error',new Error('secret'));
  assert.equal(h.out,'');
  assert.equal(h.err,'Approved-main snapshot contract refused\n');
  assert.equal(h.destroyed,true);assert.equal(h.cleared,true);assert.equal(h.process.exitCode,1);
});
test('CLI finite deadline refuses unfinished pipe without payload', () => {
  const h=cliHarness();
  h.stdin.emit('data',wire(valid).subarray(0,13));
  h.deadline();h.stdin.emit('end');
  assert.equal(h.out,'');assert.equal(h.err,'Approved-main snapshot contract refused\n');
  assert.equal(h.destroyed,true);assert.equal(h.process.exitCode,1);
});
test('CLI stream error does not echo arbitrary error details', () => {
  const h=cliHarness();
  h.stdin.emit('error',new Error('secret details'));
  assert.equal(h.out,'');assert.equal(h.err,'Approved-main snapshot contract refused\n');
  assert.equal(h.destroyed,true);assert.equal(h.process.exitCode,1);
});
test('CLI empty and malformed complete pipes fail without summary', () => {
  for(const data of [Buffer.alloc(0),Buffer.from('{"a":1,"a":2}\n')]) {
    const h=cliHarness();h.stdin.emit('data',data);h.stdin.emit('end');
    assert.equal(h.out,'');assert.equal(h.err,'Approved-main snapshot contract refused\n');
    assert.equal(h.destroyed,true);assert.equal(h.process.exitCode,1);
  }
});
test('CLI unexpected non-byte chunks fail closed', () => {
  const h=cliHarness();h.stdin.emit('data','not a Buffer');
  assert.equal(h.out,'');assert.equal(h.process.exitCode,1);assert.equal(h.destroyed,true);
});


