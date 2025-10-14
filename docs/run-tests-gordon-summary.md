# Overview of the execution path

When `scripts/run-tests-gordon.js` is executed, Node loads its dependencies, including Node core modules plus helper utilities from `lib/manifest.js` and `lib/tests.js` that provide manifest loading, suite resolution, and test discovery functions.

## Argument parsing and setup

1) `run()` is invoked immediately at the end of the file; it begins by parsing command-line arguments through parseArgs, which supports both short flags `(e.g., -b, -p)` and `--key=value` forms, storing non-flag arguments under `args._`. A `--help` flag prints usage and exits.

2) The script requires a `target board name` (--board or positional) and an `Espruino serial port` (--port, or the first explicit serial hint in the manifest). Missing values cause an error and exit.

3) If `--fixtures <json>` is provided, the file is read and JSON-parsed; the resulting object is serialized into a JavaScript snippet `(global.ESPRUINO_WIFI_FIXTURES = ...;)` that will later be injected into each test body. Errors in locating or parsing fixtures are fatal.

4) The `board manifest` is loaded via `loadManifest` from `lib/manifest.js`. This helper verifies the manifest file exists in `boards/<board>.json` and returns both the parsed object and its path. Manifest loading failures abort execution.

5) Desired suites are resolved using `resolveSuites`, which compares the requested suite list (from `--suites` or manifest defaults) to the manifest’s declared `suites.available`. Unknown suites produce an error.

6) Test files for the chosen suites are discovered by `resolveSuiteTests` from `lib/tests.js`. It maps suite names to specific directories/files (guarded by `test_*.js` naming) and returns `{id, path, suite}` descriptors. If no tests are found, the script exits successfully after printing a notice.

## Preparing output directories and logging

7) The script computes a timestamped output directory (defaulting to `results/<timestamp>/<board>` or an overridden `--outdir`), ensures `sources/` and `logs/` subdirectories exist, and prints a run summary covering the board, manifest path, port, suites, and discovered test IDs.

## Per-test execution flow

8) The Espruino CLI path is determined via `process.env.ESPRUINO_CLI` or defaults to `espruino`, and a board identifier for the CLI is derived from the manifest (`manifest.board`, `manifest.upstream.id`, or the CLI board name). Run-wide counters for pass/fail/skip and per-suite summaries are initialized.

For each test descriptor:

- The raw test source is read from disk.

- `wrapTestSource` is called to embed the test inside a harness that declares result variables, optionally injects fixtures, and defines a keep-alive timer plus a done reporter. The wrapper catches synchronous errors, waits for result to be set (by `__setResult` or other test code), enforces a timeout (default 10 s), and prints a JSON payload with status, duration, and reason when complete.

- The wrapped source is saved to `results/.../sources/<testId>` for inspection and use in Espruino REPL for testing.

- `sendViaCLI` is awaited to actually run the code on hardware.

## Interaction with the Espruino CLI (sendViaCLI)

10) `sendViaCLI` writes the wrapped code to a temporary file inside a temporary directory and spawns the Espruino CLI `(espruino --port <port> --no-ble [--board <id>] <tempfile>)`. Standard output and error are captured; stderr is streamed to the console unless `--quiet` was passed.

11) When the CLI process exits:

- The temporary directory is removed.

- Output is inspected for device-busy errors; if detected, a special `deviceBusy` error is thrown so the caller can abort the run.

- The script searches stdout for the most recent line containing `__espruino_test__` (the JSON emitted by `wrapTestSource`). Absence of such a line raises a `no_result` error.

- The JSON payload is parsed to produce a structured result containing the test file ID, status, optional reason, duration, and the captured stdout/stderr buffers. Invalid JSON raises `invalid_result_json`.

## Recording results and termination

12) Successful test results update per-suite summaries, increment pass/fail/skip counters, and write the captured stdout and stderr to `results/.../logs/<testId>.stdout/.stderr`. Skipped tests increment skip counts; passing tests increment pass counts; failures increment fail counts with reason logging. Device-busy errors abort the whole run after saving logs, while other errors register as failed tests with logged stderr/stdout and an error reason.

13) After all tests complete, the script prints totals, reports where sources and logs were saved, and attempts to emit a JSON summary per suite (containing board, port, suite name, timestamp, and aggregated per-test data) into the run directory. Errors writing summaries are non-fatal but logged.

14) Finally, the process exits with status code 0 if every test passed, or 1 if any failed. Uncaught promise rejections from `run()` are caught at the bottom, printing the error message and exiting with status `1`.

This step-by-step trace covers all major execution stages and the auxiliary modules involved when `scripts/run-tests-gordon.js' runs.
