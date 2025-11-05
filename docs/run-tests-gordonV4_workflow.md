# run-tests-gordonV4 Execution Workflow

This document walks through the execution pipeline in `scripts/run-tests-gordonV4.js`, highlighting the major steps, the modules involved, and the functions that implement each stage. The recently-added sleep delay for MDBT42Q (and any other board that sets `cli.sleepAfterUploadMs`) is called out where it occurs.

## 1. CLI Argument Parsing
- **Purpose:** Collect command-line options (board, port, suites, flags) and normalise them into a simple object.
- **Location:** `scripts/run-tests-gordonV4.js` – `parseArgs(argv)`
- **Key behaviour:** Converts short/long flags, handles `--serial-debug`, `--quiet`, `--fixtures`, and captures positional fallbacks.

## 2. Board Profile Loading
- **Purpose:** Load board metadata (board.json, cli.json, fixture.json) and convert it into a baseline configuration.
- **Location:** `lib/v4/boardProfile.js` – `loadBoardProfile(boardName, REPO_ROOT)`
- **Key behaviour:** Ensures metadata files exist, parses JSON, and exposes a `profile` object containing board, CLI, loader, and fixture branches.

## 3. Session Defaults Merge
- **Purpose:** Seed the run with repository-level defaults (serial ports, CLI configs).
- **Location:** `lib/v4/runConfig.js` – `loadSessionDefaults()`, merged via `mergeConfig`
- **Key behaviour:** Combines session defaults, board profile config, and sets the board name on `loader.board`.

## 4. Suite Resolution and Metadata Load
- **Purpose:** Decide which suites to run and gather their configuration overlays.
- **Locations:**  
  - `scripts/run-tests-gordonV4.js` – `resolveSuites(profile.config.board, args.suites)`  
  - `lib/v4/runConfig.js` – `loadSuiteConfig(REPO_ROOT, suite)`
- **Key behaviour:** Validates requested suites, records execution order hints, and stores per-suite config layers/metadata.

## 5. Test Discovery
- **Purpose:** Enumerate the individual test files for each suite.
- **Location:** `lib/tests.js` – `resolveSuiteTests(repoRoot, boardId, suites, options)`
- **Key behaviour:** Walks `tests/<suite>` directories, applies execution ordering, and returns resolved paths plus IDs.

## 6. Port Determination
- **Purpose:** Resolve the serial or BLE port used for uploads.
- **Locations:**  
  - `scripts/run-tests-gordonV4.js` – `pickDefaultPort`, `resolvePortPattern`  
  - `lib/util/serial.js` – port pattern matching helpers
- **Key behaviour:** Uses CLI argument first, then board metadata fallbacks, expanding glob patterns to actual device paths.

## 7. CLI Fixture Overrides (Optional)
- **Purpose:** Inject fixture data via JSON if `--fixtures` is provided.
- **Location:** `scripts/run-tests-gordonV4.js` – inline within `main()`
- **Key behaviour:** Loads JSON into `cliLayer.fixture` and merges it alongside other layers.

## 8. Run Directory Preparation
- **Purpose:** Create timestamped result folders and determine whether sources/logs/metadata should be written.
- **Location:** `scripts/run-tests-gordonV4.js` – `main()` (after test discovery loop)
- **Key behaviour:** Builds `<results>/<stamp>/<board>/` structure, influenced by `profile.config.loader.output`.

## 9. Per-Test Configuration Assembly
- **Purpose:** For each test, merge session, board, suite, test, and CLI layers into a final config snapshot.
- **Locations:**  
  - `lib/v4/runConfig.js` – `mergeConfig`, `cloneConfig`  
  - `scripts/run-tests-gordonV4.js` – per-test loop inside `main()`
- **Key behaviour:** Parses per-test metadata (`parseTestMetadata`), gathers fixture requirements, and normalises loader delays (`preUploadDelayMs`, `postUploadDelayMs`).

## 10. Storage Preload (Conditional)
- **Purpose:** Stage files using the Espruino CLI `--storage` option before running the main test.
- **Location:** `scripts/run-tests-gordonV4.js` – `runStoragePreload(...)`
- **Key behaviour:** Builds temporary files, spawns a CLI process with storage args, honours pre/post upload delays, and records logs/CLI command.

## 11. Wrapper Composition
- **Purpose:** Wrap the test source with harness helpers (`__pass`, `__fail`, etc.) and timeout handling.
- **Location:** `scripts/run-tests-gordonV4.js` – `composeWrappedTest(fileId, rawSource, timeoutSec, contextInjection)`
- **Key behaviour:** Injects prologue functions, emits a polling epilogue that prints JSON with `__espruino_test__`.

## 12. Test Execution via Espruino CLI
- **Purpose:** Upload wrapped code, wait for the wrapper to emit JSON, and parse the result.
- **Location:** `scripts/run-tests-gordonV4.js` – `runOneTest(...)`
- **Detailed flow:**
  1. Build CLI argument list (`--port`, board configs, `-e <wrapped>`).
  2. **Sleep Delay Injection (New):**  
     - Collects `sleepAfterUploadMs` candidates from options or `cli.sleepAfterUploadMs`.  
     - If set and no explicit `--sleep` is already in metadata, appends `--sleep <seconds>` to the CLI args and stores the millisecond value (`sleepAllowance`).  
     - **This is the new delay**; it keeps the CLI connected after the upload so the wrapper’s JSON can be captured.
  3. Spawn the CLI process (`child_process.spawn`).
  4. Set a timeout of `timeoutMs + sleepAllowance + 1000` to account for the enforced sleep.
  5. Capture stdout/stderr, parse lines containing `__espruino_test__`, and resolve with pass/fail/skip plus metadata.

## 13. Result Recording
- **Purpose:** Persist sources, stdout/stderr, runner metadata, and suite summaries.
- **Locations:**  
  - `scripts/run-tests-gordonV4.js` – per-test loop after `runOneTest`  
  - Result writing helpers inside the same loop
- **Key behaviour:** Writes artefacts under `results/<stamp>/<board>/`, aggregates suite totals, and emits `run-summary.json`.

## 14. Final Summary Output
- **Purpose:** Print console summary and exit with the appropriate status.
- **Location:** `scripts/run-tests-gordonV4.js` – tail of `main()`
- **Key behaviour:** Reports pass/fail counts, writes final JSON summary, and exits with non-zero if any test failed.

---

With the sleep delay now encoded in board metadata (e.g. `boards/MDBT42Q/cli.json` sets `sleepAfterUploadMs`), the harness keeps the CLI session open for boards that need extra time after upload, while leaving other boards unaffected unless they opt-in. The extension of the process timeout ensures the sleep window is respected without prematurely killing the CLI process.
