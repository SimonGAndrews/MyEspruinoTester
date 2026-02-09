#!/usr/bin/env node
'use strict';

/**
 * Controller Host Test Service (HTS) prototype
 *
 * Responsible for orchestrating the Target Test Host (TTH) ESP32 board.
 * Current implementation focuses on parsing metadata/env, selecting the
 * requested host script + mode, and emitting fixtures so the DUT can consume
 * them. The physical flashing/command channel will be wired in future steps.
 */

const path = require('path');
const { spawn } = require('child_process');
const { deepMerge, loadProgramConfig } = require('./tth-controller/programLoader');

const ARG_MAP = {
  port: 'HTS_TTH_PORT',
  script: 'HTS_TTH_SCRIPT_ID',
  mode: 'HTS_TTH_MODE',
  board: 'HTS_TTH_BOARD',
  baud: 'HTS_TTH_BAUD',
  'flash-policy': 'HTS_TTH_FLASH_POLICY',
  'ready-timeout': 'HTS_TTH_READY_TIMEOUT_MS',
  fixtures: 'HTS_TTH_FIXTURE_OVERRIDES',
};

function printUsage() {
  console.log(`TTH Controller CLI

Usage:
  node host-services/tth-controller.js [options]

Options (mirror env vars):
  --port <path>            (HTS_TTH_PORT)            Serial port for the TTH (e.g. /dev/ttyUSB0)
  --script <id>            (HTS_TTH_SCRIPT_ID)       TTH program manifest ID (e.g. http_host_echo)
  --mode <name>            (HTS_TTH_MODE)            Program mode inside the manifest (e.g. http_echo)
  --flash-policy <policy>  (HTS_TTH_FLASH_POLICY)    flash | reuse | auto (default reuse)
  --board <name>           (HTS_TTH_BOARD)           Board name passed to Espruino CLI
  --baud <rate>            (HTS_TTH_BAUD)            Serial baud rate (default 115200)
  --ready-timeout <ms>     (HTS_TTH_READY_TIMEOUT_MS) Timeout waiting for __HOST_READY__
  --fixtures '<json>'      (HTS_TTH_FIXTURE_OVERRIDES) Merge extra fixtures into host payload
  -h, --help               Show this help message

Examples:
  node host-services/tth-controller.js \\
    --port /dev/ttyUSB0 --script http_host_echo --mode http_echo --flash-policy flash
`);
}

function parseCliArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (!(key in ARG_MAP)) continue;
    const envName = ARG_MAP[key];
    const value = argv[i + 1];
    if (value === undefined) {
      fatal(`Missing value for --${key}`);
    }
    parsed[envName] = value;
    i += 1;
  }
  return parsed;
}

const cliOverrides = parseCliArgs(process.argv.slice(2));
if (cliOverrides.help) {
  printUsage();
  process.exit(0);
}
Object.entries(cliOverrides).forEach(([envKey, value]) => {
  process.env[envKey] = value;
});

function fatal(message, code) {
  console.error(`[TTH_CONTROLLER] ${message}`);
  process.exit(code || 1);
}

function parseOverrides(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    fatal(`HTS_TTH_FIXTURE_OVERRIDES invalid JSON: ${err && err.message ? err.message : err}`);
  }
  return null;
}

const REQUIRED_ENVS = ['HTS_TTH_PORT', 'HTS_TTH_SCRIPT_ID', 'HTS_TTH_MODE'];
REQUIRED_ENVS.forEach((key) => {
  if (!process.env[key]) {
    fatal(`${key} is required`);
  }
});

const controllerConfig = {
  port: process.env.HTS_TTH_PORT,
  baud: Number(process.env.HTS_TTH_BAUD || 115200),
  flashPolicy: (process.env.HTS_TTH_FLASH_POLICY || 'reuse').toLowerCase(),
  scriptId: process.env.HTS_TTH_SCRIPT_ID,
  mode: process.env.HTS_TTH_MODE,
  board: process.env.HTS_TTH_BOARD || 'ESP32',
  fixtureOverrides: parseOverrides(process.env.HTS_TTH_FIXTURE_OVERRIDES || ''),
  readyTimeoutMs: Number(process.env.HTS_TTH_READY_TIMEOUT_MS || 45000),
};

