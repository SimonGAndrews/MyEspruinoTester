# V5 Host Test Service Implementation Log

This document tracks the incremental implementation steps for the Host Test Service (HTS) feature described in `docs/V5_features_spec.md`.

## Implementation Plan

1. **Metadata plumbing** – Extend suite/test metadata loaders to accept `hostTestService` blocks (`name`, `script`, `env`, `startupTimeoutMs`, optional static fixtures) and enforce suite-vs-test HTS validation.
2. **Lifecycle hook** – Teach `scripts/run-tests-gordonV4.js` to spawn/track HTS processes before running a suite/test, capture stdout/stderr, and terminate them reliably (SIGTERM → grace → SIGKILL).
3. **Sentinel parsing & fixtures** – Implement `__HTS_FIXTURES__` / `__HTS_READY__` parsing with `startupTimeoutMs`, merge payloads under `fixtures.hostService.<name>` (plus optional `global`), and emit `hts_startup_timeout` / `hts_fixture_error` diagnostics.
4. **Error propagation** – When startup fails, inject `fixtures.hostService.<name>.error = 'hts_startup_failed'` so tests can `__skip`; plan for a future `mandatory: true` flag to hard-fail.
5. **Logging & shutdown** – Persist HTS stdout/stderr to `logs/<scope>.hts.*`, include paths in diagnostics, and ensure process-level exit handlers clean up HTS PIDs.
6. **Demo HTS + sample test** – Implement a reusable HTTP polling HTS (`host-services/http-client.js`) and a cooperating AP test to demonstrate the end-to-end flow, updating docs/test suites accordingly.

## Completed Work

### 1. Metadata Plumbing & Validation
Status: ✅

- `lib/v4/runConfig.js` now carries a `hostTestService` branch through `createEmptyConfig`, `normaliseLayer`, `mergeConfig`, and provenance tracking.
- Suite/test metadata headers automatically inherit the new field.
- `scripts/run-tests-gordonV4.js` throws an explicit error when both the suite layer and the test layer define an HTS, enforcing the “one HTS per scope” rule.
- CLI sanity check (`node scripts/run-tests-gordonV4.js --help`) runs successfully.

Next up: implement the runtime lifecycle hook for spawning HTS processes.

### 2. Lifecycle Hook & Process Management
Status: ✅

- `scripts/run-tests-gordonV4.js` now starts suite-level HTS processes on demand (once per suite) and per-test HTS processes when configured, using a new helper stack (`normaliseHostTestServiceConfig`, `startHostTestService`, `stopHostTestService`).
- Active HTS processes are tracked globally; signal handlers (SIGINT/SIGTERM) ensure they are terminated cleanly even if the harness aborts.
- Per-test HTS handles are stopped in a `finally` block after each test, while suite-level HTS handles are stopped once all tests complete (plus a final `stopAllHostTestServices` guard).
- HTS stdout/stderr are buffered for future logging steps (no sentinel parsing yet).
- Basic sanity check: `node scripts/run-tests-gordonV4.js --help` still runs without regression (no HTS configured).

Next up: implement sentinel parsing + fixture injection.

### 3. Sentinel Parsing & Fixture Injection
Status: ✅ (harness-level)

- `scripts/run-tests-gordonV4.js` now parses `__HTS_FIXTURES__` and `__HTS_READY__` lines from HTS stdout, with per-handle buffers, timeout handling (`hts_startup_timeout`), and fixture aggregation (namespaced under `fixtures.hostService.<name>` plus optional `global` merges).
- Startup timeouts or early exits no longer crash the run; the harness records `fixtures.hostService.<name>.error` so DUT tests can `__skip` when the HTS is unavailable. Diagnostics gain `warn/error` entries for HTS failures and malformed fixture payloads.
- Suite/test configs automatically pick up HTS-provided fixture data before injecting `global.ESPRUINO_FIXTURES` into the DUT.
- Signal handlers and per-test `finally` blocks ensure HTS processes are torn down even when errors occur.
- CLI sanity check still passes (`node scripts/run-tests-gordonV4.js --help`).

Next up: log HTS stdout/stderr to artefacts and build the HTTP polling demo.

### 4. Log Capture & Metadata References
Status: ✅ (harness-level)

- Host service stdout/stderr are now persisted to `logs/<tag>.hts.{stdout,stderr}` (suite-level and per-test tags sanitized), and metadata includes `hostTestServiceLogs` entries referencing these files along with any HTS error states.
- Per-test runs stop their HTS in a `finally` block and flush logs immediately; suite-level HTS logs flush after all tests complete. A final `stopAllHostTestServices` call still guards against orphaned processes.
- Fixture injection already included HTS-provided data, so DUT scripts now have both fixture info and log references recorded per test.
- Manual sanity check: `node scripts/run-tests-gordonV4.js --help` still succeeds (no HTS configured).

Next up: implement the HTTP polling HTS demo + sample test.

### 5. HTTP Host-Service Demo
- Added `host-services/http-ap-poll.js` (AP polling helper) and `host-services/http-host-echo.js` (host-side HTTP echo server), plus new suite `tests/http-client-host/` with `test_host_http_client.js` that consumes the HTS fixtures and Wi-Fi credentials from metadata.
- ESP32 attempts to join the LAN using the provided fixtures (`BT-GZAH5J` / `Qvm3HbnRVYAYQt`) and then exercise the host echo service; the test detects if the STA is already connected to the requested SSID and reuses the link to avoid confusing `wifi.connect`, otherwise it forces a disconnect before starting a fresh join (only disconnects on exit when it owned the session). This was the only stable path so far—the “always force reconnect” variant intermittently stuck before the connect callback fired.
- Increased the DUT timeout to 45 s and normalised HTTP status parsing so string-based `res.statusCode` values don’t cause false negatives.
- Latest *green* run: `node scripts/run-tests-gordonV4.js --board ESP32 --port /dev/ttyUSB0 --suites http-client-host --serial-debug` (`results/20251106-233801/ESP32`) PASSED end-to-end because the board was already associated with `BT-GZAH5J` prior to the test (`[HTS_TEST] Already connected ... reusing link`).
- Regression after simplifying: forcing a fresh connection repeatedly produced `esp_wifi_connect: 12298 (SSID is invalid)` or hung without ever invoking the callback (`results/20251106-234556`, `20251106-234834`, `20251106-235210`). Reverted to the earlier guarded choreography (disconnect, allow the driver to settle, reuse if already up) and added a small startup delay, but clean-boot connects still don’t succeed—the test only passes when the STA is already joined.

Next up: debug the ESP32 STA connect path so it can reliably join `BT-GZAH5J` after a harness reset (possibly requires different SSID/channel selection or firmware-side fixes) before expanding HTS coverage.
