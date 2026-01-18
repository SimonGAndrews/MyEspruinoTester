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

const fs = require('fs');
const path = require('path');

function fatal(message, code) {
  console.error(`[TTH_CONTROLLER] ${message}`);
  process.exit(code || 1);
}

function deepMerge(target, source) {
  const base = target && typeof target === 'object' && !Array.isArray(target) ? JSON.parse(JSON.stringify(target)) : {};
  if (!source || typeof source !== 'object') return base;
  Object.entries(source).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      base[key] = value.slice();
    } else if (value && typeof value === 'object') {
      base[key] = deepMerge(base[key], value);
    } else {
      base[key] = value;
    }
  });
  return base;
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    fatal(`Failed to parse ${filePath}: ${err && err.message ? err.message : err}`);
  }
  return null;
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
};

const VALID_POLICIES = new Set(['flash', 'reuse', 'auto']);
if (!VALID_POLICIES.has(controllerConfig.flashPolicy)) {
  fatal(`Unsupported HTS_TTH_FLASH_POLICY: ${controllerConfig.flashPolicy}`);
}

const PROGRAM_ROOT = path.join(__dirname, 'tth-programs');
const manifestPath = path.join(PROGRAM_ROOT, `${controllerConfig.scriptId}.json`);
const manifest = loadJson(manifestPath) || { modes: {} };
const modeEntry = manifest.modes && manifest.modes[controllerConfig.mode];

if (!modeEntry) {
  console.error(
    `[TTH_CONTROLLER] Warning: mode "${controllerConfig.mode}" not defined for script "${controllerConfig.scriptId}". Using empty fixtures.`,
  );
}

let fixturesPayload = modeEntry && modeEntry.fixtures ? deepMerge({}, modeEntry.fixtures) : {};
if (controllerConfig.fixtureOverrides) {
  fixturesPayload = deepMerge(fixturesPayload, controllerConfig.fixtureOverrides);
}

const globalPayload = {
  tth_controller: {
    port: controllerConfig.port,
    baud: controllerConfig.baud,
    flashPolicy: controllerConfig.flashPolicy,
    scriptId: controllerConfig.scriptId,
    mode: controllerConfig.mode,
    board: controllerConfig.board,
  },
};
if (modeEntry && modeEntry.global) {
  Object.assign(globalPayload, modeEntry.global);
}

console.log(
  `[TTH_CONTROLLER] script=${controllerConfig.scriptId} mode=${controllerConfig.mode} policy=${controllerConfig.flashPolicy}`,
);
if (manifest.description) {
  console.log(`[TTH_CONTROLLER] ${manifest.description}`);
}

// TODO: integrate with EspruinoTools to flash & drive the physical TTH board.
const payload = Object.assign({}, fixturesPayload);
payload.global = deepMerge({}, globalPayload);
console.log('__HTS_FIXTURES__' + JSON.stringify(payload));
console.log('__HTS_READY__');

// Keep process alive if future controller needs to monitor the host; for now exit immediately.
process.exit(0);
