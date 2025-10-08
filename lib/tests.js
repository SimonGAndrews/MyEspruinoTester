// Minimal test discovery utilities
//
// Suites are mapped to known test files for now. Each returned test
// includes a stable id (filename), absolute path, and suite name.

const fs = require('fs');
const path = require('path');

const TEST_FILE_RE = /^test_/;

function readSuiteManifest(suiteDir) {
  const manifestPath = path.join(suiteDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${manifestPath}: ${err.message}`);
  }

  if (!manifest || !Array.isArray(manifest.order)) {
    throw new Error(`${manifestPath} must export an object with an array "order"`);
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
    throw new Error(`${manifestPath} entry #${index} must be a string or { path, id? }`);
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

function resolveSuiteTests(repoRoot, target, requestedSuites) {
  const tests = [];
  const seen = new Set();

  requestedSuites.forEach((suite) => {
    const suiteDir = path.join(repoRoot, 'tests', suite);
    const manifestEntries = readSuiteManifest(suiteDir);
    const manifestSet = new Set();

    if (manifestEntries) {
      manifestEntries.forEach(({ path: relativePath, id }) => {
        const resolvedPath = path.resolve(suiteDir, relativePath);
        const relativeToRepo = path.relative(repoRoot, resolvedPath);
        if (relativeToRepo.startsWith('..')) {
          throw new Error(`Suite ${suite} manifest references ${relativePath}, which resolves outside the repository`);
        }
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Suite ${suite} manifest references ${relativePath}, but it does not exist`);
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
          throw new Error(`Suite ${suite} manifest is missing ${path.basename(file)}. Include it or remove the file.`);
        }
        return;
      }
      pushTest(tests, seen, suite, normalizedFile);
    });
  });

  return tests;
}

module.exports = { resolveSuiteTests };
