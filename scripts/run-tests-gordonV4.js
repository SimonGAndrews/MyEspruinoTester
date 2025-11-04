#!/usr/bin/env node
// v4 Test runner CLI
//
// Uploads and executes suite tests on a connected Espruino device using
// the Espruino CLI for each test (persistent per-test session).
//
// This variant consumes the board metadata directory layout documented in
// docs/v4_metadata.md (board.json, optional fixture.json and cli.json).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { loadBoardProfile, REPO_ROOT } = require('../lib/v4/boardProfile');
const { resolveSuiteTests } = require('../lib/tests');
const { resolvePortPattern } = require('../lib/util/serial');
const {
  createEmptyConfig,
  cloneConfig,
  loadSessionDefaults,
  loadSuiteConfig,
  mergeConfig,
  parseTestMetadata,
} = require('../lib/v4/runConfig');

const SESSION_DEFAULTS = loadSessionDefaults();
const SESSION_DEFAULT_CONFIG_SET = new Set(
  Array.isArray(SESSION_DEFAULTS.cli?.espruinoConfig)
    ? SESSION_DEFAULTS.cli.espruinoConfig.map(({ key, value }) => `${key}=${value}`)
    : []
);

function gatherFixtureRequirements(meta) {
  const list = [];
  if (!meta || typeof meta !== 'object') return list;
  if (meta.fixtures && Array.isArray(meta.fixtures.required)) {
    list.push(...meta.fixtures.required);
  }
  if (meta.config) {
    const cfg = meta.config;
    if (cfg.fixtures && Array.isArray(cfg.fixtures.required)) {
      list.push(...cfg.fixtures.required);
    }
    if (cfg.fixture && Array.isArray(cfg.fixture.required)) {
      list.push(...cfg.fixture.required);
    }
  }
  return list;
}

function gatherRequirements(meta) {
  const list = [];
  if (!meta || typeof meta !== 'object') return list;
  if (Array.isArray(meta.requirements)) {
    list.push(...meta.requirements);
  }
  if (meta.config && meta.config.loader && Array.isArray(meta.config.loader.requirements)) {
    list.push(...meta.config.loader.requirements);
  }
  return list;
}

function getValueAtPath(obj, path) {
  if (!obj) return undefined;
  return path.split('.').reduce((acc, key) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, key)) {
      return acc[key];
    }
    return undefined;
  }, obj);
}

function validateFixturePaths(fixtureObj, requiredPaths) {
  const missing = [];
  requiredPaths.forEach((p) => {
    const value = getValueAtPath(fixtureObj, p);
    if (value === undefined || value === null) {
      missing.push(p);
    }
  });
  return missing;
}

function normalizeKey(key) {
  return key
    .split('-')
    .map((part, index) => (index ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join('');
}

function parseNonNegativeInt(value, label) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${label} requires a non-negative integer`);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${label} requires a non-negative integer`);
  }
  return Math.floor(num);
}

function normaliseDelay(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

function delay(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatConfigValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null || value === undefined) return 'null';
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function resolveBoardArg(profile, loaderConfig = {}) {
  const boardPayload = profile.payloads?.board || {};
  let boardJsonOverride = null;
  if (typeof boardPayload.localJSON === 'string' && boardPayload.localJSON.trim()) {
    const resolved = path.resolve(path.dirname(profile.files.board), boardPayload.localJSON.trim());
    if (!fs.existsSync(resolved)) {
      throw new Error(`localJSON specified but file not found: ${resolved}`);
    }
    boardJsonOverride = resolved;
  }
  return (
    process.env.ESPRUINO_BOARD ||
    boardJsonOverride ||
    (boardPayload.upstream && boardPayload.upstream.id) ||
    loaderConfig.board ||
    profile.boardName
  );
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function normaliseStoragePreloadEntries(entries, testDir) {
  const items = ensureArray(entries);
  const normalised = [];
  items.forEach((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`storagePreload entry #${idx + 1} must be an object`);
    }
    if (typeof item.filename !== 'string' || !item.filename.trim()) {
      throw new Error(`storagePreload entry #${idx + 1} must provide a filename`);
    }
    const record = { filename: item.filename.trim() };
    if (Object.prototype.hasOwnProperty.call(item, 'sourceFile')) {
      if (typeof item.sourceFile !== 'string' || !item.sourceFile.trim()) {
        throw new Error(`storagePreload entry #${idx + 1} has invalid sourceFile`);
      }
      const resolved = path.isAbsolute(item.sourceFile)
        ? item.sourceFile
        : path.resolve(testDir, item.sourceFile);
      if (!fs.existsSync(resolved)) {
        throw new Error(`storagePreload entry #${idx + 1} references missing sourceFile ${resolved}`);
      }
      record.sourceFile = resolved;
    } else if (Object.prototype.hasOwnProperty.call(item, 'contents')) {
      if (typeof item.contents !== 'string') {
        throw new Error(`storagePreload entry #${idx + 1} must supply string contents`);
      }
      record.contents = item.contents;
    } else {
      throw new Error(`storagePreload entry #${idx + 1} must supply either contents or sourceFile`);
    }
    normalised.push(record);
  });
  return normalised;
}

