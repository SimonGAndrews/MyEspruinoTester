const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveSuiteTests } = require('../tests');

function createFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '// test stub', 'utf8');
}

function withTempRepo(callback) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'espruinotester-'));
  try {
    callback(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function mapIds(tests) {
  return tests.map((t) => `${t.suite}:${path.basename(t.path)}`);
}

function expectThrows(fn, pattern) {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    if (pattern) {
      assert.match(err.message, pattern);
    }
  }
  if (!threw) {
    throw new Error('Expected function to throw');
  }
}

function runTests() {
  withTempRepo((repoRoot) => {
    const suiteDir = path.join(repoRoot, 'tests', 'alpha-suite');
    createFile(path.join(suiteDir, 'test_setup.js'));
    createFile(path.join(suiteDir, 'test_second.js'));
    createFile(path.join(suiteDir, 'test_third.js'));
    createFile(path.join(repoRoot, 'tests', 'shared', 'test_shared.js'));

    fs.writeFileSync(
      path.join(suiteDir, 'manifest.json'),
      JSON.stringify(
        {
          version: 1,
          order: ['test_second.js', '../shared/test_shared.js', 'test_setup.js', 'test_third.js'],
        },
        null,
        2
      ),
      'utf8'
    );

    const ordered = resolveSuiteTests(repoRoot, null, ['alpha-suite']);
    assert.deepStrictEqual(mapIds(ordered), [
      'alpha-suite:test_second.js',
      'alpha-suite:test_shared.js',
      'alpha-suite:test_setup.js',
      'alpha-suite:test_third.js',
    ]);
  });

  withTempRepo((repoRoot) => {
    const suiteDir = path.join(repoRoot, 'tests', 'beta-suite');
    createFile(path.join(suiteDir, 'test_b.js'));
    createFile(path.join(suiteDir, 'test_a.js'));
    createFile(path.join(suiteDir, 'not_a_test.txt'));

    const ordered = resolveSuiteTests(repoRoot, null, ['beta-suite']);
    assert.deepStrictEqual(mapIds(ordered), [
      'beta-suite:test_a.js',
      'beta-suite:test_b.js',
    ]);
  });

  withTempRepo((repoRoot) => {
    const suiteDir = path.join(repoRoot, 'tests', 'gamma-suite');
    createFile(path.join(suiteDir, 'test_in_manifest.js'));
    createFile(path.join(suiteDir, 'test_missing.js'));

    fs.writeFileSync(
      path.join(suiteDir, 'manifest.json'),
      JSON.stringify(
        {
          version: 1,
          order: ['test_in_manifest.js'],
        },
        null,
        2
      ),
      'utf8'
    );

    expectThrows(
      () => resolveSuiteTests(repoRoot, null, ['gamma-suite']),
      /manifest is missing test_missing\.js/
    );
  });

  withTempRepo((repoRoot) => {
    const suiteDir = path.join(repoRoot, 'tests', 'delta-suite');
    createFile(path.join(suiteDir, 'test_present.js'));

    fs.writeFileSync(
      path.join(suiteDir, 'manifest.json'),
      JSON.stringify(
        {
          version: 1,
          order: ['test_missing.js'],
        },
        null,
        2
      ),
      'utf8'
    );

    expectThrows(
      () => resolveSuiteTests(repoRoot, null, ['delta-suite']),
      /does not exist/
    );
  });
}

runTests();