const VALID_POLICIES = new Set(['flash', 'reuse', 'auto']);
if (!VALID_POLICIES.has(controllerConfig.flashPolicy)) {
  fatal(`Unsupported HTS_TTH_FLASH_POLICY: ${controllerConfig.flashPolicy}`);
}

const PROGRAM_ROOT = path.join(__dirname, 'tth-programs');
let programConfig;
try {
  programConfig = loadProgramConfig(PROGRAM_ROOT, controllerConfig.scriptId, controllerConfig.mode, controllerConfig.fixtureOverrides);
} catch (err) {
  fatal(err.message);
}
const manifest = programConfig.manifest;
const fixturesPayload = programConfig.fixtures || {};

const globalPayload = {
  tth_controller: {
    port: controllerConfig.port,
    baud: controllerConfig.baud,
    flashPolicy: controllerConfig.flashPolicy,
    scriptId: controllerConfig.scriptId,
    mode: controllerConfig.mode,
    board: programConfig.board || controllerConfig.board,
    scriptPath: programConfig.scriptPath,
  },
};

console.log(
  `[TTH_CONTROLLER] script=${controllerConfig.scriptId} mode=${controllerConfig.mode} policy=${controllerConfig.flashPolicy}`,
);
if (manifest.description) {
  console.log(`[TTH_CONTROLLER] ${manifest.description}`);
}

// TODO: integrate with EspruinoTools to flash & drive the physical TTH board.
const payload = Object.assign({}, fixturesPayload);
payload.global = deepMerge(programConfig.globalPayload || {}, globalPayload);
const ES_CLI =
  process.platform === 'win32'
    ? path.join(__dirname, '..', 'node_modules', '.bin', 'espruino.cmd')
    : path.join(__dirname, '..', 'node_modules', '.bin', 'espruino');
const baseEspruinoArgs = ['--port', controllerConfig.port, '-b', String(controllerConfig.baud), '--no-ble'];

function makeLineAccumulator(handler) {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r/g, '').trim();
        buffer = buffer.slice(idx + 1);
        if (line && handler) handler(line);
      }
    },
    flush() {
      const line = buffer.replace(/\r/g, '').trim();
      buffer = '';
      if (line && handler) handler(line);
    },
  };
}

function handleHostSentinel(rawLine) {
  if (!rawLine) return;
  const line = rawLine
    .replace(/^--]\s*/, '')
    .replace(/^>\s*/, '')
    .trim();
  if (!line) return;
  if (line.startsWith('__HOST_FIXTURES__')) {
    const json = line.slice('__HOST_FIXTURES__'.length);
    try {
      hostFixtures = deepMerge(fixturesPayload, JSON.parse(json));
      emitFixturesLine();
    } catch (err) {
      console.error(`[TTH_CONTROLLER] Failed to parse HOST fixtures: ${err.message}`);
    }
    return;
  }
  if (line.startsWith('__HOST_READY__')) {
    emitReadyLine();
  }
}

