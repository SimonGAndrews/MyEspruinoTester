# Writing Tests for the Gordon Runner

This guide explains how individual test files are structured, how the Gordon-style runner (`scripts/run-tests-gordon.js`) wraps them before sending them to the Espruino CLI, and what to keep in mind when you author new synchronous or asynchronous tests.

The examples below use `tests/wifi-core/test_module_presence.js` and the wrapped source that the runner generated in `results/20250924-154839/ESP32C3/sources/test_module_presence.js`.

---

## 1. Authoring a Synchronous Test File

Plain test files live under `tests/<suite>/` and must be named `test_*.js`. Here is the full contents of `tests/wifi-core/test_module_presence.js`:

```javascript
// Test: Wifi module must be loadable and expose a usable object/function
(function(){
  try {
    var wifi = require('Wifi');
    var ok = !!wifi && (typeof wifi === 'object' || typeof wifi === 'function');
    if (ok) {
      result = { status: 'pass', pass: true };
    } else {
      result = { status: 'fail', pass: false, reason: 'Wifi module not available or unexpected type' };
    }
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'require(\'Wifi\') threw: ' + ((e && e.message) || e) };
  }
})();
```

Key points for synchronous tests:

- **Immediately Invoked Function Expression (IIFE):** Wrapping the test logic in `(function(){ ... })();` keeps variables local and runs the code right away.
- **`result` object:** Set `result` to an object with `status`, `pass`, and optional `reason`. The runner looks for this value to decide pass/fail/skip.
- **Failures:** Catch exceptions and return a helpful message in `result.reason`.

As soon as the function finishes and assigns `result`, the runner picks that up and records the outcome.

---

## 2. What the Runner Actually Sends

When the Gordon runner executes a test it wraps the file, injects heartbeat logic, and writes the wrapped source to `results/<timestamp>/<board>/sources/`. 

To see the exact payload for our example, open `results/20250924-154839/ESP32C3/sources/test_module_presence.js`. The important parts look like this (comments added for clarity):

```javascript
var result=undefined; var resultReason=undefined; var resultStatus=undefined;
var __setResult = function(v){ result = v; };
(function(){
  var __t0 = Date.now();
  var __keepAlive = setInterval(function(){
    if (typeof result !== 'undefined') { clearInterval(__keepAlive); return; }
    try { print('{"__espruino_keep_alive__":true}'); } catch (e) {}
  }, 250);
  function done(status, ok, reason) {
    if (__keepAlive) {
      clearInterval(__keepAlive);
      __keepAlive = undefined;
    }
    var payload = { __espruino_test__: true, file: "test_module_presence.js", status: status, pass: !!ok, duration_ms: Date.now()-__t0, reason: reason || null };
    print(JSON.stringify(payload));
  }
  try {
    // <=== the original test body is inserted here verbatim ===>
    (function(){
      try {
        var wifi = require('Wifi');
        var ok = !!wifi && (typeof wifi === 'object' || typeof wifi === 'function');
        if (ok) {
          result = { status: 'pass', pass: true };
        } else {
          result = { status: 'fail', pass: false, reason: 'Wifi module not available or unexpected type' };
        }
      } catch (e) {
        result = { status: 'fail', pass: false, reason: 'require(\'Wifi\') threw: ' + ((e && e.message) || e) };
      }
    })();
  } catch (e) {
    resultStatus = 'fail';
    resultReason = (e && e.message) || e;
    result = false;
  }
  (function wait(){
    if (typeof result !== 'undefined') {
      var status, ok, reason = resultReason;
      if (typeof result === 'object' && result) {
        status = result.status;
        if (typeof result.pass === 'boolean') ok = !!result.pass;
        else if (typeof result.ok === 'boolean') ok = !!result.ok;
        else if (status === 'skip') ok = false;
        else ok = true;
        if (!status) status = ok ? 'pass' : 'fail';
        if (result.reason !== undefined) reason = result.reason;
      } else {
        ok = !!result;
        status = resultStatus || (ok ? 'pass' : 'fail');
      }
      if (status === 'skip') ok = false;
      done(status, ok, reason);
      return;
    }
    if (Date.now()-__t0 < 10000) return setTimeout(wait,50);
    done('fail', false, 'timeout');
  })();
})();
```

Here’s the execution order in plain language:

1. **Global setup:** 
   - Declares helper variables (`result`, `resultReason`, `resultStatus`, `__setResult`).
   - (When fixtures are provided) sets `global.ESPRUINO_WIFI_FIXTURES = {...}` before the main function runs.

2. **Outer IIFE:** `(function(){ ... })();` starts immediately. This ensures every test runs in an isolated scope.

3. **Keep-alive loop:** `setInterval` prints a small JSON heartbeat every 250 ms while `result` is still `undefined`. This keeps the serial connection alive; without it the CLI would close the port when the test code waits on asynchronous work.

4. **`done` helper:** A normal inner function that finalises the test, clears the heartbeat, and prints the result JSON (`{"__espruino_test__": true, ...}`). Nothing calls it yet—it’s saved for later.

5. **Test body:** The runner inserts your original file inside a `try { ... } catch` block. If your code throws, the wrapper records the error and sets `result` to `false`.

