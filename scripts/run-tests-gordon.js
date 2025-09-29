#!/usr/bin/env node
// Minimal "Gordon-style" runner that shells out to the espruino CLI for each
// test. Designed for simple async/sync suites (e.g., basicAsync).

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const { REPO_ROOT, loadManifest, resolveSuites } = require('../lib/manifest');
const { resolveSuiteTests } = require('../lib/tests');

const DEFAULT_TIMEOUT_MS = 10000;

function formatCliCommand(cmd, args) {
  const parts = [cmd].concat(args || []);
  return parts.map(part => {
    if (typeof part !== 'string') part = String(part);
    return /\s/.test(part) ? JSON.stringify(part) : part;
  }).join(' ');
}

function parseMetadataHeader(src, fileId) {
  const BOM = '\ufeff';
  const withoutBOM = src.startsWith(BOM) ? src.slice(1) : src;
  const metaPattern = /^\s*\/\*\s*JSON\s*(\{[\s\S]*?\})\s*\*\//;
  const match = withoutBOM.match(metaPattern);
  if (!match) return { hints: {}, source: src };
  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch (err) {
    throw new Error(`Invalid JSON metadata block in ${fileId}: ${err.message || err}`);
  }
  return { hints: parsed || {}, source: src };
}

function coerceNonNegativeInt(value, label, fileId) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Invalid ${label} value in ${fileId}: expected non-negative number, received ${value}`);
  }
  return Math.floor(num);
}

function normaliseSaveOnSend(value, storageTarget, fileId) {
  if (value === undefined || value === null) {
    if (storageTarget) return { saveOnSend: 3 };
    return {};
  }

  const mapping = {
    ram: 0,
    flash: 1,
    flashpersistent: 2,
    flashboot: 2,
    storage: 3,
    storagefile: 3,
  };

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < -1) {
      throw new Error(`Invalid saveOnSend value in ${fileId}: ${value}`);
    }
    return { saveOnSend: value };
  }

  if (typeof value === 'boolean') {
    return { saveOnSend: value ? 1 : 0 };
  }

  if (typeof value === 'string') {
    const key = value.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(mapping, key)) {
      return { saveOnSend: mapping[key] };
    }
    if (/^\d+$/.test(key)) {
      const numeric = Number(key);
      return { saveOnSend: numeric };
    }
  }

  throw new Error(`Unsupported saveOnSend value in ${fileId}: ${value}`);
}

function normaliseCliArgs(value, fileId) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`cliArgs metadata in ${fileId} must be an array of strings`);
  }
  value.forEach((item, idx) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(`cliArgs[${idx}] in ${fileId} must be a non-empty string`);
    }
  });
  return value.slice();
}

function normaliseEspruinoConfig(value, fileId) {
  if (value === undefined) return [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`espruinoConfig metadata in ${fileId} must be an object of key/value pairs`);
  }
  return Object.entries(value).map(([key, val]) => {
    if (!key || typeof key !== 'string') {
      throw new Error(`Invalid espruinoConfig key in ${fileId}`);
    }
    return { key, value: val };
  });
}

function normaliseStoragePreload(value, fileId, testDir) {
  if (value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map((item, idx) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`storagePreload entry #${idx} in ${fileId} must be an object`);
    }
    const filename = (item.filename || item.name || '').trim();
    if (!filename) {
      throw new Error(`storagePreload entry #${idx} in ${fileId} must provide a filename`);
    }
    let contents;
    let sourceFile;
    if (item.contents !== undefined) {
      if (typeof item.contents !== 'string') {
        throw new Error(`storagePreload entry #${idx} in ${fileId} must use string contents`);
      }
      contents = item.contents;
    }
    if (item.sourceFile !== undefined) {
      if (typeof item.sourceFile !== 'string' || !item.sourceFile.trim()) {
        throw new Error(`storagePreload entry #${idx} in ${fileId} has invalid sourceFile`);
      }
      const candidate = path.isAbsolute(item.sourceFile) ? item.sourceFile : path.resolve(testDir || process.cwd(), item.sourceFile);
      if (!fs.existsSync(candidate)) {
        throw new Error(`storagePreload entry #${idx} in ${fileId} references missing sourceFile ${item.sourceFile}`);
      }
      sourceFile = candidate;
    }
    if (contents === undefined && !sourceFile) {
      throw new Error(`storagePreload entry #${idx} in ${fileId} must supply either contents or sourceFile`);
    }
    return { filename, contents, sourceFile };
  });
}

