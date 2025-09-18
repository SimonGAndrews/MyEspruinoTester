#!/usr/bin/env node
// Run suites under Node.js as a baseline comparison (no hardware).
// Loads tests matching the suite and evaluates them in the host runtime.

const { REPO_ROOT, loadManifest } = require('../lib/manifest');
const { resolveSuiteTests } = require('../lib/tests');
const path = require('path');
const vm = require('vm');

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
      case 's': args.suites=n; i++; break;
      case 'h': args.help=true; break;
      default: args[f]=true;
    }
  }
  return args;
}

function usage() {
  console.log(`Usage: node scripts/run-node-baseline.js --suites suiteA,suiteB [--board <name>]
Runs suites locally using Node.js (no hardware). Useful for pure JavaScript baselines.
`);
}

function runTestNode(testPath, timeoutMs=15000) {
  const fs = require('fs');
  const src = fs.readFileSync(testPath, 'utf8');
  return new Promise((resolve) => {
    let timer;
    function done(pass, reason) {
      clearTimeout(timer);
      resolve({ pass: !!pass, reason: reason || null });
    }
    const sandbox = {
      result: undefined,
      resultReason: undefined,
      console,
      setTimeout,
      clearTimeout,
      require,
      module,
      exports
    };
    try {
      const context = vm.createContext(sandbox);
      vm.runInContext(src, context, { filename: path.basename(testPath) });
      timer = setTimeout(()=>{
        if (typeof context.result !== 'undefined') {
          done(context.result, context.resultReason);
        } else {
          done(false, 'timeout');
        }
      }, timeoutMs);
      (function check(){
        if (typeof context.result !== 'undefined') {
          done(context.result, context.resultReason);
        } else if (timer) {
          setTimeout(check, 50);
        }
      })();
    } catch (e) {
      done(false, e.message || String(e));
    }
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { usage(); process.exit(0); }
  const board = args.board || args._[0] || 'ESP32C3';

  let manifest;
  try {
    manifest = loadManifest(board, REPO_ROOT).manifest;
  } catch (e) {
    manifest = { suites: { available: [] } };
  }

  let requestedSuites = [];
  if (args.suites) {
    requestedSuites = args.suites.split(',').map(s => s.trim()).filter(Boolean);
  } else if (manifest?.suites?.default?.length) {
    requestedSuites = manifest.suites.default;
  } else if (manifest?.suites?.available?.length) {
    requestedSuites = manifest.suites.available;
  }
  if (!requestedSuites.length) {
    console.error('No suites specified. Use --suites or define defaults in the manifest.');
    process.exit(1);
  }

  const tests = resolveSuiteTests(REPO_ROOT, board.toLowerCase(), requestedSuites);
  if (!tests.length) {
    console.log('No tests discovered for given suites.');
    process.exit(0);
  }

  console.log('');
  console.log('Node.js Baseline Summary');
  console.log('=========================');
  console.log(`Board (for suite selection): ${board}`);
  console.log(`Suites: ${requestedSuites.join(', ')}`);
  console.log(`Tests: ${tests.map(t=>t.id).join(', ')}`);

  let passCount=0, failCount=0;
  const bySuite = {};
  for (const t of tests) {
    process.stdout.write(`Running ${t.id} ... `);
    try {
      const res = await runTestNode(t.path);
      if (res.pass) {
        passCount++; console.log('PASS');
      } else {
        failCount++;
        console.log('FAIL' + (res.reason ? ` (${res.reason})` : ''));
      }
      const summary = bySuite[t.suite] = bySuite[t.suite] || { pass:0, fail:0 };
      if (res.pass) summary.pass++; else summary.fail++;
    } catch (e) {
      failCount++; console.log('ERROR');
      console.error(e.message || e);
    }
  }

  console.log('');
  console.log('Suite Summary');
  console.log('============');
  Object.keys(bySuite).forEach(sname=>{
    const s = bySuite[sname];
    const total = s.pass + s.fail;
    console.log(`${sname}: ${s.pass}/${total} passed`);
  });

  console.log(`\nResults: ${passCount} passed, ${failCount} failed`);
  process.exit(failCount?1:0);
}

main();
