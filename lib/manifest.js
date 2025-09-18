// Utilities for loading and interpreting board manifests and firmware bundles.
//
// A "manifest" is a JSON file in boards/<BoardName>.json describing:
// - firmware.pattern and firmware.artifacts (filenames with offsets)
// - flash.type (adapter), chip/baud/mode/freq, ports hints
// - suites.available/default (declares runnable test sets)
//
// Firmware bundles are stored under firmware/<BoardName>/<Version>/ and contain
// the artifacts referenced by the manifest (e.g., bootloader.bin, partition-table.bin,
// and the application image whose name is derived from firmware.pattern).
//
// These helpers are shared by CLIs like scripts/dry-run.js and scripts/flash.js.

const fs = require('fs');
const path = require('path');

// Repo root used to resolve relative paths from within the library
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * List available board manifest names (without .json extension).
 * @param {string} [root] - Repository root (defaults to detected root)
 * @returns {string[]} Sorted list of board names
 */
function listBoards(root = REPO_ROOT) {
  const boardsDir = path.join(root, 'boards');
  if (!fs.existsSync(boardsDir)) return [];
  return fs.readdirSync(boardsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.basename(f, '.json'))
    .sort();
}

/**
 * Compute absolute path to the manifest for a given board.
 * @param {string} boardName - Name like "ESP32C3"
 * @param {string} [root]
 * @returns {string} Absolute path to boards/<boardName>.json
 */
function getManifestPath(boardName, root = REPO_ROOT) {
  return path.join(root, 'boards', `${boardName}.json`);
}

/**
 * Load and parse the manifest JSON for a board.
 * Throws if the file does not exist or JSON is invalid.
 * @param {string} boardName
 * @param {string} [root]
 * @returns {{manifest: object, manifestPath: string}}
 */
function loadManifest(boardName, root = REPO_ROOT) {
  const manifestPath = getManifestPath(boardName, root);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Board manifest not found: ${manifestPath}`);
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return { manifest, manifestPath };
  } catch (err) {
    throw new Error(`Failed to parse manifest ${manifestPath}: ${err.message}`);
  }
}

/**
 * Resolve which test suites should be run given a manifest and optional user input.
 * - If suitesArg provided (comma-separated), validate against suites.available
 * - Otherwise default to suites.default (or suites.available if default missing)
 * @param {object} manifest
 * @param {string|undefined} suitesArg - e.g., "javascript-core,hardware-io"
 * @returns {{available: string[], defaults: string[], requested: string[], unknown: string[]}}
 */
function resolveSuites(manifest, suitesArg) {
  const available = Array.isArray(manifest?.suites?.available) ? manifest.suites.available : [];
  const defaults = Array.isArray(manifest?.suites?.default) && manifest.suites.default.length ? manifest.suites.default : available;
  const requested = suitesArg
    ? suitesArg.split(',').map(s => s.trim()).filter(Boolean)
    : defaults;
  const unknown = requested.filter(s => !available.includes(s));
  return { available, defaults, requested, unknown };
}

/**
 * Resolve firmware bundle paths and existence based on the manifest and version.
 * - Pattern substitutions: %v -> version, %pattern% -> firmware.pattern with %v substituted
 * - Verifies folder existence and whether each artifact file exists
 * @param {object} manifest
 * @param {string} boardName
 * @param {string|undefined} version - firmware/<boardName>/<version>/
 * @param {string} [root]
 * @returns {{
 *   requiresVersion: boolean,
 *   versionProvided: boolean,
 *   firmwareDir: string|null,
 *   firmwareDirExists: boolean,
 *   artifacts: Array<{name:string, filename:string, offset:string|null, path:string, exists:boolean}>,
 *   resolvedPattern: string
 * }}
 */
function resolveFirmware(manifest, boardName, version, root = REPO_ROOT) {
  const firmware = manifest.firmware || {};
  const pattern = firmware.pattern || '';
  const requiresVersion = pattern.includes('%v');
  const versionProvided = Boolean(version);
  const firmwareDir = versionProvided ? path.join(root, 'firmware', boardName, version) : null;
  const firmwareDirExists = firmwareDir ? fs.existsSync(firmwareDir) : false;
  const resolvedPattern = versionProvided ? pattern.replace(/%v/g, version) : pattern;

  const artifacts = Array.isArray(firmware.artifacts) ? firmware.artifacts.map(item => {
    let filename = item.filename || '';
    if (filename.includes('%pattern%')) {
      filename = filename.replace('%pattern%', resolvedPattern);
    }
    if (versionProvided) {
      filename = filename.replace(/%v/g, version);
    }
    const filePath = firmwareDir ? path.join(firmwareDir, filename) : filename;
    const exists = firmwareDirExists && fs.existsSync(filePath);
    return {
      name: item.name || filename,
      filename,
      offset: item.offset || null,
      path: filePath,
      exists,
    };
  }) : [];

  return {
    requiresVersion,
    versionProvided,
    firmwareDir,
    firmwareDirExists,
    artifacts,
    resolvedPattern,
  };
}

module.exports = {
  REPO_ROOT,
  listBoards,
  loadManifest,
  resolveSuites,
  resolveFirmware,
};
