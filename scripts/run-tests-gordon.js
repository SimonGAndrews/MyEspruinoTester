#!/usr/bin/env node
// Minimal "Gordon-style" runner that shells out to the espruino CLI for each
// test. Designed for simple async/sync suites (e.g., basicAsync).

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const { REPO_ROOT, loadManifest, resolveSuites } = require('../lib/manifest');
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
        case 'h': args.help = true; break;
        default: args[flag] = true;
      }
    }
  }
  return args;
}

function usage() {
  console.log(`Usage: node scripts/run-tests-gordon.js --board <name> --port <tty> [--suites suite1,suite2]\n`);
}

function wrapTestSource(fileId, src, timeoutMs, contextInjection) {
  const prologue = [];
  prologue.push(`var result=undefined; var resultReason=undefined; var resultStatus=undefined;`);
  prologue.push(`var __setResult = function(v){ result = v; };`);
  if (contextInjection) {
    prologue.push(contextInjection);
  }
  const epilogue = `
(function(){
  var __t0 = Date.now();
  var __keepAlive = setInterval(function(){
    if (typeof result !== 'undefined') { clearInterval(__keepAlive); return; }
    try { print('{"__espruino_keep_alive__":true}'); } catch (e) {}
  }, 250);
  function done(status, ok, reason) {
    if (__keepAlive) {
      clearInterval(__keepAlive);
      __keepAlive = undefined;
    }
    var payload = { __espruino_test__: true, file: "${fileId}", status: status, pass: !!ok, duration_ms: Date.now()-__t0, reason: reason || null };
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
      var status, ok, reason = resultReason;
      if (typeof result === 'object' && result) {
        status = result.status;
        if (typeof result.pass === 'boolean') ok = !!result.pass;
        else if (typeof result.ok === 'boolean') ok = !!result.ok;
        else if (status === 'skip') ok = false;
        else ok = true;
        if (!status) status = ok ? 'pass' : 'fail';
        if (result.reason !== undefined) reason = result.reason;
      } else {
        ok = !!result;
        status = resultStatus || (ok ? 'pass' : 'fail');
      }
      if (status === 'skip') ok = false;
      done(status, ok, reason);
      return;
    }
    if (Date.now()-__t0 < ${timeoutMs}) return setTimeout(wait,50);
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

  let fixtureInjection = '';
  if (args.fixtures) {
    if (typeof args.fixtures !== 'string') {
      console.error('Error: --fixtures requires a path to a JSON file');
      process.exit(1);
    }
    const fixturesPath = path.isAbsolute(args.fixtures) ? args.fixtures : path.resolve(process.cwd(), args.fixtures);
    try {
      const raw = fs.readFileSync(fixturesPath, 'utf8');
      const fixtures = JSON.parse(raw);
      fixtureInjection = `global.ESPRUINO_WIFI_FIXTURES = ${JSON.stringify(fixtures)};`;
    } catch (e) {
      console.error(`Error loading fixtures from ${args.fixtures}: ${e.message || e}`);
      process.exit(1);
    }
  }

  let manifest; let manifestPath;
  try {
    const loaded = loadManifest(board, REPO_ROOT);
    manifest = loaded.manifest; manifestPath = loaded.manifestPath;
  } catch (e) {
    console.error(`Error: ${e.message}`); process.exit(1);
  }

  const port = args.port || (manifest?.ports?.serial?.find(p=>!p.includes('*')));
  if (!port) { console.error('Error: --port <tty> is required'); process.exit(1); }

  const suitesInfo = resolveSuites(manifest, args.suites);
  if (suitesInfo.unknown?.length) {
    console.error(`Error: unknown suites: ${suitesInfo.unknown.join(', ')}`);
    process.exit(1);
  }

  const tests = resolveSuiteTests(REPO_ROOT, board.toLowerCase(), suitesInfo.requested);
  if (!tests.length) { console.log('No tests discovered for given suites.'); process.exit(0); }

  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const defaultDir = path.join(REPO_ROOT, 'results', stamp, board);
  const baseDir = typeof args.outdir === 'string' ? path.resolve(process.cwd(), args.outdir)
                   : (args.outdir === true ? defaultDir : defaultDir);
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
    const timeoutMs = 10000; // 10 seconds is plenty for simple async tests
    const code = fs.readFileSync(test.path, 'utf8');
    const wrapped = wrapTestSource(test.id, code, timeoutMs, fixtureInjection);
    fs.writeFileSync(path.join(sourcesDir, test.id), code);
    process.stdout.write(`Running ${test.id} ... `);
    try {
      const result = await sendViaCLI(CLI, port, boardArg, wrapped, Boolean(args.quiet));
      const suiteSummary = bySuite[test.suite] = bySuite[test.suite] || { tests: [], pass:0, fail:0, skip:0 };
      suiteSummary.tests.push({ file: test.id, status: result.status, pass: result.pass, reason: result.reason, duration_ms: result.duration_ms });
      fs.writeFileSync(path.join(logsDir, `${test.id}.stdout`), result.stdout || '');
      fs.writeFileSync(path.join(logsDir, `${test.id}.stderr`), result.stderr || '');
      if (result.status === 'skip') {
        skipCount++; console.log(`SKIP${result.reason ? ` (${result.reason})` : ''}`);
        suiteSummary.skip++;
      } else if (result.pass) {
        passCount++; console.log('PASS');
        suiteSummary.pass++;
      } else {
        failCount++; console.log(`FAIL${result.reason ? ` (${result.reason})` : ''}`);
        suiteSummary.fail++;
      }
    } catch (err) {
      if (err && err.deviceBusy) {
        if (err.stdout) fs.writeFileSync(path.join(logsDir, `${test.id}.stdout`), err.stdout);
        if (err.stderr) fs.writeFileSync(path.join(logsDir, `${test.id}.stderr`), err.stderr);
        console.log('ABORT');
        console.error(`Error: device busy (is another REPL connected to ${port}?). Aborting test run.`);
        process.exit(2);
      }
      failCount++;
      const suiteSummary = bySuite[test.suite] = bySuite[test.suite] || { tests: [], pass:0, fail:0, skip:0 };
      suiteSummary.tests.push({ file: test.id, status: 'fail', pass: false, reason: err.message || err, duration_ms: null });
      suiteSummary.fail++;
      if (err.stdout) fs.writeFileSync(path.join(logsDir, `${test.id}.stdout`), err.stdout);
      if (err.stderr) fs.writeFileSync(path.join(logsDir, `${test.id}.stderr`), err.stderr);
      console.log(`FAIL (${err.message || err})`);
    }
  }

  console.log(`\nResults: ${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
  console.log(`Saved test sources to ${sourcesDir}`);
  console.log(`Saved logs to ${logsDir}`);

  try {
    Object.entries(bySuite).forEach(([suiteName, summary]) => {
      const fp = path.join(baseDir, `${suiteName}.json`);
      fs.writeFileSync(fp, JSON.stringify({ board, port, suite: suiteName, when: stamp, summary }, null, 2));
    });
  } catch (e) {
    console.error('Warning: failed to write summary JSON:', e.message || e);
  }

  process.exit(failCount ? 1 : 0);
}

function sendViaCLI(cli, port, boardArg, code, quiet) {
  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'espruino-gordon-'));
    const tempFile = path.join(tempDir, 'test.js');
    fs.writeFileSync(tempFile, code);

    const args = ['--port', port, '--no-ble'];
    if (boardArg) args.push('--board', boardArg);
    args.push(tempFile);

    const child = spawn(cli, args, { stdio: ['ignore','pipe','pipe'] });
    let stdout=''; let stderr='';
    child.stdout.on('data', d=>{ stdout += d.toString(); });
    child.stderr.on('data', d=>{ stderr += d.toString(); if (!quiet) process.stderr.write(d.toString()); });
    child.on('error', err => { fs.rmSync(tempDir, { recursive: true, force: true }); reject(err); });
    child.on('close', () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      const combined = `${stdout}\n${stderr}`;
      if (/device or resource busy/i.test(combined) || /cannot open \/dev\//i.test(combined)) {
        const err = new Error('device_busy');
        err.stdout = stdout;
        err.stderr = stderr;
        err.deviceBusy = true;
        return reject(err);
      }
      const match = stdout.split(/\r?\n/).filter(l=>l.includes('__espruino_test__')).pop();
      if (!match) {
        const err = new Error('no_result');
        err.stdout = stdout; err.stderr = stderr;
        return reject(err);
      }
      try {
        const json = JSON.parse(match.slice(match.indexOf('{')));
        resolve({
          file: json.file,
          status: json.status || (json.pass ? 'pass' : 'fail'),
          pass: !!json.pass,
          reason: json.reason || null,
          duration_ms: json.duration_ms || null,
          stdout,
          stderr
        });
      } catch (e) {
        const err = new Error('invalid_result_json');
        err.stdout = stdout; err.stderr = stderr;
        reject(err);
      }
    });
  });
}

run().catch(err => { console.error(err.message || err); process.exit(1); });