function detectConnectionIssue(stdout = '', stderr = '', port) {
  const text = `${stdout || ''}\n${stderr || ''}`;
  if (/Unable to connect/i.test(text)) {
    return `Connection error: Unable to connect to ${port}. Check board state and cabling.`;
  }
  if (/device or resource busy/i.test(text) || /Cannot open/i.test(text)) {
    return `Connection error: Port ${port} is busy or unavailable.`;
  }
  return null;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith('-')) {
      args._.push(raw);
      continue;
    }
    if (raw.startsWith('--')) {
      const [key, value] = raw.slice(2).split('=');
      const normalized = normalizeKey(key);
      if (normalized === 'serial-debug') {
        args.serialDebug = true;
        continue;
      }
      if (value !== undefined) {
        args[normalized] = value;
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith('-')) {
          args[normalized] = next;
          i++;
        } else {
          args[normalized] = true;
        }
      }
      continue;
    }
    const flag = raw.slice(1);
    const next = argv[i + 1];
    switch (flag) {
      case 'b':
        args.board = next;
        i++;
        break;
      case 'p':
        args.port = next;
        i++;
        break;
      case 's':
        args.suites = next;
        i++;
        break;
      case 'h':
        args.help = true;
        break;
      case 'q':
        args.quiet = true;
        break;
      case 'f':
        args.fixtures = next;
        i++;
        break;
      default:
        args[flag] = true;
    }
  }
  return args;
}

function usage() {
  console.log(`Usage: node scripts/run-tests-gordonV4.js --board <name> --port <tty> [--suites suite1,suite2]
Runs tests on a connected Espruino device and reports PASS/FAIL.
Options:
  -b, --board     Board directory name (required)
  -p, --port      Serial/BLE port (required unless metadata provides a literal default)
  -s, --suites    Comma-separated suites (default: board defaults)
  -q, --quiet     Suppress noisy logging during test upload
  -f, --fixtures  Path to JSON fixtures injected as global.ESPRUINO_FIXTURES
      --serial-debug  Enable verbose Espruino serial logging (for debugging harness/CLI issues)
`);
}

function resolveSuites(boardConfig, suitesArg) {
  const available = Array.isArray(boardConfig?.suites?.available) ? boardConfig.suites.available : [];
  const defaults =
    Array.isArray(boardConfig?.suites?.default) && boardConfig.suites.default.length
      ? boardConfig.suites.default
      : available;
  const requested = suitesArg
    ? suitesArg
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : defaults;
  const unknown = requested.filter((suite) => !available.includes(suite));
  return { available, defaults, requested, unknown };
}

function pickDefaultPort(loaderPorts) {
  if (!loaderPorts) return null;
  const serial = Array.isArray(loaderPorts.serial) ? loaderPorts.serial : [];
  return serial.find((entry) => typeof entry === 'string' && !entry.includes('*')) || null;
}

function ensureEspruinoModule() {
  try {
    return require('espruino');
  } catch (err) {
    console.error('Error: require("espruino") failed. Run `npm install` or `npm link espruino`.');
    process.exit(1);
  }
}

async function warmup(E, port, quiet = false, options = {}) {
  return new Promise((resolve) => {
    const code = 'print("__RUNNER_READY__")';
    const origLog = console.log;
    const origWarn = console.warn;
    const origErr = console.error;
    const restore = () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origErr;
    };
    if (quiet) {
      console.log = () => {};
      console.warn = () => {};
      console.error = () => {};
    }
    const applyConfig = () => {
      if (!global.Espruino || !global.Espruino.Config) return;
      if (!Array.isArray(options.espruinoConfig)) return;
      options.espruinoConfig.forEach(({ key, value }) => {
        if (!key) return;
        try {
          if (typeof global.Espruino.Config.set === 'function') {
            global.Espruino.Config.set(key, value);
          } else {
            global.Espruino.Config[key] = value;
          }
        } catch (_) {
          global.Espruino.Config[key] = value;
        }
      });
    };
    E.init(() => {
      applyConfig();
      if (options.serialDebug) {
        try {
          if (global.Espruino && global.Espruino.Core && global.Espruino.Core.Serial && typeof global.Espruino.Core.Serial.debug === 'function') {
            global.Espruino.Core.Serial.debug();
            if (!quiet) console.log('Serial debug logging enabled (Espruino.Core.Serial.debug())');
          } else if (!quiet) {
            console.warn('Serial debug flag set, but Espruino.Core.Serial.debug() is unavailable');
          }
        } catch (debugErr) {
          if (!quiet) console.warn('Failed to enable serial debug logging:', debugErr && debugErr.message ? debugErr.message : debugErr);
        }
      }
      E.sendCode(port, code, () => {
        restore();
        resolve();
      });
    });
  });
}