function buildTestOptions(rawHints, fileId, defaults, context = {}) {
  const hints = rawHints || {};
  const options = { ...defaults };

  if (hints.preUploadDelayMs !== undefined) {
    options.preDelayMs = coerceNonNegativeInt(hints.preUploadDelayMs, 'preUploadDelayMs', fileId);
  }
  if (hints.postUploadDelayMs !== undefined) {
    options.postDelayMs = coerceNonNegativeInt(hints.postUploadDelayMs, 'postUploadDelayMs', fileId);
  }
  if (hints.noReset !== undefined) {
    options.noReset = Boolean(hints.noReset);
  }
  if (hints.timeoutMs !== undefined) {
    options.timeoutMs = coerceNonNegativeInt(hints.timeoutMs, 'timeoutMs', fileId);
  }
  if (hints.storageTarget !== undefined) {
    if (typeof hints.storageTarget !== 'string' || !hints.storageTarget.trim()) {
      throw new Error(`storageTarget metadata in ${fileId} must be a non-empty string`);
    }
    options.storageTarget = hints.storageTarget.trim();
  }

  if (hints.saveOnSend !== undefined || options.storageTarget) {
    const { saveOnSend } = normaliseSaveOnSend(hints.saveOnSend, options.storageTarget, fileId);
    if (saveOnSend !== undefined) options.saveOnSend = saveOnSend;
  }

  if (options.storageTarget && options.saveOnSend !== 3) {
    throw new Error(`storageTarget specified in ${fileId} requires saveOnSend set to 'storage' (3)`);
  }

  options.cliArgs = normaliseCliArgs(hints.cliArgs, fileId);
  options.espruinoConfig = normaliseEspruinoConfig(hints.espruinoConfig, fileId);
  options.storagePreload = normaliseStoragePreload(hints.storagePreload, fileId, context.testDir);

  return options;
}

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
  console.log(`Usage: node scripts/run-tests-gordon.js --board <name> --port <tty> [--suites suite1,suite2] [--fixtures path] [--no-reset] [--pre-cli-delay <ms>] [--post-cli-delay <ms>]\n`);
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

  const parseDelay = (value, fallback) => {
    if (value === undefined || value === true) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      console.error(`Error: delay values must be non-negative numbers (received ${value})`);
      process.exit(1);
    }
    return parsed;
  };

  const preCliDelayMs = parseDelay(args['pre-cli-delay'], 1000);
  const postCliDelayMs = parseDelay(args['post-cli-delay'], 1000);
  const defaultNoReset = Boolean(args['no-reset']);

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
  console.log(`Delays:   pre-cli ${preCliDelayMs}ms, post-cli ${postCliDelayMs}ms`);

  const CLI = process.env.ESPRUINO_CLI || 'espruino';
  const boardArg = manifest.board || (manifest.upstream && manifest.upstream.id) || board;

  let passCount=0, failCount=0, skipCount=0;
  const bySuite = {};

  for (const test of tests) {
    const suiteSummary = bySuite[test.suite] = bySuite[test.suite] || { tests: [], pass:0, fail:0, skip:0 };
    let rawSource;
    let perTestOptions;
    try {
      rawSource = fs.readFileSync(test.path, 'utf8');
      const parsed = parseMetadataHeader(rawSource, test.id);
      perTestOptions = buildTestOptions(parsed.hints, test.id, {
        preDelayMs: preCliDelayMs,
        postDelayMs: postCliDelayMs,
        noReset: defaultNoReset,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        cliArgs: [],
        espruinoConfig: [],
        storagePreload: [],
      }, { testDir: path.dirname(test.path) });
      if (perTestOptions.storagePreload.length) {
        if (!Boolean(args.quiet)) {
          const names = perTestOptions.storagePreload.map(item => item.filename).join(', ');
          console.log(`  -> preloading Storage files: ${names}`);
        }
        await preloadStorageFiles(
          CLI,
          port,
          boardArg,
          Boolean(args.quiet),
          perTestOptions.storagePreload,
          {
            preDelayMs: perTestOptions.preDelayMs,
            postDelayMs: perTestOptions.postDelayMs,
            noReset: perTestOptions.noReset,
            cliArgs: perTestOptions.cliArgs,
            espruinoConfig: perTestOptions.espruinoConfig,
            logsDir,
            testId: test.id,
          }
        );
      }
      const wrapped = wrapTestSource(test.id, parsed.source, perTestOptions.timeoutMs, fixtureInjection);
      fs.writeFileSync(path.join(sourcesDir, test.id), wrapped);
      process.stdout.write(`Running ${test.id} ... `);
      const result = await sendViaCLI(
        CLI,
        port,
        boardArg,
        wrapped,
        Boolean(args.quiet),
        {
          preDelayMs: perTestOptions.storagePreload.length ? 0 : perTestOptions.preDelayMs,
          postDelayMs: perTestOptions.postDelayMs,
          noReset: perTestOptions.noReset,
          saveOnSend: perTestOptions.saveOnSend,
          storageTarget: perTestOptions.storageTarget,
          cliArgs: perTestOptions.cliArgs,
          espruinoConfig: perTestOptions.espruinoConfig,
        }
      );
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
      continue;
    } catch (err) {
      if (err && err.deviceBusy) {
        if (err.stdout) fs.writeFileSync(path.join(logsDir, `${test.id}.stdout`), err.stdout);
        if (err.stderr) fs.writeFileSync(path.join(logsDir, `${test.id}.stderr`), err.stderr);
        console.log('ABORT');
        console.error(`Error: device busy (is another REPL connected to ${port}?). Aborting test run.`);
        process.exit(2);
      }
      failCount++;
      suiteSummary.tests.push({ file: test.id, status: 'fail', pass: false, reason: err.message || err, duration_ms: null });
      suiteSummary.fail++;
      if (err && err.stdout) fs.writeFileSync(path.join(logsDir, `${test.id}.stdout`), err.stdout);
      if (err && err.stderr) fs.writeFileSync(path.join(logsDir, `${test.id}.stderr`), err.stderr);
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

function preloadStorageFiles(cli, port, boardArg, quiet, storageItems, options = {}) {
  if (!storageItems || !storageItems.length) return Promise.resolve();
  const {
    preDelayMs = 0,
    postDelayMs = 0,
    noReset = false,
    cliArgs = [],
    espruinoConfig = [],
    logsDir,
    testId,
  } = options;

  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'espruino-storage-'));
    const tempPaths = [];
    try {
      storageItems.forEach((item, idx) => {
        let onDisk;
        if (item.sourceFile) {
          onDisk = item.sourceFile;
        } else {
          onDisk = path.join(tempDir, `storage_${idx}.txt`);
          fs.writeFileSync(onDisk, item.contents, 'utf8');
        }
        tempPaths.push(onDisk);
      });
    } catch (err) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw err;
    }

    const preloadStubPath = path.join(tempDir, 'storage_preload_stub.js');
    fs.writeFileSync(preloadStubPath, '// storage preload stub\n');

    const args = ['--port', port, '--no-ble'];
    if (noReset) args.push('--config', 'RESET_BEFORE_SEND=false');
    if (Array.isArray(espruinoConfig) && espruinoConfig.length) {
      espruinoConfig.forEach(({ key, value }) => {
        args.push('--config', `${key}=${formatConfigValue(value)}`);
      });
    }
    if (Array.isArray(cliArgs) && cliArgs.length) args.push(...cliArgs);
    if (boardArg) args.push('--board', boardArg);

    storageItems.forEach((item, idx) => {
      args.push('--storage', `${item.filename}:${tempPaths[idx]}`);
    });
    args.push(preloadStubPath);

    const launch = () => {
      console.log(`[espruino-cli] ${formatCliCommand(cli, args)}`);
      const child = spawn(cli, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const finish = handler => {
        if (settled) return;
        settled = true;
        if (postDelayMs > 0) return setTimeout(handler, postDelayMs);
        handler();
      };

      child.stdout.on('data', d => {
        stdout += d.toString();
        if (!quiet) process.stdout.write(d.toString());
      });
      child.stderr.on('data', d => {
        stderr += d.toString();
        if (!quiet) process.stderr.write(d.toString());
      });
      child.on('error', err => {
        if (!settled) fs.rmSync(tempDir, { recursive: true, force: true });
        finish(() => reject(err));
      });
      child.on('close', code => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        if (settled) return;
        const combined = `${stdout}\n${stderr}`;
        if (/device or resource busy/i.test(combined) || /cannot open \/dev\//i.test(combined)) {
          const err = new Error('device_busy');
          err.stdout = stdout;
          err.stderr = stderr;
          err.deviceBusy = true;
          return finish(() => reject(err));
        }
        const knownPortError = /TypeError: Cannot read properties of undefined \(reading 'type'\)/.test(stderr);
        if (code !== 0 && !knownPortError) {
          const err = new Error(`storage_preload_failed (exit ${code})`);
          err.stdout = stdout;
          err.stderr = stderr;
          return finish(() => reject(err));
        }
        if (logsDir && testId) {
          try {
            fs.writeFileSync(path.join(logsDir, `${testId}.storage.stdout`), stdout || '');
            fs.writeFileSync(path.join(logsDir, `${testId}.storage.stderr`), stderr || '');
          } catch (e) {
            // best effort, ignore
          }
        }
        finish(() => resolve());
      });
    };

    if (preDelayMs > 0) setTimeout(launch, preDelayMs);
    else launch();
  });
}

