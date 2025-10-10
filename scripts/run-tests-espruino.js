#!/usr/bin/env node
// Alternative test runner that drives the Espruino CLI directly, wrapping each
// test file so it emits a single JSON result line. This mimics the original
// workflow from index.js while giving us structured PASS/FAIL/SKIP reporting.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const { REPO_ROOT, loadManifest, resolveSuites } = require('../lib/manifest');
const { resolvePortPattern } = require('../lib/util/serial');
const { loadBoardProfile, boardProfileToLegacy } = require('../lib/v4/boardProfile');
const { resolveSuiteTests } = require('../lib/tests');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('-')) { args._.push(token); continue; }
    if (token.startsWith('--')) {
      const pieces = token.slice(2).split('=');
      const key = pieces[0];
      if (pieces.length > 1) args[key] = pieces.slice(1).join('=');
      else {
        const next = argv[i+1];
        if (next && !next.startsWith('-')) { args[key] = next; i++; }
        else args[key] = true;
      }
    } else {
      const flag = token.slice(1);
      const next = argv[i+1];
      switch (flag) {
        case 'b': args.board = next; i++; break;
        case 'p': args.port = next; i++; break;
        case 's': args.suites = next; i++; break;
        case 'f': args.fixtures = next; i++; break;
        case 'q': args.quiet = true; break;
        case 'o':
          if (next && !next.startsWith('-')) { args.outdir = next; i++; }
          else args.outdir = true;
          break;
        case 'h': args.help = true; break;
        default: args[flag] = true;
      }
    }
  }
  return args;
}

function usage() {
  console.log(`Usage: node scripts/run-tests-espruino.js --board <name> --port <tty> [--suites suite1,suite2] [--fixtures path.json] [--outdir [path]]\n`);
}

function wrapTestSource(fileId, src, timeoutSec, fixtureInjection) {
  const prologue = [];
  prologue.push(`var __TEST_TIMEOUT_SEC=${Math.max(1, timeoutSec)};`);
  if (fixtureInjection) prologue.push(fixtureInjection);
  prologue.push(`var result=undefined; var resultReason=undefined; var resultStatus=undefined;`);
  const epilogue = `
(function(){
  function now(){return (typeof getTime==='function'?getTime():Date.now()/1000);}  
  var __t0=now();
  var __deadline = __t0 + (__TEST_TIMEOUT_SEC||5);
  function done(status, ok, reason){
    var payload = { __espruino_test__: true, file: "${fileId}", status: status, pass: !!ok, duration_ms: Math.round((now()-__t0)*1000), reason: reason || null };
    print(JSON.stringify(payload));
  }
  try {
${src}
  } catch (e) {
    resultStatus = 'fail';
    resultReason = (e && e.message) || e;
    result = false;
  }
  (function wait(){
    if (typeof result !== 'undefined') {
      var status = resultStatus || (result ? 'pass' : 'fail');
      done(status, result, resultReason);
      return;
    }
    if (now() < __deadline) return setTimeout(wait,50);
    done('fail', false, 'timeout');
  })();
})();
`;
  return prologue.join('\n') + '\n' + epilogue;
}