function composeWrappedTest(fileId, src, timeoutSec, contextInjection) {
  const injections = [];
  injections.push(`var __TEST_TIMEOUT_SEC=${Math.max(1, timeoutSec)};`);
  injections.push('function __setTestResult(__status, __reason){ result = { status: __status, reason: __reason || null }; }');
  injections.push('function __pass(__reason){ __setTestResult(\'pass\', __reason); }');
  injections.push('function __fail(__reason){ __setTestResult(\'fail\', __reason); }');
  injections.push('function __skip(__reason){ __setTestResult(\'skip\', __reason); }');
  if (contextInjection) injections.push(contextInjection);
  const prologue = injections.join('\n') + '\n';
  const epilogue = `
(function(){
  var __t0 = Date.now();
  var __deadline = __t0 + ((__TEST_TIMEOUT_SEC||5)*1000);
  function done(value){
    var normalized = normalizeResult(value);
    var status = normalized.status;
    var reason = normalized.reason;
    if (typeof resultStatus !== 'undefined' && resultStatus != null) status = resultStatus;
    if (reason == null && typeof resultReason !== 'undefined' && resultReason != null) reason = resultReason;
    if (status !== 'pass' && status !== 'fail' && status !== 'skip') status = 'fail';
    var out={__espruino_test__:true,file:"${fileId}",status:status,duration_ms:(Date.now() - __t0),reason: reason || null};
    print(JSON.stringify(out));
    if (typeof result !== 'undefined') result = undefined;
    if (typeof resultStatus !== 'undefined') resultStatus = null;
    if (typeof resultReason !== 'undefined') resultReason = null;
  }
  function normalizeResult(value){
    var status = null;
    var reason = null;
    if (value && typeof value === 'object') {
      if (typeof value.status === 'string') {
        status = String(value.status).toLowerCase();
      }
      if (value.reason != null) reason = value.reason;
      if (!status) {
        if (value.skip) status = 'skip';
        else if (typeof value.pass !== 'undefined') status = value.pass ? 'pass' : 'fail';
        else status = value ? 'pass' : 'fail';
      }
    } else if (typeof value === 'string') {
      status = value.toLowerCase();
    } else {
      status = value ? 'pass' : 'fail';
    }
    if (status !== 'pass' && status !== 'fail' && status !== 'skip') {
      status = 'fail';
    }
    return { status: status, reason: reason };
  }
  (function wait(){
    if (typeof result!=='undefined') return done(result);
    if (Date.now()<__deadline) return setTimeout(wait,50);
    resultStatus = 'fail';
    resultReason = 'timeout';
    done(false);
  })();
})();
`;
  return prologue + src + epilogue;
}

async function runOneTest(
  E,
  port,
  testPath,
  rawSource,
  profile,
  testConfig,
  quiet = false,
  contextInjection = '',
  options = {}
) {
  const fileId = path.basename(testPath);
  const loaderConfig = testConfig.loader || {};
  const cliConfig = testConfig.cli || {};

  const timeoutCandidate = loaderConfig.timeoutMs !== undefined ? Number(loaderConfig.timeoutMs) : undefined;
  const timeoutMs = Number.isFinite(timeoutCandidate) && timeoutCandidate > 0 ? Math.floor(timeoutCandidate) : 15000;
  loaderConfig.timeoutMs = timeoutMs;

  const resolvedPreDelay = options.preDelayMs !== undefined ? Math.max(0, options.preDelayMs) : normaliseDelay(loaderConfig.preUploadDelayMs) ?? 0;
  const resolvedPostDelay = options.postDelayMs !== undefined ? Math.max(0, options.postDelayMs) : normaliseDelay(loaderConfig.postUploadDelayMs) ?? 0;
  loaderConfig.preUploadDelayMs = resolvedPreDelay;
  loaderConfig.postUploadDelayMs = resolvedPostDelay;

  const wrapped = composeWrappedTest(fileId, rawSource, Math.round(timeoutMs / 1000), contextInjection);

  return new Promise((resolve) => {
    let done = false;
    const cmd = process.env.ESPRUINO_CLI || 'espruino';
    const args = ['--port', port];

    const baud =
      cliConfig.BAUD_RATE ||
      loaderConfig.baud ||
      loaderConfig?.ports?.baud ||
      profile.config?.loader?.ports?.baud;
    if (baud) args.push('--config', `BAUD_RATE=${baud}`);

    const espruinoPairs = [];
    if (Array.isArray(cliConfig.espruinoConfig)) {
      cliConfig.espruinoConfig.forEach(({ key, value }) => {
        if (key) espruinoPairs.push({ key, value });
      });
    }
    ['SAVE_ON_SEND', 'RESET_BEFORE_SEND'].forEach((key) => {
      if (cliConfig[key] !== undefined) {
        espruinoPairs.push({ key, value: cliConfig[key] });
      }
    });
    if (loaderConfig.noReset === true && !espruinoPairs.some((pair) => pair.key === 'RESET_BEFORE_SEND')) {
      espruinoPairs.push({ key: 'RESET_BEFORE_SEND', value: false });
    }
    if (espruinoPairs.length) {
      const collapsed = new Map();
      espruinoPairs.forEach(({ key, value }) => {
        collapsed.set(key, value);
      });
      for (const [key, value] of collapsed.entries()) {
        args.push('--config', `${key}=${formatConfigValue(value)}`);
      }
    }

    if (Array.isArray(cliConfig.cliArgs)) {
      args.push(...cliConfig.cliArgs);
    }

    args.push('-e', wrapped);
    let boardArg;
    try {
      boardArg = resolveBoardArg(profile, loaderConfig);
    } catch (err) {
      resolve({
        status: 'fail',
        output: '',
        stderr: '',
        reason: err.message || String(err),
        wrappedSource: wrapped,
        timeout_ms: timeoutMs,
        cliArgs: [],
        connectionIssue: null,
      });
      return;
    }
    if (boardArg) args.push('--board', boardArg);

    if (!quiet) {
      const previewArgs = args.map((item) => (item === wrapped ? '<wrapped>' : item));
      console.log('CLI command:', [cmd, ...previewArgs].join(' '));
    }

    const launch = () => {
      const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      const cliCommand = [cmd, ...args];
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          try {
            child.kill('SIGINT');
          } catch (_) {}
          const finish = () =>
            resolve({
              status: 'fail',
              reason: 'timeout',
              output: out || err,
              stderr: err,
              wrappedSource: wrapped,
              timeout_ms: timeoutMs,
              cliArgs: cliCommand,
              connectionIssue: null,
            });
          if (resolvedPostDelay > 0) return setTimeout(finish, resolvedPostDelay);
          return finish();
        }
      }, timeoutMs + 1000);

      child.stdout.on('data', (d) => {
        out += d.toString();
      });
      child.stderr.on('data', (d) => {
        err += d.toString();
        if (!quiet) process.stderr.write(d.toString());
      });
      child.on('close', () => {
        if (done) return;
        clearTimeout(timer);
        let record = null;
        out.split(/\r?\n/).forEach((line) => {
          if (line.includes('__espruino_test__')) {
            const match = line.match(/(\{.*\})/);
            if (match) {
              try {
                record = JSON.parse(match[1]);
              } catch (_) {
                record = null;
              }
            }
          }
        });
        const finish = () => {
          const connectionIssue = detectConnectionIssue(out, err, port);
          if (record) {
            var statusFromRecord = (record && typeof record.status === 'string') ? record.status : 'fail';
            resolve({
              status: statusFromRecord,
              output: out,
              stderr: err,
              reason: record && record.reason != null ? record.reason : null,
              duration_ms: record && record.duration_ms != null ? record.duration_ms : null,
              file: record && record.file ? record.file : path.basename(testPath),
              wrappedSource: wrapped,
              timeout_ms: timeoutMs,
              cliArgs: cliCommand,
              connectionIssue: connectionIssue,
            });
          } else {
            resolve({
              status: 'fail',
              output: out,
              stderr: err,
              reason: connectionIssue || 'no_result',
              wrappedSource: wrapped,
              timeout_ms: timeoutMs,
              cliArgs: cliCommand,
              connectionIssue: connectionIssue,
            });
          }
        };
        if (resolvedPostDelay > 0) return setTimeout(finish, resolvedPostDelay);
        finish();
      });
    };

    if (resolvedPreDelay > 0) {
      setTimeout(launch, resolvedPreDelay);
    } else {
      launch();
    }
  });
}

