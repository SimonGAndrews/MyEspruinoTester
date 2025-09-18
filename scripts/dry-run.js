#!/usr/bin/env node
// Dry-run CLI
//
// Validates board manifests, test suite selections, and firmware bundle presence
// without opening devices or flashing. Shared helpers come from lib/manifest.js.

const { REPO_ROOT, listBoards, loadManifest, resolveSuites, resolveFirmware } = require('../lib/manifest');

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
 * Supports --key=value, --key value and short flags (-b, -s, -v, -l, -h).
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
      case 's':
        args.suites = next;
        i++;
        break;
      case 'v':
        args.version = next;
        i++;
        break;
      case 'l':
        args.list = true;
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
 * Print usage help for the dry-run script.
 */
function printUsage() {
  console.log(`Usage: node scripts/dry-run.js --board <name> [--version <firmwareVersion>] [--suites suite1,suite2]
Options:
  --board, --device, -b   Board manifest name (required unless --list)
  --version, -v           Firmware version directory under firmware/<board>/
  --suites, -s            Comma separated list of suites to validate
  --list, -l              List available board manifests
  --help, -h              Show this help
`);
}

/**
 * Entry point. Validates inputs and prints a summary of detected configuration.
 */
function main() {
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
    console.error('Error: board/device name is required. Use --board <name> or --list to view options.');
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

  const suitesInfo = resolveSuites(manifest, args.suites);
  if (suitesInfo.unknown.length) {
    console.error(`Error: unknown suites requested: ${suitesInfo.unknown.join(', ')}.`);
    console.error(`Available suites for ${boardName}: ${suitesInfo.available.join(', ') || '(none listed)'}`);
    process.exit(1);
  }

  const versionArg = args.version || args.firmwareVersion || args.fwVersion;
  const firmwareInfo = resolveFirmware(manifest, boardName, versionArg, repoRoot);

  const summary = {
    board: boardName,
    manifestPath,
    suites: suitesInfo.requested,
    availableSuites: suitesInfo.available,
    firmware: firmwareInfo,
  };

  console.log('Dry Run Summary');
  console.log('================');
  console.log(`Board:           ${summary.board}`);
  console.log(`Manifest:        ${summary.manifestPath}`);
  console.log(`Suites:          ${summary.suites.join(', ') || '(none)'}`);
  console.log(`Available suites:${summary.availableSuites.join(', ') || '(none)'}`);

  if (!summary.firmware.versionProvided) {
    if (summary.firmware.requiresVersion) {
      console.warn('Warning: firmware version is required (pattern includes %v) but no --version was provided.');
    } else {
      console.log('Firmware:        no version specified (not required by manifest).');
    }
  } else {
    console.log(`Firmware dir:    ${summary.firmware.firmwareDir}`);
    console.log(`Dir exists:      ${summary.firmware.firmwareDirExists ? 'yes' : 'no'}`);
    if (!summary.firmware.firmwareDirExists) {
      console.warn('Warning: firmware directory does not exist.');
    }
    if (summary.firmware.artifacts.length) {
      console.log('Artifacts:');
      summary.firmware.artifacts.forEach(item => {
        const status = item.exists ? 'ok' : 'missing';
        console.log(`  - ${item.name}: ${item.filename} @ ${item.offset || 'n/a'} (${status})`);
      });
    } else {
      console.log('Artifacts:       none defined in manifest.');
    }
  }

  if (manifest.flash && manifest.flash.type) {
    console.log(`Flashing via:    ${manifest.flash.type}`);
  } else {
    console.warn('Warning: manifest missing flash.type; adapter selection may fail.');
  }

  console.log('Dry run completed without executing flashing or device communication.');
}

main();
