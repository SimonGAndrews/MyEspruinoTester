#!/usr/bin/env node
// Test runner CLI
//
// Uploads and executes suite tests on a connected Espruino device using
// the Espruino CLI for each test (persistent per-test session).
// Tests follow the "upstream" contract: each sets global `result` and optional `resultReason`.
// The runner injects a small epilogue that prints a single JSON line per test.
// We parse only that JSON line to determine pass/fail.

const { REPO_ROOT, loadManifest, resolveSuites } = require('../lib/manifest');
const { resolveSuiteTests } = require('../lib/tests');

function normalizeKey(key) {
  return key.split('-').map((p,i)=> i? p.charAt(0).toUpperCase()+p.slice(1):p).join('');
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i=2;i<argv.length;i++) {
    const a = argv[i];
    if (!a.startsWith('-')) { args._.push(a); continue; }
    if (a.startsWith('--')) {
      const [k,v] = a.slice(2).split('=');
      const key = normalizeKey(k);
      if (v !== undefined) args[key] = v; else {
        const n = argv[i+1];
        if (n && !n.startsWith('-')) { args[key]=n; i++; } else { args[key]=true; }
      }
      continue;
    }
    const f = a.slice(1);
    const n = argv[i+1];
    switch (f) {
      case 'b': args.board=n; i++; break;
      case 'p': args.port=n; i++; break;
      case 's': args.suites=n; i++; break;
      case 'h': args.help=true; break;
      case 'q': args.quiet=true; break;
      default: args[f]=true;
    }
  }
  return args;
}

function usage() {
  console.log(`Usage: node scripts/run-tests.js --board <name> --port <tty> [--suites suite1,suite2]
Runs tests on a connected Espruino device and reports PASS/FAIL.
Options:
  -b, --board   Board name (required)
  -p, --port    Serial/BLE port (required)
  -s, --suites  Comma-separated suites (default: manifest defaults)
  -q, --quiet   Suppress noisy logging during test upload
`);
}

// We keep EspruinoTools for the warmup step only (to soak up banners)
function ensureEspruinoModule() {
  try {
    return require('espruino');
  } catch (e) {
    console.error('Error: require("espruino") failed. Run `npm install` or `npm link espruino`.');
    process.exit(1);
  }
}

// Quick warmup to consume initial banner/prompt noise
async function warmup(E, port, quiet=false) {
  return new Promise((resolve) => {
    const code = 'print("__RUNNER_READY__")';
    const origLog = console.log, origWarn = console.warn, origErr = console.error;
    const restore = ()=>{ console.log = origLog; console.warn = origWarn; console.error = origErr; };
    if (quiet) { console.log = ()=>{}; console.warn = ()=>{}; console.error = ()=>{}; }
    E.sendCode(port, code, () => { restore(); resolve(); });
  });
}

// Build wrapped source: prologue sets timeout; epilogue polls for `result` and prints JSON
function composeWrappedTest(fileId, src, timeoutSec) {
  const prologue = `var __TEST_TIMEOUT_SEC=${Math.max(1, timeoutSec)};\n`;
  const epilogue = `
(function(){
  function now(){return (typeof getTime==='function'?getTime():Date.now()/1000);}
  var __t0 = now();
  var __deadline = __t0 + (__TEST_TIMEOUT_SEC||5);
  function done(ok, reason){
    var out={__espruino_test__:true,file:"${fileId}",pass:!!ok,duration_ms:Math.round((now()-__t0)*1000),reason: reason || (typeof resultReason!=='undefined'?resultReason:null) || null};
    print(JSON.stringify(out));
  }
  (function wait(){
    if (typeof result!=='undefined') return done(result);
    if (now()<__deadline) return setTimeout(wait,50);
    done(false, 'timeout');
  })();
})();
`;
  return prologue + src + epilogue;
}

// Run one test using the Espruino CLI to keep a persistent session per test
async function runOneTest(E, port, testPath, manifest, timeoutMs=15000, quiet=false) {
  const fs = require('fs');
  const path = require('path');
  const { spawn } = require('child_process');
  const src = fs.readFileSync(testPath,'utf8');
  const fileId = path.basename(testPath);
  const wrapped = composeWrappedTest(fileId, src, Math.round(timeoutMs/1000));

  return new Promise((resolve) => {
    let done = false;
    const cmd = process.env.ESPRUINO_CLI || 'espruino';
    const args = ['--port', port, '-e', wrapped];
    const boardArg = process.env.ESPRUINO_BOARD || (manifest && (manifest.board || (manifest.upstream && manifest.upstream.id)));
    if (boardArg) args.push('--board', boardArg);
    const child = spawn(cmd, args, { stdio: ['ignore','pipe','pipe'] });
    let out=''; let err='';
    const timer = setTimeout(()=>{ if(!done){ done=true; try{child.kill('SIGINT');}catch(_){} resolve({ pass:false, reason:'timeout', output: out||err }); }}, timeoutMs+1000);
    child.stdout.on('data', d=>{ out += d.toString(); });
    child.stderr.on('data', d=>{ err += d.toString(); });
    child.on('close', () => {
      if (done) return;
      clearTimeout(timer);
      let record=null;
      out.split(/\r?\n/).forEach(line=>{
        if (line.includes('__espruino_test__')) {
          const m = line.match(/(\{.*\})/);
          if (m) { try { record = JSON.parse(m[1]); } catch(e){} }
        }
      });
      if (record) resolve({ pass: !!record.pass, output: out, reason: record.reason||null, duration_ms: record.duration_ms||null, file: record.file });
      else resolve({ pass:false, output: out || err, reason: 'no_result' });
    });
  });
}