async function runStoragePreload(
  port,
  testPath,
  profile,
  testConfig,
  storageItems,
  quiet = false,
  options = {}
) {
  const entries = normaliseStoragePreloadEntries(storageItems, path.dirname(testPath));
  if (!entries.length) return null;

  const loaderConfig = testConfig.loader || {};
  const cliConfig = testConfig.cli || {};
  const preDelayMs = options.preDelayMs !== undefined ? Math.max(0, options.preDelayMs) : normaliseDelay(loaderConfig.preUploadDelayMs) ?? 0;
  const postDelayMs = options.postDelayMs !== undefined ? Math.max(0, options.postDelayMs) : normaliseDelay(loaderConfig.postUploadDelayMs) ?? 0;
  const writeLogs = options.writeLogs !== false;
  const logsDir = options.logsDir;
  const testId = options.testId;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'espruino-storage-'));
  const stagedPaths = [];
  try {
    entries.forEach((entry, idx) => {
      if (entry.sourceFile) {
        stagedPaths.push(entry.sourceFile);
      } else {
        const onDisk = path.join(tempDir, `storage_${idx}.txt`);
        fs.writeFileSync(onDisk, entry.contents, 'utf8');
        stagedPaths.push(onDisk);
      }
    });
    const preloadStubPath = path.join(tempDir, 'storage_preload_stub.js');
    fs.writeFileSync(preloadStubPath, '// storage preload stub\n');

    const cmd = process.env.ESPRUINO_CLI || 'espruino';
    const args = ['--port', port];

    const baud =
      cliConfig.BAUD_RATE ||
      loaderConfig.baud ||
      loaderConfig?.ports?.baud ||
      profile.config?.loader?.ports?.baud;
    if (baud) args.push('--config', `BAUD_RATE=${baud}`);

    if (Array.isArray(cliConfig.cliArgs)) {
      args.push(...cliConfig.cliArgs);
    }

    const espruinoPairs = [];
    if (Array.isArray(cliConfig.espruinoConfig)) {
      cliConfig.espruinoConfig.forEach(({ key, value }) => {
        if (key) espruinoPairs.push({ key, value });
      });
    }
    ['SAVE_ON_SEND', 'RESET_BEFORE_SEND'].forEach((key) => {
      if (cliConfig[key] !== undefined) {
        espruinoPairs.push({ key, value: cliConfig[key] });
      }
    });
    if (loaderConfig.noReset === true && !espruinoPairs.some((pair) => pair.key === 'RESET_BEFORE_SEND')) {
      espruinoPairs.push({ key: 'RESET_BEFORE_SEND', value: false });
    }
    espruinoPairs.forEach(({ key, value }) => {
      args.push('--config', `${key}=${formatConfigValue(value)}`);
    });

    let boardArg;
    try {
      boardArg = resolveBoardArg(profile, loaderConfig);
    } catch (err) {
      throw err;
    }
    if (boardArg) args.push('--board', boardArg);

    entries.forEach((entry, idx) => {
      args.push('--storage', `${entry.filename}:${stagedPaths[idx]}`);
    });
    args.push(preloadStubPath);

    const cliCommand = [cmd, ...args];

    return await new Promise((resolve, reject) => {
      const launch = () => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => {
          const chunk = d.toString();
          stdout += chunk;
          if (!quiet) process.stdout.write(chunk);
        });
        child.stderr.on('data', (d) => {
          const chunk = d.toString();
          stderr += chunk;
          if (!quiet) process.stderr.write(chunk);
        });
        child.on('error', (err) => {
          reject(Object.assign(err, { stdout, stderr, cliCommand }));
        });
        child.on('close', (code) => {
          const combined = `${stdout}\n${stderr}`;
          if (/device or resource busy/i.test(combined) || /cannot open \/dev\//i.test(combined)) {
            const err = new Error('device_busy');
            err.stdout = stdout;
            err.stderr = stderr;
            err.deviceBusy = true;
            err.cliCommand = cliCommand;
            return reject(err);
          }
          const knownPortError = /TypeError: Cannot read properties of undefined \(reading 'type'\)/.test(stderr);
          if (code !== 0 && !knownPortError) {
            const err = new Error(`storage_preload_failed (exit ${code})`);
            err.stdout = stdout;
            err.stderr = stderr;
            err.cliCommand = cliCommand;
            return reject(err);
          }
          if (writeLogs && logsDir && testId) {
            try {
              fs.writeFileSync(path.join(logsDir, `${testId}.storage.stdout`), stdout || '');
              fs.writeFileSync(path.join(logsDir, `${testId}.storage.stderr`), stderr || '');
            } catch (_) {
              // ignore log write failures
            }
          }
          resolve({ stdout, stderr, cliCommand });
        });
      };

      if (preDelayMs > 0) setTimeout(launch, preDelayMs);
      else launch();
    }).finally(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }).then(async (result) => {
      if (postDelayMs > 0) await delay(postDelayMs);
      return result;
    });
  } catch (err) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
    throw err;
  }
}

