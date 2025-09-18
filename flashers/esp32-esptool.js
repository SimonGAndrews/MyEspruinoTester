// ESP32-family flasher using esptool.py
//
// Validates firmware artifacts and spawns esptool.py with the
// correct arguments derived from the board manifest. Host GPIO is not used;
// rely on esptool's DTR/RTS (default_reset) or USB Serial-JTAG (usb_reset).

const { spawn } = require('child_process');
const path = require('path');
// No host GPIO helpers

/**
 * No-op: esptool handles boot/reset via --before/--after.
 * Keep these to preserve the adapter interface.
 */
async function enterBootloader() { return {}; }
async function exitBootloader() { /* no-op */ }

/**
 * No-op resource release (no host GPIO allocated).
 */
function releaseResources() { /* no-op */ }

/**
 * Validate firmware artifacts exist and carry offsets.
 * @param {{versionProvided:boolean,requiresVersion:boolean,firmwareDir:string,firmwareDirExists:boolean,artifacts:Array}} firmwareInfo
 */
function ensureArtifacts(firmwareInfo) {
  if (!firmwareInfo.versionProvided && firmwareInfo.requiresVersion) {
    throw new Error('Firmware version is required but was not provided.');
  }
  if (firmwareInfo.versionProvided && !firmwareInfo.firmwareDirExists) {
    throw new Error(`Firmware directory not found: ${firmwareInfo.firmwareDir}`);
  }
  const missing = firmwareInfo.artifacts.filter(item => !item.exists);
  if (missing.length) {
    const list = missing.map(item => `${item.name} (${item.filename})`).join(', ');
    throw new Error(`Missing firmware artifacts: ${list}`);
  }
  const noOffset = firmwareInfo.artifacts.filter(item => !item.offset);
  if (noOffset.length) {
    const list = noOffset.map(item => item.name).join(', ');
    throw new Error(`Firmware artifacts missing flash offsets: ${list}`);
  }
}

/**
 * Build esptool.py argv array from manifest + artifacts.
 * @param {Object} manifest
 * @param {Object} firmwareInfo
 * @param {{port:string,baud?:number}} options
 * @returns {string[]}
 */
function buildCommandArgs(manifest, firmwareInfo, options) {
  const flashConfig = manifest.flash || {};
  const chip = flashConfig.chip;
  const baud = options.baud || flashConfig.baud || 921600;
  const mode = flashConfig.mode || 'dio';
  const freq = flashConfig.freq || '40m';
  const size = flashConfig.size || flashConfig.flashSize || 'detect';
  const compress = flashConfig.compress === true;
  const extraArgs = Array.isArray(flashConfig.extraArgs) ? flashConfig.extraArgs.slice() : [];

  const args = [];
  if (chip) {
    args.push('--chip', chip);
  }
  args.push('--port', options.port);
  args.push('--baud', String(baud));
  if (extraArgs.length) {
    args.push(...extraArgs);
  }
  args.push('write_flash');
  if (compress) {
    args.push('--compress');
  }
  args.push('--flash_mode', mode);
  args.push('--flash_freq', freq);
  args.push('--flash_size', size);

  firmwareInfo.artifacts.forEach(item => {
    args.push(item.offset, path.resolve(item.path));
  });

  return args;
}

/**
 * Spawn esptool.py and stream stdio.
 * @param {string} command
 * @param {string[]} args
 * @param {Console} logger
 * @returns {Promise<void>}
 */
function runCommand(command, args, logger) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`esptool exited with code ${code}`));
    });
  });
}


/**
 * Attempt to run esptool using a sequence of commands:
 * 1) preferred command (manifest/env/--esptool)
 * 2) 'esptool' (some distros install this name)
 * 3) 'python3 -m esptool'
 */
async function tryEsptool(command, args, logger) {
  const tries = [
    { cmd: command, prefix: [] },
    { cmd: 'esptool', prefix: [] },
    { cmd: 'python3', prefix: ['-m','esptool'] },
  ];
  let lastErr;
  for (const t of tries) {
    try {
      logger.log?.(`[flasher] trying: ${t.cmd} ${[...t.prefix, ...args].join(' ')}`);
      await runCommand(t.cmd, [...t.prefix, ...args], logger);
      return; // success
    } catch (e) {
      lastErr = e;
      if (e && (e.code === 'ENOENT' || (''+e.message).includes('ENOENT'))) continue;
      // Non-spawn errors: bubble up immediately
      throw e;
    }
  }
  // If we get here, all attempts failed
  throw lastErr || new Error('Unable to execute esptool with any known method');
}

/**
 * Flash entrypoint used by the orchestrator.
 * Validates firmware and runs esptool.py (no host GPIO required).
 * @param {Object} opts
 * @param {string} opts.boardName
 * @param {Object} opts.manifest
 * @param {Object} opts.firmwareInfo
 * @param {string} [opts.version]
 * @param {string} [opts.port]
 * @param {string} [opts.esptoolPath]
 * @param {number} [opts.baud]
 * @param {boolean} [opts.dryRun]
 * @param {Console} [opts.logger]
 */
async function flash({
  boardName,
  manifest,
  firmwareInfo,
  version,
  port,
  esptoolPath,
  baud,
  dryRun = false,
  logger = console,
}) {
  ensureArtifacts(firmwareInfo);

  const flashConfig = manifest.flash || {};
  const command = esptoolPath || process.env.ESPTOOL || 'esptool.py';
  const resolvedPort = port || (manifest?.ports?.serial?.[0]);
  if (!resolvedPort) {
    throw new Error('Serial port not provided and no default available in manifest. Use --port <device>.');
  }
  if (resolvedPort.includes('*')) {
    logger.warn?.('[flasher] Warning: selected serial port contains wildcard; consider specifying --port explicitly.');
  }

  const args = buildCommandArgs(manifest, firmwareInfo, {
    port: resolvedPort,
    baud,
  });

  logger.log?.(`[flasher] Prepared esptool command: ${command} ${args.join(' ')}`);
  if (dryRun) {
    logger.log?.('[flasher] Dry run enabled; skipping flashing operation.');
    return;
  }

  let resources;
  try {
    resources = await enterBootloader(manifest?.gpio?.signals, logger);
    await tryEsptool(command, args, logger);
    await exitBootloader(resources, logger);
  } finally {
    releaseResources(resources);
  }

  logger.log?.(`[flasher] Flash completed for ${boardName} (${version || 'unspecified version'}).`);
}

module.exports = {
  type: 'esp32-esptool',
  flash,
};
