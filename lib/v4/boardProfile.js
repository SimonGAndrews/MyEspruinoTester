/**
 * v4 board metadata loader.
 *
 * Loads typed files from boards/<board>/:
 *   - board.json   (required)
 *   - fixture.json (optional)
 *   - cli.json     (optional)
 *
 * Each file may expose a metadataVersion for future schema validation.
 * The loader normalises these files into a partial config object that
 * seeds config.board, config.fixture, config.cli, and config.loader.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function assertJsonFile(filePath, optional = false) {
  if (!fs.existsSync(filePath)) {
    if (optional) return null;
    throw new Error(`Board metadata file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON (${filePath}): ${err.message}`);
  }
}

function normaliseFixturePayload(payload) {
  if (!payload) return {};
  if (payload.fixture && typeof payload.fixture === 'object') {
    return payload.fixture;
  }
  if (payload.fixtures && typeof payload.fixtures === 'object') {
    return payload.fixtures;
  }
  const clone = { ...payload };
  delete clone.metadataVersion;
  return clone;
}

function normaliseCliPayload(payload) {
  if (!payload) {
    return { cli: {}, loader: {} };
  }

  const cliBranch = payload.cli && typeof payload.cli === 'object' ? payload.cli : {};
  const loaderBranch = payload.loader && typeof payload.loader === 'object' ? payload.loader : {};

  // Allow legacy keys at top-level (other than metadataVersion / cli / loader)
  const clone = { ...payload };
  delete clone.metadataVersion;
  delete clone.cli;
  delete clone.loader;

  const extraCli = clone.cli && typeof clone.cli === 'object' ? clone.cli : {};

  return {
    cli: { ...cliBranch, ...extraCli },
    loader: { ...loaderBranch },
  };
}

function listBoards(root = REPO_ROOT) {
  const boardsDir = path.join(root, 'boards');
  if (!fs.existsSync(boardsDir)) return [];
  return fs
    .readdirSync(boardsDir)
    .filter((entry) => {
      const full = path.join(boardsDir, entry);
      if (!fs.statSync(full).isDirectory()) return false;
      return fs.existsSync(path.join(full, 'board.json'));
    })
    .sort();
}

function loadBoardProfile(boardName, root = REPO_ROOT) {
  const boardDir = path.join(root, 'boards', boardName);
  if (!fs.existsSync(boardDir) || !fs.statSync(boardDir).isDirectory()) {
    throw new Error(`Board directory not found: ${boardDir}`);
  }

  const boardPath = path.join(boardDir, 'board.json');
  const boardPayload = assertJsonFile(boardPath);

  const fixturePath = path.join(boardDir, 'fixture.json');
  const fixturePayload = assertJsonFile(fixturePath, true);

  const cliPath = path.join(boardDir, 'cli.json');
  const cliPayload = assertJsonFile(cliPath, true);
  const cliBranches = normaliseCliPayload(cliPayload);

  const config = {
    board: boardPayload,
    fixture: normaliseFixturePayload(fixturePayload),
    cli: cliBranches.cli,
    loader: cliBranches.loader,
  };

  return {
    boardName,
    boardDir,
    files: {
      board: boardPath,
      fixture: fs.existsSync(fixturePath) ? fixturePath : null,
      cli: fs.existsSync(cliPath) ? cliPath : null,
    },
    payloads: {
      board: boardPayload,
      fixture: fixturePayload,
      cli: cliPayload,
    },
    config,
  };
}

function boardProfileToLegacy(profile) {
  const manifest = { ...(profile?.config?.board || {}) };
  const ports = profile?.config?.loader?.ports;
  if (ports && !manifest.ports) {
    manifest.ports = ports;
  }
  if (profile?.config?.cli && Object.keys(profile.config.cli).length) {
    manifest.cli = { ...(manifest.cli || {}), ...profile.config.cli };
  }
  if (profile?.config?.fixture && Object.keys(profile.config.fixture).length) {
    manifest.fixtures = profile.config.fixture;
  }
  return {
    manifest,
    manifestPath: profile?.files?.board,
  };
}

module.exports = {
  REPO_ROOT,
  listBoards,
  loadBoardProfile,
  boardProfileToLegacy,
};
