# MDBT42Q Harness Upload / Result Capture Issue

## Summary

- Target board: MDBT42Q (nRF52832 module, console on Serial1 @ 9600 baud).
- Harness command: `node scripts/run-tests-gordonV4.js --board MDBT42Q --port /dev/ttyUSB0 --suites demo/getStarted`.
- Observed symptom: Every test run ends in `no_result`. Logs show `__NO_RESULT__` produced by the fallback evaluation rather than the expected `__espruino_test__` JSON record.
- Manual CLI/REPL runs of the individual tests succeed (JSON output is printed), but they take up to ~6 seconds in the guard test before failing with `setWatch callback never fired`.
- Harness disconnects (or evaluates the fallback) before the board prints its JSON when running automatically.

## Reproduction / Test Session Details

### Manual REPL (Web IDE)

- Paste `results/<stamp>/<board>/sources/test_sync_basic.js`. Output:
  ```
  {"__espruino_test__":true,"file":"test_sync_basic.js","status":"pass","duration_ms":13.15307617187,"reason":"testShouldPass was true"}
  ```
- Paste `.../sources/test_timeout_guard.js`. Output appears after ~2 seconds:
  ```
  {"__espruino_test__":true,"file":"test_timeout_guard.js","status":"fail","duration_ms":6383.6669921875,"reason":"setWatch callback never fired"}
  ```
- Conclusion: Wrapper works when executed manually. Guard test fails as designed (no LED on D1).

### CLI (`espruino` command)

- `espruino --board MDBT42Q --port /dev/ttyUSB0 /tmp/harness_payload.js` (wrapper for test_sync_basic.js).
  - Output: board banner only, no JSON. Wrapper not executed in RAM. `.bootcde` contains the wrapper.
- `load(); console.log(JSON.stringify(result));`
  - Prints last `result` (e.g. `{"status":"pass","reason":"testShouldPass was true"}`) but raises `SyntaxError: Got else expected ','` when the stored program replays.
- `dump();`
  - Shows wrapper in `.bootcde` (only one copy, no `[ERASED]` characters since new wrapper is smaller).
- `require("Storage").read(".bootcde").length`
  - Reports `2685` bytes (matching local wrapper file size).
- `setTimeout(()=>print("done"),2000);`
  - Upload completes immediately, but we do not see `done` because CLI returns before timeout fires unless we add `--sleep`.

### Harness Runs (examples)

- After wrapper refactor + board-specific config (baud=9600, throttled send, fetchResultEval).
- Result: same `no_result` output; no JSON in the test stdout logs; fallback prints `__NO_RESULT__`.
- `node scripts/run-tests-gordonV4.js ... --serial-debug` shows the CLI upload, but no `__espruino_test__`. Fallback `-e` command emits `__NO_RESULT__`.
- With 3-sec `fetchResultDelayMs`, fallback still prints `__NO_RESULT__`. Guard/fail JSON never seen by harness.

## Code Changes Explored

1. **Wrapper refactor (scripts/run-tests-gordonV4.js)**  
   - Generate helper functions that set `resultStatus`, `resultReason`, and emit JSON immediately.
   - Add polling interval + timeout guard inside wrapper.
   - Overall size reduces drastically; no `[ERASED]` in `.bootcde`.

2. **Board metadata updates**  
   - `boards/MDBT42Q/board.json`: fleshed out upstream info and added console mapping (defaults, tx, rx, baud).
   - `boards/MDBT42Q/cli.json`:  
     + `RESET_BEFORE_SEND=false`, `SAVE_ON_SEND=0`, `ENV_ON_CONNECT=true`, `SERIAL_THROTTLE_SEND=true`, `BAUD_RATE=9600`.  
     + `fetchResultEval` fallback `(function(){ if (typeof result === 'undefined' || result === null) { try { load(); } catch (e) { console.log('__NO_RESULT__'); return; } } if (typeof result !== 'undefined' && result !== null) console.log(JSON.stringify(result)); else console.log('__NO_RESULT__'); })();`.
     + Added `fetchResultDelayMs: 3000` to allow guard timeouts to fire before we fetch results.

3. **Harness fallback**  
   - If wrapper output lacks `__espruino_test__`, run the board-provided `fetchResultEval` (after optional delay).
   - Append fallback output/error to logs.
   - Parse fallback output for JSON result objects even if they lack `__espruino_test__`.

4. **Manual CLI tests with `--sleep 1`**  
   - Running `espruino ... --sleep 1 /tmp/harness_payload.js` still prints a JSON after the board finishes (with fail reason `setWatch callback never fired`). Without `--sleep`, we only get the banner; CLI exits before guard fires.

## Findings / Analysis