async function main() {
  console.log('\n'); // leading newline
  const args = parseArgs(process.argv);
  if (args.help) { usage(); process.exit(0); }
  const board = args.board || args.device || args._[0];
  if (!board) { console.error('Error: --board <name> is required'); usage(); process.exit(1); }

  let manifest, manifestPath;
  try {
    const loaded = loadManifest(board, REPO_ROOT);
    manifest = loaded.manifest; manifestPath = loaded.manifestPath;
  } catch (e) {
    console.error(`Error: ${e.message}`); process.exit(1);
  }

  const port = args.port || (manifest?.ports?.serial?.find(p=>!p.includes('*')));
  if (!port) {
    console.error('Error: --port <tty> is required (manifest contains wildcards).');
    process.exit(1);
  }

  const suitesInfo = resolveSuites(manifest, args.suites);
  if (suitesInfo.unknown?.length) {
    console.error(`Error: unknown suites: ${suitesInfo.unknown.join(', ')}`);
    process.exit(1);
  }

  const tests = resolveSuiteTests(REPO_ROOT, board.toLowerCase(), suitesInfo.requested);
  if (!tests.length) {
    console.log('No tests discovered for given suites.');
    process.exit(0);
  }

  console.log('\n');
  console.log('Test Run Summary');
  console.log('================');
  console.log(`Board:    ${board}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Port:     ${port}`);
  console.log(`Suites:   ${suitesInfo.requested.join(', ')}`);
  console.log(`Tests:    ${tests.map(t=>t.id).join(', ')}`);

  const E = ensureEspruinoModule();
  // Warm up device to consume banner/prompt noise
  await warmup(E, port, Boolean(args.quiet));

  let passCount=0, failCount=0;
  const results = []; const pairs = [];
  for (const t of tests) {
    process.stdout.write(`Running ${t.id} ... `);
    try {
      const res = await runOneTest(E, port, t.path, manifest, 15000, Boolean(args.quiet));
      results.push(res); pairs.push({ test: t, res });
      if (res.pass) {
        passCount++; console.log('PASS');
      } else {
        failCount++;
        const reason = res.reason ? ` (${res.reason})` : '';
        console.log('FAIL' + reason);
        if (res.output && res.output.trim()) console.log(res.output.trim());
      }
    } catch (e) {
      failCount++; console.log('ERROR');
      console.error(e.message || e);
    }
  }

  // Aggregate results per suite and persist
  const bySuite = {};
  pairs.forEach(pr=>{
    const t = pr.test, r = pr.res;
    const rec = { file: t.id, pass: !!r.pass, reason: r.reason||null, duration_ms: r.duration_ms||null };
    bySuite[t.suite] = bySuite[t.suite] || { tests: [], pass:0, fail:0 };
    bySuite[t.suite].tests.push(rec);
    if (rec.pass) bySuite[t.suite].pass++; else bySuite[t.suite].fail++;
  });

  console.log('');
  console.log('Suite Summary');
  console.log('============');
  Object.keys(bySuite).forEach(sname=>{
    const s = bySuite[sname];
    const total = s.pass + s.fail;
    const ms = s.tests.reduce((a,b)=>a+(b.duration_ms||0),0);
    console.log(`${sname}: ${s.pass}/${total} passed, total ${ms} ms`);
  });

  // Persist JSON under results/<ts>/<board>/<suite>.json
  try {
    const fs = require('fs');
    const path = require('path');
    const ts = new Date();
    const pad = n=> String(n).padStart(2,'0');
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    const baseDir = path.join(REPO_ROOT, 'results', stamp, board);
    fs.mkdirSync(baseDir, { recursive: true });
    Object.keys(bySuite).forEach(sname=>{
      const fp = path.join(baseDir, `${sname}.json`);
      fs.writeFileSync(fp, JSON.stringify({ board, port, suite: sname, when: stamp, summary: bySuite[sname] }, null, 2));
    });
    console.log('');
    console.log(`Saved results to results/${stamp}/${board}/`);
  } catch(e){}

  console.log(`\nResults: ${passCount} passed, ${failCount} failed`);
  process.exit(failCount?1:0);
}

main();
