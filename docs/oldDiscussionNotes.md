# Espruino Wi-Fi Harness – Working Notes (SGA_V02)

## Context
- Goal: converge the ESP32 Wi-Fi test harness on the original Gordon-style CLI workflow while modernising the suites described in `docs/TestPlan_Wifi.md`.
- Active tooling references: `docs/baseline-requirements.md`, `docs/cli-guide.md`, `docs/manifest-reference.md`, and the multi-suite plan in `docs/TestPlan_Wifi.md`.
- Current branch: `SGA_V02` (mirrored upstream).

## Runner Landscape
| Script | Purpose | Recent Updates |
| --- | --- | --- |
| `scripts/run-tests-gordon.js` | Shell-out harness matching Gordon Williams’ original flow. | Now accepts `--fixtures`, injects `global.ESPRUINO_WIFI_FIXTURES`, keeps serial sessions alive with heartbeats, and aborts early when the port is already in use. Logs and wrapped sources land under `results/<timestamp>/<board>/`. |
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

## Next Steps (handoff for new thread)
- Re-enable Wi-Fi connection tests end-to-end using lab fixtures; focus on stability of `test_connect_get_ip.js` and ensure `wifi.getIP()` reports non-zero addresses.
- Expand `wifi-event` coverage to include reconnect loops once we stabilise the connection path.
- Port HTTP/WebSocket fixture endpoints into the Gordon runner (fixtures injection already in place).
- Investigate reducing CLI noise (BLE warnings) once functional coverage is stable.

These notes should be enough for a fresh conversation to resume without revisiting the earlier context overflow.