6. **Wait loop:** Another IIFE `(function wait(){ ... })();` runs immediately. The trailing `();` is what executes the function right away. Inside it:
   - If `result` has been set, it packages the status and calls `done(...)`.
   - If `result` is still `undefined`, it schedules itself to run again in 50 ms (`setTimeout(wait, 50)`) until either `result` is set or 10 s elapse.
   - If 10 s pass without a result, it records a timeout failure.

7. **Anonymous functions:** Even though several functions are unnamed, they execute because the runner either calls them immediately (`(function(){})()`) or schedules them with timers (`setInterval`, `setTimeout`).

This wrapped version is what now gets stored under `results/.../sources/`—you can copy/paste it directly into the REPL to reproduce the runner behaviour.

---

## 3. Fixtures: defining and using shared data

Wi-Fi tests often need credentials, hostnames, or timing tweaks that shouldn’t be hard-coded in source control. The harness reads fixture files (simple JSON) and injects them before each test runs.

### 3.1 Defining fixture data

Create a JSON file under `configs/` with whatever structure your tests expect. For example, `configs/fixtures.wifi_station.json` contains:

```json
{
  "wifi": {
    "ssid": "SHED",
    "password": "MyGreatShed",
    "timeout": 25000,
    "hostname": "espruino-tester"
  },
  "wifi_invalid": {
    "enabled": false,
    "ssid": "SHED",
    "password": "WRONG",
    "timeout": 12000
  }
}
```

You can keep multiple fixture files (lab, home, CI) and select the one you want on the command line.

### 3.2 Loading fixtures in the Gordon runner

When you run the harness with `--fixtures configs/fixtures.wifi_station.json`, `scripts/run-tests-gordon.js` parses the JSON once and injects it before every test body:

```javascript
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
fixtureInjection = `global.ESPRUINO_WIFI_FIXTURES = ${JSON.stringify(fixtures)};`;
```

That snippet becomes part of the wrapped source (see section 2). In the saved copy under `results/.../sources/` you’ll see a line such as:

```javascript
global.ESPRUINO_WIFI_FIXTURES = {"wifi":{"ssid":"SHED","password":"MyGreatShed","timeout":25000,"hostname":"espruino-tester"},"wifi_invalid":{"enabled":false,"ssid":"SHED","password":"WRONG","timeout":12000}};
```

### 3.3 Using fixtures inside a test

Tests read the data at runtime. For example, `tests/wifi-station/test_connect_get_ip.js` begins with:

```javascript
var fixtures = global.ESPRUINO_WIFI_FIXTURES || {};
var wifiCfg = fixtures.wifi;
if (!wifiCfg || !wifiCfg.ssid || !wifiCfg.password) {
  result = { status: 'skip', pass: false, reason: 'wifi-station skipped (fixtures.wifi not provided)' };
  return;
}
```

Because the runner injected the JSON before the test executes, `global.ESPRUINO_WIFI_FIXTURES` already holds the right values. Tests can also check optional blocks (`fixtures.wifi_invalid`, `fixtures.http`, etc.) and skip themselves cleanly when data is missing.

This injection happens in both the Gordon runner and the richer `scripts/run-tests.js`, so the same fixture files work for every harness.

---

## 4. Why the Keep-Alive Exists

Some tests wait on Wi-Fi events that can take seconds. The Espruino CLI automatically closes the serial port after ~500 ms of silence. By printing a small heartbeat JSON every 250 ms, the runner keeps the connection open until your test sets `result`. Once `result` is defined, the heartbeat stops and the final JSON payload is printed.

---

## 5. Writing Asynchronous Tests

Synchronous tests finish inside a single IIFE. Asynchronous tests (connecting to Wi-Fi, waiting for callbacks, etc.) still use the same pattern—they just set `result` later. A simplified example:

```javascript
(function(){
  try {
    var wifi = require('Wifi');
    wifi.connect('SHED', { password: 'topsecret' }, function(err) {
      if (err) {
        result = { status: 'fail', pass: false, reason: 'wifi.connect error: ' + err };
        return;
      }
      wifi.getIP(function(info) {
        if (info && info.ip && info.ip !== '0.0.0.0') {
          result = { status: 'pass', pass: true };
        } else {
          result = { status: 'fail', pass: false, reason: 'no usable IP' };
        }
      });
    });
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'Test threw: ' + ((e && e.message) || e) };
  }
})();
```

Important reminders for async tests:

1. **Always set `result`:** Callbacks and promises must eventually assign `result`. The wrapper will keep waiting until the test does so (or until it times out).
2. **Use structured objects:** Stick to `{ status, pass, reason }` so the harness can distinguish PASS/FAIL/SKIP.
3. **Clean up:** Disconnect from Wi-Fi, remove event listeners, and clear timers inside your own success/failure paths.
4. **Timeouts:** If your async flow might hang, add your own `setTimeout` failsafe so the test doesn’t wait forever.

---

## 6. Debugging Tips

- The wrapped sources saved by the runner are ideal for REPL reproduction. Paste the entire file into the Web IDE to mimic harness behaviour.
- Look in `results/<timestamp>/<board>/logs/` for the raw stdout/stderr captured from each run.
- Tests skip cleanly when required fixtures or optional APIs are missing, so you can iterate without rewiring every test.

With these building blocks you can author new tests, understand how the runner evaluates them, and debug the wrapped payload when something behaves unexpectedly.