async function main() {
  console.log('\n');
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    process.exit(0);
  }

  const boardName = args.board || args.device || args._[0];
  if (!boardName) {
    console.error('Error: --board <name> is required');
    usage();
    process.exit(1);
  }

  let profile;
  try {
    profile = loadBoardProfile(boardName, REPO_ROOT);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const baseConfig = createEmptyConfig();
  const baseProvenance = [];
  mergeConfig(baseConfig, SESSION_DEFAULTS, baseProvenance, 'session-defaults');
  mergeConfig(baseConfig, profile.config, baseProvenance, `board:${boardName}`);
  baseConfig.loader.board = boardName;

  const suiteInfo = resolveSuites(profile.config.board, args.suites);
  if (suiteInfo.unknown.length) {
    console.error(`Error: unknown suites: ${suiteInfo.unknown.join(', ')}`);
    process.exit(1);
  }

  const suiteLayers = new Map();
  const suiteMetadata = new Map();
  const suiteExecutionOrders = new Map();
  suiteInfo.requested.forEach((suite) => {
    try {
      const suiteConfig = loadSuiteConfig(REPO_ROOT, suite);
      suiteLayers.set(suite, suiteConfig.layer);
      suiteMetadata.set(suite, suiteConfig.meta || {});
      if (suiteConfig.meta && suiteConfig.meta.execution && Array.isArray(suiteConfig.meta.execution.order)) {
        suiteExecutionOrders.set(suite, suiteConfig.meta.execution.order);
      }
    } catch (err) {
      console.error(`Error loading suite config for ${suite}: ${err.message}`);
      process.exit(1);
    }
  });

  const tests = resolveSuiteTests(REPO_ROOT, boardName.toLowerCase(), suiteInfo.requested, {
    executionOrders: Object.fromEntries(suiteExecutionOrders.entries()),
  });
  if (!tests.length) {
    console.log('No tests discovered for given suites.');
    process.exit(0);
  }

  const candidatePort =
    args.port ||
    pickDefaultPort(profile.config.loader?.ports) ||
    pickDefaultPort(baseConfig.loader?.ports);
  if (!candidatePort) {
    console.error('Error: --port <tty> is required (metadata does not provide a literal default).');
    process.exit(1);
  }

  const resolvedPort = resolvePortPattern(candidatePort, console);

  const cliLayer = createEmptyConfig();
  if (args.fixtures) {
    if (typeof args.fixtures !== 'string') {
      console.error('Error: --fixtures requires a path to a JSON file');
      process.exit(1);
    }
    const fixturesPath = path.isAbsolute(args.fixtures) ? args.fixtures : path.resolve(process.cwd(), args.fixtures);
    try {
      cliLayer.fixture = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
    } catch (err) {
      console.error(`Error loading fixtures from ${args.fixtures}: ${err.message || err}`);
      process.exit(1);
    }
  }
  cliLayer.cli.ports = [resolvedPort];
  cliLayer.loader.port = resolvedPort;
  if (Object.prototype.hasOwnProperty.call(args, 'preCliDelay')) {
    try {
      cliLayer.loader.preUploadDelayMs = parseNonNegativeInt(args.preCliDelay, '--pre-cli-delay');
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }
  if (Object.prototype.hasOwnProperty.call(args, 'postCliDelay')) {
    try {
      cliLayer.loader.postUploadDelayMs = parseNonNegativeInt(args.postCliDelay, '--post-cli-delay');
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }
  if (args.noReset) {
    cliLayer.loader.noReset = true;
    cliLayer.cli.RESET_BEFORE_SEND = false;
  }

  const quietMode = Boolean(args.quiet);

  const E = ensureEspruinoModule();
  await warmup(E, resolvedPort, quietMode, {
    serialDebug: Boolean(args.serialDebug),
    espruinoConfig: Array.isArray(baseConfig.cli?.espruinoConfig)
      ? baseConfig.cli.espruinoConfig
      : Array.isArray(profile?.config?.cli?.espruinoConfig)
      ? profile.config.cli.espruinoConfig
      : undefined,
  });

  const timestamp = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${timestamp.getFullYear()}${pad(timestamp.getMonth() + 1)}${pad(timestamp.getDate())}-${pad(
    timestamp.getHours()
  )}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}`;
  const resultsDir = path.join(REPO_ROOT, 'results', stamp, boardName);
  fs.mkdirSync(resultsDir, { recursive: true });
  const writeSources = profile.config.loader?.output?.writeSources !== false;
  const writeLogs = profile.config.loader?.output?.writeLogs !== false;
  const writeMetadata = profile.config.loader?.output?.writeMetadata !== false;

  const sourcesDir = path.join(resultsDir, 'sources');
  const logsDir = path.join(resultsDir, 'logs');
  const metadataDir = path.join(resultsDir, 'runner-metadata');
  if (writeSources) fs.mkdirSync(sourcesDir, { recursive: true });
  if (writeLogs) fs.mkdirSync(logsDir, { recursive: true });
  if (writeMetadata) fs.mkdirSync(metadataDir, { recursive: true });

  console.log('Test Run Summary');
  console.log('================');
  console.log(`Board:    ${boardName}`);
  console.log(`Board file: ${profile.files.board}`);
  if (profile.files.fixture) console.log(`Fixture file: ${profile.files.fixture}`);
  if (profile.files.cli) console.log(`CLI file: ${profile.files.cli}`);
  console.log(`Port:     ${resolvedPort}`);
  console.log(`Suites:   ${suiteInfo.requested.join(', ')}`);
  console.log(`Tests:    ${tests.map((t) => t.id).join(', ')}`);

  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const perSuite = {};

  for (const test of tests) {
    process.stdout.write(`Running ${test.id} ... `);
    let testMeta;
    let perTestConfig;
    let provenance;
    let diagnostics = [];
    let requiredFixturePaths = [];
    let aggregatedRequirements = new Set();
    let storageCliCommand = null;
    let storageExecuted = false;
    let basePreDelay = null;
    let basePostDelay = null;
    let effectivePreDelay = 0;
    try {
      testMeta = parseTestMetadata(test.path);
      perTestConfig = cloneConfig(baseConfig);
      provenance = baseProvenance.slice();
      const suiteLayer = suiteLayers.get(test.suite);
      if (suiteLayer) mergeConfig(perTestConfig, suiteLayer, provenance, `suite:${test.suite}`);
      mergeConfig(perTestConfig, testMeta.layer, provenance, `test:${test.id}`);
      mergeConfig(perTestConfig, cliLayer, provenance, 'cli-overrides');
      perTestConfig.loader.board = boardName;

      const suiteMeta = suiteMetadata.get(test.suite) || {};
      requiredFixturePaths = Array.from(
        new Set([
          ...gatherFixtureRequirements(suiteMeta),
          ...gatherFixtureRequirements(testMeta.metadata),
        ])
      );
      if (perTestConfig.fixture && Array.isArray(perTestConfig.fixture.required)) {
        requiredFixturePaths = Array.from(
          new Set([...requiredFixturePaths, ...perTestConfig.fixture.required])
        );
        delete perTestConfig.fixture.required;
      }

      aggregatedRequirements = new Set([
        ...(perTestConfig.loader && Array.isArray(perTestConfig.loader.requirements)
          ? perTestConfig.loader.requirements
          : []),
        ...gatherRequirements(suiteMeta),
        ...gatherRequirements(testMeta.metadata),
      ]);
      if (aggregatedRequirements.size) {
        perTestConfig.loader.requirements = Array.from(aggregatedRequirements);
      }

      const loaderBranch = perTestConfig.loader || {};
      basePreDelay = normaliseDelay(loaderBranch.preUploadDelayMs);
      if (basePreDelay !== null) {
        loaderBranch.preUploadDelayMs = basePreDelay;
      } else if (loaderBranch.preUploadDelayMs !== undefined) {
        delete loaderBranch.preUploadDelayMs;
      }
      basePostDelay = normaliseDelay(loaderBranch.postUploadDelayMs);
      if (basePostDelay !== null) {
        loaderBranch.postUploadDelayMs = basePostDelay;
      } else if (loaderBranch.postUploadDelayMs !== undefined) {
        delete loaderBranch.postUploadDelayMs;
      }

      const storageItemsRaw = loaderBranch.storagePreload;
      const hasStoragePreload = storageItemsRaw && ensureArray(storageItemsRaw).length > 0;
      if (hasStoragePreload) {
        storageExecuted = true;
        try {
          const storageResult = await runStoragePreload(
            resolvedPort,
            test.path,
            profile,
            perTestConfig,
            storageItemsRaw,
            quietMode,
            {
              preDelayMs: basePreDelay ?? 0,
              postDelayMs: basePostDelay ?? 0,
              logsDir: writeLogs ? logsDir : null,
              testId: test.id,
              writeLogs,
            }
          );
          if (storageResult && storageResult.cliCommand) {
            storageCliCommand = storageResult.cliCommand;
          }
        } catch (storageErr) {
          if (storageErr && storageErr.cliCommand && !storageCliCommand) {
            storageCliCommand = storageErr.cliCommand;
          }
          throw storageErr;
        }
      }
      effectivePreDelay = hasStoragePreload ? 0 : basePreDelay ?? 0;

      const fixturePayload = perTestConfig.fixture || {};
      const fixtureInjectionCode = Object.keys(fixturePayload).length
        ? `global.ESPRUINO_FIXTURES = ${JSON.stringify(fixturePayload)};`
        : '';

      const runResult = await runOneTest(
        E,
        resolvedPort,
        test.path,
        testMeta.rawSource,
        profile,
        perTestConfig,
        quietMode,
        fixtureInjectionCode,
        { preDelayMs: effectivePreDelay, postDelayMs: basePostDelay ?? 0 }
      );

      const { wrappedSource, timeout_ms, cliArgs, connectionIssue, ...resultBase } = runResult;
      const resultForMeta = { ...resultBase };
      if (!resultForMeta || typeof resultForMeta.status !== 'string') {
        resultForMeta.status = 'fail';
      }
      if (resultForMeta.reason === undefined) {
        resultForMeta.reason = connectionIssue || null;
      }
      if (connectionIssue) {
        diagnostics.push({
          level: 'error',
          source: 'runner',
          path: 'cli.connect',
          message: connectionIssue,
        });
      }

      const missingFixturePaths = validateFixturePaths(perTestConfig.fixture, requiredFixturePaths);
      if (missingFixturePaths.length) {
        const message = `Missing fixture path(s): ${missingFixturePaths.join(', ')}`;
        diagnostics = diagnostics.concat(
          missingFixturePaths.map((p) => ({
            level: 'error',
            source: 'fixture',
            path: `fixture.${p}`,
            message,
          }))
        );
        resultForMeta.status = 'fail';
        resultForMeta.reason = message;
      }

      const suiteSummary = perSuite[test.suite] || { tests: [], pass: 0, fail: 0, skip: 0 };
      perSuite[test.suite] = suiteSummary;
      const testStatus = resultForMeta.status;
      const testReason = resultForMeta.reason || null;
      const durationMs = resultForMeta.duration_ms || null;
      suiteSummary.tests.push({
        file: test.id,
        status: testStatus,
        reason: testReason,
        duration_ms: durationMs,
      });
      if (testStatus === 'skip') {
        skipCount++;
        suiteSummary.skip++;
        console.log(`SKIP${testReason ? ` (${testReason})` : ''}`);
      } else if (testStatus === 'pass') {
        passCount++;
        suiteSummary.pass++;
        console.log('PASS');
      } else {
        failCount++;
        suiteSummary.fail++;
        console.log(`FAIL${testReason ? ` (${testReason})` : ''}`);
        if (resultForMeta.output && resultForMeta.output.trim()) {
          console.log(resultForMeta.output.trim());
        }
      }
      if (writeSources) {
        fs.writeFileSync(path.join(sourcesDir, test.id), wrappedSource);
      }
      if (writeLogs) {
        fs.writeFileSync(path.join(logsDir, `${test.id}.stdout`), resultForMeta.output || '');
        fs.writeFileSync(path.join(logsDir, `${test.id}.stderr`), resultForMeta.stderr || '');
      }
      if (writeMetadata) {
        const metadataPath = path.join(metadataDir, `${test.id}.json`);
        const configForLog = cloneConfig(perTestConfig);
        if (configForLog.cli && Array.isArray(configForLog.cli.espruinoConfig)) {
          configForLog.cli.espruinoConfig = configForLog.cli.espruinoConfig.filter(({ key, value }) => !SESSION_DEFAULT_CONFIG_SET.has(`${key}=${value}`));
          if (!configForLog.cli.espruinoConfig.length) delete configForLog.cli.espruinoConfig;
        }
        const provenanceForLog = provenance.filter((entry) => !(entry.source === 'session-defaults' && entry.path === 'cli.espruinoConfig'));
        const storageStdoutPath = storageExecuted && writeLogs ? path.join('logs', `${test.id}.storage.stdout`) : null;
        const storageStderrPath = storageExecuted && writeLogs ? path.join('logs', `${test.id}.storage.stderr`) : null;
        const record = {
          metadataVersion: 1,
          board: boardName,
          suite: test.suite,
          test: test.id,
          sourceFile: path.relative(REPO_ROOT, test.path),
          config: configForLog,
          provenance: provenanceForLog,
          result: {
            status: resultForMeta.status,
            reason: testReason,
            duration_ms: durationMs,
            timeout_ms: (typeof timeout_ms === 'number' ? timeout_ms : perTestConfig.loader.timeoutMs || 15000),
          },
          ports: {
            resolved: resolvedPort,
            declared: perTestConfig.cli.ports || [],
          },
          requiredFixtures: requiredFixturePaths,
          requirements: Array.from(aggregatedRequirements),
          diagnostics,
          cliCommand: cliArgs,
          artefacts: {
            sources: writeSources ? path.join('sources', test.id) : null,
            stdout: writeLogs ? path.join('logs', `${test.id}.stdout`) : null,
            stderr: writeLogs ? path.join('logs', `${test.id}.stderr`) : null,
            storageStdout: storageStdoutPath,
            storageStderr: storageStderrPath,
          },
        };
        if (storageCliCommand) {
          record.storageCliCommand = storageCliCommand;
        }
        record.storagePreloadApplied = storageExecuted;
        fs.writeFileSync(metadataPath, JSON.stringify(record, null, 2));
      }
    } catch (err) {
      failCount++;
      const suiteSummary = perSuite[test.suite] || { tests: [], pass: 0, fail: 0, skip: 0 };
      perSuite[test.suite] = suiteSummary;
      suiteSummary.fail++;
      suiteSummary.tests.push({
        file: test.id,
        status: 'fail',
        reason: err.message || err,
        duration_ms: null,
      });
      if (err && err.cliCommand && !storageCliCommand) {
        storageCliCommand = err.cliCommand;
      }
      console.log(`ERROR (${err.message || err})`);
      if (writeMetadata && perTestConfig && provenance) {
        const metadataPath = path.join(metadataDir, `${test.id}.json`);
        const configForLog = cloneConfig(perTestConfig);
        if (configForLog.cli && Array.isArray(configForLog.cli.espruinoConfig)) {
          configForLog.cli.espruinoConfig = configForLog.cli.espruinoConfig.filter(({ key, value }) => !SESSION_DEFAULT_CONFIG_SET.has(`${key}=${value}`));
          if (!configForLog.cli.espruinoConfig.length) delete configForLog.cli.espruinoConfig;
        }
        const provenanceForLog = provenance.filter((entry) => !(entry.source === 'session-defaults' && entry.path === 'cli.espruinoConfig'));
        const storageStdoutPath = storageExecuted && writeLogs ? path.join('logs', `${test.id}.storage.stdout`) : null;
        const storageStderrPath = storageExecuted && writeLogs ? path.join('logs', `${test.id}.storage.stderr`) : null;
        const failedCliCommand = err && err.cliCommand ? err.cliCommand : null;
        const record = {
          metadataVersion: 1,
          board: boardName,
          suite: test.suite,
          test: test.id,
          sourceFile: path.relative(REPO_ROOT, test.path),
          config: configForLog,
          provenance: provenanceForLog,
          result: {
            status: 'fail',
            reason: err.message || err,
            duration_ms: null,
          },
          ports: {
            resolved: resolvedPort,
            declared: (perTestConfig.cli && perTestConfig.cli.ports) || [],
          },
          requiredFixtures: requiredFixturePaths,
          requirements: Array.from(aggregatedRequirements),
          diagnostics,
          cliCommand: failedCliCommand,
          artefacts: {
            sources: writeSources ? path.join('sources', test.id) : null,
            stdout: writeLogs ? path.join('logs', `${test.id}.stdout`) : null,
            stderr: writeLogs ? path.join('logs', `${test.id}.stderr`) : null,
            storageStdout: storageStdoutPath,
            storageStderr: storageStderrPath,
          },
        };
        if (storageCliCommand) {
          record.storageCliCommand = storageCliCommand;
        }
        record.storagePreloadApplied = storageExecuted;
        fs.writeFileSync(metadataPath, JSON.stringify(record, null, 2));
      }
    }
  }

  console.log('\nSuite Summary');
  console.log('============');
  Object.entries(perSuite).forEach(([suiteName, summary]) => {
    console.log(`${suiteName}: ${summary.pass} passed, ${summary.fail} failed, ${summary.skip} skipped`);
  });

  Object.entries(perSuite).forEach(([suiteName, summary]) => {
    const suiteFile = path.join(resultsDir, `${suiteName.replace(/\//g, "_")}.json`);
    fs.writeFileSync(
      suiteFile,
      JSON.stringify(
        {
          board: boardName,
          port: resolvedPort,
          suite: suiteName,
          when: stamp,
          summary,
          boardFiles: profile.files,
        },
        null,
        2
      )
    );
  });

  console.log('\nRun Summary');
  console.log('==========');
  console.log(`${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
  console.log(`Results directory: ${resultsDir}`);

  const finishedAt = new Date();
  const runSummaryRecord = {
    metadataVersion: 1,
    board: boardName,
    port: resolvedPort,
    suites: perSuite,
    totals: { pass: passCount, fail: failCount, skip: skipCount },
    startedAt: timestamp.toISOString(),
    finishedAt: finishedAt.toISOString(),
    stamp,
    args: process.argv.slice(2),
  };
  try {
    fs.writeFileSync(path.join(resultsDir, 'run-summary.json'), JSON.stringify(runSummaryRecord, null, 2));
  } catch (err) {
    console.warn(`Warning: failed to write run-summary.json (${err.message || err})`);
  }

  process.exit(failCount ? 1 : 0);
}

main();
