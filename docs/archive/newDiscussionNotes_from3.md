# Espruino Wi-Fi Harness – Working Notes (SGA_V02)

## Context
- Goal: converge the ESP32 Wi-Fi test harness on the original Gordon-style CLI workflow while modernising the suites described in `docs/TestPlan_Wifi.md`.
- Active tooling references: `docs/baseline-requirements.md`, `docs/test-runner-cli-guide.md`, `docs/manifest-reference.md`, and the multi-suite plan in `docs/TestPlan_Wifi.md`.
- Current branch: `SGA_V02` (mirrored upstream).

## Runner Landscape
| Script | Purpose | Recent Updates |
| --- | --- | --- |
| `scripts/run-tests-gordon.js` | Shell-out harness matching Gordon Williams’ original flow. | Injects fixtures ahead of every test, prints keep-alive heartbeats, aborts when the port is busy, and now honours an optional `--no-reset` flag that disables the CLI’s pre-upload reset (`--config RESET_BEFORE_SEND=false`). A one-time fixture upload was trialled but reverted because the CLI reset cleared the globals. |
| `scripts/run-tests.js` | Feature-rich harness with manifest awareness. | Fixtures flag added earlier in the project; station timeout bumped to 30 s. Continues to run in parallel while we evaluate the Gordon baseline. |

When the serial port is busy the Gordon runner now exits with:
```
Error: device busy (is another REPL connected to /dev/ttyACM0?). Aborting test run.
```
This prevents the cascade of `no_result` failures we previously saw when the Web IDE or a spare REPL had the port open.

## Wi-Fi Suite Status
All Wi-Fi tests now emit structured `{ status, pass, reason }` results so the new harnesses cannot get stuck waiting for output.

### `wifi-core`
- `test_module_presence.js`, `test_api_methods.js`, `test_scan_callback.js` rewritten to use structured results and tolerate missing optional APIs.

### `wifi-station`
- Active tests: `test_connect_get_ip.js`, `test_event_callbacks.js`, `test_auth_failure_events.js`, `test_dhcp_timeout_event.js`, `test_scan_for_fixture.js`.
- Each test loads fixtures via `global.ESPRUINO_WIFI_FIXTURES`, performs aggressive cleanup, and reports SKIP when credentials or optional firmware hooks are unavailable.
- Event tests now prefer `wifi.removeListener` and fall back to `wifi.removeAllListeners`, matching REPL observations.
- Deprecated checks (`wifi.setAutoConnect`, `wifi.setReconnectInterval`) removed from the suite and documentation.

### `wifi-http-client`
- `test_http_module_present.js`, `test_http_get_smoke.js`, `test_https_support.js` converted to structured results and defensive skip/timeout handling.

### Other Suites
- `wifi-ap`, `wifi-config-diagnostics`, `wifi-mqtt-ws`, `wifi-http-server` restored from the original archives to give the runner full coverage parity.

## Fixtures
- Repository now ships with `configs/fixtures.example.json` plus a lab template (`configs/fixtures.wifi_station.json`). Tests skip cleanly when the relevant fixture block is disabled.

## Operational Tips
1. **Before running tests**: ensure no REPL/Web IDE is holding `/dev/ttyACM0`. The Gordon runner will abort, but the standard runner still attempts every test.
2. **Capturing logs**: check `results/<timestamp>/<board>/logs/*.stdout` and `.stderr` for the raw Espruino CLI output; `sources/` houses the unwrapped test code for each run.
3. **Updating suites**: add files under `tests/<suite>/test_*.js`; discovery filters out any other prefix.

## Current Debug Focus – `FIFO_FULL`
- Branch context: work continues on `SGA_V3` (forked from `SGA_V02` with an initial empty commit for traceability).
- Intermittent `FIFO_FULL` errors occur during upload, before tests print keep-alives. They correspond to Espruino’s receive FIFO overflowing while the CLI streams the wrapped script.
- Recent runs:
  - `test_event_callbacks.js` and `test_scan_for_fixture.js` now succeed consistently (no FIFO overflow).
  - `test_connect_get_ip.js` passes intermittently; when it fails the CLI reported FIFO_FULL immediately after the prompt.
  - `test_dhcp_timeout_event.js` remains the most frequent failure (still seeing FIFO_FULL).
  - `test_auth_failure_events.js` skips whenever `fixtures.wifi_invalid.enabled` is `false` (expected).
- Experiments so far:
  - Injecting fixtures once per run reduced the upload size but clashed with the CLI reset (globals were lost). Reverted to per-test injection.
  - Added `--no-reset` flag to skip the CLI’s pre-upload reset; early runs indicate it needs a clean board (disconnect Wi-Fi / power-cycle first). Regression fixed (`disableReset` renamed to a module-level flag) so tests no longer throw “disableReset is not defined”.
  - Pre/post CLI delays remain at 1000 ms to give the device time between uploads.

## Next Steps (handoff for new thread)
- Compare wifi-station runs with and without `--no-reset` to confirm whether the CLI reset is triggering FIFO overflows (remember to disconnect any REPL/Web IDE before testing).
- If FIFO persists even without resets, consider longer delays and/or trimming the wrapped payload (e.g., stripping comments, reducing heartbeat frequency) to reduce burst size.
- Instrument the failing tests (`test_connect_get_ip.js`, `test_dhcp_timeout_event.js`) with additional logging to see whether partial uploads occur before FIFO_FULL.
- Once uploads are stable, re-enable deeper Wi-Fi scenarios (save/restore, HTTP reachability) and revisit CLI noise suppression.
- Added `runner-metadata` smoke suite with two tests to exercise per-test `saveOnSend` and the new `storagePreload` metadata hook (see `tests/runner-metadata`). Useful for validating runner behaviour without tying up Wi-Fi fixtures. The storage preload helper shells the CLI twice; the second run still emits the long-standing EspruinoTools `TypeError: Cannot read properties of undefined (reading 'type')` on exit, but the runner captures it in `.storage.stderr` and treats it as benign.

These notes should be enough for a fresh conversation to resume without revisiting the earlier context overflow.