function formatConfigValue(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean' || value === null) return JSON.stringify(value);
  return JSON.stringify(value);
}

function sendViaCLI(cli, port, boardArg, code, quiet, options = {}) {
  const {
    preDelayMs = 0,
    postDelayMs = 0,
    noReset = false,
    saveOnSend,
    storageTarget,
    cliArgs = [],
    espruinoConfig = [],
  } = options || {};
  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'espruino-gordon-'));
    const tempFile = path.join(tempDir, 'test.js');
    fs.writeFileSync(tempFile, code);

    const args = ['--port', port, '--no-ble'];
    if (noReset) args.push('--config', 'RESET_BEFORE_SEND=false');
    if (saveOnSend !== undefined) args.push('--config', `SAVE_ON_SEND=${formatConfigValue(saveOnSend)}`);
    if (storageTarget) args.push('--config', `SAVE_STORAGE_FILE=${formatConfigValue(storageTarget)}`);
    if (Array.isArray(espruinoConfig) && espruinoConfig.length) {
      espruinoConfig.forEach(({ key, value }) => {
        args.push('--config', `${key}=${formatConfigValue(value)}`);
      });
    }
    if (Array.isArray(cliArgs) && cliArgs.length) args.push(...cliArgs);
    if (boardArg) args.push('--board', boardArg);
    args.push(tempFile);

    const launch = () => {
      console.log(`[espruino-cli] ${formatCliCommand(cli, args)}`);
      const child = spawn(cli, args, { stdio: ['ignore','pipe','pipe'] });
      let stdout=''; let stderr='';
      let settled = false;

      const finish = handler => {
        if (settled) return;
        settled = true;
        if (postDelayMs > 0) return setTimeout(handler, postDelayMs);
        handler();
      };

      child.stdout.on('data', d=>{ stdout += d.toString(); });
      child.stderr.on('data', d=>{ stderr += d.toString(); if (!quiet) process.stderr.write(d.toString()); });
      child.on('error', err => {
        if (!settled) fs.rmSync(tempDir, { recursive: true, force: true });
        finish(() => reject(err));
      });
      child.on('close', () => {
        if (settled) return;
        fs.rmSync(tempDir, { recursive: true, force: true });
        const combined = `${stdout}\n${stderr}`;
        if (/device or resource busy/i.test(combined) || /cannot open \/dev\//i.test(combined)) {
          const err = new Error('device_busy');
          err.stdout = stdout;
          err.stderr = stderr;
          err.deviceBusy = true;
          return finish(() => reject(err));
        }
        const match = stdout.split(/\r?\n/).filter(l=>l.includes('__espruino_test__')).pop();
        if (!match) {
          const err = new Error('no_result');
          err.stdout = stdout; err.stderr = stderr;
          return finish(() => reject(err));
        }
        try {
          const json = JSON.parse(match.slice(match.indexOf('{')));
          finish(() => resolve({
            file: json.file,
            status: json.status || (json.pass ? 'pass' : 'fail'),
            pass: !!json.pass,
            reason: json.reason || null,
            duration_ms: json.duration_ms || null,
            stdout,
            stderr
          }));
        } catch (e) {
          const err = new Error('invalid_result_json');
          err.stdout = stdout; err.stderr = stderr;
          finish(() => reject(err));
        }
      });
    };

    if (preDelayMs > 0) setTimeout(launch, preDelayMs);
    else launch();
  });
}

run().catch(err => { console.error(err.message || err); process.exit(1); });