- `serial` connection stable (no truncated code, no `[ERASED]` characters).
- `sync` test: harness run still `no_result` but fallback `load()` shows `{"status":"pass","reason":"testShouldPass was true"}` afterwards. Means the board set `result`, but the harness read it too early.
- `timeout_guard` test: fallback `load()` prints fail JSON and then the guard triggers `SyntaxError`, same as REPL. Harness `no_result` because fallback executed before guard fired.
- `fetchResultDelayMs=3000` gave guard time to fail on the board, but CLI log indicates the fallback runs twice: once immediately after upload, once after `__NO_RESULT__`. After delay, fallback still prints `__NO_RESULT__`, implying the guard had not yet set `result`.
- After wrapper refactor, `test_async_example.js`, `test_fixture_usage.js`, `test_metadata_led_override.js` produce `PASS` automatically (during earlier runs) but the latest run regressed to `no_result` across the board when fallback was reinstated. Checking `results/20251104-175754/MDBT42Q/run-summary.json` shows 4 pass / 1 fail / 1 skip; latest run reverts to 0 pass, meaning our fallback regained precedence and suppresses the proper output.

### Likely root cause
- MDBT42Q does not automatically run RAM code with `SAVE_ON_SEND=0`. CLI upload places the wrapper into flash (`.bootcde`) and resets the board to the prompt. The wrapper only executes after `load()`. Thus:
  1. Upload completes.
  2. Fallback waits 3 seconds.
  3. Fallback runs `load();` (assigned to `fetchResultEval`), prints result, but the stored code is already in `.bootcde`.
  4. CLI sees `__NO_RESULT__` because at the moment the fallback call executes, `result` was still undefined, or the JSON print happens only after the fallback finished (timing).

### Additional notes
- Running `espruino --board MDBT42Q --port /dev/ttyUSB0 /tmp/harness_payload.js` + `--sleep 1` shows the board prints JSON, then CLI returns `Upload Complete. Sleeping for 1s`. Without `--sleep`, CLI returns immediately and we miss the JSON output.
- Harness currently doesn't set `--sleep`. To mimic the Web IDE, we’d need to either block the CLI until JSON is printed or add a board-specific wait (like `fetchResultDelayMs`) that holds until guard/wrapper finishes.
  - `fetchResultDelayMs` only applies before the fallback evaluation; if the JSON is printed via the wrapper outside the fallback window, the harness still misses it.
  - Proposed manual fix: secondary CLI command with `--sleep 1` or `--timeout 8` in CLI args, or direct board metadata entry to control `CLI sleep`.

## Current Status - Issue Resolved

- Manual CLI run with `--sleep` or Web IDE run gives expected JSON.

- implemented  proposed actions 1. **Implement `--sleep` (or board-specific CLI option)**  

- Board CLI metadata now sets `sleepAfterUploadMs`, so the harness passes `--sleep 9` to Espruino and should keep the serial link alive long enough for wrapper JSON to print.
- Hardware validation (20251105-201634) shows the harness capturing wrapper JSON directly: demo suite reported 4 pass / 1 fail (guard) / 1 skip with expected reasons.
- Fallback `load()` prints JSON + `__NO_RESULT__`.
- Manual CLI run with `--sleep` or Web IDE run gives expected JSON.

## Proposed Actions / Next Steps (Not Required - issue resolved)

1. **Implement `--sleep` (or board-specific CLI option)**  
   - _Done:_ `boards/MDBT42Q/cli.json` now specifies `sleepAfterUploadMs`, and the harness translates this to a CLI `--sleep` argument so uploads stay connected while the wrapper runs. Validate on hardware.

2. **Alternative: board-specific `postUploadDelayMs`**  
   - In `boards/MDBT42Q/cli.json`, set `loader.postUploadDelayMs = 3000`. Runner already has support for `postUploadDelayMs` (passed to `runOneTest`). Confirm this is actually applied.

3. **Confirm `SAVE_ON_SEND=0` is respected**  
   - Escalate follow-up to Espruino CLI maintainers: `SAVE_ON_SEND=0` appears to still push code to `.bootcde`. If this is by design, we must always call `load()` post-upload.

4. **Option: re-run wrapper directly in fallback**  
   - Instead of calling `load()`, fallback could rerun the wrapper in RAM (e.g., via `espruino ... -e <script>`). This ensures JSON prints without rewriting `.bootcde`. Could have side effects but isolates the issues.

5. **Document behaviour**  
   - Update docs to note the board specifics: no LED on D1, guard test fails by design, need to wait for printouts.

6. **Hardware check**  
   - Confirm there is no built-in LED toggled by D1 on this module. Suggest wiring an external LED for the guard test or marking the test as board-specific skip/fail.

7. **Fallback improvement**  
   - Fallback currently marks result as `fail (no_result)` when `__NO_RESULT__` is printed. Instead, we could call `load()` and parse its output string before returning, thereby capturing the fail record automatically.

## Recommendations

- **Short term:**  
  - Add `--sleep 3` to MDBT42Q CLI metadata or set `postUploadDelayMs` to 3000 so the harness waits for guard tests to complete before considering fallback.
  - Keep fallback `load()` to catch the result even if the guard triggers after we sleep.

- **Medium term:**  
  - Investigate why CLI with `SAVE_ON_SEND=0` still writes to `.bootcde`. Possibly tweak to send to RAM only (`-e` mode).
  - Consider board-specific skipping or fixture changes for guard/LED tests.

- **Long term:**  
  - Extend harness to detect board-specific delays automatically (based on metadata) and confirm guard operations.
  - Work with Espruino CLI maintainers if needed to support “fire and wait for JSON” natively without extra scripts.
