# Overview of the execution path

When `scripts/run-tests-gordonV4.js` is executed, Node loads its dependencies, including Node core modules plus helper utilities from `lib/v4`, `lib/tests.js`, and related helpers that provide board metadata loading, suite resolution, and test discovery functions.

## Argument parsing and setup

1) `main()` is invoked at the end of the file; it begins by parsing command-line arguments through `parseArgs`, which supports both short flags `(e.g., -b, -p)` and `--key=value` forms, storing non-flag arguments under `args._`. A `--help` flag prints usage and exits.

2) The script requires a `target board name` (`--board` or positional) and an `Espruino serial port` (`--port`, or the first literal serial hint supplied by metadata). Missing values cause an error and exit.

3) If `--fixtures <json>` is provided, the file is read and JSON-parsed; the resulting object is serialized into a JavaScript snippet `(global.ESPRUINO_FIXTURES = ...;)` that will later be injected into each test body. Errors in locating or parsing fixtures are fatal.

4) The `board profile` is loaded via `loadBoardProfile` from `lib/v4/boardProfile.js`. This helper verifies the metadata directory exists in `boards/<board>/`, parses `board.json`, `cli.json`, and `fixture.json` (when present), and returns both the parsed objects and file paths. Loading failures abort execution.

5) Session defaults from `EspruinoTools/configDefaults.json` are merged with board metadata to create the shared base configuration. CLI overrides (`--fixtures`, `--pre-cli-delay`, etc.) are collected separately and injected during per-test assembly.

6) Desired suites are resolved using `resolveSuites`, which compares the requested suite list (from `--suites` or metadata defaults) to the profile’s declared `suites.available`. Matching suites then load their `testConfig.json` via `loadSuiteConfig` so suite-level metadata can participate in the later merge. Unknown suites produce an error.

7) Test files for the chosen suites are discovered by `resolveSuiteTests` from `lib/tests.js`. It maps suite names to specific directories/files (guarded by `test_*.js` naming) and returns `{id, path, suite}` descriptors. If no tests are found, the script exits successfully after printing a notice.

## Preparing output directories and logging

8) The script computes a timestamped output directory (defaulting to `results/<timestamp>/<board>`), ensures `sources/`, `logs/`, and `runner-metadata/` subdirectories exist (unless explicitly disabled by board config), and prints a run summary covering the board, metadata files, port, suites, and discovered test IDs.

## Per-test execution flow

9) The Espruino CLI path is determined via `process.env.ESPRUINO_CLI` or defaults to `espruino`, and a board identifier for the CLI is derived from metadata (`board.json` upstream ID or CLI overrides). Run-wide counters for pass/fail/skip and per-suite summaries are initialized.

For each test descriptor:

- The raw test source is read from disk via `parseTestMetadata`, which also extracts any JSON metadata header.

- The effective configuration is assembled by cloning the base config and merging the suite layer (`testConfig.json`), per-test metadata (`/* JSON */` block), and CLI overrides. Loader delays (`preUploadDelayMs`, `postUploadDelayMs`, `timeoutMs`) are normalised, fixture data is prepared for injection, and storage preload directives are identified.

- `composeWrappedTest` embeds the test inside the harness that declares result helpers, injects fixtures, and defines a polling epilogue that prints a JSON payload with status, duration, and reason when complete.

- Optional storage preload work is executed by `runStoragePreload`, which stages files using the Espruino CLI before the main upload when required.

- `runOneTest` is awaited to actually run the code on hardware.

## Interaction with the Espruino CLI (`runOneTest`)

10) `runOneTest` spawns the Espruino CLI with `--port <port>`, merged `--config` pairs, optional `--board <id>`, and `-e <wrapped code>`. Standard output and error are captured; stderr is streamed to the console unless `--quiet` was passed.

11) **Sleep delay handling (new):**  
    - The runner inspects the merged CLI configuration for `sleepAfterUploadMs` (or seconds).  
    - When set—and when an explicit `--sleep` is not already present—the CLI command is augmented with `--sleep <max(1, ceil(ms/1000))>`, guaranteeing at least a one-second hold.  
    - The process timeout is extended by the same duration, ensuring the CLI remains connected while the device finishes executing and emits the wrapper JSON. Boards without this field continue to run without additional delay.

12) When the CLI process exits:

- Output is inspected for connection issues (device busy, port unavailable); if detected, a descriptive failure is returned so the caller can log and move on.

- The script searches stdout for the most recent line containing `__espruino_test__` (the JSON emitted by the wrapper). Absence of such a line raises a `no_result` outcome; malformed JSON raises `invalid_result_json`.

- The parsed payload produces a structured result containing the test file ID, status, optional reason, duration, CLI command, and resolved diagnostics. Connection errors and timeouts propagate as failures with context.

## Recording results and termination

13) Successful test results update per-suite summaries, increment pass/fail/skip counters, and write the captured stdout and stderr to `results/.../logs/<testId>.stdout/.stderr`. Runner metadata (config provenance, CLI command, timing) is written alongside the test when enabled. Device-busy errors result in an immediate failure record with saved logs.

14) After all tests complete, the script prints totals, reports where sources and logs were saved, and emits per-suite JSON summaries plus a top-level `run-summary.json` describing the run (board, port, suites, totals, CLI args, timestamps).

15) Finally, the process exits with status code `0` if every test passed, or `1` if any failed. Uncaught promise rejections from `main()` are caught at the bottom, printing the error message and exiting with status `1`.

This step-by-step trace covers all major execution stages and the auxiliary modules involved when `scripts/run-tests-gordonV4.js` runs, including the new board-configurable sleep delay that improves result capture on slower devices such as the MDBT42Q.
