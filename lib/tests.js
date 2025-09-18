// Minimal test discovery utilities
//
// Suites are mapped to known test files for now. Each returned test
// includes a stable id (filename), absolute path, and suite name.

const fs = require('fs');
const path = require('path');

function resolveSuiteTests(repoRoot, target, requestedSuites) {
  const tests = [];
  function pushIfFile(suite, p) {
    if (fs.existsSync(p)) tests.push({ id: path.basename(p), path: p, suite });
  }

  if (requestedSuites.includes('javascript-core')) {
    // Core JavaScript examples (sync + async)
    pushIfFile('javascript-core', path.join(repoRoot, 'tests', 'javascript-core', 'test_add_numbers.js'));
    pushIfFile('javascript-core', path.join(repoRoot, 'tests', 'javascript-core', 'test_split_string.js'));
    pushIfFile('javascript-core', path.join(repoRoot, 'tests', 'javascript-core', 'test_async_timeout.js'));
    // Keep original conformance example as an extra check
    pushIfFile('javascript-core', path.join(repoRoot, 'tests', 'generic', 'test_abstract_comparison.js'));
  }

  if (requestedSuites.includes('wifi-connectivity')) {
    // WiFi API smoke tests (no credentials required)
    pushIfFile('wifi-connectivity', path.join(repoRoot, 'tests', 'wifi-connectivity', 'test_wifi_module_present.js'));
    pushIfFile('wifi-connectivity', path.join(repoRoot, 'tests', 'wifi-connectivity', 'test_wifi_scan_basic.js'));
    pushIfFile('wifi-connectivity', path.join(repoRoot, 'tests', 'wifi-connectivity', 'test_wifi_api_methods.js'));
  }
  if (requestedSuites.includes('javascript-upstream')) {
    pushIfFile('javascript-upstream', path.join(repoRoot, 'tests', 'javascript-upstream', 'test_constructor.js'));
    pushIfFile('javascript-upstream', path.join(repoRoot, 'tests', 'javascript-upstream', 'test_array_concat.js'));
    pushIfFile('javascript-upstream', path.join(repoRoot, 'tests', 'javascript-upstream', 'test_eval.js'));
    pushIfFile('javascript-upstream', path.join(repoRoot, 'tests', 'javascript-upstream', 'test_array_reduce.js'));
    pushIfFile('javascript-upstream', path.join(repoRoot, 'tests', 'javascript-upstream', 'test_function_apply.js'));
  }

  return tests;
}

module.exports = { resolveSuiteTests };
