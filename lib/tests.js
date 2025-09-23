// Minimal test discovery utilities
//
// Suites are mapped to known test files for now. Each returned test
// includes a stable id (filename), absolute path, and suite name.

const fs = require('fs');
const path = require('path');

const TEST_FILE_RE = /^test_/;

function resolveSuiteTests(repoRoot, target, requestedSuites) {
  const tests = [];
  function pushIfFile(suite, p) {
    const base = path.basename(p);
    if (fs.existsSync(p) && TEST_FILE_RE.test(base)) tests.push({ id: base, path: p, suite });
  }

  if (requestedSuites.includes('javascript-core')) {
    pushIfFile('javascript-core', path.join(repoRoot, 'tests', 'javascript-core', 'test_add_numbers.js'));
    pushIfFile('javascript-core', path.join(repoRoot, 'tests', 'javascript-core', 'test_split_string.js'));
    pushIfFile('javascript-core', path.join(repoRoot, 'tests', 'javascript-core', 'test_async_timeout.js'));
    pushIfFile('javascript-core', path.join(repoRoot, 'tests', 'generic', 'test_abstract_comparison.js'));
  }

  if (requestedSuites.includes('javascript-upstream')) {
    pushIfFile('javascript-upstream', path.join(repoRoot, 'tests', 'javascript-upstream', 'test_constructor.js'));
    pushIfFile('javascript-upstream', path.join(repoRoot, 'tests', 'javascript-upstream', 'test_array_concat.js'));
    pushIfFile('javascript-upstream', path.join(repoRoot, 'tests', 'javascript-upstream', 'test_eval.js'));
    pushIfFile('javascript-upstream', path.join(repoRoot, 'tests', 'javascript-upstream', 'test_array_reduce.js'));
    pushIfFile('javascript-upstream', path.join(repoRoot, 'tests', 'javascript-upstream', 'test_function_apply.js'));
  }

  if (requestedSuites.includes('wifi-core')) {
    const dir = path.join(repoRoot, 'tests', 'wifi-core');
    fs.readdirSync(dir).filter(f=>f.endsWith('.js') && TEST_FILE_RE.test(f)).forEach(f=>{
      pushIfFile('wifi-core', path.join(dir, f));
    });
  }
  if (requestedSuites.includes('wifi-station')) {
    const dir = path.join(repoRoot, 'tests', 'wifi-station');
    fs.readdirSync(dir).filter(f=>f.endsWith('.js') && TEST_FILE_RE.test(f)).forEach(f=>{
      pushIfFile('wifi-station', path.join(dir, f));
    });
  }
  if (requestedSuites.includes('wifi-http-client')) {
    const dir = path.join(repoRoot, 'tests', 'wifi-http-client');
    fs.readdirSync(dir).filter(f=>f.endsWith('.js') && TEST_FILE_RE.test(f)).forEach(f=>{
      pushIfFile('wifi-http-client', path.join(dir, f));
    });
  }
  if (requestedSuites.includes('wifi-http-server')) {
    const dir = path.join(repoRoot, 'tests', 'wifi-http-server');
    fs.readdirSync(dir).filter(f=>f.endsWith('.js') && TEST_FILE_RE.test(f)).forEach(f=>{
      pushIfFile('wifi-http-server', path.join(dir, f));
    });
  }
  if (requestedSuites.includes('wifi-mqtt-ws')) {
    const dir = path.join(repoRoot, 'tests', 'wifi-mqtt-ws');
    fs.readdirSync(dir).filter(f=>f.endsWith('.js') && TEST_FILE_RE.test(f)).forEach(f=>{
      pushIfFile('wifi-mqtt-ws', path.join(dir, f));
    });
  }
  if (requestedSuites.includes('wifi-ap')) {
    const dir = path.join(repoRoot, 'tests', 'wifi-ap');
    fs.readdirSync(dir).filter(f=>f.endsWith('.js') && TEST_FILE_RE.test(f)).forEach(f=>{
      pushIfFile('wifi-ap', path.join(dir, f));
    });
  }
  if (requestedSuites.includes('wifi-config-diagnostics')) {
    const dir = path.join(repoRoot, 'tests', 'wifi-config-diagnostics');
    fs.readdirSync(dir).filter(f=>f.endsWith('.js') && TEST_FILE_RE.test(f)).forEach(f=>{
      pushIfFile('wifi-config-diagnostics', path.join(dir, f));
    });
  }

  if (requestedSuites.includes('basicAsync')) {
    const dir = path.join(repoRoot, 'tests', 'basicAsync');
    fs.readdirSync(dir).filter(f=>f.endsWith('.js') && TEST_FILE_RE.test(f)).forEach(f=>{
      pushIfFile('basicAsync', path.join(dir, f));
    });
  }

  if (requestedSuites.includes('wifi-connectivity')) {
    pushIfFile('wifi-connectivity', path.join(repoRoot, 'tests', 'wifi-connectivity', 'test_wifi_module_present.js'));
    pushIfFile('wifi-connectivity', path.join(repoRoot, 'tests', 'wifi-connectivity', 'test_wifi_scan_basic.js'));
    pushIfFile('wifi-connectivity', path.join(repoRoot, 'tests', 'wifi-connectivity', 'test_wifi_api_methods.js'));
  }

  return tests;
}

module.exports = { resolveSuiteTests };
