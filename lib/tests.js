// Minimal test discovery utilities
//
// Suites are mapped to known test files for now. Each returned test
// includes a stable id (filename), absolute path, and suite name.

const fs = require('fs');
const path = require('path');

let see_error_message_below;

const TEST_FILE_RE = /^test_/;

function loadSuiteExecutionOrder(repoRoot, suite) {
  const configPath = path.join(repoRoot, 'tests', suite, 'testConfig.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (json && json.execution && Array.isArray(json.execution.order)) {
      return json.execution.order;
    }
  } catch (err) {
    see_error_message_below = `Failed to parse ${configPath}: ${err.message}`;
    throw new Error(see_error_message_below);
  }
  return null;
}

function readSuiteManifest(suiteDir) {
  const manifestPath = path.join(suiteDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    see_error_message_below = `Failed to parse ${manifestPath}: ${err.message}`;
    throw new Error(see_error_message_below);
  }

  if (!manifest || !Array.isArray(manifest.order)) {
    see_error_message_below = `${manifestPath} must export an object with an array "order"`;
    throw new Error(see_error_message_below);
  }

  return manifest.order.map((entry, index) => {
    if (typeof entry === 'string') {
      return { path: entry };
    }
    if (entry && typeof entry === 'object' && typeof entry.path === 'string') {
      const normalized = { path: entry.path };
      if (entry.id) normalized.id = entry.id;
      return normalized;
    }
    see_error_message_below = `${manifestPath} entry #${index} must be a string or { path, id? }`;
    throw new Error(see_error_message_below);
  });
}

function discoverSuiteFiles(suiteDir) {
  if (!fs.existsSync(suiteDir)) return [];
  return fs
    .readdirSync(suiteDir)
    .filter((name) => name.endsWith('.js') && TEST_FILE_RE.test(name))
    .sort()
    .map((name) => path.join(suiteDir, name));
}

function pushTest(tests, seen, suite, filePath, explicitId) {
  const normalizedPath = path.normalize(filePath);
  if (!fs.existsSync(normalizedPath)) return;
  const id = explicitId || path.basename(normalizedPath);
  if (!TEST_FILE_RE.test(id)) return;
  const key = `${suite}::${normalizedPath}`;
  if (seen.has(key)) return;
  seen.add(key);
  tests.push({ id, path: normalizedPath, suite });
}

function resolveSuiteTests(repoRoot, target, requestedSuites, options = {}) {
  const tests = [];
  const seen = new Set();
  const executionOrders = options.executionOrders || {};

  requestedSuites.forEach((suite) => {
    const suiteDir = path.join(repoRoot, 'tests', suite);
    let manifestEntries = null;
    const executionOrder = executionOrders[suite] || loadSuiteExecutionOrder(repoRoot, suite);
    if (executionOrder) {
      const sourceLabel = `tests/${suite}/testConfig.json execution.order`;
      manifestEntries = executionOrder.map((entry, index) => {
        if (typeof entry === 'string') {
          return { path: entry, source: sourceLabel };
        }
        if (entry && typeof entry === 'object' && typeof entry.path === 'string') {
          const normalized = { path: entry.path, source: sourceLabel };
          if (entry.id) normalized.id = entry.id;
          return normalized;
        }
        see_error_message_below = `Suite ${suite} execution.order entry #${index} must be a string or { path, id }`;
        throw new Error(see_error_message_below);
      });
    } else {
      const manifest = readSuiteManifest(suiteDir);
      manifestEntries = manifest
        ? manifest.map(({ path: p, id }) => ({ path: p, id, source: `tests/${suite}/manifest.json` }))
        : null;
    }
    const manifestSet = new Set();
    const appendedTests = [];

    if (manifestEntries) {
      manifestEntries.forEach(({ path: relativePath, id, source }) => {
        const resolvedPath = path.resolve(suiteDir, relativePath);
        const relativeToRepo = path.relative(repoRoot, resolvedPath);
        if (relativeToRepo.startsWith('..')) {
          see_error_message_below = `Suite ${suite} ${source} references ${relativePath}, which resolves outside the repository`;
          throw new Error(see_error_message_below);
        }
        if (!fs.existsSync(resolvedPath)) {
          see_error_message_below = `Suite ${suite} ${source} references ${relativePath}, but the file does not exist`;
          throw new Error(see_error_message_below);
        }
        const normalizedPath = path.normalize(resolvedPath);
        manifestSet.add(normalizedPath);
        pushTest(tests, seen, suite, normalizedPath, id);
      });
    }

    const fallbackFiles = discoverSuiteFiles(suiteDir);
    fallbackFiles.forEach((file) => {
      const normalizedFile = path.normalize(file);
      if (manifestSet.size > 0) {
        if (!manifestSet.has(normalizedFile)) {
          appendedTests.push({ path: normalizedFile });
        }
        return;
      }
      pushTest(tests, seen, suite, normalizedFile);
    });

    appendedTests.forEach(({ path: appendedPath }) => {
      pushTest(tests, seen, suite, appendedPath);
    });
  });

  return tests;
}

module.exports = { resolveSuiteTests };