async function run() {
  const args = parseArgs(process.argv);
  if (args.help) { usage(); process.exit(0); }

  const board = args.board || args._[0];
  if (!board) { console.error('Error: --board <name> is required'); usage(); process.exit(1); }

  let fixtures = null;
  let fixtureInjection = '';
  if (args.fixtures) {
    const fixturesPath = path.isAbsolute(args.fixtures) ? args.fixtures : path.resolve(process.cwd(), args.fixtures);
    try {
      fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
      fixtureInjection = `global.ESPRUINO_WIFI_FIXTURES = ${JSON.stringify(fixtures)};`;
    } catch (e) {
      console.error(`Error loading fixtures from ${args.fixtures}: ${e.message || e}`);
      process.exit(1);
    }
  }

  let manifest; let manifestPath;
  const legacyManifestPath = path.join(REPO_ROOT, 'boards', `${board}.json`);
  if (fs.existsSync(legacyManifestPath)) {
    try {
      const loaded = loadManifest(board, REPO_ROOT);
      manifest = loaded.manifest; manifestPath = loaded.manifestPath;
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  } else {
    try {
      const profile = loadBoardProfile(board, REPO_ROOT);
      const legacy = boardProfileToLegacy(profile);
      manifest = legacy.manifest; manifestPath = legacy.manifestPath;
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  }

  const portCandidate = args.port || (manifest?.ports?.serial?.find(p=>!p.includes('*')));
  if (!portCandidate) {
    console.error('Error: --port <tty> is required (manifest contains wildcards).');
    process.exit(1);
  }
  const port = resolvePortPattern(portCandidate, console);

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

  const ts = new Date();
  const pad = n => String(n).padStart(2,'0');
  const stamp = `${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const defaultResultsDir = path.join(REPO_ROOT, 'results', stamp, board);
  const baseDir = args.outdir === undefined ? defaultResultsDir
                  : (args.outdir === true ? defaultResultsDir : path.resolve(process.cwd(), args.outdir));
  const sourcesDir = path.join(baseDir, 'sources');
  const logsDir = path.join(baseDir, 'logs');
  fs.mkdirSync(sourcesDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  console.log('\nTest Run Summary');
  console.log('================');
  console.log(`Board:    ${board}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Port:     ${port}`);
  console.log(`Suites:   ${suitesInfo.requested.join(', ')}`);
  console.log(`Tests:    ${tests.map(t=>t.id).join(', ')}`);

  const CLI = process.env.ESPRUINO_CLI || 'espruino';
  const boardArg = manifest.board || (manifest.upstream && manifest.upstream.id) || board;

  let passCount=0, failCount=0, skipCount=0;
  const bySuite = {};

  for (const test of tests) {
    const timeoutSec = 30;
    const code = fs.readFileSync(test.path, 'utf8');
    fs.writeFileSync(path.join(sourcesDir, test.id), code);
    const wrapped = wrapTestSource(test.id, code, timeoutSec, fixtureInjection);

    process.stdout.write(`Running ${test.id} ... `);
    try {
      const result = await sendViaCLI(CLI, port, boardArg, wrapped, Boolean(args.quiet));
      const suiteSummary = bySuite[test.suite] = bySuite[test.suite] || { tests: [], pass:0, fail:0, skip:0 };
      suiteSummary.tests.push(result);
      if (result.status === 'skip') {
        skipCount++; suiteSummary.skip++; console.log(`SKIP${result.reason ? ` (${result.reason})` : ''}`);
      } else if (result.pass) {
        passCount++; suiteSummary.pass++; console.log('PASS');
      } else {
        failCount++; suiteSummary.fail++;
        console.log(`FAIL${result.reason ? ` (${result.reason})` : ''}`);
      }
      fs.writeFileSync(path.join(logsDir, `${test.id}.stdout`), result.stdout || '');
      fs.writeFileSync(path.join(logsDir, `${test.id}.stderr`), result.stderr || '');
    } catch (err) {
      failCount++;
      const suiteSummary = bySuite[test.suite] = bySuite[test.suite] || { tests: [], pass:0, fail:0, skip:0 };
      suiteSummary.tests.push({ file: test.id, status: 'fail', pass: false, reason: err.message || err, duration_ms: null });
      const [reason, raw] = String(err.message || err).split('::');
      if (raw) fs.writeFileSync(path.join(logsDir, `${test.id}.stdout`), raw);
      suiteSummary.fail++;
      console.log(`FAIL (${reason})`);
    }
  }

  console.log('\nSuite Summary');
  console.log('============');
  Object.entries(bySuite).forEach(([suiteName, summary]) => {
    console.log(`${suiteName}: ${summary.pass} passed, ${summary.fail} failed, ${summary.skip} skipped`);
  });

  try {
    Object.entries(bySuite).forEach(([suiteName, summary]) => {
      const fp = path.join(baseDir, `${suiteName}.json`);
      fs.writeFileSync(fp, JSON.stringify({ board, port, suite: suiteName, when: stamp, summary }, null, 2));
    });
  } catch (e) {
    console.error('Warning: failed to write summary JSON:', e.message || e);
  }

  console.log(`\nResults: ${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
  console.log(`Saved test sources to ${sourcesDir}`);
  console.log(`Saved logs to ${logsDir}`);
  process.exit(failCount ? 1 : 0);
}

function sendViaCLI(cli, port, boardArg, code, quiet) {
  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'espruino-test-'));
    const tempFile = path.join(tempDir, 'wrapped.js');
    fs.writeFileSync(tempFile, code);

    const args = ['--port', port];
    if (boardArg) args.push('--board', boardArg);
    args.push(tempFile);

    const child = spawn(cli, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); if (!quiet) process.stderr.write(d.toString()); });
    child.on('error', err => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      reject(err);
    });
    child.on('close', () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      const matchLine = stdout.split(/\r?\n/).filter(l => l.includes('__espruino_test__')).pop();
      if (!matchLine) return reject(new Error('no_result::' + stdout));
      try {
        const jsonStr = matchLine.slice(matchLine.indexOf('{'));
        const record = JSON.parse(jsonStr);
        resolve({
          file: record.file,
          status: record.status || (record.pass ? 'pass' : 'fail'),
          pass: !!record.pass,
          reason: record.reason || null,
          duration_ms: record.duration_ms || null,
          stdout,
          stderr
        });
      } catch (e) {
        reject(new Error('invalid_result_json'));
      }
    });
  });
}

run().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
