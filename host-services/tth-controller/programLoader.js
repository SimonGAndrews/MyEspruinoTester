'use strict';

const fs = require('fs');
const path = require('path');

function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone);
  if (value && typeof value === 'object') {
    const copy = {};
    Object.keys(value).forEach((key) => {
      copy[key] = deepClone(value[key]);
    });
    return copy;
  }
  return value;
}

function deepMerge(target, source) {
  const output = target && typeof target === 'object' ? deepClone(target) : {};
  if (!source || typeof source !== 'object') return output;
  Object.entries(source).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      output[key] = deepClone(value);
    } else if (value && typeof value === 'object') {
      output[key] = deepMerge(output[key], value);
    } else {
      output[key] = value;
    }
  });
  return output;
}

function fatal(msg) {
  throw new Error(msg);
}

function loadManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    fatal(`Manifest not found: ${manifestPath}`);
  }
  const raw = fs.readFileSync(manifestPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fatal(`Failed to parse manifest ${manifestPath}: ${err.message}`);
  }
  if (parsed.schemaVersion && parsed.schemaVersion !== 1) {
    fatal(`Unsupported schemaVersion ${parsed.schemaVersion} in ${manifestPath}`);
  }
  return parsed;
}

function resolveScriptPath(rootDir, manifest, manifestPath, scriptId) {
  const scriptEntry = manifest.script || `${scriptId}.espruino`;
  const baseDir = path.dirname(manifestPath);
  const scriptPath = path.resolve(rootDir, baseDir, scriptEntry);
  if (!fs.existsSync(scriptPath)) {
    fatal(`Script asset not found for ${scriptId}: ${scriptEntry} (resolved ${scriptPath})`);
  }
  return scriptPath;
}

function loadProgramConfig(rootDir, scriptId, mode, overrides) {
  const manifestPath = path.join(rootDir, `${scriptId}.json`);
  const manifest = loadManifest(manifestPath);
  if (!manifest.modes || typeof manifest.modes !== 'object') {
    fatal(`Manifest ${scriptId} missing "modes" definition`);
  }
  const modeEntry = manifest.modes[mode];
  if (!modeEntry) {
    fatal(`Mode "${mode}" not defined in manifest ${scriptId}`);
  }

  const scriptPath = resolveScriptPath(rootDir, manifest, manifestPath, scriptId);
  const fixtures = deepMerge(manifest.fixtureDefaults || {}, modeEntry.fixtures || {});
  const mergedFixtures = overrides ? deepMerge(fixtures, overrides) : fixtures;

  let globalPayload = deepMerge(manifest.global || {}, modeEntry.global || {});
  const flashConfig = {
    saveOnSend: false,
    ramUpload: false,
  };
  function applyFlash(source) {
    if (!source) return;
    if (Object.prototype.hasOwnProperty.call(source, 'saveOnSend')) {
      flashConfig.saveOnSend = !!source.saveOnSend;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'ramUpload')) {
      flashConfig.ramUpload = !!source.ramUpload;
    }
  }
  applyFlash(manifest.flash);
  applyFlash(modeEntry.flash);

  return {
    manifest,
    manifestPath,
    scriptPath,
    board: manifest.board || 'ESP32',
    modeEntry,
    fixtures: mergedFixtures,
    globalPayload,
    flashConfig,
  };
}

module.exports = {
  deepMerge,
  loadProgramConfig,
};
