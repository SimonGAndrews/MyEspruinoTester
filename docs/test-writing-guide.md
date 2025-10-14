# Writing Tests for the Gordon Runner

This guide explains how individual test files are structured, how the Gordon-style wrapper behaves, and what to keep in mind when you author new synchronous or asynchronous tests. The examples use the small demo suites that live under `tests/demo/`. All of the example outputs referenced below are stored alongside the tests so you can inspect them directly.

## Basic Concepts

- **Wrapper:** The harness prepends/appends a small helper bundle to every test before it is sent to the Espruino CLI. It injects fixtures, runs keep-alive heartbeats, enforces timeouts, and normalises results. Section 2 walks through it in more detail, and `docs/test-harness-architecture.md` provides the full breakdown.
- **Helpers:** Tests get `__pass`, `__fail`, `__skip`, and `__setTestResult` injected automatically so they can report outcomes consistently. Legacy patterns still work, but the helpers keep new tests simple.
- **Fixtures:** Define variables such as GPIO pins or WIFI credentials needed for the tests.  Suites can define `global.ESPRUINO_FIXTURES` via `testConfig.json`; individual tests can override with JSON metadata definitions or skip when data is missing.
- **Metadata:** Per-test JSON headers let you control timeout, CLI arguments, fixtures, storage preload, and other behaviour without touching the harness.
- **EspruinoTools CLI:** is the [underlying command line interface](https://github.com/espruino/EspruinoTools) (used by the [EspruinoWebIDE](https://github.com/espruino/EspruinoWebIDE)) on which this test harness relies upon to upload and control execution of test files in the connected microcontroller running the Espruino interpreter.

---

## 1. Structuring Tests

Tests live under the `tests/` folder, organised by suite. A suite is simply a directory containing related `test_*.js` files plus any supporting metadata. For example, `tests/demo/getStarted/` is a suite that holds the introductory demo tests.

You can use nested subfolders to group suites by functionality, hardware, or library. Common patterns include:

- `tests/demo/getStarted/` – introductory examples.
- `tests/demo/CLI_Overrides/` – showcases of metadata-driven CLI behaviour.
- `tests/wifi/` or `tests/peripherals/` – collections focused on a particular subsystem.

Every suite can optionally provide a `testConfig.json` to set defaults (fixtures, execution order, metadata notes) and a `README.md` for human readers. Tests themselves are individual `test_*.js` files inside the suite directory.

## 2. Authoring a Synchronous Test

Plain test files live under a suite directory (for example `tests/demo/getStarted/`) and must be named `test_*.js`. Here is the full contents of `tests/demo/getStarted/test_sync_basic.js`:

```javascript
// Basic Synchronous test script
(function(){
  try {
    var testShouldPass = true;
    if (testShouldPass) {
      __pass('testShouldPass was true');
    } else {
      __fail('testShouldPass evaluated false');
    }
  } catch (e) {
    __fail('Basic sync test threw: ' + ((e && e.message) || e));
  }
})();
```

Key points for synchronous tests:

- **Immediately Invoked Function Expression (IIFE):** Wrapping the logic in `(function(){ ... })();` keeps variables local and runs the code right away.
- **Result helpers:** The wrapper injects convenience helpers:
  - `__pass('optional reason')`
  - `__fail('optional reason')`
  - `__skip('optional reason')`
  - `__setTestResult('pass' | 'fail' | 'skip', 'optional reason')`
  Using the helpers keeps the method of reporting the test status consistent. If you prefer, you can still assign `result = { status: 'pass', reason: '...' }` manually; the helpers simply make the intent explicit. Legacy shapes such as booleans or `{ pass: true }` still work for backward compatibility.
- **Try/Catch:** Wrapping the body in a `try/catch` lets you report unexpected errors with `__fail(...)` instead of crashing the test.

Once the function finishes and sets a result, the wrapper records the outcome. You can see the exact metadata used to by the harness to execute this test in `tests/demo/getStarted/example_results/test_sync_basic.js.json`.

---

## 3. Viewing Test Results

After every run, the harness writes a predictable folder structure under `results/<timestamp>/<board>/`. The important pieces are:

- `runner-metadata/<test>.js.json` – per-test metadata (status, reason, duration, merged config, diagnostics, CLI command). We copied the demo outputs into `tests/demo/.../example_results/` for quick reference.
- `sources/<test>.js` – the fully wrapped test sent to the device (helpful when debugging how metadata and helpers were injected).
- `logs/<test>.stdout` and `logs/<test>.stderr` – raw output captured from the Espruino CLI for each test. Storage preload runs create additional `.storage.*` logs.
- `<suite>.json` – per-suite summary file with pass/fail/skip counts and the per-test entries.
- `run-summary.json` – top-level summary for the whole run (totals and suite breakdowns).

Understanding this layout makes it much easier to diagnose why a test behaved a certain way or to grab data for documentation.

## 4. What the Wrapper Sends

Before uploading a test, the runner wraps your source, injects fixture data, installs a keep-alive heartbeat, and writes the wrapped file under `results/<timestamp>/<board>/sources/`. The wrapper:

1. Defines the helpers described above.
2. Starts a heartbeat (`setInterval`) that prints `{"__espruino_keep_alive__":true}` every 250 ms so the CLI keeps the port open while the test waits.
3. Executes your test inside a `try/catch` block.
4. Polls for `result` every 50 ms. When a result arrives (via `__pass`, `__fail`, etc.), it prints a JSON line with `status`, `reason`, and `duration_ms`.
5. If no result arrives before the timeout (default 10 s unless you override `loader.timeoutMs`), the wrapper records a failure with reason `timeout`.

You can inspect any wrapped source in `results/.../sources/`, or use the copies under `tests/demo/getStarted/example_results/` to see the metadata captured for the demos. See `docs/test-harness-architecture.md` for a deeper look at the wrapper internals.

---

## 5. Asynchronous Tests

Asynchronous tests follow the same pattern: schedule the work, and call a helper when the result is ready. `tests/demo/getStarted/test_async_example.js` looks like this:

```javascript
/* JSON {
  "notes": "Simple async example where a callback resolves with __pass.",
  "config": {
    "loader": { "timeoutMs": 5000 }
  }
} */

(function(){
  try {
    setTimeout(function(){
      try {
        __pass('async callback fired');
      } catch (err) {
        __fail('async callback threw: ' + ((err && err.message) || err));
      }
    }, 10);
  } catch (e) {
    __fail('async setup threw: ' + ((e && e.message) || e));
  }
})();
```

Important details:

- The optional JSON block at the top lets you add per-test metadata (here we just adjusted the timeout).
- Always guard asynchronous callbacks with `try/catch` so unexpected errors become helpful failures rather than silent exceptions.
- The heartbeat keeps the connection alive while the timeout runs.
- The `notes` field is simply documentation for future readers—it shows up in the per-test metadata so you can describe intent or prerequisites.
- Keep the JSON comment the very first non-empty lines in the file. The harness scans for `/* JSON { ... } */` at the top; anything before it (other than blank lines) will stop the metadata from being parsed.
- The block must be valid JSON (double quotes, commas between fields, no trailing commas) wrapped inside the `/* JSON { ... } */` comment. If it is malformed, the harness simply ignores it and you may spend time wondering why overrides are not applied.

The recorded output for this test is stored at `tests/demo/getStarted/example_results/test_async_example.js.json`.

### Guarding Against Timeouts

In cases where an async test may not fire, introduce your own guard. `test_timeout_guard.js` sets a 3 s timer that fails the test if the tested function never invokes the callback:

```javascript

(function(){
  var done = false;              // track whether guard or callback fired

  // invoke the guard
  var guard = setTimeout(function(){
    if (!done) {
      done = true;
      __fail('setWatch callback never fired');
    }
  }, 3000);

  // invoke the async function to be tested (with its callback)
  var id = setWatch(function(){
    if (done) return;             // guard already tripped
    done = true;
    clearTimeout(guard);
    clearWatch(id);
    __pass('setWatch callback fired');
  }, LED1, { repeat: false });

  digitalPulse(LED1, 1, 20);      // in this case trigger the watch (comment out to exercise the guard)
})();

```

The recorded metadata lives in `tests/demo/getStarted/example_results/test_timeout_guard.js.json`.

Key points:

- The var `done` tracks if the callback or the timeout guard have executed.
- A three second guard is provided via the `setTimeout`, where the timeout function sets done and fails the test.
- The guard timeout function runs on invocation, setting the timer.
- The purpose of the test, the `setwatch` async function, also runs on invocation (racing the guard).
- If the setWatch triggers, its callback:
  - checks `done` in case the guard already expired, if so just returns.
  - if not, it sets `done` and clears the guard `clearTimeout` (also tidies up with clearWatch).
  - finally it handles the results in the callback - in this case simply declares the pass test result, In other async cases the handling may well pass or fail depending upon the parameters in the callback (eg if err exists or something not set correctly)

  ---

## 7. Example of Skipping a test

In some cases it may be preferred to report a test as `skipped` instead of `pass` or  `fail`.
In the previous example this could have been achieved with this additional code afer the IIFE function declaration

```js
(function(){
  if (typeof setWatch !== 'function' || typeof clearWatch !== 'function' ||
      typeof digitalPulse !== 'function' || typeof LED1 === 'undefined') {
    __skip('setWatch demo skipped: required functions or LED1 pin unavailable');
    return;
  }
  ...
  ...
}
```

## 8. Fixtures

Suites can provide default fixtures via `testConfig.json` within a given test suite folder.

### Fixture Example

In `tests/demo/getStarted/testConfig.json` we define a dummy example fixture with:

```json
{
  "config": {
    "fixture": {
      "demo": {
        "message": "Hello from fixture",
        "number": 42
      }
    }
  }
}
```

`tests/demo/getStarted/test_fixture_usage.js` reads those values:

```javascript
(function(){
  try {
    var fixtures = global.ESPRUINO_FIXTURES || {};
    var demo = fixtures.demo;
    if (!demo) {
      __skip('demo fixture missing');
      return;
    }
    if (demo.message === 'Hello from fixture' && demo.number === 42) {
      __pass('fixture values matched');
    } else {
      __fail('fixture values unexpected: ' + JSON.stringify(demo));
    }
  } catch (e) {
    __fail('fixture usage threw: ' + ((e && e.message) || e));
  }
})();
```

Key points:

- Fixture data can be accessed in the test via the object `global.ESPRUINO_FIXTURES`
- This object is injected into a test's code by the test harness before upload to the target device.  In this case:

```js
global.ESPRUINO_FIXTURES = {"wifi":"default","peripherals":[],"demo":{"message":"Hello from fixture","number":42}};
```

- The sample result of this test  (`tests/demo/getStarted/example_results/test_fixture_usage.js.json`) shows a clean pass with the injected values. 
- The test demonstrates how missing data could trigger a `skipped` test.
- A skipped test is demonstrated further in `test_skip_on_missing_led.js`, whose metadata lives in `tests/demo/getStarted/example_results/test_skip_on_missing_led.js.json`.


## 9. Metadata Layers

During test preperation , the metadata which controls the test execution is defined through a simple “layered merge” workflow: each layer takes what came before and adds its own details. We have already seen parts of these layers above: sections—fixtures in the suite guide, per-test metadata in the async examples, and command-line overrides when we ran the demos. This section pulls the pieces together so the workflow is easy to follow. The complete flow collects the following, (in the order of merging):

1. **Session defaults** – These are the values bundled with EspruinoTools (`EspruinoTools/configDefaults.json`). They seed common CLI settings such as port hints or default timeouts. _These defaultd are not usually edited._
2. **Board profile** – When you choose a board (for example ESP32C3), the harness reads `boards/ESP32C3/board.json` plus any optional `fixture.json` or `cli.json`. This layer defines things like the board name, default fixtures (e.g., Wi-Fi credentials), and CLI hints.
3. **Suite metadata** – Inside each suite directory you can provide `testConfig.json` (as shown in `tests/demo/getStarted/testConfig.json`). It can introduce fixtures, notes, or execution order that apply to every test in that suite.
4. **Test metadata** – Individual tests can include a JSON block at the top (`/* JSON { ... } */`). We used this in `test_async_example.js` to tweak the timeout and in `test_metadata_led_override.js` to add an LED pin for a single test.
5. **CLI overrides** – Finally, whatever you pass on the `scripts/run-tests-gordonV4.js` command line (e.g., `--port`, `--suites`, `--fixtures`) applies last. This is what we used when running the demo suites earlier.

By the time the wrapper runs, all of these layers have been merged.  The resulting metadata of a given test run can be inspected in `results/<timestamp>/<board>/runner-metadata/<test>.json`.  The table below summarises this workflow merge and shows where each piece lives on disk.

### The metadata assignment workflow

| Level            | Example path / file                                                                 |
|------------------|-----------------------------------------------------------------------------------------|
| Session defaults | `EspruinoTools/configDefaults.json`                                                     |
| Board profile    | `boards/<board>/board.json`, `boards/<board>/fixture.json`, `boards/<board>/cli.json`   |
| Suite metadata   | `tests/<suite>/testConfig.json` (for example `tests/demo/getStarted/testConfig.json`)   |
| Test metadata    | JSON block at the top of `tests/<suite>/<test>.js`                                      |
| CLI overrides    | Command-line flags passed to `scripts/run-tests-gordonV4.js` (`--port`, `--suites`, etc.)|

### Suite Level Metadata and Execution Order

Suite-level metadata lives in `testConfig.json` alongside the tests. The key pieces are:

- `execution.order` – a list of files to run first. Any other `test_*.js` files run afterwards in alphabetical order. The demo suite lists every test so the order is obvious.
- `config.fixture` – default fixture values (as shown above).
- `notes` – free-form documentation that shows up in the per-test metadata.

### Per-Test Overrides

Tests can override fixtures in their own metadata. `test_metadata_led_override.js` adds `demo.ledPin` for just that test and then confirms it is present.

```js
/* JSON {
  "notes": "Shows per-test metadata: overrides demo.ledPin so the LED check passes.",
  "config": {
    "fixture": {
      "demo": {
        "ledPin": 2
      }
    }
  }
} */

(function(){
  try {
    var fixtures = global.ESPRUINO_FIXTURES || {};
    var demo = fixtures.demo || {};
    if (demo.ledPin === undefined || demo.ledPin === null) {
      __fail('demo.ledPin missing');
      return;
    }
    console.log('Would toggle LED on pin', demo.ledPin);
    __pass('LED pin present (' + demo.ledPin + ') via metadata override');
  } catch (err) {
    __fail('metadata LED test threw: ' + ((err && err.message) || err));
  }
})();
```

- The tests recorded output is in `tests/demo/getStarted/example_results/test_metadata_led_override.js.json`.
- The following line of code is injected into the test before upload to the target.

  ```js
  global.ESPRUINO_FIXTURES = {"wifi":"default","peripherals":[],"demo":{"ledPin":2}};
  ```

### Board level eg fixture definitions

In the previous example of fixture injected data it can be seen that the global.ESPRUINO_FIXTURES object also contains the value wifi.default and peripherials.[]  These values were defined in a Board level metadaqta file  eg `boards/ESP32C3/fixture.json`  containing :

```js
{
  "metadataVersion": 1,
  "fixture": {
    "wifi": "default",
    "peripherals": []
  }
}
```

---
