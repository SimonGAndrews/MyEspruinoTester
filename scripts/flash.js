#!/usr/bin/env node
// Flashing CLI
//
// Wraps pluggable flashing adapters (esp32-esptool) to program devices
// using prebuilt firmware bundles defined by board manifests.

const { REPO_ROOT, listBoards, loadManifest, resolveSuites, resolveFirmware } = require('../lib/manifest');
const { getAdapter } = require('../flashers');

/**
 * Normalize CLI --kebab-case to camelCase keys.
 * @param {string} key
 * @returns {string}
 */
function normalizeKey(key) {
  return key
    .split('-')
    .map((part, idx) => (idx === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

/**
 * Parse CLI arguments into a simple object.
 * Supports --key=value, --key value and short flags (-b, -v, -p, -s, -n, -l, -h).
 * @param {string[]} argv process.argv
 * @returns {Object}
 */
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('-')) {
      args._.push(arg);
      continue;
    }
    if (arg.startsWith('--')) {
      const [rawKey, rawValue] = arg.slice(2).split('=');
      const key = normalizeKey(rawKey);
      if (rawValue !== undefined) {
        args[key] = rawValue;
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith('-')) {
          args[key] = next;
          i++;
        } else {
          args[key] = true;
        }
      }
      continue;
    }
    const flag = arg.slice(1);
    const next = argv[i + 1];
    switch (flag) {
      case 'b':
        args.device = next;
        i++;
        break;
      case 'v':
        args.version = next;
        i++;
        break;
      case 's':
        args.suites = next;
        i++;
        break;
      case 'p':
        args.port = next;
        i++;
        break;
      case 'l':
        args.list = true;
        break;
      case 'n':
        args.dryRun = true;
        break;
      case 'h':
        args.help = true;
        break;
      default:
        args[flag] = true;
    }
  }
  return args;
}

/**
 * Print usage help for the flashing script.
 */
function printUsage() {
  console.log(`Usage: node scripts/flash.js --board <name> --version <firmwareVersion> [options]
Options:
  --board, --device, -b     Board manifest name
  --version, -v             Firmware version directory under firmware/<board>/
  --port, -p                Serial port (defaults to first entry in manifest if available)
  --baud                    Override flashing baud rate
  --suites, -s              Validate suite availability before flashing
  --esptool                 Path to esptool.py (defaults to system PATH)
  --dry-run, -n             Print command and exit without flashing
  --list, -l                List available board manifests
  --help, -h                Show this help
`);
}

/**
 * Entry point. Validates inputs, prepares adapter and runs flashing.
 */
async function main() {
  const repoRoot = REPO_ROOT;
  const args = parseArgs(process.argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (args.list) {
    const boards = listBoards(repoRoot);
    console.log('Available boards:');
    boards.forEach(name => console.log(`  - ${name}`));
    process.exit(0);
  }

  const boardName = args.board || args.device || args._[0];
  if (!boardName) {
    console.error('Error: --board <name> is required.');
    printUsage();
    process.exit(1);
  }

  let manifest;
  let manifestPath;
  try {
    const loaded = loadManifest(boardName, repoRoot);
    manifest = loaded.manifest;
    manifestPath = loaded.manifestPath;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (!manifest.flash || !manifest.flash.type) {
    console.error('Error: manifest is missing flash.type; cannot determine adapter.');
    process.exit(1);
  }

  const versionArg = args.version || args.firmwareVersion || args.fwVersion;
  const firmwareInfo = resolveFirmware(manifest, boardName, versionArg, repoRoot);

  if (firmwareInfo.requiresVersion && !firmwareInfo.versionProvided) {
    console.error('Error: firmware version is required (manifest pattern includes %v). Supply --version.');
    process.exit(1);
  }
  if (firmwareInfo.versionProvided && !firmwareInfo.firmwareDirExists) {
    console.error(`Error: firmware directory does not exist: ${firmwareInfo.firmwareDir}`);
    process.exit(1);
  }
  const missing = firmwareInfo.artifacts.filter(item => !item.exists);
  if (missing.length) {
    const list = missing.map(item => `${item.name} (${item.filename})`).join(', ');
    console.error(`Error: missing firmware artifacts: ${list}`);
    process.exit(1);
  }

  if (args.suites) {
    const suitesInfo = resolveSuites(manifest, args.suites);
    if (suitesInfo.unknown.length) {
      console.error(`Error: unknown suites requested: ${suitesInfo.unknown.join(', ')}.`);
      console.error(`Available suites for ${boardName}: ${suitesInfo.available.join(', ') || '(none listed)'}`);
      process.exit(1);
    }
  }

  let adapter;
  try {
    adapter = getAdapter(manifest.flash.type);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const dryRun = Boolean(args.dryRun);
  const baud = args.baud ? Number(args.baud) : undefined;
  const port = args.port;
  const esptoolPath = args.esptool;

  console.log('Flash Summary');
  console.log('============');
  console.log(`Board:      ${boardName}`);
  console.log(`Manifest:   ${manifestPath}`);
  console.log(`Version:    ${versionArg || '(none)'}`);
  console.log(`Adapter:    ${manifest.flash.type}`);
  console.log(`Port:       ${port || manifest?.ports?.serial?.[0] || '(not specified)'}`);
  console.log(`Baud:       ${baud || manifest.flash.baud || 'default'}`);
  console.log(`Dry run:    ${dryRun ? 'yes' : 'no'}`);

  try {
    await adapter.flash({
      boardName,
      manifest,
      firmwareInfo,
      version: versionArg,
      port,
      esptoolPath,
      baud,
      dryRun,
      logger: console,
    });
  } catch (err) {
    console.error(`Flashing failed: ${err.message}`);
    process.exit(1);
  }
}

main();
