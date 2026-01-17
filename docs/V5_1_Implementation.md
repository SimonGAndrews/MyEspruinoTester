# V5.1 Host Test Service Implementation Snapshot

This document captures the state of Host Test Service (HTS) development as carried over to branch `V5.1`. It derives from `docs/V5_implementation_1.md` but adds the incremental context gathered during the recent work.

## Functional Areas Delivered

1. **Metadata plumbing (`lib/v4/runConfig.js:6-102`)**
   - Suite/test configs now accept `hostTestService` blocks (name, script, env, startup timeout, static fixtures).
   - Provenance tracking ensures HTS definitions survive through merges and validation prevents conflicting suite/test HTS entries.

2. **Harness lifecycle & process control (`scripts/run-tests-gordonV4.js:339-545`, `1356-1709`)**
   - HTS processes spawn before suites/tests run, emit fixtures via `__HTS_FIXTURES__`, and signal readiness with `__HTS_READY__`.
   - Sentinel parsing, fixture merging, and diagnostics (`hts_startup_timeout`, `hts_fixture_error`) feed into test metadata.
   - Signal handlers plus `stopHostTestService`/`stopAllHostTestServices` ensure graceful teardown and log flushing even on abort.

3. **Logging & metadata references (`scripts/run-tests-gordonV4.js:1619-1698`)**
   - Each HTS has `logs/<scope>.hts.stdout/.stderr` artefacts recorded in `hostTestServiceLogs`, enabling post-mortem analysis.

4. **Host service assets (`host-services/http-host-echo.js`, `host-services/http-ap-poll.js`)**
   - `http-host-echo` exposes an HTTP endpoint for DUT clients, auto-selecting host interface/port or honouring `HTS_*` env overrides.
   - `http-ap-poll` repeatedly probes DUT AP URLs using env-configured targets, emitting fixtures for AP-side tests.

5. **DUT test suites**
   - `tests/http-client-host/testConfig.json` + `test_host_http_client.js` consume HTS fixtures + Wi-Fi credentials to issue host-bound HTTP requests with reconnect safeguards (connection reuse, disconnect-before-connect, 500 ms settle delay, 45 s timeout).
   - `tests/wifi-ap/testConfig.json` + `test_ap_host_poll.js` coordinate with the polling HTS; `test_ap_ip_report.js` now skips cleanly when the HTS layer reports an error or AP helpers are unavailable.

6. **Board/suite wiring**
   - `boards/ESP32/board.json` and `boards/ESP32C3/board.json` list `http-client-host` under `available` suites, enabling selection from CLI metadata.

7. **Documentation**
   - `docs/V5_features_spec.md:90-114` now describes HTS readiness, logging, security constraints, and the implementation backlog.
   - `docs/V5_implementation_1.md` remains the changelog through Step 5; this companion file (`docs/V5_1_Implementation.md`) records the branch cutover and current blockers (ESP32 STA instability).
   - `docs/TestKit/` adds FT232H reference material for forthcoming hardware harness efforts.

## Current Status & Blockers

- **HTTP host-service demo** works end-to-end only when the ESP32 is already associated with the Wi-Fi network. Fresh connects often fail with `ESP_ERR_WIFI_SSID`/`WIFI_REASON_NO_AP_FOUND`, leading to `no_result`. Work continues to stabilise the STA connect path (stronger AP, retries, firmware tweaks).
- **ESP32C3** experimentation shows REPL uploads to flash succeed, but RAM uploads hit the known `FIFO_FULL` issue; focus returns to ESP32 until the Wi-Fi reliability is resolved.

## Next Steps

1. Stabilise ESP32 Wi-Fi joins post-reset so the HTTP HTS suite passes reliably in the harness (consider closer AP, longer settle delays, or driver updates).
2. Once networking is stable, expand HTS coverage (additional host services, DUT tests) and add unit tests for the HTS helpers in `scripts/run-tests-gordonV4.js`.
3. Revisit ESP32C3 support (upload mode fixes) after the V5.1 HTS baseline is proven on ESP32.