function runEspruinoCommand(args, label, lineHandler) {
  return new Promise((resolve, reject) => {
    const child = spawn(ES_CLI, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const accumulator = lineHandler ? makeLineAccumulator(lineHandler) : null;
    child.stdout.on('data', (chunk) => {
      process.stdout.write(`[TTH_${label || 'CMD'}][STDOUT] ${chunk}`);
      if (accumulator) accumulator.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(`[TTH_${label || 'CMD'}][STDERR] ${chunk}`);
    });
    child.on('error', (err) => {
      reject(err);
    });
    child.on('exit', (code) => {
      if (accumulator) accumulator.flush();
      if (code === 0) resolve();
      else reject(new Error(`${label || 'command'} exited with code ${code}`));
    });
  });
}

function flashScript() {
  const args = baseEspruinoArgs
    .concat(['--board', programConfig.board || controllerConfig.board])
    .concat([programConfig.scriptPath]);
  return runEspruinoCommand(args, 'FLASH', handleHostSentinel);
}

async function persistProgram() {
  const saveArgs = baseEspruinoArgs.concat(['-e', 'save();']);
  await runEspruinoCommand(saveArgs, 'SAVE', handleHostSentinel);
  const rebootArgs = baseEspruinoArgs.concat(['-e', 'E.reboot();']);
  await runEspruinoCommand(rebootArgs, 'RESET');
}

let monitorChild = null;
let monitorBuffer = '';
let hostFixtures = null;
let fixturesEmitted = false;
let readyEmitted = false;
let readyTimer = null;

function emitSentinel(line) {
  process.stdout.write(`\n${line}\n`);
}

function emitFixturesLine() {
  if (fixturesEmitted) return;
  const combined = deepMerge(payload, hostFixtures || {});
  emitSentinel('__HTS_FIXTURES__' + JSON.stringify(combined));
  fixturesEmitted = true;
}

function emitReadyLine() {
  if (readyEmitted) return;
  emitFixturesLine();
  emitSentinel('__HTS_READY__');
  readyEmitted = true;
  if (readyTimer) {
    clearTimeout(readyTimer);
    readyTimer = null;
  }
}

function startMonitor(options) {
  if (monitorChild) return;
  monitorChild = spawn(ES_CLI, baseEspruinoArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
  monitorChild.stdin.setEncoding('utf8');
  monitorChild.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    process.stdout.write(`[TTH_SERIAL] ${text}`);
    monitorBuffer += text;
    let idx;
    while ((idx = monitorBuffer.indexOf('\n')) >= 0) {
      const line = monitorBuffer.slice(0, idx).trim();
      monitorBuffer = monitorBuffer.slice(idx + 1);
      handleHostSentinel(line.replace(/\r/g, ''));
    }
  });
  monitorChild.stderr.on('data', (chunk) => {
    process.stderr.write(`[TTH_SERIAL][ERR] ${chunk}`);
  });
  monitorChild.on('exit', (code) => {
    console.error(`[TTH_CONTROLLER] Serial monitor exited with code ${code}`);
    if (!readyEmitted) {
      fatal('TTH monitor exited before readiness detected');
    } else {
      process.exit(code || 0);
    }
  });
  if (!readyEmitted) {
    readyTimer = setTimeout(() => {
      console.error('[TTH_CONTROLLER] Ready timeout expired');
      fatal('Timed out waiting for __HOST_READY__');
    }, controllerConfig.readyTimeoutMs);
  }
  if (options && options.resetOnConnect) {
    console.log('[TTH_CONTROLLER] Rebooting TTH via monitor stdin');
    setTimeout(() => {
      if (monitorChild && monitorChild.stdin.writable) {
        monitorChild.stdin.write('E.reboot();\n');
      }
    }, options.resetDelayMs || 500);
  }
}

function cleanupAndExit(signal) {
  console.log(`[TTH_CONTROLLER] Received ${signal}, shutting down monitor`);
  if (monitorChild) {
    monitorChild.kill('SIGINT');
  }
  process.exit(0);
}

process.on('SIGINT', () => cleanupAndExit('SIGINT'));
process.on('SIGTERM', () => cleanupAndExit('SIGTERM'));

async function orchestrate() {
  try {
    if (controllerConfig.flashPolicy === 'flash' || controllerConfig.flashPolicy === 'auto') {
      console.log('[TTH_CONTROLLER] Flash policy requires upload');
      await flashScript();
      if (programConfig.flashConfig && programConfig.flashConfig.saveOnSend) {
        console.log('[TTH_CONTROLLER] Persisting program via save()');
        await persistProgram();
      }
    } else {
      console.log('[TTH_CONTROLLER] Flash policy reuse: will reset via monitor');
    }
    const shouldResetViaMonitor = controllerConfig.flashPolicy === 'reuse';
    startMonitor({ resetOnConnect: shouldResetViaMonitor });
  } catch (err) {
    fatal(`Controller error: ${err && err.message ? err.message : err}`);
  }
}

orchestrate();
