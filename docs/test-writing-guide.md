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
- **`result` value:** Assigning `result` ends the test. You can use:
  - `result = true` / `false` for simple pass/fail,
  - `result = { status: 'skip', reason: '...' }` for skips, or
  - `result = { status: 'fail', pass: false, reason: '...' }` for detailed outcomes.
  The runner understands plain booleans as well as objects with `status`, `pass`, and optional `reason` fields.
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
   - (When fixtures are provided) sets `global.ESPRUINO_FIXTURES = {...}` before the main function runs.

2. **Outer IIFE:** `(function(){ ... })();` starts immediately. This ensures every test runs in an isolated scope.

3. **Keep-alive loop:** `setInterval` prints a small JSON heartbeat every 250 ms while `result` is still `undefined`. This keeps the serial connection alive; without it the CLI would close the port when the test code waits on asynchronous work.

4. **`done` helper:** Finalises the test by clearing the heartbeat and printing the result JSON (`{"__espruino_test__": true, ...}`).

5. **Test body:** The runner inserts your original file inside a `try { ... } catch` block. If your code throws, the wrapper records the error and sets `result = false`.

6. **Wait loop:** Another IIFE `(function wait(){ ... })();` runs immediately. The trailing `();` is what executes the function right away. Inside it:
   - If `result` has been set, it normalises the value (booleans become pass/fail; objects with `status`/`pass` are honoured) and calls `done(...)`.
   - If `result` is still `undefined`, it schedules itself to run again in 50 ms (`setTimeout(wait, 50)`) until either `result` is set or the timeout expires.
   - If the timeout elapses first, it records a failure with `status: 'fail'` and `reason: 'timeout'`.

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
fixtureInjection = `global.ESPRUINO_FIXTURES = ${JSON.stringify(fixtures)};`;
```

That snippet becomes part of the wrapped source (see section 2). In the saved copy under `results/.../sources/` you’ll see a line such as:

```javascript
global.ESPRUINO_FIXTURES = {"wifi":{"ssid":"SHED","password":"MyGreatShed","timeout":25000,"hostname":"espruino-tester"},"wifi_invalid":{"enabled":false,"ssid":"SHED","password":"WRONG","timeout":12000}};
```

### 3.3 Using fixtures inside a test

Tests read the data at runtime. For example, `tests/wifi-station/test_connect_get_ip.js` begins with:

```javascript
var fixtures = global.ESPRUINO_FIXTURES || {};
var wifiCfg = fixtures.wifi;
if (!wifiCfg || !wifiCfg.ssid || !wifiCfg.password) {
  result = { status: 'skip', pass: false, reason: 'wifi-station skipped (fixtures.wifi not provided)' };
  return;
}
```

Because the runner injected the JSON before the test executes, `global.ESPRUINO_FIXTURES` already holds the right values. Tests can also check optional blocks (`fixtures.wifi_invalid`, `fixtures.http`, etc.) and skip themselves cleanly when data is missing.

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

Example with a manual timeout guard:

```javascript
(function(){
  try {
    var fixtures = global.ESPRUINO_FIXTURES || {};
    var wifiCfg = fixtures.wifi;
    if (!wifiCfg) {
      result = { status: 'skip', pass: false, reason: 'no fixtures.wifi block' };
      return;
    }

    var wifi = require('Wifi');
    var finished = false;
    var guard = setTimeout(function(){
      if (finished) return;
      finished = true;
      try { wifi.disconnect(); } catch (e) {}
      result = { status: 'fail', pass: false, reason: 'connect callback never fired' };
    }, 20000);

    wifi.connect(wifiCfg.ssid, { password: wifiCfg.password }, function(err) {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      if (err) {
        result = { status: 'fail', pass: false, reason: 'wifi.connect error: ' + err };
        return;
      }
      result = { status: 'pass', pass: true };
    });
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'Test threw: ' + ((e && e.message) || e) };
  }
})();
```

If the callback never fires we clean up and report a failure, otherwise the guard is cleared as soon as the connection succeeds.

---

## 6. Per-Test Metadata Hints

Some tests need the Espruino CLI to behave differently (upload to Storage, skip resets, stretch the port delays, etc.). You can request those tweaks without touching the runner by placing a single JSON block at the very top of the test file:

```javascript
/*JSON{
  "saveOnSend": "storage",
  "storageTarget": "wifi-tests/test_event_callbacks.js",
  "preUploadDelayMs": 1500,
  "postUploadDelayMs": 2000,
  "noReset": true,
  "timeoutMs": 20000,
  "cliArgs": ["--sleep", "1"],
  "espruinoConfig": { "LOAD_STORAGE_FILE": 2 }
}*/
```

Guidelines:

- The comment must appear before any other code (whitespace is fine). Use strict JSON: double quotes, commas between fields, and no trailing commas.
- The runner understands every key listed in the table below; any unrecognised key is silently ignored (but a typo usually means your change has no effect).
- All numeric knobs accept non-negative numbers. Anything else causes the runner to fail the test before it touches the device, so mistakes are caught early.

| Key | Type | Accepted values | Effect | Default |
| --- | --- | --- | --- | --- |
| `saveOnSend` | number / string / boolean | Numbers are passed straight through (`0` = RAM, `1` = flash boot, `2` = flash persistent, `3` = Storage). Strings are matched case-insensitively against `ram`, `flash`, `flashPersistent`, `flashBoot`, `storage`, or any numeric string. `true` maps to `1`, `false` to `0`. | Overrides `Espruino.Config.SAVE_ON_SEND` for this upload. | Not set (runner leaves the CLI default alone). |
| `storageTarget` | string | Any non-empty Storage filename. Must be ≤28 chars to satisfy Storage limits. | Sets `SAVE_STORAGE_FILE` when `saveOnSend` resolves to Storage. The runner raises an error if you supply a target without also selecting Storage. | Not set. |
| `preUploadDelayMs` | number | Non-negative integer. | The harness waits this many milliseconds *after* launching the Espruino CLI process but *before* it sends your test payload. Skipped automatically if `storagePreload` already exercised the CLI. | Inherits global `--pre-cli-delay` (default 1000 ms). |
| `postUploadDelayMs` | number | Non-negative integer. | The harness pauses this long *after* the CLI finishes uploading but *before* it reads the device output and checks results. Applies to both the preload and main upload stages. | Inherits global `--post-cli-delay` (default 1000 ms). |
| `timeoutMs` | number | Non-negative integer. | Changes how long the harness' 50 ms wait-loop keeps polling for `result` before it labels the run a timeout. | 10 000 ms. |
| `noReset` | boolean | `true` or `false`. | When `true`, the runner adds `--config RESET_BEFORE_SEND=false` for this test only. | `false` unless `--no-reset` was passed globally. |
| `cliArgs` | array of strings | Each array element is forwarded verbatim; use one token per flag/value. | Adds extra command-line arguments to the CLI invocation(s). Useful for ad-hoc flags such as `--sleep 1`. | `[]`. |
| `espruinoConfig` | object | Arbitrary key/value pairs. Values are JSON-encoded so you can send numbers, booleans, strings, or nested objects. | Converts to multiple `--config KEY=VALUE` CLI flags before the upload. | `{}`. |
| `storagePreload` | object or array of objects | Each entry must contain `filename` plus either literal `contents` (a string) or `sourceFile` (path relative to the test file or absolute). | Triggers an additional CLI run *before* the test upload. The runner writes your payload into Storage using `--storage` arguments, records the CLI stdout/stderr under `<test>.storage.*`, and then runs the main test. | Not set; no preload. |
| `requirements` | array of strings | Arbitrary requirement tags (`"WIFI-CONNECT-001"`, `"BLE-AVAILABLE"`, etc.). | Copied into the merged config and run metadata so higher layers (reporting, CI) can gate tests on capabilities. | `[]`. |

### Save on Send targets in plain language

If you are not familiar with the Espruino CLI options, think of `saveOnSend` as telling the device where to store the code you upload:

- `0` / `"ram"` — keep code only in RAM. It runs immediately but disappears after reset.
- `1` / `"flashBoot"` — write to flash so the code runs automatically on boot, but it overwrites the boot slot.
- `2` / `"flashPersistent"` — store in flash and keep existing boot code. Useful when you want the test to survive soft resets without touching the primary boot program.
- `3` / `"storage"` — upload straight into Espruino Storage. Combine this with `storageTarget` to pick the filename the test should read later.

Pick the lowest option that matches your goal: RAM for temporary experiments, flash boot when you want to replace the startup script, flash persistent for longer-lived helpers, and Storage when a test needs supporting files.

### Example: `espruinoConfig` hint

`espruinoConfig` mirrors the `--config KEY=VALUE` flags you would normally pass on the CLI. For example, to slow down uploads and disable echoes without remembering the CLI syntax, add this JSON block at the top of your test:

```javascript
/*JSON{
  "espruinoConfig": {
    "SERIAL_THROTTLE_SEND": true,
    "SERIAL_THROTTLE_WAIT": 50,
    "BOARD_JSON": "/absolute/path/to/custom_board.json"
  }
}*/
```

The runner converts those entries into `--config SERIAL_THROTTLE_SEND=true --config SERIAL_THROTTLE_WAIT=50 --config BOARD_JSON=/absolute/path/to/custom_board.json` when it launches the Espruino CLI, so you can keep the settings close to the test without memorising the command-line switches.

### Harness wait-loop limit

The Gordon harness watches for `result` in a 50 ms polling loop (the `wait()` helper described earlier). `timeoutMs` just expands or shrinks the maximum time spent in that loop. The wait sits between the moment the wrapper finishes uploading your code and the moment it sees `result` become defined, so raise it for long-running async flows and lower it when you want fast-failing smoke tests.

### When to reach for `storagePreload`

`storagePreload` is handy whenever a test needs extra files in Espruino Storage before the main script runs—for example HTML fixtures, certificate bundles, or helper modules that your test loads with `require("Storage").read(...)`. The harness performs a lightweight “preload” CLI run that only writes those files, then performs the normal upload. The CLI command used for the preload and the captured stdout/stderr are recorded under `runner-metadata/<test>.json` and `logs/<test>.storage.(stdout|stderr)` so you can audit what happened on-device. Use this when:

- Your test depends on multiple Storage files and you want to populate them from checked-in sources.
- You need deterministic device state (for example, seeded data logs) without embedding everything inline in the test body.
- You want to reuse the same preloaded assets across several tests without duplicating code.

If a test does not touch Storage, leave `storagePreload` out so the harness only runs the CLI once.

When `storagePreload` is present the runner shells out to the CLI twice. The first run writes the requested Storage files (by uploading a tiny stub and the `--storage` arguments you described), and the second run uploads the wrapped test itself. The helper captures any output from the preload pass into `<test>.storage.stdout`/`.storage.stderr` so you can review what happened on-device.

Invalid metadata causes the runner to mark the test as failed and prints the validation error, so mistakes are visible immediately. The comment stays in the wrapped source saved under `results/.../sources/`, which means you can paste the exported file into the REPL and reproduce the exact upload behaviour.

---

### Suite Metadata (testConfig.json)

Suites can provide a `tests/<suite>/testConfig.json` file that applies defaults to every test in the directory. Typical uses:

- **Execution order:** declare an `"execution": { "order": [ ... ] }` array so critical setup tests run first (for example, write to Storage before consuming the module). Tests not listed still run afterwards in discovery order.
- **Shared config:** place `loader`, `cli`, or `fixture` blocks under `config` to seed pre/post delays, `noReset`, `storagePreload`, fixture defaults, or requirement tags that apply to the whole suite.
- **Notes:** the optional `notes` field documents suite purpose and prerequisites so future contributors know what the harness is expected to provide.

Every test still merges its own metadata on top of the suite defaults, and the harness records provenance in `runner-metadata/<test>.json` so you can see which layer supplied each value.

---

## 7. Debugging Tips

- The wrapped sources saved by the runner are ideal for REPL reproduction. Paste the entire file into the Web IDE to mimic harness behaviour.
- Look in `results/<timestamp>/<board>/logs/` for the raw stdout/stderr captured from each run.
- Connection failures (busy port, unplugged board) now surface as explicit diagnostics (`cli.connect`) in the per-test metadata and console output; fix the hardware state and rerun.
- Tests skip cleanly when required fixtures or optional APIs are missing, so you can iterate without rewiring every test.
- If the CLI reports errors about missing board JSON (for example when using community boards), generate the JSON from the firmware repo with `python scripts/build_board_json.py boards/MYBOARD.py > MYBOARD.json` and pass it to the harness with `--board boards/MYBOARD.json`. Without the JSON the CLI cannot determine Storage layout or firmware offsets, and uploads will fail before your test runs.

With these building blocks you can author new tests, understand how the runner evaluates them, and debug the wrapped payload when something behaves unexpectedly.
